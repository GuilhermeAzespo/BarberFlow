import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { systemLog } from '../../lib/system-log.js';
import {
  getActiveMercadoPagoConfig,
  createMercadoPagoPix,
  createMercadoPagoCardToken,
  createMercadoPagoCardPayment,
  getMercadoPagoPayment,
  getMercadoPagoWebhookUrl,
  inferPaymentMethodId,
  translateMpStatusDetail,
} from '../../lib/mercadopago.js';
import { effectiveLimits, evaluateTenantAccess } from '../../lib/tenant-access.js';
import { getAddonsCatalog, getAddonByKey } from '../../lib/addons.js';
import { validateAndCalculateCoupon, incrementCouponUsage } from '../../lib/coupons.js';
import {
  BILLING_CYCLES,
  CYCLE_LABELS,
  calculateCyclePrice,
  getBillingCyclesConfig,
  parseBillingCycle,
  resolvePaymentCycleDays,
  type BillingCycle,
} from '../../lib/billing-cycles.js';

export const billingRouter = Router();

const billingCycleSchema = z.enum(['MONTHLY', 'SEMIANNUAL', 'ANNUAL']).default('MONTHLY');

/**
 * Calcula o valor final de um plano considerando ciclo (Mensal/Semestral/Anual) + cupom.
 * O cupom é aplicado sobre o valor do ciclo já com o desconto progressivo.
 */
async function resolvePlanCheckoutAmount(params: {
  plan: { priceCents: number };
  billingCycle: BillingCycle;
  couponCode?: string;
}) {
  const cyclesConfig = await getBillingCyclesConfig();
  let cycle;
  try {
    cycle = calculateCyclePrice(params.plan.priceCents, params.billingCycle, cyclesConfig);
  } catch (err) {
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Ciclo de cobrança inválido.');
  }

  let finalAmountCents = cycle.amountCents;
  let appliedCouponCode: string | null = null;
  let couponDiscountCents = 0;

  if (params.couponCode) {
    const couponCheck = await validateAndCalculateCoupon({
      code: params.couponCode,
      targetType: 'PLAN',
      originalAmountCents: cycle.amountCents,
    });
    if (!couponCheck.valid || !couponCheck.coupon) {
      throw HttpError.badRequest(couponCheck.message);
    }
    finalAmountCents = couponCheck.finalAmountCents;
    couponDiscountCents = couponCheck.discountCents;
    appliedCouponCode = couponCheck.coupon.code;
  }

  return { cycle, finalAmountCents, appliedCouponCode, couponDiscountCents };
}

const pixCheckoutSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  payerCpf: z.string().trim().optional(),
  payerName: z.string().trim().optional(),
  payerEmail: z.string().email('E-mail do pagador inválido').optional(),
  couponCode: z.string().trim().optional(),
  billingCycle: billingCycleSchema,
  autoRenew: z.boolean().optional(),
});

const cardCheckoutSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  token: z.string().optional(),
  cardNumber: z.string().optional(),
  cardholderName: z.string().optional(),
  cardholderCpf: z.string().optional(),
  expMonth: z.union([z.string(), z.number()]).optional(),
  expYear: z.union([z.string(), z.number()]).optional(),
  cvv: z.string().optional(),
  installments: z.coerce.number().int().min(1).max(12).default(1),
  paymentMethodId: z.string().optional(),
  couponCode: z.string().trim().optional(),
  billingCycle: billingCycleSchema,
  autoRenew: z.boolean().optional(),
});

// Validação de Cupom de Desconto no Checkout (Planos ou Add-ons)
billingRouter.post('/coupons/validate', async (req, res) => {
  const body = z
    .object({
      code: z.string().trim().min(1, 'Informe o código do cupom'),
      targetType: z.enum(['PLAN', 'ADDON']).default('PLAN'),
      planId: z.string().optional(),
      addonKey: z.string().optional(),
      billingCycle: billingCycleSchema,
    })
    .parse(req.body || {});

  let originalAmountCents = 0;

  if (body.targetType === 'PLAN') {
    if (!body.planId) {
      throw HttpError.badRequest('Selecione um plano para validar o cupom.');
    }
    const plan = await prisma.plan.findUnique({ where: { id: body.planId } });
    if (!plan || !plan.isActive) {
      throw HttpError.badRequest('Plano selecionado inválido.');
    }
    try {
      const cyclesConfig = await getBillingCyclesConfig();
      originalAmountCents = calculateCyclePrice(plan.priceCents, body.billingCycle, cyclesConfig).amountCents;
    } catch (err) {
      throw HttpError.badRequest(err instanceof Error ? err.message : 'Ciclo de cobrança inválido.');
    }
  } else {
    const addonCfg = await getAddonByKey((body.addonKey as any) || 'nfse');
    originalAmountCents = addonCfg.priceCents;
  }

  const result = await validateAndCalculateCoupon({
    code: body.code,
    targetType: body.targetType,
    originalAmountCents,
  });

  if (!result.valid || !result.coupon) {
    throw HttpError.badRequest(result.message);
  }

  res.json({
    valid: true,
    code: result.coupon.code,
    description: result.coupon.description,
    discountType: result.coupon.discountType,
    discountValue: result.coupon.discountValue,
    originalAmountCents: result.originalAmountCents,
    discountCents: result.discountCents,
    finalAmountCents: result.finalAmountCents,
    message: result.message,
  });
});

