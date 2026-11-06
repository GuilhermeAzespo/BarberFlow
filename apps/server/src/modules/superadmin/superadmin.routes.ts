import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { signToken, authCookieOptions, AUTH_COOKIE } from '../../lib/auth-token.js';
import {
  getActiveSmtpConfig,
  testSmtpConnection,
  sendEmail,
  buildBarberFlowEmailHtml,
} from '../../lib/email.js';
import { extractPlanPermissions, extractPlanFeatureList, type PlanPermissions } from '../../lib/tenant-access.js';
import { getAddonsCatalog, saveAddonsCatalog, getAddonByKey } from '../../lib/addons.js';
import { getCouponsCatalog, saveCouponsCatalog, type SaasCoupon } from '../../lib/coupons.js';
import { getBillingCyclesConfig, saveBillingCyclesConfig } from '../../lib/billing-cycles.js';
import {
  getDunningDashboardStats,
  saveBillingDunningConfig,
  executeBillingDunning,
} from '../../lib/billing-dunning.js';
import crypto from 'node:crypto';
import {
  getActiveMercadoPagoConfig,
  testMercadoPagoConnection,
  getMercadoPagoWebhookUrl,
} from '../../lib/mercadopago.js';
import {
  getActiveCloudflareConfig,
  testCloudflareConnection,
  provisionCustomHostname,
} from '../../lib/cloudflare.js';

export const superAdminRouter = Router();

const updateTenantStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'BLOCKED', 'CANCELED']),
  statusReason: z.string().trim().max(300).nullable().optional(),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional(),
  trialEndsAt: z.coerce.date().nullable().optional(),
  currentPeriodEnd: z.coerce.date().nullable().optional(),
  maxProfessionalsOverride: z.number().int().min(1).nullable().optional(),
  maxAppointmentsOverride: z.number().int().min(1).nullable().optional(),
  nfseAddonActive: z.boolean().optional(),
  nfseAddonExpiresAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const planSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  priceCents: z.number().int().min(0),
  maxProfessionals: z.number().int().min(1).nullable().optional(),
  maxAppointmentsPerMonth: z.number().int().min(1).nullable().optional(),
  whatsappEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  badge: z.string().trim().nullable().optional(),
  isHighlighted: z.boolean().default(false),
  features: z
    .union([
      z.array(z.string()),
      z.object({
        items: z.array(z.string()).optional(),
        permissions: z.record(z.string(), z.boolean()).optional(),
      }),
    ])
    .optional(),
});

const smtpConfigSchema = z.object({
  smtpHost: z.string().trim().min(1, 'Host SMTP é obrigatório'),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpUser: z.string().trim().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().trim().min(1, 'E-mail de remetente é obrigatório'),
  smtpSecure: z.boolean().default(false),
  emailNotificationsEnabled: z.boolean().default(true),
});

const testSmtpSchema = z.object({
  to: z.string().email('E-mail de destino inválido'),
  smtpHost: z.string().trim().optional(),
  smtpPort: z.number().int().optional(),
  smtpUser: z.string().trim().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().trim().optional(),
  smtpSecure: z.boolean().optional(),
});

const broadcastEmailSchema = z.object({
  subject: z.string().trim().min(3, 'Assunto é obrigatório'),
  message: z.string().trim().min(10, 'A mensagem precisa ter pelo menos 10 caracteres'),
  target: z.enum(['ALL', 'ACTIVE', 'BLOCKED']).default('ALL'),
});

const mpConfigSchema = z.object({
  mpAccessToken: z.string().trim().optional(),
  mpPublicKey: z.string().trim().optional(),
  mpWebhookSecret: z.string().trim().optional(),
  mpSandbox: z.boolean().default(false),
  mpEnabled: z.boolean().default(true),
});

const testMpSchema = z.object({
  accessToken: z.string().trim().optional(),
});

// Métricas globais da plataforma SaaS
superAdminRouter.get('/overview', async (_req, res) => {
  const [
    totalTenants,
    activeTenants,
    suspendedTenants,
    blockedTenants,
    totalAppointments,
    subscriptions,
    plans,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    prisma.tenant.count({ where: { status: 'BLOCKED' } }),
    prisma.appointment.count(),
    prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      include: { plan: { select: { priceCents: true } } },
    }),
    prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    }),
  ]);

  // Cálculo de MRR (apenas assinaturas ativas)
  const mrrCents = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.plan.priceCents + (s.nfseAddonActive ? 2990 : 0), 0);

  res.json({
    metrics: {
      totalTenants,
      activeTenants,
      suspendedTenants,
      blockedTenants,
      totalAppointments,
      mrrCents,
      arrCents: mrrCents * 12,
    },
    plans,
  });
});

