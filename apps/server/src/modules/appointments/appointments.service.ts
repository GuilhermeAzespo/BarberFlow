import { Prisma, type AppointmentSource, type AppointmentStatus, type BusinessHour, type PaymentMethod } from '@prisma/client';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { assertAppointmentLimit } from '../../lib/tenant-access.js';
import { normalizePhone, timeToMinutes, weekdayOf } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';
import { triggerAppointmentSurvey } from '../whatsapp/whatsapp-surveys.js';

/** Status que ocupam a agenda do profissional. */
export const BLOCKING_STATUSES: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'DELAYED'];

export const appointmentInclude = {
  customer: { select: { id: true, name: true, phone: true, whatsappJid: true } },
  professional: { select: { id: true, name: true, color: true } },
  service: { select: { id: true, name: true, durationMinutes: true, priceCents: true } },
  transaction: { select: { id: true, amountCents: true, paymentMethod: true } },
} satisfies Prisma.AppointmentInclude;

export type AppointmentWithRelations = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

export interface Slot {
  startAt: string;
  time: string;
  professionalIds: string[];
}

/** Profissionais ativos que executam o serviço (sem vínculos = atende todos). */
export async function professionalsForService(tenantId: string, serviceId: string) {
  return prisma.professional.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [{ services: { none: {} } }, { services: { some: { serviceId } } }],
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, color: true },
  });
}

function localTime(date: DateTime, time: string): DateTime {
  const [hour, minute] = time.split(':').map(Number);
  return date.set({ hour, minute, second: 0, millisecond: 0 });
}

export function isWithinBusinessHours(hours: BusinessHour | undefined, start: DateTime, end: DateTime): boolean {
  if (!hours || !hours.isOpen) return false;
  if (!start.hasSame(end.minus({ minutes: 1 }), 'day')) return false;
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute || 24 * 60;
  if (startMin < timeToMinutes(hours.openTime) || endMin > timeToMinutes(hours.closeTime)) return false;
  if (hours.breakStart && hours.breakEnd) {
    const bs = timeToMinutes(hours.breakStart);
    const be = timeToMinutes(hours.breakEnd);
    if (startMin < be && endMin > bs) return false;
  }
  return true;
}

/** Calcula os horários livres de um dia (no fuso do salão) para um serviço. */
export async function getAvailability(params: {
  tenantId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  professionalId?: string | null;
}): Promise<{ date: string; slots: Slot[]; closed: boolean }> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: params.tenantId },
    select: { timezone: true, slotIntervalMinutes: true },
  });
  const day = DateTime.fromISO(params.date, { zone: tenant.timezone }).startOf('day');
  if (!day.isValid) throw HttpError.badRequest('Data inválida');

  const now = DateTime.now().setZone(tenant.timezone);
  if (day < now.startOf('day')) {
    return { date: params.date, slots: [], closed: false };
  }

  const service = await prisma.service.findFirst({ where: { id: params.serviceId, tenantId: params.tenantId, isActive: true } });
  if (!service) throw HttpError.notFound('Serviço não encontrado');

  const hours = await prisma.businessHour.findUnique({
    where: { tenantId_weekday: { tenantId: params.tenantId, weekday: weekdayOf(day) } },
  });
  if (!hours?.isOpen) return { date: params.date, slots: [], closed: true };

  let professionals = await professionalsForService(params.tenantId, service.id);
  if (params.professionalId) professionals = professionals.filter((p) => p.id === params.professionalId);
  if (!professionals.length) return { date: params.date, slots: [], closed: false };

  const open = localTime(day, hours.openTime);
  const close = localTime(day, hours.closeTime);
  const busy = await prisma.appointment.findMany({
    where: {
      tenantId: params.tenantId,
      professionalId: { in: professionals.map((p) => p.id) },
      status: { in: BLOCKING_STATUSES },
      startAt: { lt: close.toJSDate() },
      endAt: { gt: open.toJSDate() },
    },
    select: { professionalId: true, startAt: true, endAt: true },
  });

  const slots: Slot[] = [];
  for (let cursor = open; cursor.plus({ minutes: service.durationMinutes }) <= close; cursor = cursor.plus({ minutes: tenant.slotIntervalMinutes })) {
    const end = cursor.plus({ minutes: service.durationMinutes });
    if (cursor <= now) continue;
    if (!isWithinBusinessHours(hours, cursor, end)) continue;
    const startMs = cursor.toMillis();
    const endMs = end.toMillis();
    const free = professionals.filter(
      (p) => !busy.some((b) => b.professionalId === p.id && b.startAt.getTime() < endMs && b.endAt.getTime() > startMs),
    );
    if (free.length) {
      slots.push({ startAt: cursor.toUTC().toISO()!, time: cursor.toFormat('HH:mm'), professionalIds: free.map((p) => p.id) });
    }
  }
  return { date: params.date, slots, closed: false };
}