// Informações gerais de faturamento do salão
billingRouter.get('/status', async (req, res) => {
  const tenantId = req.tenantId!;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: {
        include: { plan: true },
      },
    },
  });

  if (!tenant) throw HttpError.notFound('Salão não encontrado.');

  const sub = tenant.subscription;
  const access = evaluateTenantAccess(tenant);
  const mpConfig = await getActiveMercadoPagoConfig();

  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
  });

  const [addonsCatalog, nfseAddonCfg, cyclesConfig, lastPlanPayment] = await Promise.all([
    getAddonsCatalog(),
    getAddonByKey('nfse'),
    getBillingCyclesConfig(),
    prisma.saaSPayment.findFirst({
      where: {
        tenantId,
        status: 'APPROVED',
        NOT: { mpStatusDetail: { startsWith: 'ADDON_NFSE' } },
      },
      orderBy: { paidAt: 'desc' },
      select: { metadata: true },
    }),
  ]);
  const nfseAddonPriceCents = nfseAddonCfg.priceCents;
  const lastPaymentMeta = (lastPlanPayment?.metadata as Record<string, any> | null) || null;
  const currentBillingCycle = parseBillingCycle(lastPaymentMeta?.billingCycle);

  res.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
    },
    subscription: sub
      ? {
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          lastPaymentAt: sub.lastPaymentAt,
          isTrial: sub.status === 'TRIALING',
          trialDaysLeft:
            sub.trialEndsAt
              ? Math.max(0, Math.ceil(DateTime.fromJSDate(sub.trialEndsAt).diffNow('days').days))
              : null,
          renewDaysLeft:
            sub.currentPeriodEnd
              ? Math.ceil(DateTime.fromJSDate(sub.currentPeriodEnd).diffNow('days').days)
              : null,
          plan: sub.plan,
          autoRenew: sub.autoRenew ?? true,
          billingCycle: currentBillingCycle,
          billingCycleLabel: CYCLE_LABELS[currentBillingCycle],
          limits: effectiveLimits(sub),
          nfseAddonActive: sub.nfseAddonActive,
          nfseAddonExpiresAt: sub.nfseAddonExpiresAt,
        }
      : null,
    nfseAddon: {
      active: Boolean(sub?.nfseAddonActive),
      expiresAt: sub?.nfseAddonExpiresAt ?? null,
      priceCents: nfseAddonPriceCents,
      isAddon: nfseAddonCfg.isAddon,
    },
    addons: addonsCatalog,
    billingCycles: {
      available: BILLING_CYCLES.filter((c) => c === 'MONTHLY' || cyclesConfig[c].enabled),
      MONTHLY: { enabled: true, discountPct: 0, maxInstallments: 1 },
      ...cyclesConfig,
    },
    access,
    plans,
    mercadopago: {
      isConfigured: mpConfig.isConfigured,
      enabled: mpConfig.enabled,
      publicKey: mpConfig.publicKey,
      sandbox: mpConfig.sandbox,
    },
  });
});

// Ativar ou Desativar Renovação Automática (Auto-Renew) da assinatura do salão
billingRouter.patch('/auto-renew', async (req, res) => {
  const tenantId = req.tenantId!;
  const autoRenew = Boolean(req.body?.autoRenew);

  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { plan: true },
  });
  if (!sub) {
    throw HttpError.notFound('Assinatura não encontrada para este salão.');
  }

  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: { autoRenew },
  });

  await systemLog({
    tenantId,
    source: 'billing',
    message: `Renovação Automática (Auto-Renew) ${autoRenew ? 'ATIVADA' : 'DESATIVADA (Modo Manual)'} pelo cliente.`,
    meta: { autoRenew, planId: sub.planId },
  });

  res.json({
    autoRenew: updated.autoRenew,
    message: autoRenew
      ? 'Renovação Automática ativada! Você receberá os avisos e códigos de renovação automática no vencimento.'
      : 'Renovação alterada para Manual! Você escolherá manualmente quando e como renovar sua assinatura.',
  });
});

