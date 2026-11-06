import { prisma } from './prisma.js';

export type BillingCycle = 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';

export const BILLING_CYCLES: BillingCycle[] = ['MONTHLY', 'SEMIANNUAL', 'ANNUAL'];

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

export const CYCLE_DAYS: Record<BillingCycle, number> = {
  MONTHLY: 30,
  SEMIANNUAL: 180,
  ANNUAL: 365,
};

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Mensal',
  SEMIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
};

export interface CycleOptionConfig {
  enabled: boolean;
  discountPct: number; // 0 a 60 (%)
  maxInstallments: number; // 1 a 12 parcelas no cartão
}

export interface BillingCyclesConfig {
  SEMIANNUAL: CycleOptionConfig;
  ANNUAL: CycleOptionConfig;
}

const SETTING_ID = 'saas_billing_cycles';

export const DEFAULT_BILLING_CYCLES: BillingCyclesConfig = {
  SEMIANNUAL: { enabled: true, discountPct: 10, maxInstallments: 6 },
  ANNUAL: { enabled: true, discountPct: 20, maxInstallments: 12 },
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeOption(raw: any, fallback: CycleOptionConfig, maxParcels: number): CycleOptionConfig {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    discountPct: clampInt(raw?.discountPct, 0, 60, fallback.discountPct),
    maxInstallments: clampInt(raw?.maxInstallments, 1, maxParcels, fallback.maxInstallments),
  };
}

export function normalizeBillingCyclesConfig(raw: any): BillingCyclesConfig {
  return {
    SEMIANNUAL: normalizeOption(raw?.SEMIANNUAL, DEFAULT_BILLING_CYCLES.SEMIANNUAL, 6),
    ANNUAL: normalizeOption(raw?.ANNUAL, DEFAULT_BILLING_CYCLES.ANNUAL, 12),
  };
}

export async function getBillingCyclesConfig(): Promise<BillingCyclesConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { id: SETTING_ID } });
    if (!row?.smtpHost) return { ...DEFAULT_BILLING_CYCLES };
    return normalizeBillingCyclesConfig(JSON.parse(row.smtpHost));
  } catch {
    return { ...DEFAULT_BILLING_CYCLES };
  }
}

export async function saveBillingCyclesConfig(raw: unknown): Promise<BillingCyclesConfig> {
  const normalized = normalizeBillingCyclesConfig(raw);
  const serialized = JSON.stringify(normalized);
  await prisma.systemSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, smtpHost: serialized },
    update: { smtpHost: serialized },
  });
  return normalized;
}

export function parseBillingCycle(value: unknown): BillingCycle {
  const v = String(value || '').toUpperCase();
  return v === 'SEMIANNUAL' || v === 'ANNUAL' ? v : 'MONTHLY';
}

export interface CyclePriceBreakdown {
  cycle: BillingCycle;
  label: string;
  months: number;
  days: number;
  grossAmountCents: number; // preço mensal × meses (sem desconto)
  cycleDiscountPct: number;
  cycleDiscountCents: number;
  amountCents: number; // valor do ciclo com desconto progressivo
  monthlyEquivalentCents: number;
  maxInstallments: number;
}

/**
 * Calcula o preço de um plano para o ciclo escolhido.
 * Lança erro se o ciclo estiver desativado no Super Admin.
 */
export function calculateCyclePrice(
  monthlyPriceCents: number,
  cycle: BillingCycle,
  config: BillingCyclesConfig,
): CyclePriceBreakdown {
  const months = CYCLE_MONTHS[cycle];
  const gross = Math.max(0, Math.round(monthlyPriceCents)) * months;

  let discountPct = 0;
  let maxInstallments = 1;

  if (cycle !== 'MONTHLY') {
    const opt = config[cycle];
    if (!opt.enabled) {
      throw new Error(`O ciclo de cobrança ${CYCLE_LABELS[cycle]} não está disponível no momento.`);
    }
    discountPct = opt.discountPct;
    maxInstallments = opt.maxInstallments;
  }

  const discountCents = Math.round((gross * discountPct) / 100);
  const amountCents = Math.max(gross > 0 ? 100 : 0, gross - discountCents);

  return {
    cycle,
    label: CYCLE_LABELS[cycle],
    months,
    days: CYCLE_DAYS[cycle],
    grossAmountCents: gross,
    cycleDiscountPct: discountPct,
    cycleDiscountCents: gross - amountCents,
    amountCents,
    monthlyEquivalentCents: Math.round(amountCents / months),
    maxInstallments,
  };
}

/**
 * Resolve quantos dias de acesso uma cobrança aprovada concede,
 * a partir do metadata salvo no SaaSPayment ou enviado ao Mercado Pago.
 */
export function resolvePaymentCycleDays(...metadataSources: Array<Record<string, any> | null | undefined>): number {
  for (const meta of metadataSources) {
    if (!meta) continue;
    const days = Number(meta.cycleDays ?? meta.cycle_days);
    if (Number.isFinite(days) && days > 0) return Math.round(days);
    const cycle = meta.billingCycle ?? meta.billing_cycle;
    if (cycle) return CYCLE_DAYS[parseBillingCycle(cycle)];
  }
  return CYCLE_DAYS.MONTHLY;
}

