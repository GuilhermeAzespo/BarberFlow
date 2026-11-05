import { prisma } from './prisma.js';
import { logger } from './logger.js';
import crypto from 'node:crypto';

export interface MercadoPagoConfig {
  accessToken?: string | null;
  publicKey?: string | null;
  webhookSecret?: string | null;
  sandbox: boolean;
  enabled: boolean;
  isConfigured: boolean;
}

export const DEFAULT_PUBLIC_FQDN = 'barberflow.azespo.com.br';

export function getMercadoPagoWebhookUrl(req?: any): string {
  // 1. Variável de ambiente explícita
  if (process.env.MP_WEBHOOK_URL && process.env.MP_WEBHOOK_URL.trim() !== '') {
    return sanitizeNotificationUrl(process.env.MP_WEBHOOK_URL.trim());
  }
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.trim() !== '') {
    return sanitizeNotificationUrl(`${process.env.PUBLIC_URL.replace(/\/$/, '')}/api/webhooks/mercadopago`);
  }

  // 2. Se a requisição contiver um host público válido (não localhost, 0.0.0.0 ou IP local)
  const rawHost = req?.get ? req.get('x-forwarded-host') || req.get('host') : null;
  if (rawHost) {
    const host = String(rawHost).split(',')[0].trim().split(':')[0].toLowerCase();
    const isLocal =
      !host.includes('.') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.') ||
      host.endsWith('.local');

    if (!isLocal) {
      return `https://${host}/api/webhooks/mercadopago`;
    }
  }

  // 3. Padrão FQDN Cloudflare Zero Trust oficial da aplicação (sempre https://)
  return `https://${DEFAULT_PUBLIC_FQDN}/api/webhooks/mercadopago`;
}

export function sanitizeNotificationUrl(rawUrl?: string): string {
  const url = (rawUrl || '').trim();
  if (
    !url ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('0.0.0.0') ||
    url.startsWith('http://') ||
    !url.startsWith('https://') ||
    /:\d+/.test(url)
  ) {
    return `https://${DEFAULT_PUBLIC_FQDN}/api/webhooks/mercadopago`;
  }
  return url;
}

export function sanitizePayerEmail(email?: string | null): string {
  const clean = (email || '').trim().toLowerCase();
  if (
    clean &&
    /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(clean) &&
    !clean.endsWith('.local') &&
    !clean.endsWith('@localhost')
  ) {
    return clean;
  }
  return 'pagamentos@azespo.com.br';
}

export function buildIdentification(rawDoc?: string | null): { type: 'CPF' | 'CNPJ'; number: string } | undefined {
  if (!rawDoc) return undefined;
  const digits = rawDoc.replace(/\D/g, '');
  if (digits.length === 11) {
    return { type: 'CPF', number: digits };
  }
  if (digits.length === 14) {
    return { type: 'CNPJ', number: digits };
  }
  return undefined;
}

