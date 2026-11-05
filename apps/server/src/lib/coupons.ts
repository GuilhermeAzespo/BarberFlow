import crypto from 'node:crypto';
import { prisma } from './prisma.js';

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED_CENTS';
export type CouponAppliesTo = 'ALL' | 'PLANS_ONLY' | 'ADDONS_ONLY';

export interface SaasCoupon {
  id: string;
  code: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number; // Se PERCENTAGE: 1 a 99 (%). Se FIXED_CENTS: valor em centavos (ex: 2000 = R$ 20,00)
  appliesTo: CouponAppliesTo;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null; // ISO Date string ou null
  isActive: boolean;
  createdAt: string;
}

const COUPONS_SETTING_ID = 'saas_coupons_catalog';

export async function getCouponsCatalog(): Promise<SaasCoupon[]> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { id: COUPONS_SETTING_ID },
    });
    if (!row?.smtpHost) return [];

    const parsed = JSON.parse(row.smtpHost);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item.code === 'string')
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        code: String(item.code).trim().toUpperCase(),
        description: String(item.description || '').trim(),
        discountType: item.discountType === 'FIXED_CENTS' ? 'FIXED_CENTS' : 'PERCENTAGE',
        discountValue: Math.max(1, Math.round(Number(item.discountValue) || 10)),
        appliesTo:
          item.appliesTo === 'PLANS_ONLY' || item.appliesTo === 'ADDONS_ONLY'
            ? item.appliesTo
            : 'ALL',
        maxUses:
          item.maxUses !== null && item.maxUses !== undefined && Number(item.maxUses) > 0
            ? Math.round(Number(item.maxUses))
            : null,
        usedCount: Math.max(0, Math.round(Number(item.usedCount) || 0)),
        expiresAt: item.expiresAt ? String(item.expiresAt) : null,
        isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
        createdAt: item.createdAt ? String(item.createdAt) : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export async function saveCouponsCatalog(coupons: SaasCoupon[]): Promise<SaasCoupon[]> {
  const serialized = JSON.stringify(coupons);
  await prisma.systemSetting.upsert({
    where: { id: COUPONS_SETTING_ID },
    create: {
      id: COUPONS_SETTING_ID,
      smtpHost: serialized,
    },
    update: {
      smtpHost: serialized,
    },
  });
  return coupons;
}

export async function validateAndCalculateCoupon(params: {
  code: string;
  targetType: 'PLAN' | 'ADDON';
  originalAmountCents: number;
}): Promise<{
  valid: boolean;
  coupon?: SaasCoupon;
  originalAmountCents: number;
  discountCents: number;
  finalAmountCents: number;
  message: string;
}> {
  const normalizedCode = (params.code || '').trim().toUpperCase();
  const original = Math.max(0, Math.round(params.originalAmountCents));

  if (!normalizedCode) {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: 'Informe um código de cupom válido.',
    };
  }

  const catalog = await getCouponsCatalog();
  const coupon = catalog.find((c) => c.code === normalizedCode);

  if (!coupon) {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: `O cupom "${normalizedCode}" não foi encontrado.`,
    };
  }

  if (!coupon.isActive) {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: `O cupom "${normalizedCode}" está desativado no momento.`,
    };
  }

  if (coupon.expiresAt) {
    const expDate = new Date(coupon.expiresAt);
    if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
      return {
        valid: false,
        originalAmountCents: original,
        discountCents: 0,
        finalAmountCents: original,
        message: `O cupom "${normalizedCode}" já expirou.`,
      };
    }
  }

  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: `O cupom "${normalizedCode}" já atingiu o limite máximo de utilizações.`,
    };
  }

  if (coupon.appliesTo === 'PLANS_ONLY' && params.targetType === 'ADDON') {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: `O cupom "${normalizedCode}" é válido apenas para assinatura de Planos.`,
    };
  }

  if (coupon.appliesTo === 'ADDONS_ONLY' && params.targetType === 'PLAN') {
    return {
      valid: false,
      originalAmountCents: original,
      discountCents: 0,
      finalAmountCents: original,
      message: `O cupom "${normalizedCode}" é válido apenas para contratação de Módulos Add-on.`,
    };
  }

  let rawDiscountCents = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    const pct = Math.min(99, Math.max(1, coupon.discountValue));
    rawDiscountCents = Math.round((original * pct) / 100);
  } else {
    rawDiscountCents = Math.round(coupon.discountValue);
  }

  // O Mercado Pago exige valor mínimo de R$ 1,00 (100 centavos) para transações PIX/Cartão
  const minPayableCents = Math.min(100, original);
  const finalAmountCents = Math.max(minPayableCents, original - rawDiscountCents);
  const effectiveDiscountCents = Math.max(0, original - finalAmountCents);

  const formattedDiscount =
    coupon.discountType === 'PERCENTAGE'
      ? `${coupon.discountValue}% OFF`
      : `R$ ${(effectiveDiscountCents / 100).toFixed(2).replace('.', ',')} OFF`;

  return {
    valid: true,
    coupon,
    originalAmountCents: original,
    discountCents: effectiveDiscountCents,
    finalAmountCents,
    message: `Cupom ${coupon.code} aplicado com sucesso (${formattedDiscount})!`,
  };
}

export async function incrementCouponUsage(code?: string | null): Promise<void> {
  if (!code) return;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;

  try {
    const catalog = await getCouponsCatalog();
    let changed = false;
    const updated = catalog.map((c) => {
      if (c.code === normalized) {
        changed = true;
        return { ...c, usedCount: (c.usedCount || 0) + 1 };
      }
      return c;
    });

    if (changed) {
      await saveCouponsCatalog(updated);
    }
  } catch {
    // Silencia erro para não interromper o fluxo de aprovação do pagamento
  }
}