// Checkout PIX via Mercado Pago
billingRouter.post('/checkout/pix', async (req, res) => {
  const tenantId = req.tenantId!;
  const data = pixCheckoutSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: { where: { role: 'OWNER' }, select: { email: true, name: true } },
      subscription: { include: { plan: true } },
    },
  });
  if (!tenant) throw HttpError.notFound('Salão não encontrado.');

  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) {
    throw HttpError.badRequest('Plano selecionado inválido ou indisponível.');
  }

  const {
    cycle,
    finalAmountCents,
    appliedCouponCode,
    couponDiscountCents: discountCents,
  } = await resolvePlanCheckoutAmount({
    plan,
    billingCycle: data.billingCycle,
    couponCode: data.couponCode,
  });

  const paymentMetadata = {
    billingCycle: cycle.cycle,
    cycleDays: cycle.days,
    cycleMonths: cycle.months,
    grossAmountCents: cycle.grossAmountCents,
    cycleDiscountPct: cycle.cycleDiscountPct,
    cycleDiscountCents: cycle.cycleDiscountCents,
    originalAmountCents: cycle.amountCents,
    ...(typeof data.autoRenew === 'boolean' ? { autoRenew: data.autoRenew } : {}),
    ...(appliedCouponCode ? { couponCode: appliedCouponCode, discountCents } : {}),
  };

  if (typeof data.autoRenew === 'boolean' && tenant.subscription) {
    await prisma.subscription.update({
      where: { tenantId },
      data: { autoRenew: data.autoRenew },
    }).catch(() => {});
  }
  const cycleSuffix = cycle.cycle === 'MONTHLY' ? '' : ` - ${cycle.label} (${cycle.months} meses)`;

  const owner = tenant.users[0];
  const payerEmail = data.payerEmail || tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = data.payerName || owner?.name || tenant.name;

  const notificationUrl = getMercadoPagoWebhookUrl(req);

  // Cria registro pendente no banco
  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: plan.id,
      amountCents: finalAmountCents,
      method: 'PIX',
      status: 'PENDING',
      payerEmail,
      payerName,
      payerDoc: data.payerCpf ? data.payerCpf.replace(/\D/g, '') : null,
      metadata: paymentMetadata,
    },
  });

  try {
    const pixResult = await createMercadoPagoPix({
      amountCents: finalAmountCents,
      description: `BarberFlow - Assinatura Plano ${plan.name}${cycleSuffix} (${tenant.name})${
        appliedCouponCode ? ` [Cupom ${appliedCouponCode}]` : ''
      }`,
      payerEmail,
      payerName,
      payerCpf: data.payerCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: plan.id,
        billing_cycle: cycle.cycle,
        cycle_days: cycle.days,
        saas_payment_id: saasPayment.id,
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {}),
      },
    });

    const updatedPayment = await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: {
        mpPaymentId: pixResult.paymentId,
        mpStatus: pixResult.status,
        mpStatusDetail: pixResult.statusDetail,
        qrCode: pixResult.qrCode,
        qrCodeBase64: pixResult.qrCodeBase64,
        ticketUrl: pixResult.ticketUrl,
        expiresAt: pixResult.expiresAt,
      },
    });

    res.json({
      paymentId: updatedPayment.id,
      mpPaymentId: pixResult.paymentId,
      status: pixResult.status,
      planName: plan.name,
      amountCents: finalAmountCents,
      originalAmountCents: cycle.amountCents,
      grossAmountCents: cycle.grossAmountCents,
      billingCycle: cycle.cycle,
      billingCycleLabel: cycle.label,
      discountCents,
      couponCode: appliedCouponCode,
      qrCode: pixResult.qrCode,
      qrCodeBase64: pixResult.qrCodeBase64,
      ticketUrl: pixResult.ticketUrl,
      expiresAt: pixResult.expiresAt,
    });
  } catch (err: unknown) {
    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: { status: 'REJECTED', mpStatusDetail: err instanceof Error ? err.message : 'Falha ao gerar Pix' },
    });
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Falha ao gerar cobrança Pix no Mercado Pago.');
  }
});

