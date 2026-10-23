import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { requireRole } from '../../middlewares/auth.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { sendEmail } from '../../lib/email.js';
import { normalizePhone } from '../../lib/utils.js';
import { logger } from '../../lib/logger.js';

export const servicesRouter = Router();

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do serviço').max(80),
  description: z.string().trim().max(300).nullable().optional(),
  durationMinutes: z.number().int().min(5, 'Duração mínima de 5 minutos').max(480),
  priceCents: z.number().int().min(0),
  promoPriceCents: z.number().int().min(0).nullable().optional(),
  promoTitle: z.string().trim().max(100).nullable().optional(),
  promoActive: z.boolean().optional(),
  promoExpiresAt: z
    .preprocess((arg) => {
      if (!arg || arg === '') return null;
      if (arg instanceof Date) return arg;
      if (typeof arg === 'string') {
        const d = new Date(arg);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    }, z.date().nullable())
    .optional(),
  promoDaysOfWeek: z.array(z.number().int().min(0).max(6)).optional().default([]),
  isActive: z.boolean().optional(),
});

const broadcastPromoSchema = z.object({
  channels: z.array(z.enum(['WHATSAPP_BOT', 'EMAIL'])).min(1),
  customMessage: z.string().trim().optional(),
  customSubject: z.string().trim().optional(),
});

export const WEEKDAY_NAMES_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function formatRecurringDays(days?: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return 'Todos os dias';
  if (days.length === 1) return `Toda ${WEEKDAY_NAMES_PT[days[0]]}`;
  return days.map((d) => WEEKDAY_NAMES_PT[d]).join(', ');
}

export function isPromoActiveForDate(
  service: {
    promoActive: boolean;
    promoPriceCents?: number | null;
    priceCents: number;
    promoExpiresAt?: Date | string | null;
    promoDaysOfWeek?: number[] | null;
  },
  date: Date = new Date(),
  timezone: string = 'America/Sao_Paulo'
): boolean {
  if (!service.promoActive || !service.promoPriceCents || service.promoPriceCents >= service.priceCents) {
    return false;
  }
  if (service.promoExpiresAt) {
    const exp = service.promoExpiresAt instanceof Date ? service.promoExpiresAt : new Date(service.promoExpiresAt);
    if (!isNaN(exp.getTime()) && exp <= new Date()) {
      return false;
    }
  }
  if (service.promoDaysOfWeek && service.promoDaysOfWeek.length > 0) {
    const dt = DateTime.fromJSDate(date).setZone(timezone);
    const jsWeekday = dt.weekday === 7 ? 0 : dt.weekday;
    if (!service.promoDaysOfWeek.includes(jsWeekday)) {
      return false;
    }
  }
  return true;
}

servicesRouter.get('/', async (req, res) => {
  const onlyActive = req.query.active === 'true';
  const tenantId = req.tenantId!;
  const [tenant, rawServices] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } }),
    prisma.service.findMany({
      where: { tenantId, ...(onlyActive ? { isActive: true } : {}) },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
  ]);
  const timezone = tenant?.timezone || 'America/Sao_Paulo';
  const now = new Date();

  const expiredIds: string[] = [];
  const services = rawServices.map((s) => {
    const isExpired = Boolean(s.promoActive && s.promoExpiresAt && new Date(s.promoExpiresAt) <= now);
    if (isExpired) expiredIds.push(s.id);
    const isPromoToday = isPromoActiveForDate(s, now, timezone);
    return {
      ...s,
      promoActive: isExpired ? false : s.promoActive,
      isPromoExpired: isExpired,
      isPromoActiveToday: isPromoToday,
    };
  });

  if (expiredIds.length > 0) {
    prisma.service
      .updateMany({
        where: { id: { in: expiredIds } },
        data: { promoActive: false },
      })
      .catch(() => {});
  }

  res.json({ services });
});

servicesRouter.get('/promo-audience', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true, email: true },
  });
  const withPhone = customers.filter((c) => Boolean(c.phone)).length;
  const withEmail = customers.filter((c) => Boolean(c.email && c.email.includes('@'))).length;
  res.json({
    totalCustomers: customers.length,
    withPhone,
    withEmail,
  });
});

