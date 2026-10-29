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
import { extractPlanPermissions, extractPlanFeatureList } from '../../lib/tenant-access.js';
import {
  getActiveMercadoPagoConfig,
  testMercadoPagoConnection,
  getMercadoPagoWebhookUrl,
} from '../../lib/mercadopago.js';

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
    prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  // Cálculo de MRR (apenas assinaturas ativas)
  const mrrCents = subscriptions
    .filter((s) => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.plan.priceCents, 0);

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

  // Gera o token de impersonação
  const impersonationToken = signToken({
    sub: targetUser.id,
    tid: tenant.id,
    role: targetUser.role,
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
    orderBy: { sortOrder: 'asc' },
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
  const plan = await prisma.plan.create({
    data: {
      ...data,
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
  const plan = await prisma.plan.update({
    where: { id: req.params.id },
    data: {
      ...data,
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