// Checkout Cartão de Crédito via Mercado Pago
billingRouter.post('/checkout/card', async (req, res) => {
  const tenantId = req.tenantId!;
  const data = cardCheckoutSchema.parse(req.body);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: { where: { role: 'OWNER' }, select: { email: true, name: true } },
      subscription: { include: { plan: true } },
    },
  });
  if (!tenant) throw HttpError.notFound('Salão não encontrado.');

  const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
  if (!plan || !plan.isActive) {
    throw HttpError.badRequest('Plano selecionado inválido ou indisponível.');
  }

  const {
    cycle,
    finalAmountCents,
    appliedCouponCode,
    couponDiscountCents: discountCents,
  } = await resolvePlanCheckoutAmount({
    plan,
    billingCycle: data.billingCycle,
    couponCode: data.couponCode,
  });

  const paymentMetadata = {
    billingCycle: cycle.cycle,
    cycleDays: cycle.days,
    cycleMonths: cycle.months,
    grossAmountCents: cycle.grossAmountCents,
    cycleDiscountPct: cycle.cycleDiscountPct,
    cycleDiscountCents: cycle.cycleDiscountCents,
    originalAmountCents: cycle.amountCents,
    ...(typeof data.autoRenew === 'boolean' ? { autoRenew: data.autoRenew } : {}),
    ...(appliedCouponCode ? { couponCode: appliedCouponCode, discountCents } : {}),
  };

  if (typeof data.autoRenew === 'boolean' && tenant.subscription) {
    await prisma.subscription.update({
      where: { tenantId },
      data: { autoRenew: data.autoRenew },
    }).catch(() => {});
  }
  const cycleSuffix = cycle.cycle === 'MONTHLY' ? '' : ` - ${cycle.label} (${cycle.months} meses)`;

  const owner = tenant.users[0];
  const payerEmail = tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = data.cardholderName || owner?.name || tenant.name;

  if (data.installments > cycle.maxInstallments) {
    throw HttpError.badRequest(
      cycle.maxInstallments === 1
        ? `O ciclo ${cycle.label} aceita apenas pagamento à vista no cartão.`
        : `O ciclo ${cycle.label} permite parcelamento em até ${cycle.maxInstallments}x.`,
    );
  }

  let cardToken = data.token;
  if (!cardToken) {
    if (!data.cardNumber || !data.cardholderName || !data.cardholderCpf || !data.expMonth || !data.expYear || !data.cvv) {
      throw HttpError.badRequest('Preencha todos os dados do cartão de crédito (número, titular, CPF/CNPJ, validade e CVV).');
    }

    cardToken = await createMercadoPagoCardToken({
      cardNumber: data.cardNumber,
      cardholderName: data.cardholderName,
      cardholderCpf: data.cardholderCpf,
      expMonth: data.expMonth,
      expYear: data.expYear,
      cvv: data.cvv,
    });
  }

  const notificationUrl = getMercadoPagoWebhookUrl(req);

  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: plan.id,
      amountCents: finalAmountCents,
      method: 'CREDIT_CARD',
      status: 'PENDING',
      payerEmail,
      payerName,
      payerDoc: data.cardholderCpf ? data.cardholderCpf.replace(/\D/g, '') : null,
      installments: data.installments,
      metadata: paymentMetadata,
    },
  });

  try {
    const cardResult = await createMercadoPagoCardPayment({
      amountCents: finalAmountCents,
      token: cardToken,
      description: `BarberFlow - Assinatura Plano ${plan.name}${cycleSuffix} (${tenant.name})${
        appliedCouponCode ? ` [Cupom ${appliedCouponCode}]` : ''
      }`,
      installments: data.installments,
      paymentMethodId: data.paymentMethodId || inferPaymentMethodId(data.cardNumber),
      payerEmail,
      payerName,
      payerCpf: data.cardholderCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: plan.id,
        billing_cycle: cycle.cycle,
        cycle_days: cycle.days,
        saas_payment_id: saasPayment.id,
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {}),
      },
    });

    const isApproved = cardResult.status === 'approved';

    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: {
        mpPaymentId: cardResult.paymentId,
        mpStatus: cardResult.status,
        mpStatusDetail: cardResult.statusDetail,
        cardBrand: cardResult.cardBrand,
        cardLastFour: cardResult.cardLastFour,
        installments: cardResult.installments,
        status: isApproved ? 'APPROVED' : cardResult.status === 'rejected' ? 'REJECTED' : 'PENDING',
        paidAt: isApproved ? new Date() : null,
      },
    });

    if (isApproved) {
      if (appliedCouponCode) {
        await incrementCouponUsage(appliedCouponCode);
      }

      const now = new Date();
      const existingSub = tenant.subscription;
      const isSamePlanRenewal =
        existingSub?.status === 'ACTIVE' &&
        existingSub?.planId === plan.id &&
        existingSub?.currentPeriodEnd &&
        existingSub.currentPeriodEnd > now;

      const baseDate = isSamePlanRenewal
        ? DateTime.fromJSDate(existingSub!.currentPeriodEnd!)
        : DateTime.fromJSDate(now);
      const currentPeriodEnd = baseDate.plus({ days: cycle.days }).toJSDate();

      await prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId: plan.id,
          status: 'ACTIVE',
          autoRenew: typeof data.autoRenew === 'boolean' ? data.autoRenew : true,
          currentPeriodStart: now,
          currentPeriodEnd,
          lastPaymentAt: now,
        },
        update: {
          planId: plan.id,
          status: 'ACTIVE',
          ...(typeof data.autoRenew === 'boolean' ? { autoRenew: data.autoRenew } : {}),
          currentPeriodStart: now,
          currentPeriodEnd,
          lastPaymentAt: now,
        },
      });

      if (tenant.status !== 'ACTIVE') {
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'ACTIVE', statusReason: null },
        });
      }

      await systemLog({
        tenantId,
        source: 'billing',
        message: `Assinatura Plano ${plan.name} ativada via Cartão de Crédito no Mercado Pago (MP ID: ${cardResult.paymentId})${
          appliedCouponCode ? ` [Cupom: ${appliedCouponCode}]` : ''
        }`,
      });

      return res.json({
        success: true,
        status: 'approved',
        message: `Pagamento aprovado! Seu salão agora está no Plano ${plan.name}.`,
        paymentId: saasPayment.id,
      });
    }

    res.json({
      success: false,
      status: cardResult.status,
      statusDetail: cardResult.statusDetail,
      message: translateMpStatusDetail(cardResult.status, cardResult.statusDetail),
      paymentId: saasPayment.id,
    });
  } catch (err: unknown) {
    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: { status: 'REJECTED', mpStatusDetail: err instanceof Error ? err.message : 'Falha no cartão' },
    });
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Falha ao processar pagamento com cartão.');
  }
});

