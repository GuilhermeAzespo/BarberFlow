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
import { extractPlanFeatureList, extractPlanPermissions } from '../../lib/tenant-access.js';
import { systemLog } from '../../lib/system-log.js';
import {
  getActiveSmtpConfig,
  sendEmail,
  buildBarberFlowEmailHtml,
} from '../../lib/email.js';

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

publicRouter.get('/professionals/:id/avatar', async (req, res) => {
  const avatar = await prisma.professionalAvatar.findUnique({ where: { professionalId: String(req.params.id) } });
  if (!avatar) throw HttpError.notFound('Foto não encontrada');
  res.setHeader('Content-Type', avatar.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(Buffer.from(avatar.data));
});

const publicTenantSelect = {
  id: true,
  name: true,
  slug: true,
  customDomain: true,
  logoUrl: true,
  coverUrl: true,
  bio: true,
  instagram: true,
  phone: true,
  address: true,
  galleryImages: {
    select: { id: true, title: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' as const },
  },
  timezone: true,
  slotIntervalMinutes: true,
  status: true,
  businessHours: { orderBy: { weekday: 'asc' as const } },
  services: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
      promoPriceCents: true,
      promoTitle: true,
      promoActive: true,
      promoExpiresAt: true,
      promoDaysOfWeek: true,
    },
    orderBy: [{ promoActive: 'desc' as const }, { name: 'asc' as const }],
  },
  professionals: {
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      color: true,
      avatarUrl: true,
      services: { select: { serviceId: true } },
    },
    orderBy: { name: 'asc' as const },
  },
};

function formatPublicTenant(tenant: any) {
  const { status: _status, galleryImages, services: rawServices, ...publicData } = tenant;
  const now = new Date();
  const dt = DateTime.fromJSDate(now).setZone(tenant.timezone);
  const jsWeekday = dt.weekday === 7 ? 0 : dt.weekday;

  const services = (rawServices || []).map((s: any) => {
    const isExpired = Boolean(s.promoActive && s.promoExpiresAt && new Date(s.promoExpiresAt) <= now);
    const isTodayPromoDay =
      !s.promoDaysOfWeek || s.promoDaysOfWeek.length === 0 || s.promoDaysOfWeek.includes(jsWeekday);

    const isPromoActiveToday = !isExpired && s.promoActive && isTodayPromoDay;

    return {
      ...s,
      promoActive: !isExpired && s.promoActive,
      isPromoActiveToday,
      promoDaysOfWeek: s.promoDaysOfWeek || [],
    };
  });

  const gallery = (galleryImages || []).map((img: any) => ({
    id: img.id,
    title: img.title,
    sortOrder: img.sortOrder,
    url: `/api/public/tenants/gallery/${img.id}`,
  }));

  return {
    ...publicData,
    services,
    gallery,
  };
}

/** Dados públicos do salão (vitrine/link de agendamento web) por slug. */
publicRouter.get('/tenants/by-slug/:slug', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: String(req.params.slug) },
    select: publicTenantSelect,
  });

  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Barbearia não encontrada ou inativa');
  res.json({ tenant: formatPublicTenant(tenant) });
});

/** Dados públicos do salão (vitrine/link de agendamento web) por Domínio Próprio / DNS. */
publicRouter.get('/tenants/by-domain/:domain', async (req, res) => {
  const cleanDomain = String(req.params.domain)
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  const tenant = await prisma.tenant.findUnique({
    where: { customDomain: cleanDomain },
    select: publicTenantSelect,
  });

  if (!tenant || tenant.status !== 'ACTIVE') throw HttpError.notFound('Barbearia com este domínio não encontrada ou inativa');
  res.json({ tenant: formatPublicTenant(tenant) });
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
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
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

  const formattedPlans = plans.map((p) => ({
    ...p,
    features: extractPlanFeatureList(p.features),
    permissions: extractPlanPermissions(p),
  }));

  res.json({ plans: formattedPlans });
});