servicesRouter.post('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const service = await prisma.service.create({ data: { ...data, tenantId: req.tenantId! } });
  res.status(201).json({ service });
});

servicesRouter.patch('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const id = req.params.id as string;
  const data = serviceSchema.partial().parse(req.body);
  const current = await prisma.service.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Serviço não encontrado');
  const service = await prisma.service.update({ where: { id: current.id }, data });
  res.json({ service });
});

servicesRouter.delete('/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const id = req.params.id as string;
  const current = await prisma.service.findFirst({ where: { id, tenantId: req.tenantId! } });
  if (!current) throw HttpError.notFound('Serviço não encontrado');
  const used = await prisma.appointment.count({ where: { serviceId: current.id } });
  if (used > 0) {
    await prisma.service.update({ where: { id: current.id }, data: { isActive: false } });
    return res.json({ deleted: false, deactivated: true });
  }
  await prisma.service.delete({ where: { id: current.id } });
  res.json({ deleted: true, deactivated: false });
});

servicesRouter.post('/:id/broadcast-promo', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const id = req.params.id as string;
  const { channels, customMessage, customSubject } = broadcastPromoSchema.parse(req.body);

  const [service, tenant] = await Promise.all([
    prisma.service.findFirst({ where: { id, tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId } }),
  ]);
  if (!service) throw HttpError.notFound('Serviço não encontrado');
  if (!tenant) throw HttpError.notFound('Barbearia não encontrada');

  const customers = await prisma.customer.findMany({
    where: { tenantId },
    select: { id: true, name: true, phone: true, email: true },
  });

  const appUrl = (process.env.APP_URL || 'https://barberflow.azespo.com.br').replace(/\/$/, '');
  const bookingUrl = `${appUrl}/salao/${tenant.slug}`;
  const formatBRL = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  const originalPrice = formatBRL(service.priceCents);
  const promoPrice = service.promoPriceCents ? formatBRL(service.promoPriceCents) : originalPrice;
  const discountPercent = service.promoPriceCents
    ? Math.round(((service.priceCents - service.promoPriceCents) / service.priceCents) * 100)
    : 0;

  const expiresAtFormatted = service.promoExpiresAt
    ? DateTime.fromJSDate(service.promoExpiresAt).setZone(tenant.timezone).toFormat("dd/MM 'às' HH:mm")
    : null;

  const recurringDaysText =
    service.promoDaysOfWeek && service.promoDaysOfWeek.length > 0
      ? formatRecurringDays(service.promoDaysOfWeek)
      : null;

  let whatsappSent = 0;
  let whatsappFailed = 0;
  let emailSent = 0;
  let emailFailed = 0;

  // 1. Disparo via WhatsApp Bot
  if (channels.includes('WHATSAPP_BOT')) {
    const waCustomers = customers.filter((c) => Boolean(c.phone));
    for (const c of waCustomers) {
      const cleanPhone = normalizePhone(c.phone);
      if (!cleanPhone) continue;

      const firstName = c.name ? c.name.split(' ')[0] : 'Cliente';
      const textToSend = customMessage
        ? customMessage.replace(/\{NOME\}/gi, firstName)
        : [
            `✂️🔥 *SUPER PROMOÇÃO NO ${tenant.name.toUpperCase()}!* 🔥`,
            ``,
            `Olá, *${firstName}*! 👋`,
            `Preparamos uma oferta especial para você renovar seu estilo:`,
            ``,
            `💈 *Serviço:* ${service.name}`,
            service.promoPriceCents ? `❌ *De:* ~${originalPrice}~` : '',
            service.promoPriceCents ? `✅ *Por Apenas:* *${promoPrice}*! (${discountPercent}% OFF)` : `💰 *Valor:* *${originalPrice}*`,
            `⏱️ *Duração:* ${service.durationMinutes} minutos`,
            service.promoTitle ? `🏷️ *Condição:* ${service.promoTitle}` : '',
            recurringDaysText ? `🗓️ *Válida:* ${recurringDaysText}` : '',
            expiresAtFormatted ? `⏳ *Oferta por tempo limitado:* Válida até ${expiresAtFormatted}` : '',
            ``,
            `📅 *Garanta seu horário com desconto antes que esgote:*`,
            `🔗 *Agende online em segundos:* ${bookingUrl}`,
            ``,
            `Esperamos por você! 💈✂️`,
          ].filter(Boolean).join('\n');

      try {
        const sent = await whatsAppService.sendMessage(tenantId, cleanPhone, textToSend);
        if (sent) whatsappSent++;
        else whatsappFailed++;
        await new Promise((r) => setTimeout(r, 120));
      } catch (err) {
        logger.warn({ err, phone: cleanPhone }, 'Falha ao disparar promoção WhatsApp para cliente');
        whatsappFailed++;
      }
    }
  }

  // 2. Disparo via E-mail
  if (channels.includes('EMAIL')) {
    const mailCustomers = customers.filter((c) => Boolean(c.email && c.email.includes('@')));
    const subject = customSubject || `🔥 Promoção Imperdível no ${tenant.name}: ${service.name}!`;

    for (const c of mailCustomers) {
      const firstName = c.name ? c.name.split(' ')[0] : 'Cliente';
      const textPlain = customMessage
        ? customMessage.replace(/\{NOME\}/gi, firstName)
        : `Olá, ${firstName}! O ${tenant.name} preparou uma super promoção para você: ${service.name} por apenas ${promoPrice}! Agende agora: ${bookingUrl}`;

      const htmlContent = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0B0F17; color: #F3F4F6; padding: 32px; border-radius: 12px; border: 1px solid rgba(229,179,56,0.3);">
          <h1 style="color: #E5B338; font-size: 24px; text-align: center; margin-bottom: 8px;">🔥 Super Promoção Especial!</h1>
          <p style="text-align: center; color: #94A3B8; font-size: 16px; margin-top: 0;">${tenant.name}</p>
          
          <div style="background: rgba(255,255,255,0.04); border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid rgba(255,255,255,0.08);">
            <h2 style="color: #FFFFFF; font-size: 20px; margin-top: 0;">${service.name}</h2>
            ${service.description ? `<p style="color: #94A3B8; font-size: 14px;">${service.description}</p>` : ''}
            <div style="margin: 16px 0;">
              ${service.promoPriceCents ? `<span style="text-decoration: line-through; color: #64748B; font-size: 16px; margin-right: 12px;">De: ${originalPrice}</span>` : ''}
              <span style="color: #10B981; font-size: 26px; font-weight: bold;">Por: ${promoPrice}</span>
              ${discountPercent > 0 ? `<span style="background: rgba(16,185,129,0.2); color: #34D399; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 6px; margin-left: 10px;">${discountPercent}% OFF</span>` : ''}
            </div>
            ${service.promoTitle ? `<p style="color: #E5B338; font-size: 14px; font-weight: 600;">🏷️ ${service.promoTitle}</p>` : ''}
            ${recurringDaysText ? `<p style="color: #38BDF8; font-size: 13px; font-weight: 600; margin-top: 6px;">🗓️ Válida: ${recurringDaysText}</p>` : ''}
            ${expiresAtFormatted ? `<p style="color: #F59E0B; font-size: 13px; font-weight: 600; margin-top: 6px;">⏳ Oferta por tempo limitado! Válida até ${expiresAtFormatted}</p>` : ''}
          </div>

          <div style="text-align: center; margin-top: 28px;">
            <a href="${bookingUrl}" style="background: linear-gradient(135deg, #E5B338 0%, #D4A017 100%); color: #0B0F17; padding: 14px 28px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 16px; display: inline-block;">
              Agendar Meu Horário Agora
            </a>
          </div>
          <p style="text-align: center; color: #64748B; font-size: 12px; margin-top: 30px;">
            Enviado com carinho por ${tenant.name}.
          </p>
        </div>
      `;

      try {
        const sent = await sendEmail({
          to: c.email!,
          subject,
          html: htmlContent,
          text: textPlain,
        });
        if (sent) emailSent++;
        else emailFailed++;
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        logger.warn({ err, email: c.email }, 'Falha ao disparar e-mail promocional');
        emailFailed++;
      }
    }
  }

  res.json({
    success: true,
    totalCustomers: customers.length,
    whatsappSent,
    whatsappFailed,
    emailSent,
    emailFailed,
    bookingUrl,
  });
});