export function inferPaymentMethodId(cardNumber?: string): string {
  if (!cardNumber) return 'master';
  const digits = cardNumber.replace(/\D/g, '');
  // Hipercard & Elo (testados antes de Visa/Master pois alguns BINs começam com 4, 5 ou 6)
  if (/^(606282|3841)/.test(digits)) return 'hipercard';
  if (
    /^(4011|431274|438935|451416|457393|4576|504175|506699|5067|5090|627780|636297|636368|6500|6504|6505|6507|6509|6516|6550)/.test(
      digits,
    )
  ) {
    return 'elo';
  }
  if (digits.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'master';
  if (/^(34|37)/.test(digits)) return 'amex';
  return 'master';
}

export function translateMpStatusDetail(status: string, statusDetail?: string): string {
  if (status === 'approved') {
    return 'Pagamento aprovado com sucesso!';
  }
  if (status === 'in_process' || status === 'pending') {
    return 'Pagamento em análise pela operadora do cartão. Assim que confirmado, sua assinatura será ativada automaticamente.';
  }

  switch (statusDetail) {
    case 'cc_rejected_insufficient_amount':
      return 'Cartão recusado por saldo ou limite insuficiente. Tente outro cartão ou pague via PIX.';
    case 'cc_rejected_bad_filled_security_code':
      return 'Código de segurança (CVV) inválido. Confira os dígitos no verso do cartão.';
    case 'cc_rejected_bad_filled_date':
      return 'Data de validade do cartão inválida ou vencida.';
    case 'cc_rejected_bad_filled_card_number':
      return 'Número do cartão inválido. Confira os 16 dígitos informados.';
    case 'cc_rejected_bad_filled_other':
      return 'Dados do cartão incorretos. Verifique o nome, CPF/CNPJ e validade.';
    case 'cc_rejected_high_risk':
      return 'Transação recusada pela prevenção antifraude do Mercado Pago. Recomendamos utilizar o pagamento via PIX para liberação imediata.';
    case 'cc_rejected_call_for_authorize':
      return 'O banco emissor exige autorização prévia para esta compra. Autorize no app do banco ou utilize o PIX.';
    case 'cc_rejected_card_disabled':
      return 'Este cartão está bloqueado ou desativado. Desbloqueie no aplicativo do seu banco.';
    case 'cc_rejected_duplicated_payment':
      return 'Você já realizou um pagamento recente deste mesmo valor. Aguarde alguns minutos.';
    case 'cc_rejected_max_attempts':
      return 'Limite de tentativas excedido para este cartão. Tente outro cartão ou pague via PIX.';
    case 'cc_rejected_blacklist':
    case 'cc_rejected_other_reason':
      return 'A operadora do cartão não autorizou a cobrança. Tente outro cartão ou utilize o PIX.';
    default:
      return `Pagamento não autorizado pela operadora (${statusDetail || status}). Tente outro cartão ou pague via PIX.`;
  }
}

export async function getActiveMercadoPagoConfig(): Promise<MercadoPagoConfig> {
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  const rawAccessToken = setting?.mpAccessToken || process.env.MP_ACCESS_TOKEN || null;
  const rawPublicKey = setting?.mpPublicKey || process.env.MP_PUBLIC_KEY || null;
  const rawWebhookSecret = setting?.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET || null;

  const accessToken = rawAccessToken ? rawAccessToken.trim() : null;
  const publicKey = rawPublicKey ? rawPublicKey.trim() : null;
  const webhookSecret = rawWebhookSecret ? rawWebhookSecret.trim() : null;

  const sandbox =
    setting?.mpSandbox ?? (process.env.MP_SANDBOX === 'true' || Boolean(accessToken?.startsWith('TEST-')));
  const enabled = setting?.mpEnabled ?? Boolean(accessToken);

  return {
    accessToken,
    publicKey,
    webhookSecret,
    sandbox,
    enabled,
    isConfigured: Boolean(accessToken && accessToken.length > 10),
  };
}

export async function testMercadoPagoConnection(accessToken: string): Promise<{
  success: boolean;
  message: string;
  account?: {
    id: number;
    nickname: string;
    email: string;
    site_id: string;
    country_id: string;
  };
}> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as any;
      return {
        success: false,
        message: errData.message || `Falha na autenticação com o Mercado Pago (HTTP ${res.status}).`,
      };
    }

    const data = (await res.json()) as any;
    return {
      success: true,
      message: `Conectado com sucesso à conta Mercado Pago: ${data.nickname || data.email} (${data.site_id})!`,
      account: {
        id: data.id,
        nickname: data.nickname,
        email: data.email,
        site_id: data.site_id,
        country_id: data.country_id,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Erro ao conectar à API do Mercado Pago.',
    };
  }
}

export interface CreatePixParams {
  amountCents: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerCpf?: string;
  metadata?: Record<string, unknown>;
  notificationUrl?: string;
}

export interface CreatePixResult {
  paymentId: string;
  status: string;
  statusDetail?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
  expiresAt?: Date;
}

