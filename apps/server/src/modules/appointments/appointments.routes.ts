import { Router } from 'express';
import { z } from 'zod';
import type { AppointmentStatus, PaymentMethod, Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import {
  appointmentInclude,
  changeAppointmentStatus,
  createAppointment,
  getAvailability,
  getAvailableDates,
  getDelayedAppointments,
  rescheduleAppointment,
  syncDelayedAppointments,
} from './appointments.service.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { hasPlanFeature } from '../../lib/tenant-access.js';
import { sanitizePayerEmail } from '../../lib/mercadopago.js';

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
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'DELAYED']),
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

  // Sincroniza atendimentos que já passaram do horário previsto e ainda não foram concluídos
  await syncDelayedAppointments(tenantId);

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

// Listar agendamentos em atraso para notificações e alertas internos (deve vir antes de /:id)
appointmentsRouter.get('/delayed', async (req, res) => {
  const tenantId = req.tenantId!;
  let targetProfId: string | undefined = undefined;

  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true) {
    const myProfId = await getProfessionalIdForUser(req);
    if (!myProfId) {
      return res.json({ delayedAppointments: [], count: 0 });
    }
    targetProfId = myProfId;
  }

  const delayedAppointments = await getDelayedAppointments({
    tenantId,
    professionalId: targetProfId,
  });

  res.json({
    delayedAppointments,
    count: delayedAppointments.length,
  });
});

// Detalhes de um agendamento
appointmentsRouter.get('/:id', async (req, res) => {
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id as string, tenantId: req.tenantId! },
    include: appointmentInclude,
  });
  if (!appointment) throw HttpError.notFound('Agendamento não encontrado');

  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true && req.auth.permissions?.canManageAppointments !== true) {
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
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true && req.auth.permissions?.canManageAppointments !== true) {
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
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true && req.auth.permissions?.canManageAppointments !== true) {
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
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true && req.auth.permissions?.canManageAppointments !== true) {
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
  if (req.auth?.role === 'PROFESSIONAL' && req.auth.permissions?.canViewAllAppointments !== true && req.auth.permissions?.canManageAppointments !== true) {
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

// Notificar cliente sobre atraso no agendamento (via WhatsApp Bot / WhatsApp link)
appointmentsRouter.post('/:id/notify-delay', async (req, res) => {
  const tenantId = req.tenantId!;
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.id as string, tenantId },
    include: {
      customer: true,
      service: true,
      professional: true,
      tenant: true,
    },
  });

  if (!appointment) {
    throw HttpError.notFound('Agendamento não encontrado');
  }

  // Se o agendamento ainda estava como SCHEDULED ou CONFIRMED, atualiza para DELAYED
  if (['SCHEDULED', 'CONFIRMED'].includes(appointment.status)) {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'DELAYED' },
    });
  }

  const rawPhone = appointment.customer.phone;
  if (!rawPhone) {
    throw HttpError.badRequest('O cliente não possui telefone/WhatsApp cadastrado para receber notificação.');
  }

  const cleanPhone = rawPhone.replace(/\D/g, '');
  const startTimeStr = DateTime.fromJSDate(appointment.startAt).setZone(appointment.tenant.timezone).toFormat('HH:mm');

  const textMessage = `Olá ${appointment.customer.name}! 👋 Passando para avisar que seu horário para *${appointment.service.name}* com *${appointment.professional.name}* na *${appointment.tenant.name}* (agendado para às ${startTimeStr}) já iniciou.\n\nVocê já está a caminho? Se tiver qualquer imprevisto ou atraso, por favor nos avise por aqui! 💈`;

  let sentViaBot = false;
  try {
    const conn = whatsAppService.getConnection(tenantId);
    if (conn.status === 'CONNECTED') {
      sentViaBot = await whatsAppService.sendMessage(tenantId, cleanPhone, textMessage);
    }
  } catch {
    sentViaBot = false;
  }

  const whatsappUrl = `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(textMessage)}`;

  res.json({
    success: true,
    sentViaBot,
    whatsappUrl,
    message: sentViaBot
      ? 'Notificação enviada ao WhatsApp do cliente com sucesso!'
      : 'Link para notificação via WhatsApp gerado com sucesso.',
  });
});

