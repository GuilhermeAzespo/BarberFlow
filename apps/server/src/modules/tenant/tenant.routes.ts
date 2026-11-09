import { Router } from 'express';
import dns from 'node:dns/promises';
import multer from 'multer';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { TIME_REGEX, normalizePhone, timeToMinutes } from '../../lib/utils.js';
import { requireRole } from '../../middlewares/auth.js';
import { assertPlanFeature, hasPlanFeature } from '../../lib/tenant-access.js';
import {
  provisionCustomHostname,
  deleteCustomHostname,
  verifyTlsHandshake,
  getActiveCloudflareConfig,
} from '../../lib/cloudflare.js';

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

/** Helper para testar propagação DNS + Certificado SSL (Cloudflare for SaaS / TLS 443) */
async function checkDnsPropagation(domain: string, targetCname: string) {
  let dnsVerified = false;
  let dnsDetail = '';

  try {
    const cnames = await dns.resolveCname(domain);
    const matches = cnames.some((c) => c.toLowerCase().includes(targetCname.toLowerCase()));
    if (matches) {
      dnsVerified = true;
      dnsDetail = `Apontamento CNAME (${targetCname}) detectado.`;
    }
  } catch {
    try {
      const addresses = await dns.lookup(domain);
      if (addresses?.address) {
        dnsVerified = true;
        dnsDetail = `Domínio resolvendo no servidor (IP: ${addresses.address}).`;
      }
    } catch {
      // Ignora erro de lookup
    }
  }

  // Provisiona ou sincroniza automaticamente o Custom Hostname na Cloudflare (se configurado)
  const cfProvision = await provisionCustomHostname(domain);

  if (!dnsVerified) {
    return {
      verified: false,
      dnsVerified: false,
      sslVerified: false,
      sslStatus: cfProvision.sslStatus || 'pending_dns',
      message: 'Aguardando propagação DNS: crie o apontamento CNAME no seu provedor conforme a tabela abaixo.',
    };
  }

  // Testa se o handshake SSL/TLS na porta 443 já está ativo e respondendo sem ERR_SSL_VERSION_OR_CIPHER_MISMATCH
  const tlsCheck = await verifyTlsHandshake(domain);
  const sslVerified = tlsCheck.sslVerified || cfProvision.sslStatus === 'active';

  if (sslVerified) {
    return {
      verified: true,
      dnsVerified: true,
      sslVerified: true,
      sslStatus: 'active',
      message: 'Apontamento CNAME e Certificado SSL (HTTPS) validados com sucesso! Domínio 100% ativo.',
    };
  }

  if (cfProvision.configured) {
    return {
      verified: false,
      dnsVerified: true,
      sslVerified: false,
      sslStatus: cfProvision.sslStatus || 'pending_issuance',
      message:
        cfProvision.message ||
        `${dnsDetail} Emitindo Certificado SSL gratuito na Cloudflare (leva de 1 a 3 minutos; clique em "Verificar DNS" em instantes).`,
    };
  }

  return {
    verified: false,
    dnsVerified: true,
    sslVerified: false,
    sslStatus: 'requires_cloudflare_saas',
    message: `${dnsDetail} Aguardando liberação do Certificado SSL (Custom Hostname) na Cloudflare para acesso HTTPS seguro.`,
  };
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
  const cfConfig = await getActiveCloudflareConfig();
  const targetHost = cfConfig.fallbackOrigin || process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';

  let dnsStatus = {
    verified: false,
    dnsVerified: false,
    sslVerified: false,
    sslStatus: 'none',
    message: 'Nenhum domínio próprio configurado.',
  };
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

  const currentTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: req.tenantId! } });
  if (currentTenant.customDomain && currentTenant.customDomain !== cleanDomain) {
    await deleteCustomHostname(currentTenant.customDomain).catch(() => {});
  }

  const updated = await prisma.tenant.update({
    where: { id: req.tenantId! },
    data: { customDomain: cleanDomain },
  });

  const cfConfig = await getActiveCloudflareConfig();
  const targetHost = cfConfig.fallbackOrigin || process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
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

  await deleteCustomHostname(removedDomain).catch(() => {});

  await systemLog({
    tenantId: req.tenantId!,
    source: 'tenant',
    message: `Domínio próprio [${removedDomain}] removido pelo gestor.`,
  });

  res.json({ success: true, message: 'Domínio próprio desvinculado com sucesso.' });
});

// ────────────── Integração de Recebimentos Online por Salão (Mercado Pago Direto) ──────────────