// Verificação de status de pagamento (Polling Pix ou conferência de fatura)
billingRouter.get('/payments/:paymentId/status', async (req, res) => {
  const tenantId = req.tenantId!;
  const { paymentId } = req.params;

  const payment = await prisma.saaSPayment.findFirst({
    where: {
      id: paymentId,
      tenantId,
    },
    include: {
      plan: true,
      tenant: { include: { subscription: true } },
    },
  });

  if (!payment) throw HttpError.notFound('Cobrança não encontrada.');

  // Se estiver pendente e tiver mpPaymentId, faz checagem ativa no Mercado Pago
  if (payment.status === 'PENDING' && payment.mpPaymentId) {
    try {
      const mpStatus = await getMercadoPagoPayment(payment.mpPaymentId);
      if (mpStatus.status === 'approved') {
        const now = new Date();
        const isNfseAddon =
          mpStatus.metadata?.addon_type === 'NFSE' ||
          payment.mpStatusDetail?.startsWith('ADDON_NFSE');

        // Atualização atômica para impedir ativação duplicada com o Webhook
        const lockUpdate = await prisma.saaSPayment.updateMany({
          where: {
            id: payment.id,
            status: { not: 'APPROVED' },
          },
          data: {
            status: 'APPROVED',
            mpStatus: mpStatus.status,
            mpStatusDetail: isNfseAddon ? `ADDON_NFSE:${mpStatus.statusDetail || 'accredited'}` : mpStatus.statusDetail,
            paidAt: mpStatus.dateApproved ? new Date(mpStatus.dateApproved) : now,
          },
        });

        if (lockUpdate.count > 0) {
          const paymentMeta = (payment.metadata as Record<string, any> | null) || {};
          const usedCouponCode =
            (mpStatus.metadata?.coupon_code as string | undefined) ||
            (paymentMeta.couponCode as string | undefined);
          if (usedCouponCode) {
            await incrementCouponUsage(usedCouponCode);
          }

          const existingSub = payment.tenant?.subscription;

          if (isNfseAddon) {
            const baseDate =
              existingSub?.nfseAddonActive &&
              existingSub?.nfseAddonExpiresAt &&
              existingSub.nfseAddonExpiresAt > now
                ? DateTime.fromJSDate(existingSub.nfseAddonExpiresAt)
                : DateTime.fromJSDate(now);
            const nfseAddonExpiresAt = baseDate.plus({ days: 30 }).toJSDate();

            await prisma.subscription.updateMany({
              where: { tenantId },
              data: {
                nfseAddonActive: true,
                nfseAddonExpiresAt,
                lastPaymentAt: now,
              },
            });

            await systemLog({
              tenantId,
              source: 'billing',
              message: `Módulo Add-on NFS-e ativado via PIX no Mercado Pago (MP ID: ${payment.mpPaymentId})${
                usedCouponCode ? ` [Cupom: ${usedCouponCode}]` : ''
              }`,
            });
          } else {
            const isSamePlanRenewal =
              existingSub?.status === 'ACTIVE' &&
              existingSub?.planId === payment.planId &&
              existingSub?.currentPeriodEnd &&
              existingSub.currentPeriodEnd > now;

            const baseDate = isSamePlanRenewal
              ? DateTime.fromJSDate(existingSub!.currentPeriodEnd!)
              : DateTime.fromJSDate(now);
            const cycleDays = resolvePaymentCycleDays(paymentMeta, mpStatus.metadata);
            const currentPeriodEnd = baseDate.plus({ days: cycleDays }).toJSDate();

            await prisma.subscription.upsert({
              where: { tenantId },
              create: {
                tenantId,
                planId: payment.planId,
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd,
                lastPaymentAt: now,
              },
              update: {
                planId: payment.planId,
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd,
                lastPaymentAt: now,
              },
            });

            await prisma.tenant.update({
              where: { id: tenantId },
              data: { status: 'ACTIVE', statusReason: null },
            });

            await systemLog({
              tenantId,
              source: 'billing',
              message: `Assinatura Plano ${payment.plan.name} ativada via PIX no Mercado Pago (MP ID: ${payment.mpPaymentId})${
                usedCouponCode ? ` [Cupom: ${usedCouponCode}]` : ''
              }`,
            });
          }
        }

        return res.json({
          id: payment.id,
          status: 'APPROVED',
          isPaid: true,
          isAddon: isNfseAddon,
          planName: isNfseAddon ? 'Módulo Emissor NFS-e (Add-on)' : payment.plan.name,
          amountCents: payment.amountCents,
          paidAt: now,
        });
      }
    } catch {
      // Ignora falha temporária de checagem do MP
    }
  }

  const isNfseAddon = payment.mpStatusDetail?.startsWith('ADDON_NFSE') || false;

  res.json({
    id: payment.id,
    status: payment.status,
    isPaid: payment.status === 'APPROVED',
    isAddon: isNfseAddon,
    planName: isNfseAddon ? 'Módulo Emissor NFS-e (Add-on)' : payment.plan.name,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
  });
});

