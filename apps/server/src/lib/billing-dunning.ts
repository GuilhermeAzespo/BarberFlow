import { DateTime } from 'luxon';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { sendEmail, buildBarberFlowEmailHtml } from './email.js';
import { getActiveMercadoPagoConfig, createMercadoPagoPix, getMercadoPagoWebhookUrl } from './mercadopago.js';
import { clubService } from '../modules/club/club.service.js';
import { whatsAppService } from '../modules/whatsapp/whatsapp.service.js';
import { normalizePhone } from './utils.js';
import { syncExpiredTenantsAndSubscriptions } from './tenant-access.js';

export type DunningStage = 'D-3' | 'D0' | 'D+2';

export interface BillingDunningConfig {
  enabled: boolean;
  sendEmail: boolean;
  sendInAppWarning: boolean;
  dMinus3Enabled: boolean;
  dDayEnabled: boolean;
  dPlus2Enabled: boolean;
  lastRunAt?: string | null;
  lastRunSummary?: DunningRunSummary | null;
}

export interface DunningRunDetail {
  tenantId: string;
  tenantName: string;
  stage: DunningStage;
  recipientEmail: string;
  success: boolean;
  pixGenerated: boolean;
  paymentId?: string;
  error?: string;
}

export interface DunningRunSummary {
  tenantsChecked: number;
  noticesSent: number;
  pixGenerated: number;
  errors: number;
  details: DunningRunDetail[];
  executedAt: string;
}

export interface DunningDashboardStats {
  config: BillingDunningConfig;
  counts: {
    dMinus3: number;
    dDay: number;
    dPlus2: number;
    pastDueOrBlocked: number;
  };
  recentLogs: Array<{
    id: string;
    tenantId: string | null;
    tenantName?: string;
    stage: DunningStage;
    recipientEmail: string;
    success: boolean;
    pixGenerated: boolean;
    createdAt: Date;
    message: string;
  }>;
}

const SETTING_ID = 'saas_billing_dunning';

export const DEFAULT_DUNNING_CONFIG: BillingDunningConfig = {
  enabled: true,
  sendEmail: true,
  sendInAppWarning: true,
  dMinus3Enabled: true,
  dDayEnabled: true,
  dPlus2Enabled: true,
  lastRunAt: null,
  lastRunSummary: null,
};

/**
 * Obtém a configuração salva da régua ou retorna os padrões.
 */
export async function getBillingDunningConfig(): Promise<BillingDunningConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { id: SETTING_ID } });
    if (!row?.smtpHost) return { ...DEFAULT_DUNNING_CONFIG };
    const parsed = JSON.parse(row.smtpHost);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_DUNNING_CONFIG.enabled,
      sendEmail: typeof parsed.sendEmail === 'boolean' ? parsed.sendEmail : DEFAULT_DUNNING_CONFIG.sendEmail,
      sendInAppWarning:
        typeof parsed.sendInAppWarning === 'boolean' ? parsed.sendInAppWarning : DEFAULT_DUNNING_CONFIG.sendInAppWarning,
      dMinus3Enabled:
        typeof parsed.dMinus3Enabled === 'boolean' ? parsed.dMinus3Enabled : DEFAULT_DUNNING_CONFIG.dMinus3Enabled,
      dDayEnabled: typeof parsed.dDayEnabled === 'boolean' ? parsed.dDayEnabled : DEFAULT_DUNNING_CONFIG.dDayEnabled,
      dPlus2Enabled:
        typeof parsed.dPlus2Enabled === 'boolean' ? parsed.dPlus2Enabled : DEFAULT_DUNNING_CONFIG.dPlus2Enabled,
      lastRunAt: parsed.lastRunAt || null,
      lastRunSummary: parsed.lastRunSummary || null,
    };
  } catch (err) {
    logger.warn({ err }, 'Erro ao carregar configuração da régua de cobrança');
    return { ...DEFAULT_DUNNING_CONFIG };
  }
}

/**
 * Salva a configuração da régua no banco.
 */
export async function saveBillingDunningConfig(raw: Partial<BillingDunningConfig>): Promise<BillingDunningConfig> {
  const current = await getBillingDunningConfig();
  const updated: BillingDunningConfig = {
    ...current,
    ...raw,
  };
  const serialized = JSON.stringify(updated);
  await prisma.systemSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, smtpHost: serialized },
    update: { smtpHost: serialized },
  });
  return updated;
}