function maskToken(token?: string | null): string | null {
  if (!token) return null;
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 8)}••••••••${token.slice(-4)}`;
}

tenantRouter.get('/payment-config', async (req, res) => {
  const tenantId = req.tenantId!;
  const [hasAccess, config] = await Promise.all([
    hasPlanFeature(tenantId, 'onlinePayments').catch(() => false),
    prisma.tenantPaymentConfig.findUnique({ where: { tenantId } }),
  ]);

  const rootDomain = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';
  const webhookUrl = `https://${rootDomain}/api/webhooks/tenant-mercadopago/${tenantId}`;

  res.json({
    hasAccess,
    webhookUrl,
    config: {
      enabled: config?.enabled ?? false,
      mpPublicKey: config?.mpPublicKey ?? '',
      hasAccessToken: Boolean(config?.mpAccessToken),
      maskedAccessToken: maskToken(config?.mpAccessToken),
      mpWebhookSecret: config?.mpWebhookSecret ?? '',
      pixEnabled: config?.pixEnabled ?? true,
      creditCardEnabled: config?.creditCardEnabled ?? true,
      recurringCardEnabled: config?.recurringCardEnabled ?? true,
    },
  });
});

tenantRouter.put('/payment-config', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'onlinePayments', 'Recebimentos Online & Cartão Recorrente');

  const schema = z.object({
    enabled: z.boolean().optional(),
    mpPublicKey: z.string().trim().max(200).nullable().optional(),
    mpAccessToken: z.string().trim().max(300).nullable().optional(),
    mpWebhookSecret: z.string().trim().max(200).nullable().optional(),
    pixEnabled: z.boolean().optional(),
    creditCardEnabled: z.boolean().optional(),
    recurringCardEnabled: z.boolean().optional(),
  });

  const body = schema.parse(req.body);
  const existing = await prisma.tenantPaymentConfig.findUnique({ where: { tenantId } });

  const shouldUpdateAccessToken =
    body.mpAccessToken !== undefined &&
    body.mpAccessToken !== null &&
    !body.mpAccessToken.includes('••••');

  const finalAccessToken = shouldUpdateAccessToken
    ? body.mpAccessToken?.trim() || null
    : existing?.mpAccessToken || null;

  const finalPublicKey =
    body.mpPublicKey !== undefined ? body.mpPublicKey?.trim() || null : existing?.mpPublicKey || null;

  if (body.enabled && (!finalPublicKey || !finalAccessToken)) {
    throw HttpError.badRequest(
      'Para ativar os Recebimentos Online, preencha a Public Key e o Access Token do seu Mercado Pago.'
    );
  }

  const saved = await prisma.tenantPaymentConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      enabled: body.enabled ?? false,
      mpPublicKey: finalPublicKey,
      mpAccessToken: finalAccessToken,
      mpWebhookSecret: body.mpWebhookSecret?.trim() || null,
      pixEnabled: body.pixEnabled ?? true,
      creditCardEnabled: body.creditCardEnabled ?? true,
      recurringCardEnabled: body.recurringCardEnabled ?? true,
    },
    update: {
      enabled: body.enabled !== undefined ? body.enabled : undefined,
      mpPublicKey: finalPublicKey,
      mpAccessToken: finalAccessToken,
      mpWebhookSecret:
        body.mpWebhookSecret !== undefined ? body.mpWebhookSecret?.trim() || null : undefined,
      pixEnabled: body.pixEnabled !== undefined ? body.pixEnabled : undefined,
      creditCardEnabled: body.creditCardEnabled !== undefined ? body.creditCardEnabled : undefined,
      recurringCardEnabled:
        body.recurringCardEnabled !== undefined ? body.recurringCardEnabled : undefined,
    },
  });

  await systemLog({
    tenantId,
    source: 'tenant_payment_config',
    message: `Integração de Recebimentos Online (Mercado Pago do Salão) ${saved.enabled ? 'ATIVADA' : 'ATUALIZADA'}.`,
  });

  res.json({
    success: true,
    config: {
      enabled: saved.enabled,
      mpPublicKey: saved.mpPublicKey ?? '',
      hasAccessToken: Boolean(saved.mpAccessToken),
      maskedAccessToken: maskToken(saved.mpAccessToken),
      mpWebhookSecret: saved.mpWebhookSecret ?? '',
      pixEnabled: saved.pixEnabled,
      creditCardEnabled: saved.creditCardEnabled,
      recurringCardEnabled: saved.recurringCardEnabled,
    },
  });
});

tenantRouter.post('/payment-config/test', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'onlinePayments', 'Recebimentos Online & Cartão Recorrente');

  const rawToken = typeof req.body?.mpAccessToken === 'string' ? req.body.mpAccessToken.trim() : '';
  const existing = await prisma.tenantPaymentConfig.findUnique({ where: { tenantId } });

  const tokenToTest =
    rawToken && !rawToken.includes('••••') ? rawToken : existing?.mpAccessToken || '';

  if (!tokenToTest) {
    throw HttpError.badRequest('Informe o Access Token do Mercado Pago para testar a conexão.');
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        Authorization: `Bearer ${tokenToTest}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpRes.ok) {
      throw HttpError.badRequest(
        'Access Token inválido ou expirado no Mercado Pago. Verifique se copiou a credencial de Produção (APP_USR-...).'
      );
    }

    const userData = (await mpRes.json()) as any;
    res.json({
      valid: true,
      accountId: userData.id,
      nickname: userData.nickname || '',
      firstName: userData.first_name || '',
      lastName: userData.last_name || '',
      email: userData.email || '',
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw HttpError.badRequest('Não foi possível validar o token na API do Mercado Pago.');
  }
});


