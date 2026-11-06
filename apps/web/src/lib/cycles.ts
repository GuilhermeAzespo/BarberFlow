export type BillingCycle = 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';

export interface BillingCycleOptionConfig {
  enabled: boolean;
  discountPct: number;
  maxInstallments: number;
}

export type BillingCyclesInfo = Record<BillingCycle, BillingCycleOptionConfig>;

export const DEFAULT_CYCLES_CONFIG: BillingCyclesInfo = {
  MONTHLY: { enabled: true, discountPct: 0, maxInstallments: 1 },
  SEMIANNUAL: { enabled: true, discountPct: 10, maxInstallments: 6 },
  ANNUAL: { enabled: true, discountPct: 20, maxInstallments: 12 },
};

export const CYCLE_META: Record<BillingCycle, { label: string; months: number; period: string }> = {
  MONTHLY: { label: 'Mensal', months: 1, period: 'mês' },
  SEMIANNUAL: { label: 'Semestral', months: 6, period: 'semestre' },
  ANNUAL: { label: 'Anual', months: 12, period: 'ano' },
};

/**
 * Calcula a equivalência comercial em "meses grátis" com base no percentual de desconto e quantidade de meses.
 * - 20% em 12 meses: 2.4 meses economizados -> "2 meses grátis"
 * - 10% em 12 meses: 1.2 meses economizados -> "1 mês grátis"
 * - 17% em 6 meses: 1.02 meses economizados -> "1 mês grátis"
 * - < 1 mês inteiro economizado (ex: 5%): retorna null para exibir apenas "5% OFF"
 */
export function getCycleFreeMonthsLabel(months: number, discountPct: number): string | null {
  if (!discountPct || discountPct <= 0 || months <= 1) return null;
  const freeMonthsExact = (discountPct * months) / 100;
  const freeMonths = Math.floor(freeMonthsExact + 0.05);
  if (freeMonths >= 2) return `${freeMonths} meses grátis`;
  if (freeMonths === 1) return `1 mês grátis`;
  return null;
}

export function calcCyclePrice(monthlyPriceCents: number, cycle: BillingCycle, cfg: BillingCyclesInfo) {
  const months = CYCLE_META[cycle].months;
  const gross = Math.max(0, Math.round(monthlyPriceCents)) * months;
  const discountPct = cycle === 'MONTHLY' ? 0 : cfg[cycle]?.discountPct ?? 0;
  const amount = Math.max(gross > 0 ? 100 : 0, gross - Math.round((gross * discountPct) / 100));
  const days = cycle === 'ANNUAL' ? 365 : cycle === 'SEMIANNUAL' ? 180 : 30;
  return {
    cycle,
    label: CYCLE_META[cycle].label,
    months,
    days,
    grossCents: gross,
    discountPct,
    savingsCents: gross - amount,
    amountCents: amount,
    monthlyEquivalentCents: Math.round(amount / months),
    maxInstallments: cycle === 'MONTHLY' ? 1 : cfg[cycle]?.maxInstallments ?? 1,
    freeMonthsLabel: getCycleFreeMonthsLabel(months, discountPct),
  };
}