/** Próximos dias com pelo menos um horário livre. */
export async function getAvailableDates(params: {
  tenantId: string;
  serviceId: string;
  professionalId?: string | null;
  lookaheadDays?: number;
  limit?: number;
}): Promise<string[]> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: params.tenantId }, select: { timezone: true } });
  const today = DateTime.now().setZone(tenant.timezone).startOf('day');
  const result: string[] = [];
  for (let i = 0; i < (params.lookaheadDays ?? 21) && result.length < (params.limit ?? 7); i++) {
    const date = today.plus({ days: i }).toISODate()!;
    const { slots } = await getAvailability({ ...params, date });
    if (slots.length) result.push(date);
  }
  return result;
}

function isOverlapConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('appointment_no_overlap') || message.includes('23P01');
}

async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; professionalId: string; startAt: Date; endAt: Date; excludeId?: string },
) {
  const conflict = await tx.appointment.findFirst({
    where: {
      tenantId: params.tenantId,
      professionalId: params.professionalId,
      status: { in: BLOCKING_STATUSES },
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) throw HttpError.conflict('O profissional já possui um agendamento neste horário', 'SLOT_TAKEN');
}

export type CustomerInput = { id: string } | { name: string; phone?: string | null; whatsappJid?: string | null };

export interface CreateAppointmentInput {
  tenantId: string;
  serviceId: string;
  /** null/undefined = primeiro profissional livre */
  professionalId?: string | null;
  startAt: Date;
  customer: CustomerInput;
  notes?: string | null;
  source: AppointmentSource;
  enforceBusinessHours?: boolean;
  priceCents?: number;
}

export async function createAppointment(input: CreateAppointmentInput): Promise<AppointmentWithRelations> {
  await assertAppointmentLimit(input.tenantId);

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId }, select: { timezone: true } });
  const service = await prisma.service.findFirst({ where: { id: input.serviceId, tenantId: input.tenantId, isActive: true } });
  if (!service) throw HttpError.notFound('Serviço não encontrado');

  const start = DateTime.fromJSDate(input.startAt).setZone(tenant.timezone);
  const end = start.plus({ minutes: service.durationMinutes });

  const now = DateTime.now().setZone(tenant.timezone);
  // Não permitir agendamento no passado (datas anteriores ou horários já passados de hoje)
  if (start < now.minus({ minutes: 2 })) {
    throw HttpError.badRequest('Não é permitido agendar em datas ou horários que já passaram.');
  }

  if (input.enforceBusinessHours !== false) {
    const hours = await prisma.businessHour.findUnique({
      where: { tenantId_weekday: { tenantId: input.tenantId, weekday: weekdayOf(start) } },
    });
    if (!isWithinBusinessHours(hours ?? undefined, start, end)) {
      throw HttpError.badRequest('Horário fora do expediente do salão');
    }
  }

  const candidates = await professionalsForService(input.tenantId, service.id);
  if (input.professionalId && !candidates.some((p) => p.id === input.professionalId)) {
    throw HttpError.badRequest('Profissional inválido ou não executa este serviço');
  }
  if (!candidates.length) throw HttpError.badRequest('Nenhum profissional disponível para este serviço');

  try {
    return await prisma.$transaction(async (tx) => {
      let professionalId = input.professionalId ?? null;
      if (!professionalId) {
        for (const candidate of candidates) {
          const busy = await tx.appointment.findFirst({
            where: {
              tenantId: input.tenantId,
              professionalId: candidate.id,
              status: { in: BLOCKING_STATUSES },
              startAt: { lt: end.toJSDate() },
              endAt: { gt: start.toJSDate() },
            },
            select: { id: true },
          });
          if (!busy) {
            professionalId = candidate.id;
            break;
          }
        }
        if (!professionalId) throw HttpError.conflict('Nenhum profissional livre neste horário', 'SLOT_TAKEN');
      } else {
        await assertNoOverlap(tx, { tenantId: input.tenantId, professionalId, startAt: start.toJSDate(), endAt: end.toJSDate() });
      }

      const customerId = await resolveCustomer(tx, input.tenantId, input.customer);

      return tx.appointment.create({
        data: {
          tenantId: input.tenantId,
          customerId,
          professionalId,
          serviceId: service.id,
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          priceCents: (() => {
            if (input.priceCents !== undefined && input.priceCents !== null) return input.priceCents;
            const appointmentJsWeekday = start.weekday === 7 ? 0 : start.weekday;
            const isPromoDay =
              !service.promoDaysOfWeek ||
              service.promoDaysOfWeek.length === 0 ||
              service.promoDaysOfWeek.includes(appointmentJsWeekday);

            const isPromoActive = Boolean(
              service.promoActive &&
              service.promoPriceCents &&
              service.promoPriceCents < service.priceCents &&
              (!service.promoExpiresAt || new Date(service.promoExpiresAt) > new Date()) &&
              isPromoDay
            );
            return isPromoActive ? service.promoPriceCents! : service.priceCents;
          })(),
          notes: input.notes ?? null,
          source: input.source,
        },
        include: appointmentInclude,
      });
    });
  } catch (error) {
    if (isOverlapConstraintError(error)) throw HttpError.conflict('Este horário acabou de ser reservado', 'SLOT_TAKEN');
    throw error;
  }
}