export async function createMercadoPagoPix(params: CreatePixParams): Promise<CreatePixResult> {
  const config = await getActiveMercadoPagoConfig();
  if (!config.accessToken) {
    throw new Error('Mercado Pago não está configurado. O Super Admin precisa configurar o Access Token no painel.');
  }

  const amount = Number((params.amountCents / 100).toFixed(2));
  const nameParts = (params.payerName || 'Cliente BarberFlow').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'BarberFlow';
  const identification = buildIdentification(params.payerCpf);
  const safeEmail = sanitizePayerEmail(params.payerEmail);
  const externalReference = String(
    params.metadata?.saas_payment_id ||
      params.metadata?.tenant_id ||
      params.metadata?.tenantId ||
      params.metadata?.plan_id ||
      'barberflow-pix',
  );

  const idempotencyKey = crypto.randomUUID();

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    description: params.description,
    payment_method_id: 'pix',
    statement_descriptor: 'BARBERFLOW',
    external_reference: externalReference,
    payer: {
      email: safeEmail,
      first_name: firstName,
      last_name: lastName,
      ...(identification ? { identification } : {}),
    },
    additional_info: {
      items: [
        {
          id: String(params.metadata?.plan_id || params.metadata?.planId || params.metadata?.addon_type || 'assinatura'),
          title: params.description,
          description: params.description,
          category_id: 'services',
          quantity: 1,
          unit_price: amount,
        },
      ],
      payer: {
        first_name: firstName,
        last_name: lastName,
      },
    },
    metadata: params.metadata || {},
  };

  const notificationUrl = sanitizeNotificationUrl(params.notificationUrl || getMercadoPagoWebhookUrl());
  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    logger.error({ err: data }, 'Falha ao criar pagamento Pix no Mercado Pago');
    throw new Error(data.message || data.cause?.[0]?.description || 'Erro ao gerar Pix no Mercado Pago.');
  }

  const qrCode = data.point_of_interaction?.transaction_data?.qr_code;
  const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
  const ticketUrl = data.point_of_interaction?.transaction_data?.ticket_url;
  const expiresAt = data.date_of_expiration ? new Date(data.date_of_expiration) : undefined;

  return {
    paymentId: String(data.id),
    status: data.status,
    statusDetail: data.status_detail,
    qrCode,
    qrCodeBase64,
    ticketUrl,
    expiresAt,
  };
}

export interface CreateCardTokenParams {
  cardNumber: string;
  cardholderName: string;
  cardholderCpf: string;
  expMonth: string | number;
  expYear: string | number;
  cvv: string;
}

