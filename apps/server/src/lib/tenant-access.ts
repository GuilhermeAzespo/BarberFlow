import type { Plan, Subscription, Tenant } from '@prisma/client';
import { DateTime } from 'luxon';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { HttpError } from './http-error.js';

export type TenantWithSubscription = Tenant & {
  subscription: (Subscription & { plan: Plan }) | null;
};

export interface TenantAccess {
  allowed: boolean;
  code: 'OK' | 'TENANT_SUSPENDED' | 'TENANT_BLOCKED' | 'TENANT_CANCELED' | 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_CANCELED';
  message: string;
  /** PAST_DUE ainda dentro da carência: acesso liberado, mas com aviso */
  warning?: string;
}

export function evaluateTenantAccess(tenant: TenantWithSubscription): TenantAccess {
  if (tenant.status === 'SUSPENDED') {
    return { allowed: false, code: 'TENANT_SUSPENDED', message: tenant.statusReason ?? 'Conta suspensa pelo suporte.' };
  }
  if (tenant.status === 'BLOCKED') {
    return {
      allowed: false,
      code: 'TENANT_BLOCKED',
      message: tenant.statusReason ?? 'Conta bloqueada por pendência financeira. Regularize sua assinatura.',
    };
  }
  if (tenant.status === 'CANCELED') {
    return { allowed: false, code: 'TENANT_CANCELED', message: 'Esta conta foi cancelada.' };
  }
  const sub = tenant.subscription;
  if (!sub) return { allowed: false, code: 'NO_SUBSCRIPTION', message: 'Nenhuma assinatura encontrada.' };
  if (sub.status === 'CANCELED') {
    return { allowed: false, code: 'SUBSCRIPTION_CANCELED', message: 'Assinatura cancelada.' };
  }
  if (sub.status === 'PAST_DUE') {
    const reference = sub.currentPeriodEnd ?? sub.trialEndsAt;
    const blockAt = reference ? DateTime.fromJSDate(reference).plus({ days: env.BILLING_GRACE_DAYS }) : null;
    return {
      allowed: true,
      code: 'OK',
      message: 'OK',
      warning: blockAt
        ? `Pagamento pendente. Regularize até ${blockAt.setZone(tenant.timezone).toFormat('dd/LL/yyyy')} para evitar bloqueio.`
        : 'Pagamento pendente.',
    };
  }
  if (sub.status === 'TRIALING' && sub.trialEndsAt) {
    const daysLeft = Math.ceil(DateTime.fromJSDate(sub.trialEndsAt).diffNow('days').days);
    if (daysLeft <= 3) {
      return { allowed: true, code: 'OK', message: 'OK', warning: `Seu período de teste termina em ${Math.max(daysLeft, 0)} dia(s).` };
    }
  }
  return { allowed: true, code: 'OK', message: 'OK' };
}

export interface EffectiveLimits {
  maxProfessionals: number | null;
  maxAppointmentsPerMonth: number | null;
  whatsappEnabled: boolean;
}

export function effectiveLimits(subscription: (Subscription & { plan: Plan }) | null): EffectiveLimits {
  if (!subscription) return { maxProfessionals: 0, maxAppointmentsPerMonth: 0, whatsappEnabled: false };
  return {
    maxProfessionals: subscription.maxProfessionalsOverride ?? subscription.plan.maxProfessionals,
    maxAppointmentsPerMonth: subscription.maxAppointmentsOverride ?? subscription.plan.maxAppointmentsPerMonth,
    whatsappEnabled: subscription.plan.whatsappEnabled,
  };
}

export async function loadTenant(tenantId: string): Promise<TenantWithSubscription> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!tenant) throw HttpError.notFound('Salão não encontrado');
  return tenant;
}

export async function assertProfessionalLimit(tenantId: string): Promise<void> {
  const tenant = await loadTenant(tenantId);
  const { maxProfessionals } = effectiveLimits(tenant.subscription);
  if (maxProfessionals === null) return;
  const count = await prisma.professional.count({ where: { tenantId, isActive: true } });
  if (count >= maxProfessionals) {
    throw HttpError.paymentRequired(
      `Seu plano permite até ${maxProfessionals} profissional(is) ativo(s). Faça upgrade para adicionar mais.`,
    );
  }
}

export async function assertAppointmentLimit(tenantId: string): Promise<void> {
  const tenant = await loadTenant(tenantId);
  const { maxAppointmentsPerMonth } = effectiveLimits(tenant.subscription);
  if (maxAppointmentsPerMonth === null) return;
  const monthStart = DateTime.now().setZone(tenant.timezone).startOf('month');
  const count = await prisma.appointment.count({
    where: {
      tenantId,
      createdAt: { gte: monthStart.toJSDate(), lte: monthStart.endOf('month').toJSDate() },
    },
  });
  if (count >= maxAppointmentsPerMonth) {
    throw HttpError.paymentRequired(
      `Limite mensal de ${maxAppointmentsPerMonth} agendamentos do seu plano atingido. Faça upgrade para continuar.`,
    );
  }
}
