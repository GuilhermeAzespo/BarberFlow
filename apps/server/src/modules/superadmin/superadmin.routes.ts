import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { systemLog } from '../../lib/system-log.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';

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
    },
    plans,
  });
});

// Listagem de salões / instâncias com filtros
superAdminRouter.get('/tenants', async (req, res) => {
  const { search, status, page = '1', pageSize = '20' } = req.query;
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
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * ps,
      take: ps,
    }),
  ]);

  // Adiciona status em tempo real do WhatsApp
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
  });

  await systemLog({
    tenantId: tenant.id,
    level: data.status === 'ACTIVE' ? 'INFO' : 'WARN',
    source: 'superadmin',
    message: `Status do salão alterado para ${data.status}: ${data.statusReason || 'Sem motivo especificado'}`,
  });

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
  const plans = await prisma.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { subscriptions: true } } },
  });
  res.json({ plans });
});

superAdminRouter.post('/plans', async (req, res) => {
  const data = planSchema.parse(req.body);
  const plan = await prisma.plan.create({ data });
  res.status(201).json({ plan });
});

superAdminRouter.patch('/plans/:id', async (req, res) => {
  const data = planSchema.partial().parse(req.body);
  const plan = await prisma.plan.update({
    where: { id: req.params.id },
    data,
  });
  res.json({ plan });
});
