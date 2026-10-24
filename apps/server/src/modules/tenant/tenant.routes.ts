import { Router } from 'express';
import dns from 'node:dns/promises';
import multer from 'multer';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { TIME_REGEX, normalizePhone, timeToMinutes } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';

export const tenantRouter = Router();

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
const RESERVED_DOMAINS = ['barberflow.azespo.com.br', 'azespo.com.br', 'localhost', 'vercel.app', 'ngrok.io'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(HttpError.badRequest('Formato inválido. Envie PNG, JPG ou WEBP.'));
  },
});

const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_LOGO_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(HttpError.badRequest('Formato inválido. Envie PNG, JPG ou WEBP.'));
  },
});

const uploadGallery = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
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
  bio: z.string().trim().max(1000).nullable().optional(),
  instagram: z.string().trim().max(100).nullable().optional(),
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
    customDomain: tenant.customDomain,
    logoUrl: tenant.logoUrl,
    phone: tenant.phone,
    email: tenant.email,
    address: tenant.address,
    bio: tenant.bio,
    instagram: tenant.instagram,
    coverUrl: tenant.coverUrl,
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

tenantRouter.post('/cover', requireRole('OWNER', 'MANAGER'), uploadCover.single('cover'), async (req, res) => {
  if (!req.file) throw HttpError.badRequest('Envie o arquivo no campo "cover"');
  const tenantId = req.tenantId!;
  const data = new Uint8Array(req.file.buffer);
  await prisma.tenantCover.upsert({
    where: { tenantId },
    update: { mimeType: req.file.mimetype, data },
    create: { tenantId, mimeType: req.file.mimetype, data },
  });
  const coverUrl = `/api/public/tenants/${tenantId}/cover?v=${Date.now()}`;
  const tenant = await prisma.tenant.update({ where: { id: tenantId }, data: { coverUrl } });
  res.json({ tenant: serializeTenant(tenant) });
});

tenantRouter.delete('/cover', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  await prisma.tenantCover.deleteMany({ where: { tenantId: req.tenantId! } });
  const tenant = await prisma.tenant.update({ where: { id: req.tenantId! }, data: { coverUrl: null } });
  res.json({ tenant: serializeTenant(tenant) });
});

tenantRouter.get('/gallery', async (req, res) => {
  const images = await prisma.tenantGalleryImage.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, title: true, sortOrder: true, createdAt: true },
  });
  res.json({
    images: images.map((img) => ({
      ...img,
      url: `/api/public/tenants/gallery/${img.id}`,
    })),
  });
});

tenantRouter.post('/gallery', requireRole('OWNER', 'MANAGER'), uploadGallery.single('image'), async (req, res) => {
  if (!req.file) throw HttpError.badRequest('Envie o arquivo no campo "image"');
  const count = await prisma.tenantGalleryImage.count({ where: { tenantId: req.tenantId! } });
  if (count >= 15) throw HttpError.badRequest('Limite de 15 fotos na galeria atingido.');

  const data = new Uint8Array(req.file.buffer);
  const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 100) : null;
  const image = await prisma.tenantGalleryImage.create({
    data: {
      tenantId: req.tenantId!,
      title,
      mimeType: req.file.mimetype,
      data,
      sortOrder: count,
    },
    select: { id: true, title: true, sortOrder: true, createdAt: true },
  });

  res.status(201).json({
    image: {
      ...image,
      url: `/api/public/tenants/gallery/${image.id}`,
    },
  });
});

