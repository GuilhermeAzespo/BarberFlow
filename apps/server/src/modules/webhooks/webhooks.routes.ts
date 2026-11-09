import { Router } from 'express';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { systemLog } from '../../lib/system-log.js';
import { getMercadoPagoPayment, getActiveMercadoPagoConfig } from '../../lib/mercadopago.js';
import { incrementCouponUsage } from '../../lib/coupons.js';
import { resolvePaymentCycleDays } from '../../lib/billing-cycles.js';
import { activateAddonOnSubscription, parseSubscriptionActiveAddons } from '../../lib/addons.js';
import type { PlanPermissions } from '../../lib/tenant-access.js';
import { clubService } from '../club/club.service.js';

export const webhooksRouter = Router();

// Endpoint GET para validação rápida de disponibilidade do Webhook no navegador / monitoramento
webhooksRouter.get('/mercadopago', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'BarberFlow Mercado Pago Webhook',
    ready: true,
  });
});

// Webhook oficial do Mercado Pago para confirmação de pagamentos (PIX / Cartão)
webhooksRouter.post('/mercadopago', async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const rawType = body.type || body.topic || query.type || query.topic || body.action || '';
    const eventType = String(rawType).toLowerCase().replace(/\..*$/, ''); // ex: 'payment.created' -> 'payment'
    const entityId =
      body.data?.id ||
      body.id ||
      query['data.id'] ||
      query.id;

    logger.info({ rawType, eventType, entityId }, 'Notificação de Webhook Mercado Pago recebida');

    if (!entityId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    let paymentId: string | null = null;

    if (eventType === 'merchant_order' || eventType === 'order') {
      try {
        const config = await getActiveMercadoPagoConfig();
        if (config.accessToken) {
          const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${encodeURIComponent(String(entityId))}`, {
            headers: { Authorization: `Bearer ${config.accessToken}` },
          });
          if (orderRes.ok) {
            const orderData = (await orderRes.json()) as any;
            const approved =
              orderData.payments?.find((p: any) => p.status === 'approved') ||
              orderData.payments?.[orderData.payments.length - 1];
            if (approved?.id) {
              paymentId = String(approved.id);
            }
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Falha ao buscar detalhes da merchant_order no Mercado Pago');
      }
    } else {
      // Por padrão considera que o entityId é o ID do pagamento
      paymentId = String(entityId);
    }

    if (!paymentId) {
      return res.status(200).json({ received: true, no_payment_found: true });
    }

    let mpPayment;
    try {
      mpPayment = await getMercadoPagoPayment(paymentId);
    } catch (err) {
      // Quando o painel do Mercado Pago envia uma simulação de teste com ID fictício (ex: 123456),
      // respondemos 200 OK para que o teste de conectividade do painel seja aprovado.
      logger.warn({ paymentId, err }, 'Pagamento do webhook não localizado na API do Mercado Pago (possível teste de simulação)');
      return res.status(200).json({ received: true, simulated_or_not_found: true });
    }

    if (!mpPayment) {
      return res.status(200).json({ received: true, not_found: true });
    }

    const metadata = mpPayment.metadata || {};
    const saasPaymentId = (metadata.saas_payment_id || metadata.saasPaymentId) as string | undefined;
    const tenantId = (metadata.tenant_id || metadata.tenantId) as string | undefined;

    // Localiza o registro de pagamento pelo ID do MP ou pelo ID interno
    const saasPayment = await prisma.saaSPayment.findFirst({
      where: {
        OR: [
          { mpPaymentId: String(paymentId) },
          ...(saasPaymentId ? [{ id: saasPaymentId }] : []),
        ],
      },
      include: {
        plan: true,
        tenant: {
          include: { subscription: true },
        },
      },
    });

    if (mpPayment.status === 'approved') {
      if (saasPayment) {
        const detail = String(saasPayment.mpStatusDetail || '');
        const paymentMeta = (saasPayment.metadata as Record<string, any> | null) || {};
        let detectedAddonKey: keyof PlanPermissions | null = null;
        if (metadata.addon_key) detectedAddonKey = metadata.addon_key as keyof PlanPermissions;
        else if (metadata.addon_type === 'NFSE' || detail.startsWith('ADDON_NFSE')) detectedAddonKey = 'nfse';
        else if (detail.startsWith('ADDON:')) detectedAddonKey = (detail.split(':')[1] || null) as keyof PlanPermissions | null;
        else if (paymentMeta.addonKey) detectedAddonKey = paymentMeta.addonKey as keyof PlanPermissions;

        const now = new Date();

        // Atualização atômica para evitar ativação ou logs duplicados entre Polling e Webhook
        const lockUpdate = await prisma.saaSPayment.updateMany({
          where: {
            id: saasPayment.id,
            status: { not: 'APPROVED' },
          },
          data: {
            status: 'APPROVED',
            mpPaymentId: String(paymentId),
            mpStatus: mpPayment.status,
            mpStatusDetail: detectedAddonKey
              ? `ADDON:${detectedAddonKey}:${mpPayment.statusDetail || 'accredited'}`
              : mpPayment.statusDetail,
            paidAt: mpPayment.dateApproved ? new Date(mpPayment.dateApproved) : now,
          },
        });

        if (lockUpdate.count === 0) {
          // Já foi aprovado anteriormente pelo polling ou por outra notificação de webhook
          return res.status(200).json({ received: true, already_processed: true });
        }

        const usedCouponCode =
          (metadata.coupon_code as string | undefined) ||
          (paymentMeta.couponCode as string | undefined);
        if (usedCouponCode) {
          await incrementCouponUsage(usedCouponCode);
        }

        const existingSub = saasPayment.tenant?.subscription;

        if (detectedAddonKey) {
          const activated = await activateAddonOnSubscription(saasPayment.tenantId, detectedAddonKey, 30);

          await systemLog({
            tenantId: saasPayment.tenantId,
            source: 'billing_webhook',
            message: `Módulo Add-on [${activated.name}] ativado via Webhook Mercado Pago (MP ID: ${paymentId})`,
          });
        } else {
          const isSamePlanRenewal =
            existingSub?.status === 'ACTIVE' &&
            existingSub?.planId === saasPayment.planId &&
            existingSub?.currentPeriodEnd &&
            existingSub.currentPeriodEnd > now;

          const baseDate = isSamePlanRenewal
            ? DateTime.fromJSDate(existingSub!.currentPeriodEnd!)
            : DateTime.fromJSDate(now);
          const cycleDays = resolvePaymentCycleDays(paymentMeta, metadata);
          const currentPeriodEnd = baseDate.plus({ days: cycleDays }).toJSDate();

          const currentAddonsList = parseSubscriptionActiveAddons(existingSub);
          const renewedAddonsList = currentAddonsList.map((a) => ({
            ...a,
            expiresAt: currentPeriodEnd.toISOString(),
          }));

          await prisma.subscription.upsert({
            where: { tenantId: saasPayment.tenantId },
            create: {
              tenantId: saasPayment.tenantId,
              planId: saasPayment.planId,
              status: 'ACTIVE',
              currentPeriodStart: now,
              currentPeriodEnd,
              lastPaymentAt: now,
              activeAddons: renewedAddonsList as any,
            },
            update: {
              planId: saasPayment.planId,
              status: 'ACTIVE',
              currentPeriodStart: now,
              currentPeriodEnd,
              lastPaymentAt: now,
              activeAddons: renewedAddonsList as any,
            },
          });

          await prisma.tenant.update({
            where: { id: saasPayment.tenantId },
            data: { status: 'ACTIVE', statusReason: null },
          });

          await systemLog({
            tenantId: saasPayment.tenantId,
            source: 'billing_webhook',
            message: `Assinatura Plano ${saasPayment.plan.name} ativada via Webhook Mercado Pago (MP ID: ${paymentId})`,
          });

          logger.info(
            { tenantId: saasPayment.tenantId, plan: saasPayment.plan.name },
            'Assinatura renovada com sucesso via Webhook Mercado Pago',
          );
        }
      } else if (tenantId) {
        // Caso não ache o saasPayment específico mas tenha tenant_id no metadata
        const planId = (metadata.plan_id as string) || undefined;
        if (planId && metadata.addon_type !== 'NFSE') {
          const now = new Date();
          const currentPeriodEnd = DateTime.now().plus({ days: resolvePaymentCycleDays(metadata) }).toJSDate();

          await prisma.subscription.upsert({
            where: { tenantId },
            create: {
              tenantId,
              planId,
              status: 'ACTIVE',
              currentPeriodStart: now,
              currentPeriodEnd,
              lastPaymentAt: now,
            },
            update: {
              planId,
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
        }
      }
    } else if (
      saasPayment &&
      saasPayment.status === 'PENDING' &&
      (mpPayment.status === 'rejected' || mpPayment.status === 'cancelled')
    ) {
      await prisma.saaSPayment.update({
        where: { id: saasPayment.id },
        data: {
          status: mpPayment.status === 'cancelled' ? 'CANCELED' : 'REJECTED',
          mpStatus: mpPayment.status,
          mpStatusDetail: mpPayment.statusDetail || saasPayment.mpStatusDetail,
        },
      });
    }

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    logger.error({ err }, 'Erro ao processar Webhook do Mercado Pago');
    // Retorna 200 para evitar que o Mercado Pago bloqueie a fila de webhooks
    return res.status(200).json({ received: true, error: err instanceof Error ? err.message : String(err) });
  }
});

// ─────────── Webhook Exclusivo por Salão (Recebimentos Online do Clube VIP) ───────────

webhooksRouter.get('/tenant-mercadopago/:tenantId', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'BarberFlow Tenant Mercado Pago Webhook',
    tenantId: req.params.tenantId,
    ready: true,
  });
});

webhooksRouter.post('/tenant-mercadopago/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const body = req.body || {};
    const query = req.query || {};

    const entityId = body.data?.id || body.id || query['data.id'] || query.id;
    if (!entityId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    await clubService.checkPublicOnlinePaymentStatus(tenantId, String(entityId), true);
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.warn({ err, tenantId: req.params.tenantId }, 'Aviso ao processar webhook Mercado Pago do salão');
    return res.status(200).json({ received: true });
  }
});
