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
  code:
    | 'OK'
    | 'TENANT_SUSPENDED'
    | 'TENANT_BLOCKED'
    | 'TENANT_CANCELED'
    | 'NO_SUBSCRIPTION'
    | 'SUBSCRIPTION_CANCELED'
    | 'TRIAL_EXPIRED';
  message: string;
  /** Avisos de vencimento próximo */
  warning?: string;
}

/**
 * Sincroniza automaticamente o status da assinatura (Subscription.status -> PAST_DUE)
 * e o status do salão (Tenant.status -> BLOCKED) caso o período de Trial ou o ciclo
 * de pagamento tenha vencido sem confirmação de pagamento.
 */
export async function syncExpiredTenantsAndSubscriptions(targetTenantId?: string): Promise<void> {
  const now = new Date();

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(targetTenantId ? { id: targetTenantId } : {}),
      status: { notIn: ['CANCELED', 'SUSPENDED'] },
    },
    include: {
      subscription: true,
    },
  });

  for (const tenant of tenants) {
    const sub = tenant.subscription;
    if (!sub) continue;

    // 1. Verifica expiração do Add-on NFS-e e dos activeAddons se aplicável
    if (sub.nfseAddonActive && sub.nfseAddonExpiresAt && sub.nfseAddonExpiresAt <= now) {
      await prisma.subscription
        .update({
          where: { id: sub.id },
          data: { nfseAddonActive: false },
        })
        .catch(() => {});
    }
    if (Array.isArray((sub as any).activeAddons) && (sub as any).activeAddons.length > 0) {
      const validAddons = (sub as any).activeAddons.filter(
        (a: any) => a && typeof a.key === 'string' && (!a.expiresAt || new Date(a.expiresAt) > now),
      );
      if (validAddons.length !== (sub as any).activeAddons.length) {
        await prisma.subscription
          .update({
            where: { id: sub.id },
            data: { activeAddons: validAddons as any },
          })
          .catch(() => {});
      }
    }

    // 2. Trial expirado sem pagamento aprovado
    if (sub.status === 'TRIALING') {
      const isTrialExpired = !sub.trialEndsAt || sub.trialEndsAt <= now;
      if (isTrialExpired) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        });
        if (tenant.status !== 'BLOCKED') {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              status: 'BLOCKED',
              statusReason: 'Período de teste (Trial) expirado sem pagamento',
              statusChangedAt: now,
            },
          });
        }
        continue;
      }
    }

    // 3. Assinatura ativa cujo período de vigência venceu sem renovação/pagamento
    if (sub.status === 'ACTIVE') {
      const isPeriodExpired = Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd <= now);
      const isFallbackTrialExpired = Boolean(!sub.currentPeriodEnd && sub.trialEndsAt && sub.trialEndsAt <= now);

      if (isPeriodExpired || isFallbackTrialExpired) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'PAST_DUE' },
        });
        if (tenant.status !== 'BLOCKED') {
          await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              status: 'BLOCKED',
              statusReason: 'Assinatura vencida — aguardando pagamento',
              statusChangedAt: now,
            },
          });
        }
        continue;
      }
    }

    // 4. Assinatura já marcada como PAST_DUE ou CANCELED, mas o Tenant ainda estava como ACTIVE
    if (sub.status === 'PAST_DUE' && tenant.status === 'ACTIVE') {
      const periodStillValid = Boolean(sub.currentPeriodEnd && sub.currentPeriodEnd > now);
      const trialStillValid = Boolean(sub.trialEndsAt && sub.trialEndsAt > now);
      if (!periodStillValid && !trialStillValid) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            status: 'BLOCKED',
            statusReason: tenant.statusReason || 'Inadimplência — aguardando pagamento da assinatura',
            statusChangedAt: now,
          },
        });
      }
    } else if (sub.status === 'CANCELED' && tenant.status === 'ACTIVE') {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          status: 'BLOCKED',
          statusReason: tenant.statusReason || 'Assinatura cancelada',
          statusChangedAt: now,
        },
      });
    }
  }
}