tenantRouter.delete('/gallery/:id', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const id = String(req.params.id);
  await prisma.tenantGalleryImage.deleteMany({
    where: { id, tenantId: req.tenantId! },
  });
  res.json({ ok: true });
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

/** Helper para testar propagação DNS */
async function checkDnsPropagation(domain: string, targetCname: string) {
  try {
    const cnames = await dns.resolveCname(domain);
    const matches = cnames.some((c) => c.toLowerCase().includes(targetCname.toLowerCase()));
    if (matches) return { verified: true, message: 'Apontamento CNAME validado com sucesso! Domínio ativo.' };
  } catch {
    try {
      const addresses = await dns.lookup(domain);
      if (addresses?.address) {
        return { verified: true, message: `Domínio resolvendo no servidor (IP: ${addresses.address}).` };
      }
    } catch {
      // Ignora erro de lookup
    }
  }
  return { verified: false, message: 'Aguardando propagação DNS ou apontamento CNAME ainda não detectado.' };
}

/** Garante que o salão tenha plano Premium */
async function ensurePremiumSubscription(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  const slug = subscription?.plan?.slug?.toLowerCase();
  const isPremium = slug === 'premium' || slug === 'master';
  if (!isPremium) {
    throw HttpError.forbidden(
      'A configuração de Domínio e DNS próprio é exclusiva para assinantes do Plano Premium.',
      'PREMIUM_REQUIRED'
    );
  }
  return subscription;
}

/** Consulta dados e status de verificação do DNS próprio */
tenantRouter.get('/custom-domain', async (req, res) => {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: req.tenantId! },
    include: { subscription: { include: { plan: true } } },
  });

  const slug = tenant.subscription?.plan?.slug?.toLowerCase();
  const isPremium = slug === 'premium' || slug === 'master' || req.auth?.role === 'SUPER_ADMIN';
  const targetHost = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';

  let dnsStatus = { verified: false, message: 'Nenhum domínio próprio configurado.' };
  if (tenant.customDomain) {
    dnsStatus = await checkDnsPropagation(tenant.customDomain, targetHost);
  }

  res.json({
    customDomain: tenant.customDomain,
    isPremium,
    currentPlan: tenant.subscription?.plan?.name || 'Starter',
    dnsInstructions: {
      type: 'CNAME',
      name: tenant.customDomain ? (tenant.customDomain.includes('.') ? tenant.customDomain.split('.')[0] : 'agendar') : 'agendar',
      target: targetHost,
    },
    dnsStatus,
  });
});

/** Salva ou atualiza o domínio próprio do salão (Exclusivo Premium) */
tenantRouter.patch('/custom-domain', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  if (req.auth?.role !== 'SUPER_ADMIN') {
    await ensurePremiumSubscription(req.tenantId!);
  }

  const schema = z.object({
    customDomain: z.string().trim().toLowerCase(),
  });
  const { customDomain: rawDomain } = schema.parse(req.body);

  const cleanDomain = rawDomain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();

  if (!DOMAIN_REGEX.test(cleanDomain)) {
    throw HttpError.badRequest('Formato de domínio inválido. Exemplo: agendar.minhabarbearia.com.br');
  }

  if (RESERVED_DOMAINS.some((d) => cleanDomain === d || cleanDomain.endsWith(`.${d}`))) {
    throw HttpError.badRequest('Este domínio ou subdomínio é reservado pelo sistema BarberFlow.');
  }

  // Verifica unicidade
  const existing = await prisma.tenant.findUnique({
    where: { customDomain: cleanDomain },
  });
  if (existing && existing.id !== req.tenantId) {
    throw HttpError.conflict('Este domínio já está em uso por outro salão.');
  }

  const updated = await prisma.tenant.update({
    where: { id: req.tenantId! },
    data: { customDomain: cleanDomain },
  });

  const targetHost = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
  const dnsStatus = await checkDnsPropagation(cleanDomain, targetHost);

  await systemLog({
    tenantId: req.tenantId!,
    source: 'tenant',
    message: `Domínio próprio configurado: ${cleanDomain} (Status DNS: ${dnsStatus.verified ? 'Verificado' : 'Propagando'})`,
  });

  res.json({
    customDomain: updated.customDomain,
    dnsStatus,
  });
});

/** Desvincula o domínio próprio do salão */
tenantRouter.delete('/custom-domain', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const current = await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
  if (!current.customDomain) {
    return res.json({ success: true, message: 'Nenhum domínio configurado.' });
  }

  const removedDomain = current.customDomain;
  await prisma.tenant.update({
    where: { id: req.tenantId! },
    data: { customDomain: null },
  });

  await systemLog({
    tenantId: req.tenantId!,
    source: 'tenant',
    message: `Domínio próprio [${removedDomain}] removido pelo gestor.`,
  });

  res.json({ success: true, message: 'Domínio próprio desvinculado com sucesso.' });
});

