import { Router } from 'express';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { systemLog } from '../../lib/system-log.js';
import { getMercadoPagoPayment } from '../../lib/mercadopago.js';

export const webhooksRouter = Router();

// Webhook oficial do Mercado Pago para confirmação de pagamentos (PIX / Cartão)
webhooksRouter.post('/mercadopago', async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const type = body.type || body.topic || query.type || query.topic;
    const paymentId =
      body.data?.id ||
      body.id ||
      query['data.id'] ||
      query.id;

    logger.info({ type, paymentId }, 'Notificação de Webhook Mercado Pago recebida');

    if (!paymentId || (type && type !== 'payment')) {
      // Se for outro evento (ex: merchant_order), responde 200 para liberar o MP
      return res.status(200).json({ received: true, ignored: true });
    }

    const mpPayment = await getMercadoPagoPayment(String(paymentId));
    if (!mpPayment) {
      return res.status(200).json({ received: true, not_found: true });
    }

    if (mpPayment.status === 'approved') {
      const metadata = mpPayment.metadata || {};
      const saasPaymentId = metadata.saas_payment_id as string | undefined;
      const tenantId = metadata.tenant_id as string | undefined;

      // Localiza o registro de pagamento pelo ID do MP ou pelo ID interno
      const saasPayment = await prisma.saaSPayment.findFirst({
        where: {
          OR: [
            { mpPaymentId: String(paymentId) },
            ...(saasPaymentId ? [{ id: saasPaymentId }] : []),
          ],
        },
        include: { plan: true, tenant: true },
      });

      if (saasPayment) {
        const now = new Date();
        const currentPeriodEnd = DateTime.now().plus({ days: 30 }).toJSDate();

        await prisma.saaSPayment.update({
          where: { id: saasPayment.id },
          data: {
            status: 'APPROVED',
            mpPaymentId: String(paymentId),
            mpStatus: mpPayment.status,
            mpStatusDetail: mpPayment.statusDetail,
            paidAt: mpPayment.dateApproved ? new Date(mpPayment.dateApproved) : now,
          },
        });

        await prisma.subscription.upsert({
          where: { tenantId: saasPayment.tenantId },
          create: {
            tenantId: saasPayment.tenantId,
            planId: saasPayment.planId,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd,
            lastPaymentAt: now,
          },
          update: {
            planId: saasPayment.planId,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd,
            lastPaymentAt: now,
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
      } else if (tenantId) {
        // Caso não ache o saasPayment específico mas tenha tenant_id no metadata
        const planId = (metadata.plan_id as string) || undefined;
        if (planId) {
          const now = new Date();
          const currentPeriodEnd = DateTime.now().plus({ days: 30 }).toJSDate();

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
    }

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    logger.error({ err }, 'Erro ao processar Webhook do Mercado Pago');
    // Retorna 200 para evitar que o Mercado Pago bloqueie a fila de webhooks
    return res.status(200).json({ received: true, error: err instanceof Error ? err.message : String(err) });
  }
});