async function resolveCustomer(tx: Prisma.TransactionClient, tenantId: string, customer: CustomerInput): Promise<string> {
  if ('id' in customer) {
    const existing = await tx.customer.findFirst({ where: { id: customer.id, tenantId }, select: { id: true } });
    if (!existing) throw HttpError.badRequest('Cliente inválido');
    return existing.id;
  }
  const phone = normalizePhone(customer.phone);
  const jid = customer.whatsappJid ?? null;
  const or: Prisma.CustomerWhereInput[] = [];
  if (phone) or.push({ phone });
  if (jid) or.push({ whatsappJid: jid });
  if (or.length) {
    const existing = await tx.customer.findFirst({ where: { tenantId, OR: or } });
    if (existing) {
      if ((jid && !existing.whatsappJid) || (phone && !existing.phone)) {
        await tx.customer.update({
          where: { id: existing.id },
          data: { whatsappJid: existing.whatsappJid ?? jid, phone: existing.phone ?? phone },
        });
      }
      return existing.id;
    }
  }
  const created = await tx.customer.create({ data: { tenantId, name: customer.name, phone, whatsappJid: jid } });
  return created.id;
}

export async function rescheduleAppointment(params: {
  tenantId: string;
  id: string;
  startAt?: Date;
  professionalId?: string;
  serviceId?: string;
  notes?: string | null;
  priceCents?: number;
  enforceBusinessHours?: boolean;
}): Promise<AppointmentWithRelations> {
  const current = await prisma.appointment.findFirst({ where: { id: params.id, tenantId: params.tenantId } });
  if (!current) throw HttpError.notFound('Agendamento não encontrado');
  if (!BLOCKING_STATUSES.includes(current.status)) {
    throw HttpError.badRequest('Apenas agendamentos ativos podem ser alterados');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: params.tenantId }, select: { timezone: true } });
  const serviceId = params.serviceId ?? current.serviceId;
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: params.tenantId } });
  if (!service) throw HttpError.notFound('Serviço não encontrado');

  const professionalId = params.professionalId ?? current.professionalId;
  if (params.professionalId || params.serviceId) {
    const candidates = await professionalsForService(params.tenantId, service.id);
    if (!candidates.some((p) => p.id === professionalId)) {
      throw HttpError.badRequest('Profissional inválido ou não executa este serviço');
    }
  }

  const start = DateTime.fromJSDate(params.startAt ?? current.startAt).setZone(tenant.timezone);
  const end = start.plus({ minutes: service.durationMinutes });

  if (params.enforceBusinessHours !== false && (params.startAt || params.serviceId)) {
    const hours = await prisma.businessHour.findUnique({
      where: { tenantId_weekday: { tenantId: params.tenantId, weekday: weekdayOf(start) } },
    });
    if (!isWithinBusinessHours(hours ?? undefined, start, end)) throw HttpError.badRequest('Horário fora do expediente do salão');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await assertNoOverlap(tx, {
        tenantId: params.tenantId,
        professionalId,
        startAt: start.toJSDate(),
        endAt: end.toJSDate(),
        excludeId: current.id,
      });
      const timeChanged = start.toMillis() !== current.startAt.getTime();
      return tx.appointment.update({
        where: { id: current.id },
        data: {
          professionalId,
          serviceId: service.id,
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          notes: params.notes === undefined ? undefined : params.notes,
          priceCents: params.priceCents ?? (params.serviceId ? service.priceCents : undefined),
          reminderSentAt: timeChanged ? null : undefined,
        },
        include: appointmentInclude,
      });
    });
  } catch (error) {
    if (isOverlapConstraintError(error)) throw HttpError.conflict('Este horário acabou de ser reservado', 'SLOT_TAKEN');
    throw error;
  }
}

