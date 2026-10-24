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
    return process.env.MP_WEBHOOK_URL.trim();
  }
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.trim() !== '') {
    return `${process.env.PUBLIC_URL.replace(/\/$/, '')}/api/webhooks/mercadopago`;
  }

  // 2. Se a requisição contiver um host público válido (não localhost e não IP local)
  const rawHost = req?.get ? req.get('host') : null;
  if (rawHost) {
    const host = rawHost.split(':')[0].toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.endsWith('.local');

    if (!isLocal) {
      const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'https';
      return `${proto}://${rawHost}/api/webhooks/mercadopago`;
    }
  }

  // 3. Padrão FQDN Cloudflare Zero Trust oficial da aplicação
  return `https://${DEFAULT_PUBLIC_FQDN}/api/webhooks/mercadopago`;
}

export async function getActiveMercadoPagoConfig(): Promise<MercadoPagoConfig> {
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  const accessToken = setting?.mpAccessToken || process.env.MP_ACCESS_TOKEN || null;
  const publicKey = setting?.mpPublicKey || process.env.MP_PUBLIC_KEY || null;
  const webhookSecret = setting?.mpWebhookSecret || process.env.MP_WEBHOOK_SECRET || null;
  const sandbox = setting?.mpSandbox ?? (process.env.MP_SANDBOX === 'true');
  const enabled = setting?.mpEnabled ?? Boolean(accessToken);

  return {
    accessToken,
    publicKey,
    webhookSecret,
    sandbox,
    enabled,
    isConfigured: Boolean(accessToken && accessToken.trim().length > 10),
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
  const nameParts = (params.payerName || 'Cliente').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'BarberFlow';
  const cleanCpf = params.payerCpf ? params.payerCpf.replace(/\D/g, '') : undefined;

  const idempotencyKey = crypto.randomUUID();

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    description: params.description,
    payment_method_id: 'pix',
    payer: {
      email: params.payerEmail,
      first_name: firstName,
      last_name: lastName,
      ...(cleanCpf && cleanCpf.length === 11
        ? {
            identification: {
              type: 'CPF',
              number: cleanCpf,
            },
          }
        : {}),
    },
    metadata: params.metadata || {},
  };

  const notificationUrl = params.notificationUrl || getMercadoPagoWebhookUrl();
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
  const cleanNumber = params.cardNumber.replace(/\s+/g, '');
  const cleanCpf = params.cardholderCpf.replace(/\D/g, '');
  const month = String(params.expMonth).padStart(2, '0');
  let year = String(params.expYear);
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
      security_code: params.cvv,
      expiration_month: Number(month),
      expiration_year: Number(year),
      cardholder: {
        name: params.cardholderName.trim().toUpperCase(),
        identification: {
          type: 'CPF',
          number: cleanCpf,
        },
      },
    }),
  });

  const data = (await res.json()) as any;
  if (!res.ok || !data.id) {
    logger.error({ err: data }, 'Falha na tokenização do cartão');
    throw new Error(data.message || data.cause?.[0]?.description || 'Dados do cartão de crédito inválidos.');
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
  const idempotencyKey = crypto.randomUUID();
  const cleanCpf = params.payerCpf ? params.payerCpf.replace(/\D/g, '') : undefined;

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    token: params.token,
    description: params.description,
    installments: params.installments || 1,
    payment_method_id: params.paymentMethodId,
    payer: {
      email: params.payerEmail,
      ...(cleanCpf && cleanCpf.length === 11
        ? {
            identification: {
              type: 'CPF',
              number: cleanCpf,
            },
          }
        : {}),
    },
    metadata: params.metadata || {},
  };

  const notificationUrl = params.notificationUrl || getMercadoPagoWebhookUrl();
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
    logger.error({ err: data }, 'Falha ao processar pagamento com cartão no Mercado Pago');
    throw new Error(data.message || data.cause?.[0]?.description || 'Erro ao processar cartão de crédito.');
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

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
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