/** Pesquisa de endereço / geolocalização com suporte a CEP e Logradouro */
publicRouter.get('/address-search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query || query.length < 3) return res.json({ results: [] });

  // 1. Busca por CEP (8 dígitos)
  const numericOnly = query.replace(/\D/g, '');
  if (numericOnly.length === 8 && query.length <= 10) {
    try {
      const viaCepRes = await fetch(`https://viacep.com.br/ws/${numericOnly}/json/`);
      const viaCepData = (await viaCepRes.json()) as any;
      if (!viaCepData.erro) {
        const formatted = `${viaCepData.logradouro}, ${viaCepData.bairro} - ${viaCepData.localidade}/${viaCepData.uf}`;
        return res.json({
          results: [
            {
              displayName: formatted,
              street: viaCepData.logradouro,
              neighborhood: viaCepData.bairro,
              city: viaCepData.localidade,
              state: viaCepData.uf,
              postalCode: viaCepData.cep,
            },
          ],
        });
      }
    } catch {
      // Ignora erro e tenta Nominatim
    }
  }

  // 2. Busca por texto/logradouro via Nominatim OSM
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=br&limit=6&addressdetails=1`;
    const osmRes = await fetch(osmUrl, {
      headers: {
        'User-Agent': 'BarberFlow/1.0 (contato@barberflow.com)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    const osmData = (await osmRes.json()) as any;
    if (Array.isArray(osmData)) {
      const results = osmData.map((item: any) => {
        const addr = item.address || {};
        const road = addr.road || addr.street || addr.pedestrian || addr.suburb || '';
        const houseNumber = addr.house_number ? `, ${addr.house_number}` : '';
        const neighborhood = addr.neighbourhood || addr.suburb || addr.city_district || '';
        const city = addr.city || addr.town || addr.municipality || addr.village || '';
        const state = addr.state_code || addr.state || '';

        const parts: string[] = [];
        if (road) parts.push(`${road}${houseNumber}`);
        if (neighborhood && neighborhood !== road) parts.push(neighborhood);
        if (city) parts.push(state ? `${city} - ${state}` : city);

        return {
          displayName: parts.length >= 2 ? parts.join(', ') : item.display_name,
          fullDisplayName: item.display_name,
          lat: item.lat,
          lon: item.lon,
        };
      });

      return res.json({ results });
    }
  } catch (err) {
    logger.warn({ err }, 'Address search failed');
  }

  res.json({ results: [] });
});

const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  email: z.string().trim().email('E-mail informado é inválido'),
  phone: z.string().trim().max(30).optional().nullable(),
  barbershopName: z.string().trim().max(100).optional().nullable(),
  subject: z.string().trim().min(3, 'Assunto é obrigatório').max(150),
  message: z.string().trim().min(10, 'A mensagem deve ter pelo menos 10 caracteres').max(3000),
});

/** Envio de mensagem pelo formulário público de contato */
publicRouter.post('/contact', async (req, res) => {
  const data = contactMessageSchema.parse(req.body);

  await systemLog({
    tenantId: null,
    level: 'INFO',
    source: 'public:contact',
    message: `Mensagem de contato recebida de ${data.name} (${data.email}) - Assunto: ${data.subject}`,
    meta: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      barbershopName: data.barbershopName ?? null,
      subject: data.subject,
      messageLength: data.message.length,
    },
  });

  // Tenta despachar notificação via e-mail se SMTP estiver configurado
  try {
    const smtp = await getActiveSmtpConfig();
    if (smtp) {
      const recipient = smtp.from.includes('<')
        ? smtp.from.split('<')[1].replace('>', '').trim()
        : smtp.from.trim();

      const html = buildBarberFlowEmailHtml({
        title: 'Nova Mensagem de Contato — BarberFlow',
        contentHtml:
          `<p style="margin-bottom: 16px;">Uma nova solicitação de contato foi enviada pelo portal do BarberFlow:</p>` +
          `<ul style="line-height: 1.8; color: #E2E8F0; margin-bottom: 20px;">` +
          `<li><strong>Nome:</strong> ${data.name}</li>` +
          `<li><strong>E-mail:</strong> ${data.email}</li>` +
          `<li><strong>Telefone / WhatsApp:</strong> ${data.phone || 'Não informado'}</li>` +
          `<li><strong>Barbearia:</strong> ${data.barbershopName || 'Não informada'}</li>` +
          `<li><strong>Assunto:</strong> ${data.subject}</li>` +
          `</ul>` +
          `<div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; border-left: 3px solid #E5B338;">` +
          `<strong style="color: #E5B338; display: block; margin-bottom: 6px;">Mensagem:</strong>` +
          `<p style="margin: 0; color: #F8FAFC; white-space: pre-wrap;">${data.message}</p>` +
          `</div>`,
        actionButton: {
          text: 'Acessar Gestão Master',
          url: 'https://barberflow.azespo.com.br/admin',
        },
      });

      await sendEmail({
        to: recipient,
        subject: `[Contato BarberFlow] ${data.subject} — ${data.name}`,
        html,
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Não foi possível despachar o e-mail de contato via SMTP');
  }

  res.json({
    success: true,
    message: 'Mensagem recebida com sucesso! Em breve nossa equipe entrará em contato.',
  });
});


