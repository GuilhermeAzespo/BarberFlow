import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AUTH_COOKIE, authCookieOptions, signToken } from '../../lib/auth-token.js';
import { DEFAULT_BUSINESS_HOURS, DEFAULT_WHATSAPP_MESSAGES } from '../../lib/defaults.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { effectiveLimits, evaluateTenantAccess } from '../../lib/tenant-access.js';
import { slugify } from '../../lib/utils.js';
import { requireAuth } from '../../middlewares/auth.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde alguns minutos.' } },
});

const registerSchema = z.object({
  ownerName: z.string().trim().min(2, 'Informe seu nome'),
  salonName: z.string().trim().min(2, 'Informe o nome do salão').max(80),
  email: z.email('E-mail inválido').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(128),
});

const loginSchema = z.object({
  email: z.email('E-mail inválido').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Informe a senha'),
});

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'salao';
  let candidate = root;
  for (let attempt = 1; attempt < 50; attempt++) {
    const exists = await prisma.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
    candidate = `${root}-${attempt + 1}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Cadastro self-service: cria Tenant + Owner + Assinatura trial + configurações padrão em uma transação. */
authRouter.post('/register', authLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) throw HttpError.conflict('Já existe uma conta com este e-mail', 'EMAIL_IN_USE');

  const plan =
    (await prisma.plan.findFirst({ where: { isDefault: true, isActive: true } })) ??
    (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }));
  if (!plan) throw new HttpError(503, 'Nenhum plano disponível. Contate o suporte.', 'NO_PLAN');

  const slug = await uniqueSlug(data.salonName);
  const passwordHash = await bcrypt.hash(data.password, 12);
  const trialEndsAt = DateTime.now().plus({ days: env.TRIAL_DAYS }).toJSDate();

  const { user, tenant } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: data.salonName,
        slug,
        email: data.email,
        subscription: {
          create: {
            planId: plan.id,
            status: env.TRIAL_DAYS > 0 ? 'TRIALING' : 'ACTIVE',
            trialEndsAt: env.TRIAL_DAYS > 0 ? trialEndsAt : null,
            currentPeriodStart: new Date(),
            currentPeriodEnd: env.TRIAL_DAYS > 0 ? null : DateTime.now().plus({ months: 1 }).toJSDate(),
          },
        },
        businessHours: { createMany: { data: DEFAULT_BUSINESS_HOURS } },
        whatsAppConfig: { create: { ...DEFAULT_WHATSAPP_MESSAGES } },
      },
    });
    const user = await tx.user.create({
      data: { tenantId: tenant.id, name: data.ownerName, email: data.email, passwordHash, role: 'OWNER', lastLoginAt: new Date() },
    });
    return { user, tenant };
  });

  await systemLog({
    tenantId: tenant.id,
    source: 'auth',
    message: `Novo salão cadastrado: ${tenant.name}`,
    meta: { userId: user.id, plan: plan.slug },
  });

  const token = signToken({ sub: user.id, tid: tenant.id, role: user.role });
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, onboardingCompleted: tenant.onboardingCompleted },
  });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  // Hash fictício para manter tempo de resposta constante e evitar enumeração de e-mails
  const valid = await bcrypt.compare(data.password, user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEeO6zE8bQ1lQx8eXvBPRb6dQyYw5Wm1h2e');
  if (!user || !valid) throw HttpError.unauthorized('E-mail ou senha incorretos');
  if (!user.isActive) throw HttpError.forbidden('Usuário desativado. Contate o administrador.', 'USER_DISABLED');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id, tid: user.tenantId, role: user.role });
  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...options } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE, options);
  res.status(204).end();
});

/** Sessão atual + situação do tenant (não bloqueia tenants suspensos, para o front exibir o aviso). */
authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      permissions: true,
      tenantId: true,
      lastLoginAt: true,
      professional: { select: { id: true, name: true, color: true } },
    },
  });

  if (!user.tenantId) {
    return res.json({ user, tenant: null, access: { allowed: true, code: 'OK', message: 'OK' } });
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  const access = evaluateTenantAccess(tenant);
  const sub = tenant.subscription;

  res.json({
    user,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      phone: tenant.phone,
      address: tenant.address,
      timezone: tenant.timezone,
      currency: tenant.currency,
      slotIntervalMinutes: tenant.slotIntervalMinutes,
      onboardingCompleted: tenant.onboardingCompleted,
      status: tenant.status,
    },
    subscription: sub
      ? {
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          plan: { id: sub.plan.id, name: sub.plan.name, slug: sub.plan.slug, priceCents: sub.plan.priceCents },
          limits: effectiveLimits(sub),
        }
      : null,
    access,
    isImpersonated: Boolean(req.auth?.impersonatedBy),
    impersonatedBy: req.auth?.impersonatedBy ?? null,
  });
});

/** Sai do modo de personificação (impersonation) e restaura a sessão original do Super Admin */
authRouter.post('/exit-impersonation', requireAuth, async (req, res) => {
  const superAdminId = req.auth?.impersonatedBy;
  if (!superAdminId) {
    throw HttpError.badRequest('Você não está em uma sessão de personificação de suporte.');
  }

  const superAdmin = await prisma.user.findUnique({
    where: { id: superAdminId },
  });

  if (!superAdmin || superAdmin.role !== 'SUPER_ADMIN' || !superAdmin.isActive) {
    throw HttpError.forbidden('Conta de Super Admin não encontrada ou inativa.');
  }

  const token = signToken({
    sub: superAdmin.id,
    tid: superAdmin.tenantId ?? null,
    role: superAdmin.role,
  });

  res.cookie(AUTH_COOKIE, token, authCookieOptions());

  await systemLog({
    tenantId: null,
    source: 'superadmin',
    message: `Super Admin ${superAdmin.email} encerrou acesso de suporte/personificação`,
    meta: { superAdminId },
  });

  res.json({
    token,
    user: { id: superAdmin.id, name: superAdmin.name, email: superAdmin.email, role: superAdmin.role },
  });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres').max(128),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
  const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!valid) throw HttpError.badRequest('Senha atual incorreta');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(data.newPassword, 12) } });
  res.status(204).end();
});