export async function createMercadoPagoCardToken(params: CreateCardTokenParams): Promise<string> {
  const config = await getActiveMercadoPagoConfig();
  if (!config.publicKey && !config.accessToken) {
    throw new Error('Chave do Mercado Pago não configurada.');
  }

  // Tokenização de cartão via API Mercado Pago
  const cleanNumber = params.cardNumber.replace(/\D/g, '');
  const cleanDoc = params.cardholderCpf.replace(/\D/g, '');
  const docType = cleanDoc.length === 14 ? 'CNPJ' : 'CPF';
  const month = String(params.expMonth).padStart(2, '0');
  let year = String(params.expYear).trim();
  if (year.length === 2) year = `20${year}`;

  const url = config.publicKey
    ? `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(config.publicKey)}`
    : 'https://api.mercadopago.com/v1/card_tokens';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (!config.publicKey && config.accessToken) {
    headers.Authorization = `Bearer ${config.accessToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      card_number: cleanNumber,
      security_code: params.cvv.replace(/\D/g, ''),
      expiration_month: Number(month),
      expiration_year: Number(year),
      cardholder: {
        name: params.cardholderName.trim().toUpperCase(),
        identification: {
          type: docType,
          number: cleanDoc,
        },
      },
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data.id) {
    logger.error({ err: data }, 'Falha na tokenização do cartão');
    const rawMsg = data.message || data.cause?.[0]?.description || '';
    if (rawMsg.includes('Unauthorized use of live credentials') || data.cause?.[0]?.code === 7) {
      throw new Error(
        'Você está usando uma Chave Pública de Produção (APP_USR-) com um cartão fictício de teste. No modo Sandbox, utilize as Credenciais de Teste (TEST-) geradas no portal do Mercado Pago.',
      );
    }
    throw new Error(rawMsg || 'Dados do cartão de crédito inválidos. Verifique número, validade, CVV e CPF/CNPJ.');
  }

  return data.id as string;
}

export interface CreateCardPaymentParams {
  amountCents: number;
  token: string;
  description: string;
  installments?: number;
  paymentMethodId?: string;
  payerEmail: string;
  payerName?: string;
  payerCpf?: string;
  metadata?: Record<string, unknown>;
  notificationUrl?: string;
}

export interface CreateCardResult {
  paymentId: string;
  status: string;
  statusDetail?: string;
  cardBrand?: string;
  cardLastFour?: string;
  installments: number;
}

export async function createMercadoPagoCardPayment(params: CreateCardPaymentParams): Promise<CreateCardResult> {
  const config = await getActiveMercadoPagoConfig();
  if (!config.accessToken) {
    throw new Error('Mercado Pago não está configurado.');
  }

  const amount = Number((params.amountCents / 100).toFixed(2));
  const identification = buildIdentification(params.payerCpf);
  const safeEmail = sanitizePayerEmail(params.payerEmail);
  const nameParts = (params.payerName || 'Cliente BarberFlow').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'BarberFlow';
  const externalReference = String(
    params.metadata?.saas_payment_id ||
      params.metadata?.tenant_id ||
      params.metadata?.tenantId ||
      params.metadata?.plan_id ||
      'barberflow-card',
  );

  const buildPaymentBody = (includePaymentMethodId: boolean): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      transaction_amount: amount,
      token: params.token,
      description: params.description,
      installments: params.installments || 1,
      statement_descriptor: 'BARBERFLOW',
      external_reference: externalReference,
      payer: {
        email: safeEmail,
        first_name: firstName,
        last_name: lastName,
        ...(identification ? { identification } : {}),
      },
      additional_info: {
        items: [
          {
            id: String(params.metadata?.plan_id || params.metadata?.planId || params.metadata?.addon_type || 'assinatura'),
            title: params.description,
            description: params.description,
            category_id: 'services',
            quantity: 1,
            unit_price: amount,
          },
        ],
        payer: {
          first_name: firstName,
          last_name: lastName,
        },
      },
      metadata: params.metadata || {},
    };

    if (includePaymentMethodId && params.paymentMethodId) {
      payload.payment_method_id = params.paymentMethodId;
    }

    const notificationUrl = sanitizeNotificationUrl(params.notificationUrl || getMercadoPagoWebhookUrl());
    if (notificationUrl) {
      payload.notification_url = notificationUrl;
    }

    return payload;
  };

  // Primeira tentativa com payment_method_id inferido (ou omitido se não fornecido)
  let res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(buildPaymentBody(true)),
  });

  let data = (await res.json()) as any;

  // Fallback automático: se o Mercado Pago acusar divergência de bandeira (diff_param_bins),
  // reenviamos sem payment_method_id para que o próprio Mercado Pago infira pelo BIN do token
  if (!res.ok && params.paymentMethodId) {
    const errText = JSON.stringify(data || {}).toLowerCase();
    if (errText.includes('diff_param_bins') || errText.includes('payment_method_id')) {
      logger.warn({ paymentMethodId: params.paymentMethodId }, 'Reenviando pagamento de cartão deixando o Mercado Pago inferir a bandeira pelo token');
      res = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(buildPaymentBody(false)),
      });
      data = (await res.json()) as any;
    }
  }

  if (!res.ok) {
    logger.error({ err: data }, 'Falha ao processar pagamento com cartão no Mercado Pago');
    const rawMsg = data.message || data.cause?.[0]?.description || '';
    if (rawMsg.includes('Unauthorized use of live credentials') || data.cause?.[0]?.code === 7) {
      throw new Error(
        'Você está usando credenciais de Produção (APP_USR-) com um cartão fictício de teste. No modo Sandbox, utilize as Credenciais de Teste (TEST-) geradas no portal do Mercado Pago.',
      );
    }
    throw new Error(rawMsg || 'Erro ao processar cartão de crédito.');
  }

  return {
    paymentId: String(data.id),
    status: data.status,
    statusDetail: data.status_detail,
    cardBrand: data.payment_method_id,
    cardLastFour: data.card?.last_four_digits,
    installments: data.installments || 1,
  };
}

export async function getMercadoPagoPayment(paymentId: string): Promise<{
  id: string;
  status: string;
  statusDetail?: string;
  transactionAmount?: number;
  metadata?: Record<string, unknown>;
  dateApproved?: string;
}> {
  const config = await getActiveMercadoPagoConfig();
  if (!config.accessToken) {
    throw new Error('Mercado Pago não está configurado.');
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Pagamento ${paymentId} não encontrado no Mercado Pago.`);
  }

  const data = (await res.json()) as any;
  return {
    id: String(data.id),
    status: data.status,
    statusDetail: data.status_detail,
    transactionAmount: data.transaction_amount,
    metadata: data.metadata,
    dateApproved: data.date_approved,
  };
}