// Histórico de Faturas / Pagamentos do Salão
billingRouter.get('/history', async (req, res) => {
  const tenantId = req.tenantId!;
  const rawPayments = await prisma.saaSPayment.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 25,
    include: {
      plan: { select: { id: true, name: true, slug: true } },
    },
  });

  const payments = rawPayments.map((p) => {
    const isAddon = p.mpStatusDetail?.startsWith('ADDON_NFSE');
    return {
      ...p,
      plan: isAddon
        ? { id: p.plan.id, name: 'Add-on Emissor NFS-e', slug: 'addon-nfse' }
        : p.plan,
    };
  });

  res.json({ payments });
});

// Checkout Add-on Módulo Emissor Fiscal NFS-e via PIX
billingRouter.post('/addon/nfse/pix', async (req, res) => {
  const tenantId = req.tenantId!;
  const body = z
    .object({
      payerCpf: z.string().trim().optional(),
      payerName: z.string().trim().optional(),
      payerEmail: z.string().email('E-mail do pagador inválido').optional(),
      couponCode: z.string().trim().optional(),
    })
    .parse(req.body || {});

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: { where: { role: 'OWNER' }, select: { email: true, name: true } },
      subscription: { include: { plan: true } },
    },
  });
  if (!tenant || !tenant.subscription) {
    throw HttpError.notFound('Assinatura do salão não encontrada.');
  }

  const nfseAddonCfg = await getAddonByKey('nfse');
  if (!nfseAddonCfg.isAddon) {
    throw HttpError.badRequest(
      'Este módulo não está disponível para contratação avulsa no momento. Faça upgrade do seu plano para liberá-lo.',
    );
  }
  const addonPriceCents = nfseAddonCfg.priceCents;

  let finalAmountCents = addonPriceCents;
  let appliedCouponCode: string | null = null;
  let discountCents = 0;

  if (body.couponCode) {
    const couponCheck = await validateAndCalculateCoupon({
      code: body.couponCode,
      targetType: 'ADDON',
      originalAmountCents: addonPriceCents,
    });
    if (!couponCheck.valid || !couponCheck.coupon) {
      throw HttpError.badRequest(couponCheck.message);
    }
    finalAmountCents = couponCheck.finalAmountCents;
    discountCents = couponCheck.discountCents;
    appliedCouponCode = couponCheck.coupon.code;
  }

  const owner = tenant.users[0];
  const payerEmail = body.payerEmail || tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = body.payerName || owner?.name || tenant.name;
  const notificationUrl = getMercadoPagoWebhookUrl(req);

  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: tenant.subscription.planId,
      amountCents: finalAmountCents,
      method: 'PIX',
      status: 'PENDING',
      mpStatusDetail: 'ADDON_NFSE:pending',
      payerEmail,
      payerName,
      payerDoc: body.payerCpf ? body.payerCpf.replace(/\D/g, '') : null,
      metadata: appliedCouponCode
        ? {
            couponCode: appliedCouponCode,
            discountCents,
            originalAmountCents: addonPriceCents,
          }
        : undefined,
    },
  });

  try {
    const pixResult = await createMercadoPagoPix({
      amountCents: finalAmountCents,
      description: `BarberFlow - Módulo Emissor NFS-e (${tenant.name})${
        appliedCouponCode ? ` [Cupom ${appliedCouponCode}]` : ''
      }`,
      payerEmail,
      payerName,
      payerCpf: body.payerCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: tenant.subscription.planId,
        saas_payment_id: saasPayment.id,
        addon_type: 'NFSE',
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {}),
      },
    });

    const updatedPayment = await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: {
        mpPaymentId: pixResult.paymentId,
        mpStatus: pixResult.status,
        mpStatusDetail: `ADDON_NFSE:${pixResult.statusDetail || 'pending'}`,
        qrCode: pixResult.qrCode,
        qrCodeBase64: pixResult.qrCodeBase64,
        ticketUrl: pixResult.ticketUrl,
        expiresAt: pixResult.expiresAt,
      },
    });

    res.json({
      paymentId: updatedPayment.id,
      mpPaymentId: pixResult.paymentId,
      status: pixResult.status,
      planName: 'Módulo Emissor NFS-e (Add-on)',
      amountCents: finalAmountCents,
      originalAmountCents: addonPriceCents,
      discountCents,
      couponCode: appliedCouponCode,
      qrCode: pixResult.qrCode,
      qrCodeBase64: pixResult.qrCodeBase64,
      ticketUrl: pixResult.ticketUrl,
      expiresAt: pixResult.expiresAt,
    });
  } catch (err: unknown) {
    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: { status: 'REJECTED', mpStatusDetail: `ADDON_NFSE:${err instanceof Error ? err.message : 'Falha Pix'}` },
    });
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Falha ao gerar cobrança Pix do módulo NFS-e.');
  }
});

