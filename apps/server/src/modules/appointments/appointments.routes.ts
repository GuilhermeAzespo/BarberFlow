import { Router } from 'express';
import { z } from 'zod';
import type { AppointmentStatus, PaymentMethod, Prisma } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import {
  appointmentInclude,
  changeAppointmentStatus,
  createAppointment,
  getAvailability,
  getAvailableDates,
  rescheduleAppointment,
} from './appointments.service.js';

export const appointmentsRouter = Router();

const listAppointmentsQuery = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  professionalId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.string().optional(),
});

const availabilityQuery = z.object({
  serviceId: z.string().min(1, 'serviceId obrigatório'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato deve ser YYYY-MM-DD'),
  professionalId: z.string().optional().nullable(),
});

const availableDatesQuery = z.object({
  serviceId: z.string().min(1, 'serviceId obrigatório'),
  professionalId: z.string().optional().nullable(),
  lookaheadDays: z.coerce.number().int().min(1).max(60).default(21),
});

const createAppointmentSchema = z.object({
  serviceId: z.string().min(1, 'Serviço obrigatório'),
  professionalId: z.string().nullable().optional(),
  startAt: z.coerce.date(),
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2).optional(),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
});

const updateAppointmentSchema = z.object({
  serviceId: z.string().optional(),
  professionalId: z.string().optional(),
  startAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
});

const changeStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW']),
  paymentMethod: z.enum(['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'OTHER']).optional(),
  cancelReason: z.string().trim().max(300).nullable().optional(),
});

import type { Request } from 'express';

async function getProfessionalIdForUser(req: Request): Promise<string | null> {
  if (req.auth?.professionalId) return req.auth.professionalId;
  if (!req.auth?.userId) return null;
  const p = await prisma.professional.findUnique({
    where: { userId: req.auth.userId },
    select: { id: true },
  });
  return p?.id ?? null;
}

// Listagem com filtros
appointmentsRouter.get('/', async (req, res) => {
  const query = listAppointmentsQuery.parse(req.query);
  const tenantId = req.tenantId!;

  let targetProfId = query.professionalId;

  // Se for barbeiro/profissional sem permissão global de ver todos, restringe à sua própria agenda
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    if (!myProfId) {
      return res.json({ appointments: [] });
    }
    targetProfId = myProfId;
  }

  const where: Prisma.AppointmentWhereInput = {
    tenantId,
    ...(targetProfId ? { professionalId: targetProfId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.status ? { status: query.status as AppointmentStatus } : {}),
    ...(query.startDate || query.endDate
      ? {
          startAt: {
            ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
            ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
          },
        }
      : {}),
  };

  const appointments = await prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: { startAt: 'asc' },
  });

  res.json({ appointments });
});

// Checar horários disponíveis em uma data
appointmentsRouter.get('/availability', async (req, res) => {
  const { serviceId, date, professionalId } = availabilityQuery.parse(req.query);
  const availability = await getAvailability({
    tenantId: req.tenantId!,
    serviceId,
    date,
    professionalId,
  });
  res.json(availability);
});

// Checar dias disponíveis
appointmentsRouter.get('/available-dates', async (req, res) => {
  const { serviceId, professionalId, lookaheadDays } = availableDatesQuery.parse(req.query);
  const dates = await getAvailableDates({
    tenantId: req.tenantId!,
    serviceId,
    professionalId,
    lookaheadDays,
  });
  res.json({ dates });
});

// Detalhes de um agendamento
appointmentsRouter.get('/:id', async (req, res) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id as string, tenantId: req.tenantId! },
    include: appointmentInclude,
  });
  if (!appointment) throw HttpError.notFound('Agendamento não encontrado');

  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    if (appointment.professionalId !== myProfId) {
      throw HttpError.forbidden('Você não tem permissão para visualizar agendamentos de outros profissionais');
    }
  }

  res.json({ appointment });
});

// Criar agendamento via painel
appointmentsRouter.post('/', async (req, res) => {
  const data = createAppointmentSchema.parse(req.body);

  let targetProfessionalId = data.professionalId;
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    if (myProfId) {
      targetProfessionalId = myProfId;
    }
  }

  let customerInput;
  if (data.customerId) {
    customerInput = { id: data.customerId };
  } else if (data.customerName) {
    customerInput = {
      name: data.customerName,
      phone: data.customerPhone,
    };
  } else {
    throw HttpError.badRequest('Informe o cliente ou os dados para novo cadastro');
  }

  const appointment = await createAppointment({
    tenantId: req.tenantId!,
    serviceId: data.serviceId,
    professionalId: targetProfessionalId,
    startAt: data.startAt,
    customer: customerInput,
    notes: data.notes,
    priceCents: data.priceCents,
    source: 'PANEL',
  });

  res.status(201).json({ appointment });
});

// Reagendar / Atualizar
appointmentsRouter.patch('/:id', async (req, res) => {
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId! },
      select: { professionalId: true },
    });
    if (!existing || existing.professionalId !== myProfId) {
      throw HttpError.forbidden('Você só tem permissão para gerenciar agendamentos da sua própria agenda');
    }
  }

  const data = updateAppointmentSchema.parse(req.body);
  const appointment = await rescheduleAppointment({
    tenantId: req.tenantId!,
    id: req.params.id as string,
    startAt: data.startAt,
    professionalId: data.professionalId,
    serviceId: data.serviceId,
    notes: data.notes,
    priceCents: data.priceCents,
  });
  res.json({ appointment });
});

// Alterar status (ex: Concluir com método de pagamento, Cancelar com motivo)
appointmentsRouter.patch('/:id/status', async (req, res) => {
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId! },
      select: { professionalId: true },
    });
    if (!existing || existing.professionalId !== myProfId) {
      throw HttpError.forbidden('Você só tem permissão para gerenciar agendamentos da sua própria agenda');
    }
  }

  const data = changeStatusSchema.parse(req.body);
  const appointment = await changeAppointmentStatus({
    tenantId: req.tenantId!,
    id: req.params.id as string,
    status: data.status,
    paymentMethod: data.paymentMethod as PaymentMethod,
    cancelReason: data.cancelReason,
    userId: req.auth?.userId,
  });
  res.json({ appointment });
});

// Cancelar agendamento
appointmentsRouter.delete('/:id', async (req, res) => {
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id as string, tenantId: req.tenantId! },
      select: { professionalId: true },
    });
    if (!existing || existing.professionalId !== myProfId) {
      throw HttpError.forbidden('Você só tem permissão para gerenciar agendamentos da sua própria agenda');
    }
  }

  const appointment = await changeAppointmentStatus({
    tenantId: req.tenantId!,
    id: req.params.id as string,
    status: 'CANCELED',
    cancelReason: 'Cancelado pelo painel',
    userId: req.auth?.userId,
  });
  res.json({ appointment });
});