// ─────────── Cobrança Online via Mercado Pago do Salão (PIX e Cartão) ───────────

// 1. Gerar cobrança PIX dinâmica via Mercado Pago do salão
appointmentsRouter.post('/:id/charge-pix', async (req, res) => {
  const tenantId = req.tenantId!;
  const appointmentId = req.params.id as string;

  const [hasAddon, paymentConfig, appointment] = await Promise.all([
    hasPlanFeature(tenantId, 'onlinePayments').catch(() => false),
    prisma.tenantPaymentConfig.findUnique({ where: { tenantId } }),
    prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        customer: true,
        service: true,
        professional: true,
        tenant: true,
      },
    }),
  ]);

  if (!appointment) throw HttpError.notFound('Agendamento não encontrado.');
  if (appointment.status === 'COMPLETED') {
    throw HttpError.badRequest('Este agendamento já foi concluído anteriormente.');
  }
  if (appointment.status === 'CANCELED') {
    throw HttpError.badRequest('Este agendamento está cancelado.');
  }

  if (!hasAddon && req.auth?.role !== 'SUPER_ADMIN') {
    throw HttpError.forbidden(
      'O módulo de Recebimentos Online não está ativo no plano do salão. Ative o Add-on em /planos para gerar cobranças automáticas.'
    );
  }

  if (!paymentConfig?.mpAccessToken) {
    throw HttpError.badRequest(
      'As credenciais do Mercado Pago não estão configuradas para este salão. Acesse Configurações → Recebimentos Online para preencher suas chaves de produção.'
    );
  }

  const rawAmountCents =
    typeof req.body?.amountCents === 'number' && req.body.amountCents > 0
      ? Math.round(req.body.amountCents)
      : appointment.priceCents;
  const amount = Number((rawAmountCents / 100).toFixed(2));

  const rootDomain = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
  const notificationUrl = `https://${rootDomain}/api/webhooks/tenant-mercadopago/${tenantId}`;

  const cleanCustomerName = (appointment.customer.name || 'Cliente').trim();
  const nameParts = cleanCustomerName.split(' ');
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'BarberFlow';

  const mpPayload = {
    transaction_amount: amount,
    description: `${appointment.service.name} — ${appointment.tenant.name}`,
    payment_method_id: 'pix',
    payer: {
      email: sanitizePayerEmail(appointment.customer.email),
      first_name: firstName,
      last_name: lastName,
    },
    notification_url: notificationUrl,
    external_reference: `app_${appointment.id}`,
    metadata: {
      type: 'appointment',
      appointment_id: appointment.id,
      tenant_id: tenantId,
    },
  };

  const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paymentConfig.mpAccessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `pix-app-${tenantId}-${appointment.id}-${Date.now()}`,
    },
    body: JSON.stringify(mpPayload),
  });

  const mpData = (await mpRes.json()) as any;
  if (!mpRes.ok) {
    const detail =
      mpData?.cause?.[0]?.description ||
      mpData?.message ||
      'Não foi possível gerar a cobrança PIX no Mercado Pago.';
    throw HttpError.badRequest(`Erro no Mercado Pago: ${detail}`);
  }

  const qrCode = mpData.point_of_interaction?.transaction_data?.qr_code || '';
  const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || '';
  const ticketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url || '';

  const cleanPhone = appointment.customer.phone
    ? appointment.customer.phone.replace(/\D/g, '')
    : null;
  const formattedAmount = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const textMessage = `Olá ${cleanCustomerName}! 👋\n\nSegue a chave Pix para pagamento do seu atendimento de *${appointment.service.name}* na *${appointment.tenant.name}* no valor de *${formattedAmount}*:\n\n${qrCode}\n\nBasta copiar o código acima e colar no seu banco na opção *Pix Copia e Cola*. Assim que você pagar, o sistema reconhece automaticamente! 💈`;

  const whatsappUrl = cleanPhone
    ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(textMessage)}`
    : null;

  res.json({
    success: true,
    paymentId: String(mpData.id),
    status: mpData.status || 'pending',
    qrCode,
    qrCodeBase64,
    ticketUrl,
    amount,
    customerName: cleanCustomerName,
    customerPhone: cleanPhone,
    whatsappUrl,
    whatsappText: textMessage,
  });
});

// 2. Gerar link de pagamento (Cartão de Crédito / Débito) via Checkout Mercado Pago
appointmentsRouter.post('/:id/payment-link', async (req, res) => {
  const tenantId = req.tenantId!;
  const appointmentId = req.params.id as string;

  const [hasAddon, paymentConfig, appointment] = await Promise.all([
    hasPlanFeature(tenantId, 'onlinePayments').catch(() => false),
    prisma.tenantPaymentConfig.findUnique({ where: { tenantId } }),
    prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        customer: true,
        service: true,
        professional: true,
        tenant: true,
      },
    }),
  ]);

  if (!appointment) throw HttpError.notFound('Agendamento não encontrado.');
  if (appointment.status === 'COMPLETED') {
    throw HttpError.badRequest('Este agendamento já foi concluído anteriormente.');
  }
  if (appointment.status === 'CANCELED') {
    throw HttpError.badRequest('Este agendamento está cancelado.');
  }

  if (!hasAddon && req.auth?.role !== 'SUPER_ADMIN') {
    throw HttpError.forbidden(
      'O módulo de Recebimentos Online não está ativo no plano do salão. Ative o Add-on em /planos para gerar links de pagamento.'
    );
  }

  if (!paymentConfig?.mpAccessToken) {
    throw HttpError.badRequest(
      'As credenciais do Mercado Pago não estão configuradas para este salão. Acesse Configurações → Recebimentos Online para preencher suas chaves de produção.'
    );
  }

  const rawAmountCents =
    typeof req.body?.amountCents === 'number' && req.body.amountCents > 0
      ? Math.round(req.body.amountCents)
      : appointment.priceCents;
  const amount = Number((rawAmountCents / 100).toFixed(2));

  const rootDomain = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
  const notificationUrl = `https://${rootDomain}/api/webhooks/tenant-mercadopago/${tenantId}`;
  const cleanCustomerName = (appointment.customer.name || 'Cliente').trim();

  const prefPayload = {
    items: [
      {
        id: appointment.id,
        title: `${appointment.service.name} — ${appointment.tenant.name}`,
        description: `Atendimento com ${appointment.professional?.name || 'Profissional'}`,
        category_id: 'services',
        quantity: 1,
        currency_id: 'BRL',
        unit_price: amount,
      },
    ],
    payer: {
      name: cleanCustomerName,
      email: sanitizePayerEmail(appointment.customer.email),
    },
    notification_url: notificationUrl,
    external_reference: `app_${appointment.id}`,
    metadata: {
      type: 'appointment',
      appointment_id: appointment.id,
      tenant_id: tenantId,
    },
    back_urls: {
      success: `https://${rootDomain}/${appointment.tenant.slug}?paid=true&app=${appointment.id}`,
      pending: `https://${rootDomain}/${appointment.tenant.slug}?pending=true&app=${appointment.id}`,
      failure: `https://${rootDomain}/${appointment.tenant.slug}?failed=true&app=${appointment.id}`,
    },
    auto_return: 'approved',
  };

  const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paymentConfig.mpAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prefPayload),
  });

  const prefData = (await prefRes.json()) as any;
  if (!prefRes.ok) {
    const detail =
      prefData?.cause?.[0]?.description ||
      prefData?.message ||
      'Não foi possível criar o link de pagamento no Mercado Pago.';
    throw HttpError.badRequest(`Erro no Mercado Pago: ${detail}`);
  }

  const paymentLink = prefData.init_point || '';
  const cleanPhone = appointment.customer.phone
    ? appointment.customer.phone.replace(/\D/g, '')
    : null;
  const formattedAmount = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const textMessage = `Olá ${cleanCustomerName}! 👋\n\nSegue o link seguro para pagamento do seu atendimento de *${appointment.service.name}* na *${appointment.tenant.name}* no valor de *${formattedAmount}*:\n\n${paymentLink}\n\nVocê pode pagar via *Cartão de Crédito*, *Débito* ou *PIX*. O comprovante é gerado na hora! 💈`;

  const whatsappUrl = cleanPhone
    ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(textMessage)}`
    : null;

  res.json({
    success: true,
    preferenceId: prefData.id,
    paymentLink,
    amount,
    customerName: cleanCustomerName,
    customerPhone: cleanPhone,
    whatsappUrl,
    whatsappText: textMessage,
  });
});

// 3. Checar status da cobrança online e concluir agendamento caso aprovado
appointmentsRouter.get('/:id/charge-status', async (req, res) => {
  const tenantId = req.tenantId!;
  const appointmentId = req.params.id as string;
  const paymentId = typeof req.query.paymentId === 'string' ? req.query.paymentId.trim() : '';

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
  });

  if (!appointment) throw HttpError.notFound('Agendamento não encontrado.');

  if (appointment.status === 'COMPLETED') {
    return res.json({ completed: true, status: 'approved', message: 'Agendamento concluído!' });
  }

  if (paymentId) {
    const config = await prisma.tenantPaymentConfig.findUnique({ where: { tenantId } });
    if (config?.mpAccessToken) {
      try {
        const mpRes = await fetch(
          `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
          {
            headers: { Authorization: `Bearer ${config.mpAccessToken}` },
          },
        );
        if (mpRes.ok) {
          const mpData = (await mpRes.json()) as any;
          if (mpData.status === 'approved') {
            const paymentType = mpData.payment_type_id;
            const paymentMethod: PaymentMethod =
              paymentType === 'credit_card'
                ? 'CREDIT_CARD'
                : paymentType === 'debit_card'
                ? 'DEBIT_CARD'
                : 'PIX';

            await changeAppointmentStatus({
              tenantId,
              id: appointment.id,
              status: 'COMPLETED',
              paymentMethod,
            });

            return res.json({
              completed: true,
              status: 'approved',
              message: 'Pagamento aprovado no Mercado Pago! Agendamento concluído.',
            });
          }

          return res.json({
            completed: false,
            status: mpData.status || 'pending',
            statusDetail: mpData.status_detail,
          });
        }
      } catch {
        // Silencioso em falha transitória
      }
    }
  }

  return res.json({ completed: false, status: 'pending' });
});