/**
 * Formata valor em centavos para moeda BRL (ex: R$ 89,90).
 */
function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

/**
 * Obtém ou gera um pagamento PIX pendente para o salão.
 */
async function getOrGeneratePixPayment(tenant: any, plan: any, amountCents: number) {
  // 1. Procura se já existe um pagamento PIX pendente e não expirado criado nas últimas 24h
  const existing = await prisma.saaSPayment.findFirst({
    where: {
      tenantId: tenant.id,
      planId: plan.id,
      status: 'PENDING',
      method: 'PIX',
      qrCode: { not: null },
      createdAt: { gte: DateTime.now().minus({ hours: 24 }).toJSDate() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing?.qrCode) {
    return {
      paymentId: existing.id,
      qrCode: existing.qrCode,
      ticketUrl: existing.ticketUrl,
    };
  }

  // 2. Tenta gerar via Mercado Pago se configurado
  const mpConfig = await getActiveMercadoPagoConfig();
  if (!mpConfig.accessToken || !mpConfig.enabled) {
    return null;
  }

  const owner = tenant.users?.[0];
  const payerEmail = tenant.email || owner?.email || 'financeiro@barberflow.com.br';
  const payerName = owner?.name || tenant.name;

  const saasPayment = await prisma.saaSPayment.create({
    data: {
      tenantId: tenant.id,
      planId: plan.id,
      amountCents,
      method: 'PIX',
      status: 'PENDING',
      payerEmail,
      payerName,
      metadata: {
        billing_cycle: 'MONTHLY',
        cycle_days: 30,
        source: 'BILLING_DUNNING',
      },
    },
  });

  try {
    const pixResult = await createMercadoPagoPix({
      amountCents,
      description: `BarberFlow - Renovação Assinatura ${plan.name} (${tenant.name})`,
      payerEmail,
      payerName,
      notificationUrl: getMercadoPagoWebhookUrl(),
      metadata: {
        tenant_id: tenant.id,
        plan_id: plan.id,
        billing_cycle: 'MONTHLY',
        cycle_days: 30,
        saas_payment_id: saasPayment.id,
        source: 'BILLING_DUNNING',
      },
    });

    await prisma.saaSPayment.update({
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

    return {
      paymentId: saasPayment.id,
      qrCode: pixResult.qrCode,
      ticketUrl: pixResult.ticketUrl,
    };
  } catch (err) {
    logger.error({ err, tenantId: tenant.id }, 'Erro ao gerar PIX automático na régua de cobrança');
    return null;
  }
}

/**
 * Constrói o corpo do e-mail de acordo com o estágio da régua.
 */
function buildDunningEmail(
  stage: DunningStage,
  tenantName: string,
  planName: string,
  dateFormatted: string,
  priceStr: string,
  pixQrCode?: string | null,
  autoRenew: boolean = true,
) {
  const baseUrl = process.env.PUBLIC_URL || 'https://barberflow.azespo.com.br';
  const plansUrl = `${baseUrl.replace(/\/$/, '')}/planos`;
  const renewModeBadge = autoRenew
    ? `<p style="margin: 12px 0; font-size: 13px; color: #10B981;">🔄 <strong>Modo de Renovação:</strong> Automática (Auto-Renew Ativo) — você pode alterar para Manual a qualquer momento no painel.</p>`
    : `<p style="margin: 12px 0; font-size: 13px; color: #F59E0B;">📅 <strong>Modo de Renovação:</strong> Manual — como o Auto-Renew está desativado, acesse o painel para renovar quando desejar.</p>`;

  if (stage === 'D-3') {
    return {
      subject: `⏳ Sua assinatura BarberFlow vence em 3 dias (${dateFormatted})`,
      title: 'Lembrete Amigável de Renovação',
      html: buildBarberFlowEmailHtml({
        title: 'Sua assinatura vence em 3 dias',
        contentHtml: `
          <p>Olá, <strong>${tenantName}</strong>!</p>
          <p>Passando para lembrar que a sua assinatura do <strong>Plano ${planName}</strong> vence em <strong>${dateFormatted}</strong> (restam apenas 3 dias).</p>
          ${renewModeBadge}
          <p>Para manter sua barbearia operando sem nenhuma interrupção nos agendamentos online, vitrine pública e gestão da equipe, você já pode antecipar sua renovação.</p>
          <div style="margin: 20px 0; padding: 14px 18px; background: rgba(229, 179, 56, 0.08); border-left: 4px solid #E5B338; border-radius: 6px;">
            <p style="margin: 0; font-size: 14px; color: #E2E8F0;">
              💡 <strong>Dica Pro:</strong> Você pode optar pelos ciclos <strong>Semestral ou Anual</strong> e economizar até <strong>2 meses grátis</strong> com parcelamento no cartão!
            </p>
          </div>
        `,
        actionButton: {
          text: 'Gerenciar / Renovar Assinatura →',
          url: plansUrl,
        },
      }),
    };
  }

  if (stage === 'D0') {
    const pixBlock = pixQrCode
      ? `
        <div style="margin: 24px 0; padding: 18px; background-color: #0B0F17; border: 1px dashed #E5B338; border-radius: 10px;">
          <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #E5B338; text-transform: uppercase; letter-spacing: 0.05em;">
            ⚡ Código PIX Copia e Cola Pronto:
          </p>
          <div style="font-family: ui-monospace, Menlo, Monaco, 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #F8FAFC; background: rgba(255,255,255,0.06); padding: 12px; border-radius: 6px; user-select: all; line-height: 1.4;">
            ${pixQrCode}
          </div>
          <p style="margin: 10px 0 0 0; font-size: 12px; color: #94A3B8;">
            Copie o código acima e cole na opção <strong>PIX Copia e Cola</strong> do app do seu banco. A confirmação e liberação do salão é imediata!
          </p>
        </div>
      `
      : '';

    return {
      subject: `🔔 Sua assinatura BarberFlow vence hoje (${dateFormatted})`,
      title: 'Sua Assinatura Vence Hoje',
      html: buildBarberFlowEmailHtml({
        title: 'Renovação da Assinatura BarberFlow',
        contentHtml: `
          <p>Olá, <strong>${tenantName}</strong>!</p>
          <p>Sua assinatura do <strong>Plano ${planName}</strong> vence hoje, <strong>${dateFormatted}</strong>.</p>
          ${renewModeBadge}
          <div style="margin: 18px 0; padding: 16px; background: rgba(255, 255, 255, 0.04); border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; justify-content: space-between; font-size: 15px; margin-bottom: 6px;">
              <span style="color: #94A3B8;">Plano:</span>
              <strong style="color: #F8FAFC;">${planName}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 15px;">
              <span style="color: #94A3B8;">Valor da Renovação:</span>
              <strong style="color: #10B981; font-size: 16px;">${priceStr}</strong>
            </div>
          </div>
          ${pixBlock}
          <p style="font-size: 13px; color: #94A3B8;">Você também pode efetuar o pagamento via Cartão de Crédito ou alterar sua preferência de Auto-Renew acessando o painel.</p>
        `,
        actionButton: {
          text: 'Pagar no BarberFlow →',
          url: plansUrl,
        },
      }),
    };
  }

  // D+2
  const pixBlockUrgent = pixQrCode
    ? `
      <div style="margin: 24px 0; padding: 18px; background-color: #0B0F17; border: 1px dashed #EF4444; border-radius: 10px;">
        <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; color: #EF4444; text-transform: uppercase;">
          ⚠️ Pague via PIX Copia e Cola para regularizar agora:
        </p>
        <div style="font-family: ui-monospace, Menlo, Monaco, 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #F8FAFC; background: rgba(255,255,255,0.06); padding: 12px; border-radius: 6px; user-select: all; line-height: 1.4;">
          ${pixQrCode}
        </div>
      </div>
    `
    : '';

  return {
    subject: `⚠️ URGENTE: Sua assinatura BarberFlow está vencida (${dateFormatted})`,
    title: 'Regularização Urgente de Assinatura',
    html: buildBarberFlowEmailHtml({
      title: 'Aviso Importante: Assinatura Vencida',
      contentHtml: `
        <p>Olá, <strong>${tenantName}</strong>!</p>
        <p style="color: #F87171; font-weight: 600;">
          Identificamos que a assinatura do <strong>Plano ${planName}</strong> da sua barbearia venceu em <strong>${dateFormatted}</strong> (há 2 dias).
        </p>
        ${renewModeBadge}
        <p>
          Sua conta está no período final de carência. Para evitar a <strong>suspensão dos agendamentos online</strong> e bloqueio do acesso dos seus profissionais, por favor efetue a regularização hoje mesmo.
        </p>
        <div style="margin: 18px 0; padding: 14px 18px; background: rgba(239, 68, 68, 0.08); border-left: 4px solid #EF4444; border-radius: 6px;">
          <p style="margin: 0; font-size: 14px; color: #FCA5A5;">
            Valor pendente: <strong>${priceStr}</strong>
          </p>
        </div>
        ${pixBlockUrgent}
      `,
      actionButton: {
        text: 'Regularizar Assinatura Agora →',
        url: plansUrl,
      },
    }),
  };
}

/**
 * Executa a régua de cobrança completa em todos os salões cadastrados.
 * Pode ser disparada pelo Worker automático diário ou manualmente pelo Super Admin.
 */
export async function executeBillingDunning(options?: { force?: boolean }): Promise<DunningRunSummary> {
  const config = await getBillingDunningConfig();
  if (!config.enabled && !options?.force) {
    logger.info('Régua de cobrança automática está desativada no Super Admin.');
    return {
      tenantsChecked: 0,
      noticesSent: 0,
      pixGenerated: 0,
      errors: 0,
      details: [],
      executedAt: new Date().toISOString(),
    };
  }

  logger.info('Iniciando varredura da Régua Automática de Cobrança...');

  // Sincroniza salões cujo Trial ou Assinatura venceram sem pagamento
  await syncExpiredTenantsAndSubscriptions();

  // Busca todos os salões com suas assinaturas, planos e usuários
  const tenants = await prisma.tenant.findMany({
    where: {
      status: { notIn: ['CANCELED', 'SUSPENDED'] },
    },
    include: {
      subscription: {
        include: { plan: true },
      },
      users: {
        where: { role: { in: ['OWNER', 'MANAGER'] } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  const details: DunningRunDetail[] = [];
  let noticesSent = 0;
  let pixGeneratedCount = 0;
  let errorsCount = 0;

  for (const tenant of tenants) {
    const sub = tenant.subscription;
    if (!sub || !sub.plan || sub.status === 'CANCELED') continue;

    const expirationDate = sub.currentPeriodEnd ?? sub.trialEndsAt;
    if (!expirationDate) continue;

    const timezone = tenant.timezone || 'America/Sao_Paulo';
    const today = DateTime.now().setZone(timezone).startOf('day');
    const expDate = DateTime.fromJSDate(expirationDate).setZone(timezone).startOf('day');
    const diffDays = Math.round(expDate.diff(today, 'days').days);

    let stage: DunningStage | null = null;
    if (diffDays === 3 && config.dMinus3Enabled) {
      stage = 'D-3';
    } else if (diffDays === 0 && config.dDayEnabled) {
      stage = 'D0';
    } else if (diffDays === -2 && config.dPlus2Enabled) {
      stage = 'D+2';
    }

    if (!stage) continue;

    // Deduplicação: verifica se já enviou esta notificação para este salão hoje
    const startOfDay = today.toJSDate();
    const endOfDay = today.endOf('day').toJSDate();
    const existingLogs = await prisma.systemLog.findMany({
      where: {
        tenantId: tenant.id,
        source: 'BILLING_DUNNING',
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    });

    const alreadySent = existingLogs.some((l) => (l.meta as any)?.stage === stage);
    if (alreadySent && !options?.force) {
      continue;
    }

    const recipientEmail = tenant.email || tenant.users?.[0]?.email;
    if (!recipientEmail) {
      logger.warn({ tenantId: tenant.id }, 'Salão sem e-mail para envio de cobrança.');
      continue;
    }

    const priceCents = sub.plan.priceCents || 0;
    const priceStr = formatBRL(priceCents);
    const dateFormatted = expDate.toFormat('dd/LL/yyyy');

    let pixInfo: { paymentId: string; qrCode?: string | null; ticketUrl?: string | null } | null = null;
    const isAutoRenew = sub.autoRenew ?? true;

    // Em D0 e D+2, gera ou busca o PIX automático (se Auto-Renew estiver ativo ou em D+2 de regularização)
    if ((stage === 'D0' && isAutoRenew) || stage === 'D+2') {
      try {
        pixInfo = await getOrGeneratePixPayment(tenant, sub.plan, priceCents);
        if (pixInfo?.qrCode) pixGeneratedCount++;
      } catch (err) {
        logger.error({ err, tenantId: tenant.id }, 'Falha ao processar PIX da régua');
      }
    }

    // Disparo via Bot WhatsApp seguindo o mesmo fluxo de avisos (D-3, D0, D+2)
    try {
      const conn = whatsAppService.getConnection(tenant.id);
      const cleanPhone = (tenant.phone ? normalizePhone(tenant.phone) : '') || '';
      if (conn?.status === 'CONNECTED' && cleanPhone.length >= 10) {
        const renewStatusTxt = isAutoRenew
          ? '🔄 *Renovação Automática (Auto-Renew):* ATIVA'
          : '📅 *Modo de Renovação:* MANUAL (Auto-Renew desativado)';
        let waMsg = '';
        if (stage === 'D-3') {
          waMsg = `⏳ *Aviso de Vencimento — BarberFlow*\n\nOlá, *${tenant.name}*!\nSua assinatura do *Plano ${sub.plan.name}* (${priceStr}) vence em *3 dias* (${dateFormatted}).\n\n${renewStatusTxt}\n\n${
            isAutoRenew
              ? 'No dia do vencimento enviaremos automaticamente o código de renovação.'
              : 'Como sua renovação está no modo Manual, acesse /planos quando desejar renovar seu ciclo!'
          }`;
        } else if (stage === 'D0') {
          waMsg = `🔔 *Sua Assinatura Vence Hoje — BarberFlow*\n\nOlá, *${tenant.name}*!\nSua assinatura do *Plano ${sub.plan.name}* (${priceStr}) vence *hoje* (${dateFormatted}).\n\n${renewStatusTxt}${
            pixInfo?.qrCode
              ? `\n\n⚡ *PIX Copia e Cola gerado automaticamente:*\n\n${pixInfo.qrCode}`
              : '\n\nAcesse o menu *Assinatura (/planos)* no seu painel para renovar.'
          }`;
        } else {
          waMsg = `⚠️ *Aviso Urgente (Carência D+2) — BarberFlow*\n\nOlá, *${tenant.name}*!\nSua assinatura do *Plano ${sub.plan.name}* (${priceStr}) venceu em *${dateFormatted}*.\n\n${renewStatusTxt}\n\nPara evitar o bloqueio do painel e da vitrine online, regularize sua assinatura em */planos*.`;
        }
        await whatsAppService.sendMessage(tenant.id, cleanPhone, waMsg);
      }
    } catch (waErr) {
      logger.warn({ err: waErr, tenantId: tenant.id }, 'Aviso: Falha ao enviar mensagem da régua via WhatsApp');
    }

    // Envio do e-mail
    if (config.sendEmail) {
      const emailPayload = buildDunningEmail(
        stage,
        tenant.name,
        sub.plan.name,
        dateFormatted,
        priceStr,
        pixInfo?.qrCode,
        isAutoRenew,
      );

      try {
        const sent = await sendEmail({
          to: recipientEmail,
          subject: emailPayload.subject,
          html: emailPayload.html,
        });

        if (sent) {
          noticesSent++;
          details.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            stage,
            recipientEmail,
            success: true,
            pixGenerated: Boolean(pixInfo?.qrCode),
            paymentId: pixInfo?.paymentId,
          });

          // Registra no SystemLog para auditoria e controle de deduplicação
          await prisma.systemLog.create({
            data: {
              tenantId: tenant.id,
              level: 'INFO',
              source: 'BILLING_DUNNING',
              message: `Régua de Cobrança [${stage}]: E-mail enviado com sucesso para ${recipientEmail}`,
              meta: {
                stage,
                recipientEmail,
                planName: sub.plan.name,
                planPriceCents: priceCents,
                dueDate: dateFormatted,
                pixGenerated: Boolean(pixInfo?.qrCode),
                paymentId: pixInfo?.paymentId,
                sentAt: new Date().toISOString(),
              },
            },
          });
        } else {
          errorsCount++;
          details.push({
            tenantId: tenant.id,
            tenantName: tenant.name,
            stage,
            recipientEmail,
            success: false,
            pixGenerated: Boolean(pixInfo?.qrCode),
            error: 'SMTP rejeitou ou falhou ao entregar o e-mail.',
          });
        }
      } catch (err) {
        errorsCount++;
        const errorMessage = err instanceof Error ? err.message : 'Erro no envio';
        details.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          stage,
          recipientEmail,
          success: false,
          pixGenerated: Boolean(pixInfo?.qrCode),
          error: errorMessage,
        });
      }
    }
  }

  const summary: DunningRunSummary = {
    tenantsChecked: tenants.length,
    noticesSent,
    pixGenerated: pixGeneratedCount,
    errors: errorsCount,
    details,
    executedAt: new Date().toISOString(),
  };

  await saveBillingDunningConfig({
    lastRunAt: summary.executedAt,
    lastRunSummary: summary,
  });

  logger.info(
    { tenantsChecked: summary.tenantsChecked, noticesSent, pixGenerated: pixGeneratedCount, errors: errorsCount },
    'Varredura da Régua de Cobrança concluída com sucesso',
  );

  return summary;
}

/**
 * Coleta estatísticas em tempo real para o painel Super Admin.
 */
export async function getDunningDashboardStats(): Promise<DunningDashboardStats> {
  await syncExpiredTenantsAndSubscriptions();
  const config = await getBillingDunningConfig();

  const tenants = await prisma.tenant.findMany({
    include: {
      subscription: { include: { plan: true } },
    },
  });

  let dMinus3 = 0;
  let dDay = 0;
  let dPlus2 = 0;
  let pastDueOrBlocked = 0;

  for (const t of tenants) {
    if (t.status === 'BLOCKED') {
      pastDueOrBlocked++;
      continue;
    }
    const sub = t.subscription;
    if (!sub || sub.status === 'CANCELED') continue;
    if (sub.status === 'PAST_DUE') pastDueOrBlocked++;

    const expirationDate = sub.currentPeriodEnd ?? sub.trialEndsAt;
    if (!expirationDate) continue;

    const timezone = t.timezone || 'America/Sao_Paulo';
    const today = DateTime.now().setZone(timezone).startOf('day');
    const expDate = DateTime.fromJSDate(expirationDate).setZone(timezone).startOf('day');
    const diffDays = Math.round(expDate.diff(today, 'days').days);

    if (diffDays === 3) dMinus3++;
    else if (diffDays === 0) dDay++;
    else if (diffDays === -2) dPlus2++;
  }

  // Busca os últimos 50 logs da régua
  const logs = await prisma.systemLog.findMany({
    where: { source: 'BILLING_DUNNING' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { tenant: { select: { name: true } } },
  });

  const recentLogs = logs.map((l) => {
    const meta = (l.meta as any) || {};
    return {
      id: l.id,
      tenantId: l.tenantId,
      tenantName: l.tenant?.name || 'Salão',
      stage: (meta.stage as DunningStage) || 'D0',
      recipientEmail: meta.recipientEmail || 'E-mail não informado',
      success: l.level === 'INFO',
      pixGenerated: Boolean(meta.pixGenerated),
      createdAt: l.createdAt,
      message: l.message,
    };
  });

  return {
    config,
    counts: {
      dMinus3,
      dDay,
      dPlus2,
      pastDueOrBlocked,
    },
    recentLogs,
  };
}

/**
 * Worker com agendamento automático a cada 1 hora.
 */
class BillingDunningWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.timer) return;

    logger.info('Iniciando BillingDunningWorker (verificação diária periódica)...');

    // Executa a primeira checagem após 45 segundos do startup
    setTimeout(() => {
      this.runSafely();
    }, 45000);

    // Agenda checagem periódica a cada 60 minutos
    this.timer = setInterval(() => {
      this.runSafely();
    }, 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runSafely() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await executeBillingDunning();
      await clubService.runClubRenewalBotWarnings();
    } catch (err) {
      logger.error({ err }, 'Erro inesperado na execução periódica do BillingDunningWorker');
    } finally {
      this.isRunning = false;
    }
  }
}

export const billingDunningWorker = new BillingDunningWorker();
