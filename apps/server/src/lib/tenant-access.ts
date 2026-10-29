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
    const diff = DateTime.fromJSDate(sub.trialEndsAt).diffNow('days');
    const daysLeft = Math.ceil(diff.days);
    const dateFormatted = DateTime.fromJSDate(sub.trialEndsAt).setZone(tenant.timezone).toFormat('dd/LL/yyyy');

    if (daysLeft <= 0) {
      const graceEnd = DateTime.fromJSDate(sub.trialEndsAt).plus({ days: env.BILLING_GRACE_DAYS });
      const graceDiff = Math.ceil(graceEnd.diffNow('days').days);
      if (graceDiff <= 0) {
        return {
          allowed: false,
          code: 'TENANT_BLOCKED',
          message: 'Seu período de teste gratuito de 14 dias terminou. Cadastre seu cartão de crédito ou realize o pagamento via Pix para continuar utilizando o BarberFlow.',
        };
      }
      return {
        allowed: true,
        code: 'OK',
        message: 'OK',
        warning: `⚠️ Seu período de teste de 14 dias terminou! Cadastre um cartão de crédito ou gere um Pix agora para manter seu salão funcionando sem interrupções.`,
      };
    }

    if (daysLeft <= 3) {
      return {
        allowed: true,
        code: 'OK',
        message: 'OK',
        warning: `⚠️ Seu teste gratuito de 14 dias finaliza em ${daysLeft} dia(s) (${dateFormatted}). Cadastre seu cartão ou gere um Pix para continuar.`,
      };
    }

    return {
      allowed: true,
      code: 'OK',
      message: 'OK',
      warning: `Período de teste: restam ${daysLeft} dia(s) (termina em ${dateFormatted}).`,
    };
  }

  if (sub.status === 'ACTIVE' && sub.currentPeriodEnd) {
    const renewDate = DateTime.fromJSDate(sub.currentPeriodEnd).setZone(tenant.timezone);
    const daysUntilRenew = Math.ceil(renewDate.diffNow('days').days);
    const formattedRenew = renewDate.toFormat('dd/LL/yyyy');

    if (daysUntilRenew <= 0) {
      return {
        allowed: true,
        code: 'OK',
        message: 'OK',
        warning: `Sua assinatura renovou em ${formattedRenew}. Efetue o pagamento via Pix ou Cartão para manter seus serviços ativos.`,
      };
    }
    if (daysUntilRenew <= 3) {
      return {
        allowed: true,
        code: 'OK',
        message: 'OK',
        warning: `Aviso de renovação: sua assinatura renova em ${daysUntilRenew} dia(s) (${formattedRenew}).`,
      };
    }
  }

  return { allowed: true, code: 'OK', message: 'OK' };
}

export interface PlanPermissions {
  reports: boolean;              // Central de Relatórios & Inteligência (/reports)
  satisfactionSurveys: boolean;  // Pesquisas de Satisfação automatizadas (CSAT e NPS)
  customBotMessages: boolean;    // Personalização de mensagens e templates do WhatsApp
  financialExport: boolean;      // Exportação de relatórios financeiros e CSV
  customDomain: boolean;         // Domínio Próprio & DNS Personalizado
  commissions: boolean;          // Rateio e comissões automáticas por barbeiro
  multiUserRoles: boolean;       // Múltiplos perfis de acesso da equipe (Recepção, Barbeiro, Gerente)
  prioritySupport: boolean;      // Suporte VIP Prioritário no WhatsApp
}

export const DEFAULT_PLAN_PERMISSIONS: Record<'starter' | 'pro' | 'premium', PlanPermissions> = {
  starter: {
    reports: false,
    satisfactionSurveys: false,
    customBotMessages: false,
    financialExport: false,
    customDomain: false,
    commissions: false,
    multiUserRoles: false,
    prioritySupport: false,
  },
  pro: {
    reports: true,
    satisfactionSurveys: true,
    customBotMessages: true,
    financialExport: true,
    customDomain: false,
    commissions: true,
    multiUserRoles: true,
    prioritySupport: true,
  },
  premium: {
    reports: true,
    satisfactionSurveys: true,
    customBotMessages: true,
    financialExport: true,
    customDomain: true,
    commissions: true,
    multiUserRoles: true,
    prioritySupport: true,
  },
};

export function extractPlanPermissions(plan?: { slug?: string; features?: any } | null): PlanPermissions {
  if (!plan) return DEFAULT_PLAN_PERMISSIONS.starter;
  const slug = (plan.slug || 'starter').toLowerCase() as 'starter' | 'pro' | 'premium';
  const base = DEFAULT_PLAN_PERMISSIONS[slug] || DEFAULT_PLAN_PERMISSIONS.starter;

  if (plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)) {
    const custom = (plan.features as any).permissions;
    if (custom && typeof custom === 'object') {
      return {
        ...base,
        ...custom,
      };
    }
  }

  return base;
}

export function extractPlanFeatureList(features: any): string[] {
  if (Array.isArray(features)) return features;
  if (features && typeof features === 'object' && Array.isArray((features as any).items)) {
    return (features as any).items;
  }
  return [];
}

export interface EffectiveLimits {
  maxProfessionals: number | null;
  maxAppointmentsPerMonth: number | null;
  whatsappEnabled: boolean;
  permissions: PlanPermissions;
}

export function effectiveLimits(subscription: (Subscription & { plan: Plan }) | null): EffectiveLimits {
  if (!subscription) {
    return {
      maxProfessionals: 0,
      maxAppointmentsPerMonth: 0,
      whatsappEnabled: false,
      permissions: DEFAULT_PLAN_PERMISSIONS.starter,
    };
  }
  return {
    maxProfessionals: subscription.maxProfessionalsOverride ?? subscription.plan.maxProfessionals,
    maxAppointmentsPerMonth: subscription.maxAppointmentsOverride ?? subscription.plan.maxAppointmentsPerMonth,
    whatsappEnabled: subscription.plan.whatsappEnabled,
    permissions: extractPlanPermissions(subscription.plan),
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

export async function assertPlanFeature(
  tenantId: string,
  feature: keyof PlanPermissions,
  featureName?: string,
): Promise<void> {
  const tenant = await loadTenant(tenantId);
  const limits = effectiveLimits(tenant.subscription);
  if (!limits.permissions[feature]) {
    const planName = tenant.subscription?.plan?.name || 'Starter';
    throw HttpError.paymentRequired(
      `O recurso "${featureName || feature}" não está disponível no plano ${planName}. Faça upgrade para o plano Pro ou Premium para liberar esta funcionalidade.`,
    );
  }
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