// 4. Enviar mensagem de cobrança diretamente no WhatsApp do cliente via Bot
appointmentsRouter.post('/:id/send-payment-whatsapp', async (req, res) => {
  const tenantId = req.tenantId!;
  const appointmentId = req.params.id as string;
  const textMessage = typeof req.body?.textMessage === 'string' ? req.body.textMessage.trim() : '';

  if (!textMessage) {
    throw HttpError.badRequest('Mensagem de texto não informada.');
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: { customer: true },
  });

  if (!appointment?.customer?.phone) {
    throw HttpError.badRequest('Cliente não possui telefone cadastrado.');
  }

  const cleanPhone = appointment.customer.phone.replace(/\D/g, '');
  let sentViaBot = false;
  try {
    const conn = whatsAppService.getConnection(tenantId);
    if (conn.status === 'CONNECTED') {
      sentViaBot = await whatsAppService.sendMessage(tenantId, cleanPhone, textMessage);
    }
  } catch {
    sentViaBot = false;
  }

  const whatsappUrl = `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(textMessage)}`;

  res.json({
    success: true,
    sentViaBot,
    whatsappUrl,
    message: sentViaBot
      ? 'Cobrança enviada ao WhatsApp do cliente com sucesso pelo Bot!'
      : 'Link para envio no WhatsApp gerado.',
  });
});