export function evaluateTenantAccess(tenant: TenantWithSubscription): TenantAccess {
  if (tenant.status === 'SUSPENDED') {
    return { allowed: false, code: 'TENANT_SUSPENDED', message: tenant.statusReason ?? 'Conta suspensa pelo suporte.' };
  }
  if (tenant.status === 'BLOCKED') {
    return {
      allowed: false,
      code: 'TENANT_BLOCKED',
      message:
        tenant.statusReason ?? 'Conta bloqueada por pendência financeira. Regularize sua assinatura na página de planos.',
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
    return {
      allowed: false,
      code: 'TENANT_BLOCKED',
      message:
        tenant.statusReason ??
        'Sua assinatura está com pagamento pendente. Escolha um plano e regularize para liberar o acesso ao sistema.',
    };
  }
  if (sub.status === 'TRIALING') {
    if (!sub.trialEndsAt) {
      return {
        allowed: false,
        code: 'TRIAL_EXPIRED',
        message: 'Seu período de teste gratuito terminou. Escolha um plano para continuar utilizando o BarberFlow.',
      };
    }

    const diff = DateTime.fromJSDate(sub.trialEndsAt).diffNow('days');
    const daysLeft = Math.ceil(diff.days);
    const dateFormatted = DateTime.fromJSDate(sub.trialEndsAt).setZone(tenant.timezone).toFormat('dd/LL/yyyy');

    if (daysLeft <= 0 || DateTime.fromJSDate(sub.trialEndsAt) <= DateTime.now()) {
      return {
        allowed: false,
        code: 'TRIAL_EXPIRED',
        message:
          'Seu período de teste gratuito de 14 dias terminou. Escolha um plano e ative sua assinatura para continuar utilizando o BarberFlow.',
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

    if (daysUntilRenew <= 0 || DateTime.fromJSDate(sub.currentPeriodEnd) <= DateTime.now()) {
      return {
        allowed: false,
        code: 'TENANT_BLOCKED',
        message: `Sua assinatura venceu em ${formattedRenew}. Efetue o pagamento via Pix ou Cartão para liberar o acesso ao sistema.`,
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
  nfse: boolean;                 // Emissor de Nota Fiscal de Serviços Eletrônica (NFS-e Padrão Nacional)
  loyalty: boolean;              // Cartão Fidelidade Digital Automático
  marketing: boolean;            // Recuperação de Clientes Inativos & Aniversariantes WhatsApp
  club: boolean;                 // Clube de Assinatura da Barbearia (Planos VIP para Clientes)
  onlinePayments: boolean;       // Recebimentos Online & Cartão Recorrente (Direto na Conta do Salão)
}

export const DEFAULT_PLAN_PERMISSIONS: Record<'starter' | 'pro' | 'premium', PlanPermissions> = {
  starter: {
    reports: false,
    satisfactionSurveys: false,
    customBotMessages: false,
    financialExport: false,
    customDomain: false,
    nfse: false,
    commissions: false,
    multiUserRoles: false,
    prioritySupport: false,
    loyalty: false,
    marketing: false,
    club: false,
    onlinePayments: false,
  },
  pro: {
    reports: true,
    satisfactionSurveys: true,
    customBotMessages: true,
    financialExport: true,
    customDomain: false,
    nfse: false,
    commissions: true,
    multiUserRoles: true,
    prioritySupport: true,
    loyalty: true,
    marketing: true,
    club: true,
    onlinePayments: false,
  },
  premium: {
    reports: true,
    satisfactionSurveys: true,
    customBotMessages: true,
    financialExport: true,
    customDomain: true,
    nfse: true,
    commissions: true,
    multiUserRoles: true,
    prioritySupport: true,
    loyalty: true,
    marketing: true,
    club: true,
    onlinePayments: false,
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
  const basePermissions: PlanPermissions = {
    ...extractPlanPermissions(subscription.plan),
    nfse: Boolean(extractPlanPermissions(subscription.plan).nfse || (subscription as any).nfseAddonActive),
  };
  const now = new Date();
  const rawActiveAddons = (subscription as any).activeAddons;
  if (Array.isArray(rawActiveAddons)) {
    for (const item of rawActiveAddons) {
      if (!item || typeof item.key !== 'string') continue;
      if (item.expiresAt && new Date(item.expiresAt) <= now) continue;
      const key = item.key as keyof PlanPermissions;
      if (key in basePermissions) {
        basePermissions[key] = true;
      }
    }
  }
  return {
    maxProfessionals: subscription.maxProfessionalsOverride ?? subscription.plan.maxProfessionals,
    maxAppointmentsPerMonth: subscription.maxAppointmentsOverride ?? subscription.plan.maxAppointmentsPerMonth,
    whatsappEnabled: subscription.plan.whatsappEnabled,
    permissions: basePermissions,
  };
}

export async function loadTenant(tenantId: string): Promise<TenantWithSubscription> {
  await syncExpiredTenantsAndSubscriptions(tenantId);
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

export async function hasPlanFeature(tenantId: string, feature: keyof PlanPermissions): Promise<boolean> {
  const tenant = await loadTenant(tenantId);
  const limits = effectiveLimits(tenant.subscription);
  return Boolean(limits.permissions[feature]);
}
