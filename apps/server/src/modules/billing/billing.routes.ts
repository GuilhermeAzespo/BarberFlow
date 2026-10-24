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
} from '../../lib/mercadopago.js';
import { effectiveLimits, evaluateTenantAccess } from '../../lib/tenant-access.js';

export const billingRouter = Router();

const pixCheckoutSchema = z.object({
  planId: z.string().min(1, 'ID do plano é obrigatório'),
  payerCpf: z.string().trim().optional(),
  payerName: z.string().trim().optional(),
  payerEmail: z.string().email('E-mail do pagador inválido').optional(),
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
    orderBy: { sortOrder: 'asc' },
  });

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
          limits: effectiveLimits(sub),
        }
      : null,
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

  const owner = tenant.users[0];
  const payerEmail = data.payerEmail || tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = data.payerName || owner?.name || tenant.name;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'barberflow.azespo.com.br';
  const notificationUrl = `${protocol}://${host}/api/webhooks/mercadopago`;

  // Cria registro pendente no banco
  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: plan.id,
      amountCents: plan.priceCents,
      method: 'PIX',
      status: 'PENDING',
      payerEmail,
      payerName,
      payerDoc: data.payerCpf ? data.payerCpf.replace(/\D/g, '') : null,
    },
  });

  try {
    const pixResult = await createMercadoPagoPix({
      amountCents: plan.priceCents,
      description: `BarberFlow - Assinatura Plano ${plan.name} (${tenant.name})`,
      payerEmail,
      payerName,
      payerCpf: data.payerCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: plan.id,
        saas_payment_id: saasPayment.id,
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
      amountCents: plan.priceCents,
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

  const owner = tenant.users[0];
  const payerEmail = tenant.email || owner?.email || 'financeiro@barberflow.com.br';

  let cardToken = data.token;
  if (!cardToken) {
    if (!data.cardNumber || !data.cardholderName || !data.cardholderCpf || !data.expMonth || !data.expYear || !data.cvv) {
      throw HttpError.badRequest('Preencha todos os dados do cartão de crédito (número, titular, CPF, validade e CVV).');
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

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host') || 'barberflow.azespo.com.br';
  const notificationUrl = `${protocol}://${host}/api/webhooks/mercadopago`;

  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId,
      planId: plan.id,
      amountCents: plan.priceCents,
      method: 'CREDIT_CARD',
      status: 'PENDING',
      payerEmail,
      payerName: data.cardholderName || owner?.name,
      payerDoc: data.cardholderCpf ? data.cardholderCpf.replace(/\D/g, '') : null,
      installments: data.installments,
    },
  });

  try {
    const cardResult = await createMercadoPagoCardPayment({
      amountCents: plan.priceCents,
      token: cardToken,
      description: `BarberFlow - Assinatura Plano ${plan.name} (${tenant.name})`,
      installments: data.installments,
      paymentMethodId: data.paymentMethodId,
      payerEmail,
      payerCpf: data.cardholderCpf,
      notificationUrl,
      metadata: {
        tenant_id: tenantId,
        plan_id: plan.id,
        saas_payment_id: saasPayment.id,
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
      const now = new Date();
      const currentPeriodEnd = DateTime.now().plus({ days: 30 }).toJSDate();

      await prisma.subscription.upsert({
        where: { tenantId },
        create: {
          tenantId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd,
          lastPaymentAt: now,
        },
        update: {
          planId: plan.id,
          status: 'ACTIVE',
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
        message: `Assinatura Plano ${plan.name} ativada via Cartão de Crédito no Mercado Pago`,
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
      message:
        cardResult.status === 'in_process'
          ? 'Pagamento em análise pelo Mercado Pago. A liberação ocorrerá em instantes.'
          : 'Pagamento não autorizado pela operadora do cartão.',
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
    include: { plan: true },
  });

  if (!payment) throw HttpError.notFound('Cobrança não encontrada.');

  // Se estiver pendente e tiver mpPaymentId, faz checagem ativa no Mercado Pago
  if (payment.status === 'PENDING' && payment.mpPaymentId) {
    try {
      const mpStatus = await getMercadoPagoPayment(payment.mpPaymentId);
      if (mpStatus.status === 'approved') {
        const now = new Date();
        const currentPeriodEnd = DateTime.now().plus({ days: 30 }).toJSDate();

        await prisma.saaSPayment.update({
          where: { id: payment.id },
          data: {
            status: 'APPROVED',
            mpStatus: mpStatus.status,
            mpStatusDetail: mpStatus.statusDetail,
            paidAt: mpStatus.dateApproved ? new Date(mpStatus.dateApproved) : now,
          },
        });

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

        return res.json({
          id: payment.id,
          status: 'APPROVED',
          isPaid: true,
          planName: payment.plan.name,
          amountCents: payment.amountCents,
          paidAt: now,
        });
      }
    } catch {
      // Ignora falha temporária de checagem do MP
    }
  }

  res.json({
    id: payment.id,
    status: payment.status,
    isPaid: payment.status === 'APPROVED',
    planName: payment.plan.name,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
  });
});

// Histórico de Faturas / Pagamentos do Salão
billingRouter.get('/history', async (req, res) => {
  const tenantId = req.tenantId!;
  const payments = await prisma.saaSPayment.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      plan: { select: { id: true, name: true, slug: true } },
    },
  });

  res.json({ payments });
});