// Relatórios de Crescimento & Analytics SaaS
superAdminRouter.get('/analytics', async (_req, res) => {
  const now = DateTime.now().setZone('America/Sao_Paulo');
  const monthsData = [];

  // Últimos 6 meses
  for (let i = 5; i >= 0; i--) {
    const monthDt = now.minus({ months: i });
    const start = monthDt.startOf('month').toJSDate();
    const end = monthDt.endOf('month').toJSDate();
    const label = monthDt.toFormat('LLL/yy');

    const [newTenants, appointmentsCount] = await Promise.all([
      prisma.tenant.count({
        where: {
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.appointment.count({
        where: {
          createdAt: { gte: start, lte: end },
        },
      }),
    ]);

    monthsData.push({
      label,
      newTenants,
      appointments: appointmentsCount,
    });
  }

  // Distribuição de salões por plano
  const plansStats = await prisma.plan.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      priceCents: true,
      _count: {
        select: {
          subscriptions: {
            where: { status: { in: ['ACTIVE', 'TRIALING'] } },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  // Totais de clientes atendidos na plataforma
  const totalCustomers = await prisma.customer.count();
  const totalProfessionals = await prisma.professional.count();

  res.json({
    growthMonths: monthsData,
    plansDistribution: plansStats.map((p) => ({
      name: p.name,
      slug: p.slug,
      count: p._count.subscriptions,
      revenueCents: p.priceCents * p._count.subscriptions,
    })),
    platformStats: {
      totalCustomers,
      totalProfessionals,
    },
  });
});

// Listagem de salões / instâncias com filtros
superAdminRouter.get('/tenants', async (req, res) => {
  const { search, status, page = '1', pageSize = '30' } = req.query;
  const p = Math.max(1, parseInt(page as string, 10));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize as string, 10)));

  const where: Prisma.TenantWhereInput = {
    ...(status ? { status: status as TenantStatus } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { slug: { contains: search as string, mode: 'insensitive' } },
            { email: { contains: search as string, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, tenants] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.findMany({
      where,
      include: {
        subscription: {
          include: { plan: true },
        },
        whatsAppConfig: {
          select: { status: true, phoneNumber: true },
        },
        _count: {
          select: {
            users: true,
            professionals: true,
            appointments: true,
            customers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
    }),
  ]);

  const enrichedTenants = tenants.map((t) => {
    const conn = whatsAppService.getConnection(t.id);
    const liveStatus = conn.status !== 'DISCONNECTED' ? conn.status : (t.whatsAppConfig?.status ?? 'DISCONNECTED');
    return {
      ...t,
      whatsAppStatus: liveStatus,
    };
  });

  res.json({
    tenants: enrichedTenants,
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.ceil(total / ps),
  });
});

// Acessar Salão (Impersonation / Modo Suporte Super Admin)
superAdminRouter.post('/tenants/:id/impersonate', async (req, res) => {
  const tenantId = req.params.id;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!tenant) throw HttpError.notFound('Salão não encontrado');

  // Encontra o dono ou primeiro gestor
  const targetUser =
    tenant.users.find((u) => u.role === 'OWNER') ||
    tenant.users.find((u) => u.role === 'MANAGER') ||
    tenant.users[0];

  if (!targetUser) {
    throw HttpError.badRequest('Este salão não possui nenhum usuário cadastrado para acesso.');
  }

  // Gera o token de impersonação incluindo a referência do Super Admin autenticado
  const impersonationToken = signToken({
    sub: targetUser.id,
    tid: tenant.id,
    role: targetUser.role,
    impersonatedBy: req.auth!.userId,
  });

  res.cookie(AUTH_COOKIE, impersonationToken, authCookieOptions());

  await systemLog({
    tenantId: tenant.id,
    level: 'INFO',
    source: 'superadmin',
    message: `Super Admin acessou o salão [${tenant.name}] como ${targetUser.name} (${targetUser.email})`,
  });

  res.json({
    success: true,
    message: `Acessando salão ${tenant.name}...`,
    redirectUrl: '/dashboard',
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    },
  });
});

// Excluir Salão / Instância permanentemente (Apenas Super Admin)
superAdminRouter.delete('/tenants/:id', async (req, res) => {
  const tenantId = req.params.id;

  if (req.auth?.tenantId && req.auth.tenantId === tenantId) {
    throw HttpError.badRequest('Não é permitido excluir o salão vinculado diretamente à sua conta principal de Super Admin.');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });

  if (!tenant) throw HttpError.notFound('Salão não encontrado');

  // Desconecta qualquer sessão ativa do WhatsApp do salão
  await whatsAppService.disconnectTenant(tenantId).catch(() => {});

  // Remove o tenant (todas as tabelas filhas possuem ON DELETE CASCADE)
  await prisma.tenant.delete({
    where: { id: tenantId },
  });

  await systemLog({
    tenantId: null,
    level: 'WARN',
    source: 'superadmin',
    message: `Super Admin excluiu permanentemente o salão [${tenant.name}] (${tenant.slug})`,
    meta: { tenantId, name: tenant.name, slug: tenant.slug, deletedBy: req.auth?.userId },
  });

  res.json({
    success: true,
    message: `O salão "${tenant.name}" foi excluído permanentemente com sucesso.`,
  });
});

// Detalhes completos de uma instância
superAdminRouter.get('/tenants/:id', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: {
      subscription: { include: { plan: true } },
      whatsAppConfig: true,
      users: { select: { id: true, name: true, email: true, role: true, lastLoginAt: true } },
      _count: { select: { professionals: true, services: true, appointments: true, transactions: true, customers: true } },
    },
  });

  if (!tenant) throw HttpError.notFound('Salão não encontrado');

  const conn = whatsAppService.getConnection(tenant.id);
  const liveStatus = conn.status !== 'DISCONNECTED' ? conn.status : (tenant.whatsAppConfig?.status ?? 'DISCONNECTED');

  res.json({
    tenant: {
      ...tenant,
      whatsAppStatus: liveStatus,
    },
  });
});

// Alterar status do salão (suspensão, bloqueio por inadimplência, reativação)
superAdminRouter.patch('/tenants/:id/status', async (req, res) => {
  const data = updateTenantStatusSchema.parse(req.body);

  const tenant = await prisma.tenant.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      statusReason: data.statusReason,
      statusChangedAt: new Date(),
    },
    include: {
      users: { where: { role: 'OWNER' } },
    },
  });

  await systemLog({
    tenantId: tenant.id,
    level: data.status === 'ACTIVE' ? 'INFO' : 'WARN',
    source: 'superadmin',
    message: `Status do salão alterado para ${data.status}: ${data.statusReason || 'Sem motivo especificado'}`,
  });

  // Notificação por e-mail para o dono do salão em caso de suspensão/bloqueio ou reativação
  const ownerEmail = tenant.users[0]?.email || tenant.email;
  if (ownerEmail) {
    const isProblem = data.status === 'BLOCKED' || data.status === 'SUSPENDED';
    const title = isProblem
      ? `Aviso Importante: Status da sua conta no BarberFlow (${data.status})`
      : 'Sua conta no BarberFlow foi reativada com sucesso!';

    const html = buildBarberFlowEmailHtml({
      title,
      contentHtml: `
        <p>Olá, equipe do <strong>${tenant.name}</strong>!</p>
        <p>O status de acesso da sua instância foi atualizado para: <strong style="color: ${isProblem ? '#F43F5E' : '#10B981'};">${data.status}</strong>.</p>
        ${
          data.statusReason
            ? `<div style="background: rgba(255,255,255,0.05); border-left: 3px solid #E5B338; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><strong>Motivo informado:</strong> ${data.statusReason}</div>`
            : ''
        }
        <p>${isProblem ? 'Caso necessite regularizar seu acesso ou tenha dúvidas, por favor entre em contato com nossa equipe de suporte.' : 'Você já pode acessar e gerenciar sua barbearia normalmente através do painel.'}</p>
      `,
      actionButton: {
        text: 'Acessar Meu Painel',
        url: process.env.NEXT_PUBLIC_APP_URL || 'https://barberflow.azespo.com.br/login',
      },
    });

    sendEmail({
      to: ownerEmail,
      subject: title,
      html,
    }).catch(() => {});
  }

  res.json({ tenant });
});

// Ajustar assinatura e limites do salão
superAdminRouter.patch('/tenants/:id/subscription', async (req, res) => {
  const data = updateSubscriptionSchema.parse(req.body);

  const current = await prisma.subscription.findUnique({
    where: { tenantId: req.params.id },
  });

  if (!current) throw HttpError.notFound('Assinatura não encontrada para este salão');

  const subscription = await prisma.subscription.update({
    where: { id: current.id },
    data,
    include: { plan: true },
  });

  await systemLog({
    tenantId: req.params.id,
    source: 'superadmin',
    message: `Assinatura atualizada: status ${subscription.status}, plano ${subscription.plan.name}`,
  });

  res.json({ subscription });
});

// Logs de suporte e auditoria
superAdminRouter.get('/logs', async (req, res) => {
  const { tenantId, level, source, page = '1', pageSize = '50' } = req.query;
  const p = Math.max(1, parseInt(page as string, 10));
  const ps = Math.min(100, Math.max(1, parseInt(pageSize as string, 10)));

  const where: Prisma.SystemLogWhereInput = {
    ...(tenantId ? { tenantId: tenantId as string } : {}),
    ...(level ? { level: level as Prisma.EnumLogLevelFilter['equals'] } : {}),
    ...(source ? { source: source as string } : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.systemLog.count({ where }),
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  res.json({
    logs,
    total,
    page: p,
    pageSize: ps,
    totalPages: Math.ceil(total / ps),
  });
});

// Planos do SaaS: listagem, criação e edição
superAdminRouter.get('/plans', async (_req, res) => {
  const rawPlans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
    include: { _count: { select: { subscriptions: true } } },
  });
  const plans = rawPlans.map((p) => ({
    ...p,
    featureList: extractPlanFeatureList(p.features),
    permissions: extractPlanPermissions(p),
  }));
  res.json({ plans });
});

superAdminRouter.post('/plans', async (req, res) => {
  const data = planSchema.parse(req.body);
  const effectiveSlug = (data.slug || '').toLowerCase();
  const fixedOrder = effectiveSlug === 'starter' ? 1 : effectiveSlug === 'pro' ? 2 : effectiveSlug === 'premium' ? 3 : data.sortOrder;

  const plan = await prisma.plan.create({
    data: {
      ...data,
      ...(fixedOrder !== undefined ? { sortOrder: fixedOrder } : {}),
      features: (data.features as Prisma.InputJsonValue) ?? undefined,
    },
  });

  await systemLog({
    source: 'superadmin',
    message: `Novo plano criado: ${plan.name} (${plan.slug}) a R$ ${(plan.priceCents / 100).toFixed(2)}`,
  });

  res.status(201).json({ plan });
});

superAdminRouter.patch('/plans/:id', async (req, res) => {
  const data = planSchema.partial().parse(req.body);
  const existing = await prisma.plan.findUnique({ where: { id: req.params.id } });

  const effectiveSlug = (data.slug || existing?.slug || '').toLowerCase();
  const fixedOrder = effectiveSlug === 'starter' ? 1 : effectiveSlug === 'pro' ? 2 : effectiveSlug === 'premium' ? 3 : data.sortOrder;

  const plan = await prisma.plan.update({
    where: { id: req.params.id },
    data: {
      ...data,
      ...(fixedOrder !== undefined ? { sortOrder: fixedOrder } : {}),
      ...(data.features !== undefined ? { features: data.features as Prisma.InputJsonValue } : {}),
    },
  });

  await systemLog({
    source: 'superadmin',
    message: `Plano atualizado: ${plan.name} (${plan.slug}) a R$ ${(plan.priceCents / 100).toFixed(2)}`,
  });

  res.json({ plan });
});

// ─────────────────────── Configurações de SMTP ───────────────────────

superAdminRouter.get('/smtp', async (_req, res) => {
  const setting = await prisma.systemSetting.findUnique({
    where: { id: 'global' },
  });

  const envConfig = await getActiveSmtpConfig();

  res.json({
    config: {
      smtpHost: setting?.smtpHost || process.env.SMTP_HOST || '',
      smtpPort: setting?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587),
      smtpUser: setting?.smtpUser || process.env.SMTP_USER || '',
      smtpFrom: setting?.smtpFrom || process.env.SMTP_FROM || 'BarberFlow <notificacoes@barberflow.com.br>',
      smtpSecure: setting?.smtpSecure ?? (setting?.smtpPort === 465),
      emailNotificationsEnabled: setting?.emailNotificationsEnabled ?? true,
      hasPassword: Boolean(setting?.smtpPass || process.env.SMTP_PASS),
      isConfigured: Boolean(envConfig),
    },
  });
});

superAdminRouter.put('/smtp', async (req, res) => {
  const data = smtpConfigSchema.parse(req.body);

  const existing = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  // Se smtpPass não foi preenchido ou é vazio, mantém a senha salva anteriormente
  const finalPass = data.smtpPass && data.smtpPass.trim() !== '' ? data.smtpPass : existing?.smtpPass;

  const setting = await prisma.systemSetting.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser || null,
      smtpPass: finalPass || null,
      smtpFrom: data.smtpFrom,
      smtpSecure: data.smtpSecure,
      emailNotificationsEnabled: data.emailNotificationsEnabled,
    },
    update: {
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUser: data.smtpUser || null,
      smtpPass: finalPass || null,
      smtpFrom: data.smtpFrom,
      smtpSecure: data.smtpSecure,
      emailNotificationsEnabled: data.emailNotificationsEnabled,
    },
  });

  await systemLog({
    source: 'superadmin',
    message: `Configurações de SMTP atualizadas (${setting.smtpHost}:${setting.smtpPort})`,
  });

  res.json({
    success: true,
    message: 'Configurações de SMTP salvas com sucesso!',
  });
});

superAdminRouter.post('/smtp/test', async (req, res) => {
  const data = testSmtpSchema.parse(req.body);

  const existing = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
  const host = data.smtpHost || existing?.smtpHost || process.env.SMTP_HOST;
  const port = data.smtpPort || existing?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
  const user = data.smtpUser ?? (existing?.smtpUser || process.env.SMTP_USER);
  const pass = data.smtpPass || existing?.smtpPass || process.env.SMTP_PASS;
  const from = data.smtpFrom || existing?.smtpFrom || process.env.SMTP_FROM || 'BarberFlow <notificacoes@barberflow.com.br>';
  const secure = data.smtpSecure ?? (port === 465);

  if (!host) {
    throw HttpError.badRequest('Preencha o Host do servidor SMTP para testar.');
  }

  const testConfig = {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    from,
  };

  const connectionResult = await testSmtpConnection(testConfig);
  if (!connectionResult.success) {
    throw HttpError.badRequest(`Falha ao conectar no SMTP: ${connectionResult.message}`);
  }

  // Dispara o e-mail de teste
  const html = buildBarberFlowEmailHtml({
    title: 'Teste de Configuração de E-mail',
    contentHtml: `
      <p>Parabéns! Se você está lendo esta mensagem, o seu servidor <strong>SMTP</strong> foi configurado com sucesso no BarberFlow.</p>
      <div style="background: rgba(229, 179, 56, 0.1); border: 1px solid rgba(229, 179, 56, 0.25); border-radius: 8px; padding: 14px; margin: 18px 0; font-size: 13px;">
        <strong>Host:</strong> ${host}<br>
        <strong>Porta:</strong> ${port}<br>
        <strong>Remetente:</strong> ${from}<br>
        <strong>Data/Hora do Teste:</strong> ${DateTime.now().setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm:ss')}
      </div>
      <p>Agora a sua plataforma pode disparar notificações, avisos de cobrança e comunicados em massa com total segurança e alta entregabilidade.</p>
    `,
  });

  const sent = await sendEmail({
    to: data.to,
    subject: '✂️ BarberFlow — Teste de Configuração SMTP Concluído!',
    html,
  });

  if (!sent) {
    throw HttpError.badRequest('Conexão aceita, mas ocorreu uma falha ao entregar o e-mail de teste. Verifique o remetente.');
  }

  res.json({
    success: true,
    message: `E-mail de teste enviado com sucesso para ${data.to}!`,
  });
});

// Envio de Comunicado em Massa (Broadcast)
superAdminRouter.post('/broadcast-email', async (req, res) => {
  const data = broadcastEmailSchema.parse(req.body);

  const where: Prisma.TenantWhereInput =
    data.target === 'ACTIVE'
      ? { status: 'ACTIVE' }
      : data.target === 'BLOCKED'
      ? { status: 'BLOCKED' }
      : {};

  const tenants = await prisma.tenant.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      users: {
        where: { role: 'OWNER' },
        select: { email: true, name: true },
      },
    },
  });

  const recipientEmails = new Set<string>();
  for (const t of tenants) {
    if (t.email) recipientEmails.add(t.email);
    for (const u of t.users) {
      if (u.email) recipientEmails.add(u.email);
    }
  }

  const list = Array.from(recipientEmails);
  if (list.length === 0) {
    throw HttpError.badRequest('Nenhum destinatário encontrado com o filtro selecionado.');
  }

  const html = buildBarberFlowEmailHtml({
    title: data.subject,
    contentHtml: `<div style="white-space: pre-wrap;">${data.message}</div>`,
    actionButton: {
      text: 'Acessar BarberFlow',
      url: process.env.NEXT_PUBLIC_APP_URL || 'https://barberflow.azespo.com.br',
    },
  });

  let sentCount = 0;
  // Dispara em lotes pequenos para evitar rate limit do SMTP
  for (const email of list) {
    const success = await sendEmail({
      to: email,
      subject: `[BarberFlow] ${data.subject}`,
      html,
    });
    if (success) sentCount++;
  }

  await systemLog({
    source: 'superadmin',
    message: `Comunicado por e-mail enviado para ${sentCount} salões (Filtro: ${data.target})`,
  });

  res.json({
    success: true,
    totalRecipients: list.length,
    sentCount,
    message: `Comunicado enviado para ${sentCount} de ${list.length} destinatários com sucesso!`,
  });
});

// ─────────────────────── Integração Mercado Pago ───────────────────────

superAdminRouter.get('/integrations/mercadopago', async (req, res) => {
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
  const config = await getActiveMercadoPagoConfig();

  const token = setting?.mpAccessToken || process.env.MP_ACCESS_TOKEN || '';
  const maskedToken = token ? `${token.slice(0, 12)}****************${token.slice(-4)}` : '';

  const webhookUrl = getMercadoPagoWebhookUrl(req);

  res.json({
    config: {
      mpPublicKey: setting?.mpPublicKey || process.env.MP_PUBLIC_KEY || '',
      mpAccessTokenMasked: maskedToken,
      hasAccessToken: Boolean(token),
      mpWebhookSecret: setting?.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET || '',
      mpSandbox: config.sandbox,
      mpEnabled: config.enabled,
      isConfigured: config.isConfigured,
      webhookUrl,
    },
  });
});

superAdminRouter.put('/integrations/mercadopago', async (req, res) => {
  const data = mpConfigSchema.parse(req.body);
  const existing = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  const finalAccessToken =
    data.mpAccessToken && data.mpAccessToken.trim() !== ''
      ? data.mpAccessToken.trim()
      : existing?.mpAccessToken;

  const finalPublicKey =
    data.mpPublicKey !== undefined
      ? data.mpPublicKey.trim() || null
      : existing?.mpPublicKey;

  const finalWebhookSecret =
    data.mpWebhookSecret !== undefined
      ? data.mpWebhookSecret.trim() || null
      : existing?.mpWebhookSecret;

  await prisma.systemSetting.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      mpAccessToken: finalAccessToken || null,
      mpPublicKey: finalPublicKey,
      mpWebhookSecret: finalWebhookSecret,
      mpSandbox: data.mpSandbox,
      mpEnabled: data.mpEnabled,
    },
    update: {
      mpAccessToken: finalAccessToken || null,
      mpPublicKey: finalPublicKey,
      mpWebhookSecret: finalWebhookSecret,
      mpSandbox: data.mpSandbox,
      mpEnabled: data.mpEnabled,
    },
  });

  await systemLog({
    source: 'superadmin',
    message: `Configurações do Mercado Pago atualizadas (Sandbox: ${data.mpSandbox}, Ativo: ${data.mpEnabled})`,
  });

  res.json({
    success: true,
    message: 'Configurações do Mercado Pago salvas com sucesso!',
  });
});

superAdminRouter.post('/integrations/mercadopago/test', async (req, res) => {
  const data = testMpSchema.parse(req.body);
  const existing = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
  const token = data.accessToken || existing?.mpAccessToken || process.env.MP_ACCESS_TOKEN;

  if (!token) {
    throw HttpError.badRequest('Informe o Access Token do Mercado Pago para testar a conexão.');
  }

  const result = await testMercadoPagoConnection(token);
  if (!result.success) {
    throw HttpError.badRequest(result.message);
  }

  res.json(result);
});

// ─────────────────────── Integração Cloudflare for SaaS (SSL / Custom Domains) ───────────────────────

const cfConfigSchema = z.object({
  cfApiToken: z.string().trim().optional(),
  cfZoneId: z.string().trim().optional(),
  cfFallbackOrigin: z.string().trim().optional(),
  cfEnabled: z.boolean().default(true),
});

superAdminRouter.get('/integrations/cloudflare', async (_req, res) => {
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
  const config = await getActiveCloudflareConfig();

  const token = setting?.cfApiToken || process.env.CLOUDFLARE_API_TOKEN || '';
  const maskedToken = token ? `${token.slice(0, 8)}****************${token.slice(-4)}` : '';

  const customDomainsCount = await prisma.tenant.count({
    where: { customDomain: { not: null } },
  });

  res.json({
    config: {
      cfZoneId: setting?.cfZoneId || process.env.CLOUDFLARE_ZONE_ID || '',
      cfFallbackOrigin: config.fallbackOrigin,
      cfApiTokenMasked: maskedToken,
      hasApiToken: Boolean(token),
      cfEnabled: config.enabled,
      isConfigured: config.isConfigured,
      customDomainsCount,
    },
  });
});

superAdminRouter.put('/integrations/cloudflare', async (req, res) => {
  const data = cfConfigSchema.parse(req.body);
  const existing = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  const finalToken =
    data.cfApiToken && data.cfApiToken.trim() !== ''
      ? data.cfApiToken.trim()
      : existing?.cfApiToken;

  const finalZoneId =
    data.cfZoneId !== undefined
      ? data.cfZoneId.trim() || null
      : existing?.cfZoneId;

  const finalFallbackOrigin =
    data.cfFallbackOrigin && data.cfFallbackOrigin.trim() !== ''
      ? data.cfFallbackOrigin.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
      : existing?.cfFallbackOrigin || 'barberflow.azespo.com.br';

  await prisma.systemSetting.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      cfApiToken: finalToken || null,
      cfZoneId: finalZoneId,
      cfFallbackOrigin: finalFallbackOrigin,
      cfEnabled: data.cfEnabled,
    },
    update: {
      cfApiToken: finalToken || null,
      cfZoneId: finalZoneId,
      cfFallbackOrigin: finalFallbackOrigin,
      cfEnabled: data.cfEnabled,
    },
  });

  await systemLog({
    source: 'superadmin',
    message: `Configurações do Cloudflare for SaaS atualizadas (Zone: ${finalZoneId || 'N/A'}, Fallback: ${finalFallbackOrigin})`,
  });

  res.json({
    success: true,
    message: 'Configurações da Cloudflare salvas com sucesso!',
  });
});

superAdminRouter.post('/integrations/cloudflare/test', async (req, res) => {
  const { cfApiToken, cfZoneId, cfFallbackOrigin } = cfConfigSchema.partial().parse(req.body || {});
  const result = await testCloudflareConnection({
    apiToken: cfApiToken,
    zoneId: cfZoneId,
    fallbackOrigin: cfFallbackOrigin,
  });

  if (!result.success) {
    throw HttpError.badRequest(result.message);
  }

  res.json(result);
});

superAdminRouter.post('/integrations/cloudflare/sync', async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    where: { customDomain: { not: null } },
    select: { id: true, name: true, customDomain: true },
  });

  if (tenants.length === 0) {
    return res.json({
      success: true,
      synced: 0,
      results: [],
      message: 'Nenhum salão possui domínio próprio cadastrado no momento.',
    });
  }

  const results = [];
  let syncedCount = 0;

  for (const t of tenants) {
    if (!t.customDomain) continue;
    const resProvision = await provisionCustomHostname(t.customDomain);
    if (resProvision.success) syncedCount++;
    results.push({
      tenantName: t.name,
      domain: t.customDomain,
      ...resProvision,
    });
  }

  await systemLog({
    source: 'superadmin',
    message: `Sincronização de SSL Cloudflare executada para ${syncedCount}/${tenants.length} domínios próprios`,
  });

  res.json({
    success: true,
    synced: syncedCount,
    total: tenants.length,
    results,
    message: results.find((r) => r.tunnelWarning)?.tunnelWarning
      ? `SSL sincronizado (${syncedCount}/${tenants.length}), mas atenção ao Túnel: ${results.find((r) => r.tunnelWarning)?.tunnelWarning}`
      : `Sincronização concluída: ${syncedCount} de ${tenants.length} domínio(s) com SSL e Túnel sincronizados na Cloudflare!`,
  });
});

// ─────────────────────── Gestão de Add-ons & Módulos Avulsos ───────────────────────

const updateAddonsSchema = z.object({
  addons: z.array(
    z.object({
      key: z.string(),
      isAddon: z.boolean().optional(),
      priceCents: z.number().int().min(0).optional(),
      name: z.string().trim().optional(),
      description: z.string().trim().optional(),
      includedInPlans: z.record(z.string(), z.boolean()).optional(),
    }),
  ),
});

superAdminRouter.get('/addons', async (_req, res) => {
  const [catalog, plans, activeAddonSubscriptions] = await Promise.all([
    getAddonsCatalog(),
    prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] }),
    prisma.subscription.count({ where: { nfseAddonActive: true } }),
  ]);

  const enrichedAddons = catalog.map((addon) => {
    const includedInPlans: Record<string, boolean> = {};
    for (const p of plans) {
      const perms = extractPlanPermissions(p);
      includedInPlans[p.slug.toLowerCase()] = Boolean(perms[addon.key]);
    }
    return {
      ...addon,
      includedInPlans,
    };
  });

  res.json({
    addons: enrichedAddons,
    stats: {
      totalModules: enrichedAddons.length,
      activeAddonsCount: enrichedAddons.filter((a) => a.isAddon).length,
      activeSalonsWithAddon: activeAddonSubscriptions,
    },
  });
});

superAdminRouter.put('/addons', async (req, res) => {
  const data = updateAddonsSchema.parse(req.body);

  const savedCatalog = await saveAddonsCatalog(
    data.addons.map((a) => ({
      key: a.key as keyof PlanPermissions,
      isAddon: a.isAddon,
      priceCents: a.priceCents,
      name: a.name,
      description: a.description,
    })),
  );

  // Sincroniza também as permissões inclusas gratuitamente nos planos (Starter, Pro, Premium)
  const plans = await prisma.plan.findMany();
  for (const plan of plans) {
    const slug = plan.slug.toLowerCase();
    const currentPerms = extractPlanPermissions(plan);
    const currentItems = extractPlanFeatureList(plan.features);
    let changed = false;

    for (const addonUpdate of data.addons) {
      if (addonUpdate.includedInPlans && typeof addonUpdate.includedInPlans[slug] === 'boolean') {
        const key = addonUpdate.key as keyof PlanPermissions;
        if (currentPerms[key] !== addonUpdate.includedInPlans[slug]) {
          currentPerms[key] = addonUpdate.includedInPlans[slug];
          changed = true;
        }
      }
    }

    if (changed) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: {
          features: {
            items: currentItems,
            permissions: currentPerms as unknown as Prisma.InputJsonValue,
          },
        },
      });
    }
  }

  const updatedPlans = await prisma.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] });
  const enrichedAddons = savedCatalog.map((addon) => {
    const includedInPlans: Record<string, boolean> = {};
    for (const p of updatedPlans) {
      const perms = extractPlanPermissions(p);
      includedInPlans[p.slug.toLowerCase()] = Boolean(perms[addon.key]);
    }
    return {
      ...addon,
      includedInPlans,
    };
  });

  await systemLog({
    source: 'superadmin',
    message: `Configurações e preços de Add-ons atualizados (${enrichedAddons.filter((a) => a.isAddon).length} módulos como Add-on)`,
  });

  res.json({
    success: true,
    message: 'Configurações de Add-ons e valores salvos com sucesso!',
    addons: enrichedAddons,
  });
});

// ─────────────────────── Gestão de Cupons de Desconto SaaS ───────────────────────

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'O código do cupom deve ter pelo menos 2 caracteres')
    .max(30, 'O código do cupom deve ter no máximo 30 caracteres')
    .transform((v) => v.toUpperCase().replace(/[^A-Z0-9_-]/g, '')),
  description: z.string().trim().max(150).optional().default(''),
  discountType: z.enum(['PERCENTAGE', 'FIXED_CENTS']),
  discountValue: z.number().int().min(1, 'O valor do desconto deve ser maior que zero'),
  appliesTo: z.enum(['ALL', 'PLANS_ONLY', 'ADDONS_ONLY']).default('ALL'),
  maxUses: z.number().int().min(1).nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

superAdminRouter.get('/coupons', async (_req, res) => {
  const coupons = await getCouponsCatalog();
  res.json({
    coupons,
    stats: {
      total: coupons.length,
      activeCount: coupons.filter((c) => c.isActive).length,
      totalUses: coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0),
    },
  });
});

// ───────────────── Ciclos de Cobrança (Mensal / Semestral / Anual) ─────────────────
const cycleOptionSchema = z.object({
  enabled: z.boolean(),
  discountPct: z.coerce.number().int().min(0, 'Desconto mínimo de 0%').max(60, 'Desconto máximo de 60%'),
  maxInstallments: z.coerce.number().int().min(1).max(12),
});

superAdminRouter.get('/billing-cycles', async (_req, res) => {
  const config = await getBillingCyclesConfig();
  res.json({ config });
});

superAdminRouter.put('/billing-cycles', async (req, res) => {
  const data = z
    .object({
      SEMIANNUAL: cycleOptionSchema.refine((v) => v.maxInstallments <= 6, {
        message: 'O ciclo Semestral permite no máximo 6 parcelas.',
      }),
      ANNUAL: cycleOptionSchema,
    })
    .parse(req.body || {});

  const config = await saveBillingCyclesConfig(data);

  await systemLog({
    source: 'superadmin',
    message: `Ciclos de cobrança atualizados: Semestral ${config.SEMIANNUAL.enabled ? `${config.SEMIANNUAL.discountPct}% OFF / ${config.SEMIANNUAL.maxInstallments}x` : 'desativado'} • Anual ${config.ANNUAL.enabled ? `${config.ANNUAL.discountPct}% OFF / ${config.ANNUAL.maxInstallments}x` : 'desativado'}`,
  });

  res.json({ config, message: 'Ciclos de cobrança salvos com sucesso!' });
});

superAdminRouter.post('/coupons', async (req, res) => {
  const data = couponSchema.parse(req.body);
  if (!data.code) {
    throw HttpError.badRequest('Informe um código alfanumérico válido para o cupom.');
  }
  if (data.discountType === 'PERCENTAGE' && (data.discountValue < 1 || data.discountValue > 99)) {
    throw HttpError.badRequest('O desconto percentual deve estar entre 1% e 99%.');
  }

  const current = await getCouponsCatalog();
  if (current.some((c) => c.code === data.code)) {
    throw HttpError.conflict(`Já existe um cupom cadastrado com o código "${data.code}".`);
  }

  const newCoupon: SaasCoupon = {
    id: crypto.randomUUID(),
    code: data.code,
    description: data.description || '',
    discountType: data.discountType,
    discountValue: data.discountValue,
    appliesTo: data.appliesTo,
    maxUses: data.maxUses ?? null,
    usedCount: 0,
    expiresAt: data.expiresAt || null,
    isActive: data.isActive,
    createdAt: new Date().toISOString(),
  };

  const nextList = [newCoupon, ...current];
  await saveCouponsCatalog(nextList);

  await systemLog({
    source: 'superadmin',
    message: `Cupom de desconto criado: ${newCoupon.code} (${
      newCoupon.discountType === 'PERCENTAGE'
        ? `${newCoupon.discountValue}%`
        : `R$ ${(newCoupon.discountValue / 100).toFixed(2)}`
    })`,
  });

  res.status(201).json({
    success: true,
    coupon: newCoupon,
    coupons: nextList,
    message: `Cupom ${newCoupon.code} criado com sucesso!`,
  });
});

superAdminRouter.patch('/coupons/:id', async (req, res) => {
  const { id } = req.params;
  const data = couponSchema.partial().parse(req.body);

  const current = await getCouponsCatalog();
  const idx = current.findIndex((c) => c.id === id);
  if (idx === -1) {
    throw HttpError.notFound('Cupom não encontrado.');
  }

  const target = current[idx];
  const nextCode = data.code ? data.code.toUpperCase() : target.code;

  if (nextCode !== target.code && current.some((c) => c.code === nextCode && c.id !== id)) {
    throw HttpError.conflict(`Já existe outro cupom com o código "${nextCode}".`);
  }

  const updatedCoupon: SaasCoupon = {
    ...target,
    code: nextCode,
    description: data.description !== undefined ? data.description : target.description,
    discountType: data.discountType ?? target.discountType,
    discountValue: data.discountValue !== undefined ? data.discountValue : target.discountValue,
    appliesTo: data.appliesTo ?? target.appliesTo,
    maxUses: data.maxUses !== undefined ? data.maxUses : target.maxUses,
    expiresAt: data.expiresAt !== undefined ? data.expiresAt : target.expiresAt,
    isActive: data.isActive !== undefined ? data.isActive : target.isActive,
  };

  const nextList = [...current];
  nextList[idx] = updatedCoupon;
  await saveCouponsCatalog(nextList);

  await systemLog({
    source: 'superadmin',
    message: `Cupom ${updatedCoupon.code} atualizado (Ativo: ${updatedCoupon.isActive})`,
  });

  res.json({
    success: true,
    coupon: updatedCoupon,
    coupons: nextList,
    message: `Cupom ${updatedCoupon.code} atualizado com sucesso!`,
  });
});

superAdminRouter.delete('/coupons/:id', async (req, res) => {
  const { id } = req.params;
  const current = await getCouponsCatalog();
  const target = current.find((c) => c.id === id);
  if (!target) {
    throw HttpError.notFound('Cupom não encontrado.');
  }

  const nextList = current.filter((c) => c.id !== id);
  await saveCouponsCatalog(nextList);

  await systemLog({
    source: 'superadmin',
    message: `Cupom de desconto excluído: ${target.code}`,
  });

  res.json({
    success: true,
    coupons: nextList,
    message: `Cupom ${target.code} removido com sucesso!`,
  });
});

// ────────────────────── Régua Automática de Cobrança (Fase 3) ──────────────────────

const updateDunningSchema = z.object({
  enabled: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  sendInAppWarning: z.boolean().optional(),
  dMinus3Enabled: z.boolean().optional(),
  dDayEnabled: z.boolean().optional(),
  dPlus2Enabled: z.boolean().optional(),
});

superAdminRouter.get('/billing-dunning', async (_req, res) => {
  const stats = await getDunningDashboardStats();
  res.json(stats);
});

superAdminRouter.put('/billing-dunning', async (req, res) => {
  const data = updateDunningSchema.parse(req.body || {});
  const updated = await saveBillingDunningConfig(data);

  await systemLog({
    source: 'superadmin',
    message: `Configurações da Régua de Cobrança atualizadas (Ativa: ${updated.enabled}, E-mail: ${updated.sendEmail}, D-3: ${updated.dMinus3Enabled}, D0: ${updated.dDayEnabled}, D+2: ${updated.dPlus2Enabled})`,
  });

  res.json({
    success: true,
    config: updated,
    message: 'Configurações da régua de cobrança salvas com sucesso!',
  });
});

superAdminRouter.post('/billing-dunning/run-now', async (_req, res) => {
  const summary = await executeBillingDunning({ force: true });

  await systemLog({
    source: 'superadmin',
    message: `Régua de cobrança disparada manualmente pelo Super Admin: ${summary.noticesSent} avisos enviados, ${summary.pixGenerated} PIX gerados, ${summary.errors} erros (${summary.tenantsChecked} salões analisados)`,
  });

  res.json({
    success: true,
    summary,
    message: `Varredura concluída! ${summary.noticesSent} aviso(s) enviado(s) e ${summary.pixGenerated} PIX gerado(s).`,
  });
});
