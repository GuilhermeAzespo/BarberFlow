import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { TIME_REGEX, normalizePhone, timeToMinutes } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';

export const tenantRouter = Router();

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(HttpError.badRequest('Formato inválido. Envie PNG, JPG ou WEBP.'));
  },
});

const isValidTimezone = (tz: string) => {
  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.email().nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  timezone: z.string().refine(isValidTimezone, 'Fuso horário inválido').optional(),
  slotIntervalMinutes: z.number().int().refine((v) => [10, 15, 20, 30, 45, 60].includes(v), 'Intervalo inválido').optional(),
});

const businessHourSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    openTime: z.string().regex(TIME_REGEX, 'Horário inválido (HH:mm)'),
    closeTime: z.string().regex(TIME_REGEX, 'Horário inválido (HH:mm)'),
    breakStart: z.string().regex(TIME_REGEX).nullable().optional(),
    breakEnd: z.string().regex(TIME_REGEX).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.isOpen) return;
    if (timeToMinutes(value.closeTime) <= timeToMinutes(value.openTime)) {
      ctx.addIssue({ code: 'custom', message: 'O horário de fechamento deve ser após a abertura', path: ['closeTime'] });
    }
    if (Boolean(value.breakStart) !== Boolean(value.breakEnd)) {
      ctx.addIssue({ code: 'custom', message: 'Informe início e fim do intervalo', path: ['breakStart'] });
    }
    if (value.breakStart && value.breakEnd) {
      const bs = timeToMinutes(value.breakStart);
      const be = timeToMinutes(value.breakEnd);
      if (be <= bs || bs < timeToMinutes(value.openTime) || be > timeToMinutes(value.closeTime)) {
        ctx.addIssue({ code: 'custom', message: 'Intervalo deve estar dentro do expediente', path: ['breakStart'] });
      }
    }
  });

const businessHoursSchema = z
  .array(businessHourSchema)
  .length(7, 'Envie os 7 dias da semana')
  .refine((days) => new Set(days.map((d) => d.weekday)).size === 7, 'Dias da semana duplicados');

function serializeTenant(tenant: Awaited<ReturnType<typeof prisma.tenant.findUniqueOrThrow>>) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logoUrl: tenant.logoUrl,
    phone: tenant.phone,
    email: tenant.email,
    address: tenant.address,
    timezone: tenant.timezone,
    currency: tenant.currency,
    slotIntervalMinutes: tenant.slotIntervalMinutes,
    onboardingCompleted: tenant.onboardingCompleted,
    status: tenant.status,
    createdAt: tenant.createdAt,
  };
}

tenantRouter.get('/', async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
  const businessHours = await prisma.businessHour.findMany({ where: { tenantId: tenant.id }, orderBy: { weekday: 'asc' } });
  res.json({ tenant: serializeTenant(tenant), businessHours });
});

tenantRouter.patch('/', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const data = updateTenantSchema.parse(req.body);
  const tenant = await prisma.tenant.update({
    where: { id: req.tenantId! },
    data: { ...data, phone: data.phone === undefined ? undefined : normalizePhone(data.phone) },
  });
  res.json({ tenant: serializeTenant(tenant) });
});

tenantRouter.get('/business-hours', async (req, res) => {
  const businessHours = await prisma.businessHour.findMany({ where: { tenantId: req.tenantId! }, orderBy: { weekday: 'asc' } });
  res.json({ businessHours });
});

tenantRouter.put('/business-hours', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const days = businessHoursSchema.parse(req.body?.businessHours ?? req.body);
  const tenantId = req.tenantId!;
  await prisma.$transaction(
    days.map((day) =>
      prisma.businessHour.upsert({
        where: { tenantId_weekday: { tenantId, weekday: day.weekday } },
        update: { ...day, breakStart: day.breakStart ?? null, breakEnd: day.breakEnd ?? null },
        create: { tenantId, ...day, breakStart: day.breakStart ?? null, breakEnd: day.breakEnd ?? null },
      }),
    ),
  );
  const businessHours = await prisma.businessHour.findMany({ where: { tenantId }, orderBy: { weekday: 'asc' } });
  res.json({ businessHours });
});

tenantRouter.post('/logo', requireRole('OWNER', 'MANAGER'), upload.single('logo'), async (req, res) => {
  if (!req.file) throw HttpError.badRequest('Envie o arquivo no campo "logo"');
  const tenantId = req.tenantId!;
  const data = new Uint8Array(req.file.buffer);
  await prisma.tenantLogo.upsert({
    where: { tenantId },
    update: { mimeType: req.file.mimetype, data },
    create: { tenantId, mimeType: req.file.mimetype, data },
  });
  const logoUrl = `/api/public/tenants/${tenantId}/logo?v=${Date.now()}`;
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { logoUrl } });
  res.json({ tenant: serializeTenant(tenant) });
});

tenantRouter.delete('/logo', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  await prisma.tenantLogo.deleteMany({ where: { tenantId: req.tenantId! } });
  const tenant = await prisma.tenant.update({ where: { id: req.tenantId! }, data: { logoUrl: null } });
  res.json({ tenant: serializeTenant(tenant) });
});

/** Finaliza o onboarding: exige ao menos 1 dia aberto, 1 serviço e 1 profissional ativos (requisitos do bot). */
tenantRouter.post('/onboarding/complete', requireRole('OWNER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const [openDays, services, professionals] = await Promise.all([
    prisma.businessHour.count({ where: { tenantId, isOpen: true } }),
    prisma.service.count({ where: { tenantId, isActive: true } }),
    prisma.professional.count({ where: { tenantId, isActive: true } }),
  ]);
  const missing: string[] = [];
  if (!openDays) missing.push('ao menos um dia de funcionamento');
  if (!services) missing.push('ao menos um serviço');
  if (!professionals) missing.push('ao menos um profissional');
  if (missing.length) throw HttpError.badRequest(`Para concluir, cadastre ${missing.join(', ')}.`);

  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { onboardingCompleted: true } });
  await systemLog({ tenantId, source: 'onboarding', message: 'Onboarding concluído' });
  res.json({ tenant: serializeTenant(tenant) });
});
