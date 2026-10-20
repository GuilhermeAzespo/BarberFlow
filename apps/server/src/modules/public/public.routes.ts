import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { normalizePhone } from '../../lib/utils.js';
import {
  createAppointment,
  getAvailability,
  getAvailableDates,
} from '../appointments/appointments.service.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { logger } from '../../lib/logger.js';

export const publicRouter = Router();

publicRouter.get('/tenants/:tenantId/logo', async (req, res) => {
  const logo = await prisma.tenantLogo.findUnique({ where: { tenantId: String(req.params.tenantId) } });
  if (!logo) throw HttpError.notFound('Logo não encontrado');
  res.setHeader('Content-Type', logo.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(Buffer.from(logo.data));
});

publicRouter.get('/tenants/:tenantId/cover', async (req, res) => {
  const cover = await prisma.tenantCover.findUnique({ where: { tenantId: String(req.params.tenantId) } });
  if (!cover) throw HttpError.notFound('Foto de capa não encontrada');
  res.setHeader('Content-Type', cover.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(Buffer.from(cover.data));
});

publicRouter.get('/tenants/gallery/:imageId', async (req, res) => {
  const img = await prisma.tenantGalleryImage.findUnique({ where: { id: String(req.params.imageId) } });
  if (!img) throw HttpError.notFound('Imagem não encontrada');
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(Buffer.from(img.data));
});

/** Dados públicos do salão (vitrine/link de agendamento web). */
publicRouter.get('/tenants/by-slug/:slug', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: String(req.params.slug) },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      coverUrl: true,
      bio: true,
      instagram: true,
      phone: true,
      address: true,
      galleryImages: {
        select: { id: true, title: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      },
      timezone: true,
      slotIntervalMinutes: true,
      status: true,
      businessHours: { orderBy: { weekday: 'asc' } },
      services: {
        where: { isActive: true },
        select: { id: true, name: true, description: true, durationMinutes: true, priceCents: true },
        orderBy: { name: 'asc' },
      },
      professionals: {
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          color: true,
          services: { select: { serviceId: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Barbearia não encontrada ou inativa');
  const { status: _status, galleryImages, ...publicData } = tenant;
  const gallery = galleryImages.map((img) => ({
    id: img.id,
    title: img.title,
    sortOrder: img.sortOrder,
    url: `/api/public/tenants/gallery/${img.id}`,
  }));

  res.json({
    tenant: {
      ...publicData,
      gallery,
    },
  });
});

/** Próximas datas com horários disponíveis para agendamento online */
publicRouter.get('/tenants/by-slug/:slug/available-dates', async (req, res) => {
  const { slug } = req.params;
  const serviceId = req.query.serviceId as string;
  const professionalId = (req.query.professionalId as string) || null;

  if (!serviceId) throw HttpError.badRequest('serviceId é obrigatório');

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Salão não encontrado');

  const dates = await getAvailableDates({
    tenantId: tenant.id,
    serviceId,
    professionalId,
    lookaheadDays: 30,
    limit: 14,
  });

  res.json({ dates });
});

/** Consulta horários disponíveis em uma data específica */
publicRouter.get('/tenants/by-slug/:slug/availability', async (req, res) => {
  const { slug } = req.params;
  const serviceId = req.query.serviceId as string;
  const date = req.query.date as string;
  const professionalId = (req.query.professionalId as string) || null;

  if (!serviceId || !date) throw HttpError.badRequest('serviceId e date são obrigatórios');

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Salão não encontrado');

  const availability = await getAvailability({
    tenantId: tenant.id,
    serviceId,
    date,
    professionalId,
  });

  res.json(availability);
});

const publicBookSchema = z.object({
  serviceId: z.string().min(1, 'Selecione um serviço'),
  professionalId: z.string().optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (formato YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (formato HH:mm)'),
  customerName: z.string().trim().min(2, 'Informe seu nome completo'),
  customerPhone: z.string().trim().min(8, 'Informe seu WhatsApp para confirmação'),
  customerEmail: z.string().email('E-mail inválido').optional().nullable(),
  notes: z.string().trim().max(400).optional().nullable(),
});

/** Criar agendamento público pelo formulário web */
publicRouter.post('/tenants/by-slug/:slug/appointments', async (req, res) => {
  const data = publicBookSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({
    where: { slug: req.params.slug },
    select: { id: true, name: true, slug: true, timezone: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Salão não encontrado ou indisponível');

  const cleanPhone = normalizePhone(data.customerPhone);
  if (!cleanPhone || cleanPhone.length < 10) {
    throw HttpError.badRequest('Telefone/WhatsApp inválido. Informe o DDD e o número.');
  }

  const startAtLuxon = DateTime.fromFormat(`${data.date} ${data.time}`, 'yyyy-MM-dd HH:mm', {
    zone: tenant.timezone,
  });
  if (!startAtLuxon.isValid) throw HttpError.badRequest('Data ou horário inválidos');

  const appointment = await createAppointment({
    tenantId: tenant.id,
    serviceId: data.serviceId,
    professionalId: data.professionalId || null,
    startAt: startAtLuxon.toJSDate(),
    customer: {
      name: data.customerName,
      phone: cleanPhone,
    },
    notes: data.notes || null,
    source: 'WEB',
    enforceBusinessHours: true,
  });

  // Atualiza e-mail do cliente se fornecido
  if (data.customerEmail && appointment.customer.id) {
    await prisma.customer.update({
      where: { id: appointment.customer.id },
      data: { email: data.customerEmail },
    }).catch(() => {});
  }

  // Notificação via WhatsApp caso a barbearia esteja conectada
  try {
    const conn = whatsAppService.getConnection(tenant.id);
    if (conn?.status === 'CONNECTED') {
      const dateFormatted = DateTime.fromJSDate(appointment.startAt).setZone(tenant.timezone).toFormat('dd/MM/yyyy');
      const timeFormatted = DateTime.fromJSDate(appointment.startAt).setZone(tenant.timezone).toFormat('HH:mm');
      const confirmationMsg = `Olá, *${appointment.customer.name}*! 👋\n\nSeu agendamento na *${tenant.name}* foi confirmado com sucesso via Web!\n\n✂️ *Serviço:* ${appointment.service.name}\n💈 *Profissional:* ${appointment.professional.name}\n📅 *Data:* ${dateFormatted}\n⏰ *Horário:* ${timeFormatted}\n\nTe esperamos lá! Para dúvidas ou cancelamentos, responda a esta mensagem.`;
      await whatsAppService.sendMessage(tenant.id, cleanPhone, confirmationMsg);
    }
  } catch (waErr) {
    logger.warn({ err: waErr, tenantId: tenant.id }, 'Aviso: Notificação WhatsApp não pôde ser enviada após agendamento Web');
  }

  res.status(201).json({
    appointment,
    message: 'Agendamento confirmado com sucesso!',
  });
});

publicRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      priceCents: true,
      maxProfessionals: true,
      maxAppointmentsPerMonth: true,
      whatsappEnabled: true,
      features: true,
      badge: true,
      isHighlighted: true,
    },
  });
  res.json({ plans });
});