// Checkout Add-on Módulo Emissor Fiscal NFS-e via Cartão de Crédito
billingRouter.post('/addon/nfse/card', async (req, res) => {
  const tenantId = req.tenantId!;
  const data = z
    .object({
      token: z.string().optional(),
      cardNumber: z.string().optional(),
      cardholderName: z.string().optional(),
      cardholderCpf: z.string().optional(),
      expMonth: z.union([z.string(), z.number()]).optional(),
      expYear: z.union([z.string(), z.number()]).optional(),
      cvv: z.string().optional(),
      installments: z.coerce.number().int().min(1).max(12).default(1),
      paymentMethodId: z.string().optional(),
      couponCode: z.string().trim().optional(),
    })
    .parse(req.body || {});

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: { where: { role: 'OWNER' }, select: { email: true, name: true } },
      subscription: { include: { plan: true } },
    },
  });
  if (!tenant || !tenant.subscription) {
    throw HttpError.notFound('Assinatura do salão não encontrada.');
  }

  const nfseAddonCfg = await getAddonByKey('nfse');
  if (!nfseAddonCfg.isAddon) {
    throw HttpError.badRequest(
      'Este módulo não está disponível para contratação avulsa no momento. Faça upgrade do seu plano para liberá-lo.',
    );
  }
  const addonPriceCents = nfseAddonCfg.priceCents;

  let finalAmountCents = addonPriceCents;
  let appliedCouponCode: string | null = null;
  let discountCents = 0;

  if (data.couponCode) {
    const couponCheck = await validateAndCalculateCoupon({
      code: data.couponCode,
      targetType: 'ADDON',
      originalAmountCents: addonPriceCents,
    });
    if (!couponCheck.valid || !couponCheck.coupon) {
      throw HttpError.badRequest(couponCheck.message);
    }
    finalAmountCents = couponCheck.finalAmountCents;
    discountCents = couponCheck.discountCents;
    appliedCouponCode = couponCheck.coupon.code;
  }

  const owner = tenant.users[0];
  const payerEmail = tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = data.cardholderName || owner?.name || tenant.name;

  let cardToken = data.token;
  if (!cardToken) {
    if (!data.cardNumber || !data.cardholderName || !data.cardholderCpf || !data.expMonth || !data.expYear || !data.cvv) {
      throw HttpError.badRequest('Preencha todos os dados do cartão de crédito.');
    }
    cardToken = await createMercadoPagoCardToken({
      cardNumber: data.cardNumber,
      cardholderName: data.cardholderName,
      cardholderCpf: data.cardholderCpf,
      expMonth: data.expMonth,
      expYear: data.expYear,
      cvv: data.cvv,
    });
  }

  const notificationUrl = getMercadoPagoWebhookUrl(req);

  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: tenant.subscription.planId,
      amountCents: finalAmountCents,
      method: 'CREDIT_CARD',
      status: 'PENDING',
      mpStatusDetail: 'ADDON_NFSE:pending',
      payerEmail,
      payerName,
      payerDoc: data.cardholderCpf ? data.cardholderCpf.replace(/\D/g, '') : null,
      installments: data.installments,
      metadata: appliedCouponCode
        ? {
            couponCode: appliedCouponCode,
            discountCents,
            originalAmountCents: addonPriceCents,
          }
        : undefined,
    },
  });

  try {
    const cardResult = await createMercadoPagoCardPayment({
      amountCents: finalAmountCents,
      token: cardToken,
      description: `BarberFlow - Módulo Emissor NFS-e (${tenant.name})${
        appliedCouponCode ? ` [Cupom ${appliedCouponCode}]` : ''
      }`,
      installments: data.installments,
      paymentMethodId: data.paymentMethodId || inferPaymentMethodId(data.cardNumber),
      payerEmail,
      payerName,
      payerCpf: data.cardholderCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: tenant.subscription.planId,
        saas_payment_id: saasPayment.id,
        addon_type: 'NFSE',
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {}),
      },
    });

    const isApproved = cardResult.status === 'approved';

    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: {
        mpPaymentId: cardResult.paymentId,
        mpStatus: cardResult.status,
        mpStatusDetail: `ADDON_NFSE:${cardResult.statusDetail || ''}`,
        cardBrand: cardResult.cardBrand,
        cardLastFour: cardResult.cardLastFour,
        installments: cardResult.installments,
        status: isApproved ? 'APPROVED' : cardResult.status === 'rejected' ? 'REJECTED' : 'PENDING',
        paidAt: isApproved ? new Date() : null,
      },
    });

    if (isApproved) {
      if (appliedCouponCode) {
        await incrementCouponUsage(appliedCouponCode);
      }

      const now = new Date();
      const existingSub = tenant.subscription;
      const baseDate =
        existingSub?.nfseAddonActive &&
        existingSub?.nfseAddonExpiresAt &&
        existingSub.nfseAddonExpiresAt > now
          ? DateTime.fromJSDate(existingSub.nfseAddonExpiresAt)
          : DateTime.fromJSDate(now);
      const nfseAddonExpiresAt = baseDate.plus({ days: 30 }).toJSDate();

      await prisma.subscription.update({
        where: { tenantId },
        data: {
          nfseAddonActive: true,
          nfseAddonExpiresAt,
          lastPaymentAt: now,
        },
      });

      await systemLog({
        tenantId,
        source: 'billing',
        message: `Módulo Add-on NFS-e ativado via Cartão de Crédito no Mercado Pago (MP ID: ${cardResult.paymentId})${
          appliedCouponCode ? ` [Cupom: ${appliedCouponCode}]` : ''
        }`,
      });

      return res.json({
        success: true,
        status: 'approved',
        message: 'Pagamento aprovado! O Módulo Emissor de NFS-e já está liberado para sua barbearia.',
        paymentId: saasPayment.id,
      });
    }

    res.json({
      success: false,
      status: cardResult.status,
      statusDetail: cardResult.statusDetail,
      message: translateMpStatusDetail(cardResult.status, cardResult.statusDetail),
      paymentId: saasPayment.id,
    });
  } catch (err: unknown) {
    await prisma.saaSPayment.update({
      where: { id: saasPayment.id },
      data: { status: 'REJECTED', mpStatusDetail: `ADDON_NFSE:${err instanceof Error ? err.message : 'Falha Cartão'}` },
    });
    throw HttpError.badRequest(err instanceof Error ? err.message : 'Falha ao processar pagamento do módulo NFS-e.');
  }
});