/**
 * Altera status. Ao concluir, lança automaticamente a receita no fluxo de caixa;
 * ao reverter uma conclusão, remove o lançamento vinculado.
 */
export async function changeAppointmentStatus(params: {
  tenantId: string;
  id: string;
  status: AppointmentStatus;
  paymentMethod?: PaymentMethod;
  cancelReason?: string | null;
  userId?: string | null;
}): Promise<AppointmentWithRelations> {
  const current = await prisma.appointment.findFirst({
    where: { id: params.id, tenantId: params.tenantId },
    include: { service: true, customer: true, transaction: true },
  });
  if (!current) throw HttpError.notFound('Agendamento não encontrado');
  if (current.status === params.status) {
    return prisma.appointment.findUniqueOrThrow({ where: { id: current.id }, include: appointmentInclude });
  }

  // Reativar um agendamento cancelado exige que o horário continue livre
  if (BLOCKING_STATUSES.includes(params.status) && !BLOCKING_STATUSES.includes(current.status)) {
    await assertNoOverlap(prisma, {
      tenantId: params.tenantId,
      professionalId: current.professionalId,
      startAt: current.startAt,
      endAt: current.endAt,
      excludeId: current.id,
    });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (params.status === 'COMPLETED' && !current.transaction) {
        await tx.transaction.create({
          data: {
            tenantId: params.tenantId,
            type: 'INCOME',
            category: 'Serviços',
            description: `${current.service.name} — ${current.customer.name}`,
            amountCents: current.priceCents,
            paymentMethod: params.paymentMethod ?? 'CASH',
            occurredAt: new Date(),
            appointmentId: current.id,
            createdById: params.userId ?? null,
          },
        });
      }
      if (current.status === 'COMPLETED' && params.status !== 'COMPLETED' && current.transaction) {
        await tx.transaction.delete({ where: { id: current.transaction.id } });
      }
      return tx.appointment.update({
        where: { id: current.id },
        data: {
          status: params.status,
          completedAt: params.status === 'COMPLETED' ? new Date() : null,
          canceledAt: params.status === 'CANCELED' ? new Date() : null,
          cancelReason: params.status === 'CANCELED' ? (params.cancelReason ?? null) : null,
        },
        include: appointmentInclude,
      });
    });

    if (params.status === 'COMPLETED') {
      triggerAppointmentSurvey({
        tenantId: params.tenantId,
        appointmentId: current.id,
      }).catch((err) => {
        logger.error({ err, tenantId: params.tenantId, appointmentId: current.id }, 'Erro ao disparar pesquisa de corte');
      });
    }

    return updated;
  } catch (error) {
    if (isOverlapConstraintError(error)) throw HttpError.conflict('O horário deste agendamento já foi ocupado', 'SLOT_TAKEN');
    throw error;
  }
}

/**
 * Sincroniza e marca agendamentos que já ultrapassaram o horário final de atendimento
 * sem terem sido concluídos pelo barbeiro/salão como DELAYED (Atrasados).
 */
export async function syncDelayedAppointments(tenantId?: string): Promise<number> {
  const now = new Date();
  const res = await prisma.appointment.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      endAt: { lt: now },
    },
    data: {
      status: 'DELAYED',
    },
  });
  return res.count;
}

/**
 * Retorna todos os agendamentos atrasados para alerta interno do barbeiro/salão.
 */
export async function getDelayedAppointments(params: { tenantId: string; professionalId?: string | null }) {
  await syncDelayedAppointments(params.tenantId);

  return prisma.appointment.findMany({
    where: {
      tenantId: params.tenantId,
      status: 'DELAYED',
      ...(params.professionalId ? { professionalId: params.professionalId } : {}),
    },
    include: appointmentInclude,
    orderBy: { startAt: 'asc' },
  });
}
