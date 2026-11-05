import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { systemLog } from '../../lib/system-log.js';
import { assertPlanFeature, effectiveLimits, loadTenant } from '../../lib/tenant-access.js';
import { getAddonByKey } from '../../lib/addons.js';
import { DEFAULT_FALLBACK_ORIGIN } from '../../lib/cloudflare.js';
import { whatsAppService } from '../whatsapp/whatsapp.service.js';
import { inspectPfxCertificate, transmitNfse } from './nfse.engine.js';

export const nfseRouter = Router();

const uploadPfx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max para arquivo .pfx
});

const fiscalConfigSchema = z.object({
  enabled: z.boolean().default(true),
  environment: z.enum(['HOMOLOGATION', 'PRODUCTION']).default('HOMOLOGATION'),
  providerMode: z.enum(['ADN_NACIONAL', 'EXTERNAL_API']).default('ADN_NACIONAL'),
  cnpj: z.string().trim().optional().nullable(),
  razaoSocial: z.string().trim().optional().nullable(),
  nomeFantasia: z.string().trim().optional().nullable(),
  inscricaoMunicipal: z.string().trim().optional().nullable(),
  codigoMunicipioIbge: z.string().trim().optional().nullable(),
  uf: z.string().trim().max(2).optional().nullable(),
  cep: z.string().trim().optional().nullable(),
  logradouro: z.string().trim().optional().nullable(),
  numero: z.string().trim().optional().nullable(),
  bairro: z.string().trim().optional().nullable(),
  complemento: z.string().trim().optional().nullable(),
  regimeTributario: z
    .union([z.enum(['MEI', 'SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO']), z.coerce.number()])
    .transform((v) => {
      if (v === 1 || v === 'MEI') return 'MEI';
      if (v === 2 || v === 'SIMPLES_NACIONAL') return 'SIMPLES_NACIONAL';
      if (v === 3 || v === 'LUCRO_PRESUMIDO') return 'LUCRO_PRESUMIDO';
      return 'MEI';
    })
    .default('MEI'),
  optanteSimples: z.coerce.number().int().min(1).max(3).default(2),
  itemListaServico: z.string().trim().default('06.01'),
  codigoTributacaoNacional: z.string().trim().default('060101'),
  codigoTributacaoMunicipal: z.string().trim().optional().nullable(),
  cnae: z.string().trim().optional().nullable(),
  aliquotaIss: z.coerce.number().min(0).max(15).default(2.0),
  retencaoIss: z.boolean().default(false),
  serieDps: z.string().trim().default('1'),
  proximoNumeroDps: z.coerce.number().int().min(1).default(1),
  salaoParceiroEnabled: z.boolean().default(false),
  autoEmitOnComplete: z.boolean().default(false),
  autoSendWhatsApp: z.boolean().optional(),
  autoSendWhatsapp: z.boolean().optional(),
  externalApiUrl: z.string().trim().optional().nullable(),
  externalWebhookUrl: z.string().trim().optional().nullable(),
  externalApiToken: z.string().trim().optional().nullable(),
});

const emitNfseSchema = z.object({
  appointmentId: z.string().optional().nullable(),
  tomadorNome: z.string().trim().min(2, 'Informe o nome do cliente').optional(),
  tomadorDocumento: z.string().trim().optional().nullable(),
  tomadorEmail: z.string().trim().optional().nullable(),
  tomadorTelefone: z.string().trim().optional().nullable(),
  discriminacao: z.string().trim().optional(),
  valorBrutoCents: z.coerce.number().int().positive().optional(),
  valorServicosCents: z.coerce.number().int().positive().optional(),
  valorDeducaoParceiroCents: z.coerce.number().int().min(0).optional(),
  aplicarSalaoParceiro: z.boolean().optional(),
  profissionalParceiroNome: z.string().trim().optional().nullable(),
  sendWhatsApp: z.boolean().optional(),
  sendWhatsapp: z.boolean().optional(),
});

function buildPublicDanfseUrl(tenant: { customDomain?: string | null }, invoiceId: string, codigoVerificacao?: string | null): string {
  const baseHost = tenant.customDomain ? tenant.customDomain.trim() : DEFAULT_FALLBACK_ORIGIN;
  const codeQuery = codigoVerificacao ? `?code=${encodeURIComponent(codigoVerificacao)}` : '';
  return `https://${baseHost}/api/public/nfse/${invoiceId}/danfse${codeQuery}`;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

/**
 * Emite uma NFS-e (a partir de um agendamento ou avulsa) e envia automaticamente no WhatsApp se configurado.
 */
export async function executeEmitNfse(params: {
  tenantId: string;
  appointmentId?: string | null;
  tomadorNome?: string;
  tomadorDocumento?: string | null;
  tomadorEmail?: string | null;
  tomadorTelefone?: string | null;
  discriminacao?: string;
  valorBrutoCents?: number;
  valorServicosCents?: number;
  valorDeducaoParceiroCents?: number;
  aplicarSalaoParceiro?: boolean;
  profissionalParceiroNome?: string | null;
  sendWhatsApp?: boolean;
  sendWhatsapp?: boolean;
}) {
  const { tenantId } = params;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  let config = await prisma.fiscalConfig.findUnique({ where: { tenantId } });
  if (!config) {
    config = await prisma.fiscalConfig.create({
      data: {
        tenantId,
        nomeFantasia: tenant.name,
        razaoSocial: tenant.name,
      },
    });
  }

  let tomadorNome = params.tomadorNome || 'Consumidor Final';
  let tomadorDocumento = params.tomadorDocumento || null;
  let tomadorEmail = params.tomadorEmail || null;
  let tomadorTelefone = params.tomadorTelefone || null;
  let discriminacao = params.discriminacao || 'Prestação de serviços de barbearia e cuidados pessoais.';
  let valorBrutoCents = params.valorBrutoCents ?? params.valorServicosCents ?? 0;
  let valorDeducaoParceiroCents = params.valorDeducaoParceiroCents || 0;
  let profissionalParceiroNome = params.profissionalParceiroNome || null;
  let customerId: string | null = null;

  if (params.appointmentId) {
    const existingInvoice = await prisma.nfseInvoice.findUnique({
      where: { appointmentId: params.appointmentId },
    });
    if (existingInvoice && existingInvoice.status === 'AUTHORIZED') {
      throw HttpError.badRequest('Já existe uma Nota Fiscal autorizada para este agendamento.');
    }
    if (existingInvoice) {
      await prisma.nfseInvoice.delete({ where: { id: existingInvoice.id } });
    }

    const app = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, tenantId },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });
    if (!app) throw HttpError.notFound('Agendamento não encontrado.');

    customerId = app.customerId;
    tomadorNome = params.tomadorNome || app.customer.name;
    tomadorEmail = params.tomadorEmail ?? app.customer.email ?? null;
    tomadorTelefone = params.tomadorTelefone ?? app.customer.phone ?? null;
    valorBrutoCents = params.valorBrutoCents ?? params.valorServicosCents ?? app.priceCents;

    const dataFormatada = DateTime.fromJSDate(app.startAt)
      .setZone(tenant.timezone || 'America/Sao_Paulo')
      .toFormat('dd/LL/yyyy HH:mm');

    discriminacao =
      params.discriminacao ||
      `Prestação de serviço de ${app.service.name} realizado em ${dataFormatada} pelo profissional ${app.professional.name}.`;

    const shouldApplySalaoParceiro = params.aplicarSalaoParceiro ?? config.salaoParceiroEnabled;
    if (
      params.valorDeducaoParceiroCents === undefined &&
      shouldApplySalaoParceiro &&
      app.professional.commissionPercent > 0
    ) {
      valorDeducaoParceiroCents = Math.round((valorBrutoCents * app.professional.commissionPercent) / 100);
      profissionalParceiroNome = app.professional.name;
    }
  }

  if (valorBrutoCents <= 0) {
    throw HttpError.badRequest('O valor do serviço deve ser maior que zero.');
  }

  if (valorDeducaoParceiroCents >= valorBrutoCents) {
    valorDeducaoParceiroCents = 0;
  }

  const baseCalculoCents = Math.max(0, valorBrutoCents - valorDeducaoParceiroCents);
  const aliquotaEfetiva = config.regimeTributario === 'MEI' ? 0 : config.aliquotaIss || 0;
  const valorIssCents = Math.round((baseCalculoCents * aliquotaEfetiva) / 100);
  const valorLiquidoCents = config.retencaoIss ? Math.max(0, valorBrutoCents - valorIssCents) : valorBrutoCents;

  const numeroDps = config.proximoNumeroDps || 1;
  const serieDps = config.serieDps || '1';

  const transmission = await transmitNfse({
    config,
    tenant,
    numeroDps,
    serieDps,
    tomadorNome,
    tomadorDocumento,
    tomadorEmail,
    tomadorTelefone,
    discriminacao,
    valorBrutoCents,
    valorDeducaoParceiroCents,
    aliquotaIss: aliquotaEfetiva,
    profissionalParceiroNome,
  });

  const created = await prisma.nfseInvoice.create({
    data: {
      tenantId,
      appointmentId: params.appointmentId || null,
      customerId,
      status: transmission.status,
      environment: config.environment,
      numeroDps,
      serieDps,
      numeroNfse: transmission.numeroNfse || null,
      chaveAcesso: transmission.chaveAcesso || null,
      codigoVerificacao: transmission.codigoVerificacao || null,
      tomadorNome,
      tomadorDocumento: tomadorDocumento ? tomadorDocumento.replace(/\D/g, '') : null,
      tomadorEmail,
      tomadorTelefone,
      discriminacao,
      valorBrutoCents,
      valorDeducaoParceiroCents,
      baseCalculoCents,
      aliquotaIss: aliquotaEfetiva,
      valorIssCents,
      valorLiquidoCents,
      profissionalParceiroNome,
      xmlDps: transmission.xmlDps,
      xmlNfse: transmission.xmlNfse || null,
      errorMessage: transmission.errorMessage || null,
    },
  });

  const urlDanfse = buildPublicDanfseUrl(tenant, created.id, created.codigoVerificacao);

  const invoice = await prisma.nfseInvoice.update({
    where: { id: created.id },
    data: { urlDanfse },
  });

  if (transmission.status === 'AUTHORIZED') {
    await prisma.fiscalConfig.update({
      where: { id: config.id },
      data: { proximoNumeroDps: numeroDps + 1 },
    });
  }

  // Envio automático via WhatsApp se autorizado e cliente tiver telefone
  const shouldSendWhatsApp = params.sendWhatsApp ?? params.sendWhatsapp ?? config.autoSendWhatsApp;
  if (transmission.status === 'AUTHORIZED' && shouldSendWhatsApp && tomadorTelefone) {
    try {
      const msg =
        `🧾 *Nota Fiscal de Serviços Eletrônica (NFS-e)*\n\n` +
        `Olá, *${tomadorNome}*! Agradecemos a preferência na *${tenant.name}*.\n\n` +
        `📄 *NFS-e Nº:* ${invoice.numeroNfse || invoice.numeroDps}\n` +
        `💰 *Valor:* ${formatBRL(invoice.valorBrutoCents)}\n` +
        `🔐 *Código de Verificação:* ${invoice.codigoVerificacao}\n\n` +
        `🔗 *Visualize ou baixe o PDF (DANFSE) no link abaixo:*\n${urlDanfse}`;

      const sent = await whatsAppService.sendMessage(tenantId, tomadorTelefone, msg);
      if (sent) {
        await prisma.nfseInvoice.update({
          where: { id: invoice.id },
          data: { whatsappSentAt: new Date() },
        });
        invoice.whatsappSentAt = new Date();
      }
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, 'Aviso: não foi possível enviar a NFS-e pelo WhatsApp');
    }
  }

  return invoice;
}

/**
 * Chamado automaticamente ao concluir um agendamento na Agenda se `autoEmitOnComplete` estiver ativo.
 */
export async function autoEmitNfseForCompletedAppointment(tenantId: string, appointmentId: string): Promise<void> {
  try {
    const tenant = await loadTenant(tenantId);
    const limits = effectiveLimits(tenant.subscription);
    if (!limits.permissions.nfse) return;

    const config = await prisma.fiscalConfig.findUnique({ where: { tenantId } });
    if (!config || !config.enabled || !config.autoEmitOnComplete) return;

    await executeEmitNfse({
      tenantId,
      appointmentId,
    });
    logger.info({ tenantId, appointmentId }, 'NFS-e emitida automaticamente ao concluir agendamento');
  } catch (err) {
    logger.warn({ err, tenantId, appointmentId }, 'Falha na emissão automática de NFS-e ao concluir agendamento');
  }
}

// 1. Visão Geral + Configuração + Métricas Fiscais do Mês
nfseRouter.get('/overview', async (req, res) => {
  const tenantId = req.tenantId!;
  const tenant = await loadTenant(tenantId);
  const limits = effectiveLimits(tenant.subscription);
  const nfseAddonCfg = await getAddonByKey('nfse');

  let config = await prisma.fiscalConfig.findUnique({ where: { tenantId } });
  if (!config) {
    config = await prisma.fiscalConfig.create({
      data: {
        tenantId,
        nomeFantasia: tenant.name,
        razaoSocial: tenant.name,
      },
    });
  }

  const monthStart = DateTime.now().setZone(tenant.timezone).startOf('month').toJSDate();

  const [monthInvoices, pendingAppointmentsCount] = await Promise.all([
    prisma.nfseInvoice.findMany({
      where: {
        tenantId,
        issuedAt: { gte: monthStart },
        status: 'AUTHORIZED',
      },
      select: {
        valorBrutoCents: true,
        valorDeducaoParceiroCents: true,
        valorIssCents: true,
      },
    }),
    prisma.appointment.count({
      where: {
        tenantId,
        status: 'COMPLETED',
        nfseInvoice: { is: null },
      },
    }),
  ]);

  const totalIssuedCents = monthInvoices.reduce((acc, i) => acc + i.valorBrutoCents, 0);
  const salaoParceiroSavingsCents = monthInvoices.reduce((acc, i) => acc + i.valorDeducaoParceiroCents, 0);
  const totalIssCents = monthInvoices.reduce((acc, i) => acc + i.valorIssCents, 0);

  const { certPfxData, certPassword, externalApiToken, ...safeConfig } = config;

  const statsPayload = {
    monthAuthorizedCount: monthInvoices.length,
    monthTotalIssuedCents: totalIssuedCents,
    monthTotalValueCents: totalIssuedCents,
    monthSalaoParceiroDeducaoCents: salaoParceiroSavingsCents,
    monthTotalDeducoesCents: salaoParceiroSavingsCents,
    monthTotalIssCents: totalIssCents,
    pendingAppointmentsCount,
  };

  res.json({
    hasFeatureAccess: limits.permissions.nfse,
    nfseAddonActive: Boolean((tenant.subscription as any)?.nfseAddonActive),
    nfseAddonExpiresAt: (tenant.subscription as any)?.nfseAddonExpiresAt || null,
    addonPriceCents: nfseAddonCfg.priceCents,
    isAddon: nfseAddonCfg.isAddon,
    config: {
      ...safeConfig,
      autoSendWhatsapp: safeConfig.autoSendWhatsApp,
      hasCertificate: Boolean(certPfxData && certPfxData.length > 0),
      hasExternalToken: Boolean(externalApiToken),
    },
    metrics: statsPayload,
    stats: statsPayload,
  });
});

// 2. Salvar Configuração Fiscal do Salão
nfseRouter.put('/config', async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  const parsed = fiscalConfigSchema.parse(req.body);
  const { autoSendWhatsapp, externalWebhookUrl, ...data } = parsed;
  const effectiveAutoSendWhatsApp = data.autoSendWhatsApp ?? autoSendWhatsapp ?? true;
  const effectiveExternalApiUrl = data.externalApiUrl ?? externalWebhookUrl ?? null;
  const cleanCnpj = data.cnpj ? data.cnpj.replace(/\D/g, '') : null;

  const existing = await prisma.fiscalConfig.findUnique({ where: { tenantId } });

  const updated = await prisma.fiscalConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      ...data,
      autoSendWhatsApp: effectiveAutoSendWhatsApp,
      externalApiUrl: effectiveExternalApiUrl,
      cnpj: cleanCnpj,
      optanteSimples: data.regimeTributario === 'MEI' ? 2 : data.regimeTributario === 'SIMPLES_NACIONAL' ? 3 : 1,
    },
    update: {
      ...data,
      autoSendWhatsApp: effectiveAutoSendWhatsApp,
      externalApiUrl: effectiveExternalApiUrl,
      cnpj: cleanCnpj,
      optanteSimples: data.regimeTributario === 'MEI' ? 2 : data.regimeTributario === 'SIMPLES_NACIONAL' ? 3 : 1,
      externalApiToken:
        data.externalApiToken && data.externalApiToken.trim() !== ''
          ? data.externalApiToken.trim()
          : existing?.externalApiToken,
    },
  });

  const { certPfxData, certPassword, externalApiToken, ...safeConfig } = updated;

  res.json({
    success: true,
    message: 'Configurações fiscais de NFS-e salvas com sucesso!',
    config: {
      ...safeConfig,
      autoSendWhatsapp: safeConfig.autoSendWhatsApp,
      hasCertificate: Boolean(certPfxData && certPfxData.length > 0),
      hasExternalToken: Boolean(externalApiToken),
    },
  });
});

// 3. Upload e Validação do Certificado Digital e-CNPJ A1 (.pfx)
nfseRouter.post('/certificate', uploadPfx.single('certificate'), async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  const file = req.file;
  const password = String(req.body?.password || '').trim();

  if (!file || !file.buffer) {
    throw HttpError.badRequest('Selecione o arquivo do Certificado Digital A1 (.pfx ou .p12).');
  }
  if (!password) {
    throw HttpError.badRequest('Informe a senha do Certificado Digital (.pfx).');
  }

  const inspection = inspectPfxCertificate(file.buffer, password);
  if (!inspection.valid) {
    throw HttpError.badRequest(inspection.error || 'Certificado Digital inválido ou senha incorreta.');
  }

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const updated = await prisma.fiscalConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      razaoSocial: tenant.name,
      nomeFantasia: tenant.name,
      certPfxData: new Uint8Array(file.buffer),
      certPassword: password,
      certSubject: inspection.subject || tenant.name,
      certIssuer: inspection.issuer || 'ICP-Brasil',
      certValidTo: inspection.validTo || null,
      certUploadedAt: new Date(),
    },
    update: {
      certPfxData: new Uint8Array(file.buffer),
      certPassword: password,
      certSubject: inspection.subject || tenant.name,
      certIssuer: inspection.issuer || 'ICP-Brasil',
      certValidTo: inspection.validTo || null,
      certUploadedAt: new Date(),
    },
  });

  await systemLog({
    tenantId,
    source: 'nfse',
    message: `Certificado Digital A1 (.pfx) validado e vinculado com sucesso (${updated.certSubject})`,
  });

  res.json({
    success: true,
    message: 'Certificado Digital A1 (.pfx) validado e armazenado com sucesso!',
    certificate: {
      hasCertificate: true,
      certSubject: updated.certSubject,
      certIssuer: updated.certIssuer,
      certValidTo: updated.certValidTo,
      certUploadedAt: updated.certUploadedAt,
    },
  });
});

// 4. Remover Certificado Digital A1
nfseRouter.delete('/certificate', async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  await prisma.fiscalConfig.updateMany({
    where: { tenantId },
    data: {
      certPfxData: null,
      certPassword: null,
      certSubject: null,
      certIssuer: null,
      certValidTo: null,
      certUploadedAt: null,
    },
  });

  res.json({
    success: true,
    message: 'Certificado Digital A1 removido com sucesso.',
  });
});

// 5. Listar Notas Fiscais Emitidas
nfseRouter.get('/invoices', async (req, res) => {
  const tenantId = req.tenantId!;
  const rawStatus = typeof req.query.status === 'string' && req.query.status !== 'ALL' ? req.query.status : undefined;
  const status = rawStatus === 'CANCELLED' ? 'CANCELED' : rawStatus === 'ERROR' ? 'REJECTED' : rawStatus;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const rawInvoices = await prisma.nfseInvoice.findMany({
    where: {
      tenantId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { tomadorNome: { contains: search, mode: 'insensitive' } },
              { tomadorDocumento: { contains: search } },
              { numeroNfse: { contains: search } },
              { chaveAcesso: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      appointmentId: true,
      status: true,
      environment: true,
      numeroDps: true,
      serieDps: true,
      numeroNfse: true,
      chaveAcesso: true,
      codigoVerificacao: true,
      tomadorNome: true,
      tomadorDocumento: true,
      tomadorEmail: true,
      tomadorTelefone: true,
      discriminacao: true,
      valorBrutoCents: true,
      valorDeducaoParceiroCents: true,
      baseCalculoCents: true,
      aliquotaIss: true,
      valorIssCents: true,
      valorLiquidoCents: true,
      profissionalParceiroNome: true,
      urlDanfse: true,
      errorMessage: true,
      whatsappSentAt: true,
      issuedAt: true,
      canceledAt: true,
      cancelReason: true,
    },
  });

  const invoices = rawInvoices.map((inv) => ({
    ...inv,
    valorServicosCents: inv.valorBrutoCents,
    valorDeducoesCents: inv.valorDeducaoParceiroCents,
    salaoParceiroAplicado: inv.valorDeducaoParceiroCents > 0,
    profissionalNome: inv.profissionalParceiroNome,
    cotaParteProfissionalCents: inv.valorDeducaoParceiroCents,
    danfseUrl: inv.urlDanfse,
    emittedAt: inv.issuedAt,
    createdAt: inv.issuedAt,
    cancelledAt: inv.canceledAt,
  }));

  res.json({ invoices });
});

// 6. Listar Atendimentos Concluídos Pendentes de Emissão de NFS-e
nfseRouter.get('/pending-appointments', async (req, res) => {
  const tenantId = req.tenantId!;

  const rawAppointments = await prisma.appointment.findMany({
    where: {
      tenantId,
      status: 'COMPLETED',
      nfseInvoice: { is: null },
    },
    orderBy: { startAt: 'desc' },
    take: 60,
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      service: { select: { id: true, name: true, priceCents: true } },
      professional: { select: { id: true, name: true, commissionPercent: true, color: true } },
    },
  });

  const appointments = rawAppointments.map((app) => ({
    ...app,
    customer: {
      ...app.customer,
      cpf: null,
    },
    professional: {
      ...app.professional,
      commissionPct: app.professional.commissionPercent,
    },
  }));

  res.json({ appointments });
});

// 7. Emitir Nova Nota Fiscal (Individual ou por Agendamento)
nfseRouter.post('/emit', async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  const data = emitNfseSchema.parse(req.body);
  const invoice = await executeEmitNfse({
    tenantId,
    ...data,
  });

  if (invoice.status === 'REJECTED') {
    throw HttpError.badRequest(invoice.errorMessage || 'A nota fiscal foi rejeitada pela Sefin Nacional.');
  }

  res.json({
    success: true,
    message:
      invoice.environment === 'PRODUCTION'
        ? `NFS-e Nº ${invoice.numeroNfse} emitida e autorizada com sucesso na Sefin Nacional!`
        : `NFS-e Nº ${invoice.numeroNfse} gerada com sucesso em ambiente de Homologação!`,
    invoice,
  });
});

// 8. Reenviar / Enviar DANFSE no WhatsApp do Cliente
nfseRouter.post('/invoices/:id/whatsapp', async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  const { id } = req.params;
  const phoneOverride = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

  const invoice = await prisma.nfseInvoice.findFirst({
    where: { id, tenantId },
  });
  if (!invoice) throw HttpError.notFound('Nota Fiscal não encontrada.');

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const targetPhone = phoneOverride || invoice.tomadorTelefone || '';

  const danfseUrl = invoice.urlDanfse || buildPublicDanfseUrl(tenant, invoice.id, invoice.codigoVerificacao);

  const msg =
    `🧾 *Nota Fiscal de Serviços Eletrônica (NFS-e)*\n\n` +
    `Olá, *${invoice.tomadorNome}*! Segue a sua Nota Fiscal referente ao atendimento na *${tenant.name}*:\n\n` +
    `📄 *NFS-e Nº:* ${invoice.numeroNfse || invoice.numeroDps}\n` +
    `💰 *Valor:* ${formatBRL(invoice.valorBrutoCents)}\n` +
    `🔐 *Código de Verificação:* ${invoice.codigoVerificacao || 'N/A'}\n\n` +
    `🔗 *Visualize ou imprima o PDF (DANFSE) clicando abaixo:*\n${danfseUrl}`;

  let sentViaBot = false;
  if (targetPhone) {
    try {
      sentViaBot = await whatsAppService.sendMessage(tenantId, targetPhone, msg);
    } catch {
      sentViaBot = false;
    }
  }

  const cleanPhone = (targetPhone || '').replace(/\D/g, '');
  const whatsappUrl = cleanPhone
    ? `https://wa.me/55${cleanPhone.replace(/^55/, '')}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;

  if (sentViaBot) {
    await prisma.nfseInvoice.update({
      where: { id: invoice.id },
      data: {
        whatsappSentAt: new Date(),
        ...(targetPhone ? { tomadorTelefone: targetPhone } : {}),
      },
    });
  }

  res.json({
    success: true,
    sentViaBot,
    whatsappUrl,
    message: sentViaBot
      ? `Nota Fiscal enviada automaticamente para o WhatsApp (${targetPhone})!`
      : 'Link para envio da DANFSE via WhatsApp gerado com sucesso!',
  });
});

// 9. Cancelar Nota Fiscal Emitida
nfseRouter.post('/invoices/:id/cancel', async (req, res) => {
  const tenantId = req.tenantId!;
  await assertPlanFeature(tenantId, 'nfse', 'Emissor de Notas Fiscais (NFS-e)');

  const { id } = req.params;
  const reason = String(req.body?.reason || req.body?.motivo || 'Cancelamento solicitado pelo prestador (erro de preenchimento)').trim();

  const invoice = await prisma.nfseInvoice.findFirst({
    where: { id, tenantId },
  });
  if (!invoice) throw HttpError.notFound('Nota Fiscal não encontrada.');

  if (invoice.status === 'CANCELED') {
    throw HttpError.badRequest('Esta Nota Fiscal já está cancelada.');
  }

  const updated = await prisma.nfseInvoice.update({
    where: { id: invoice.id },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      cancelReason: reason,
    },
  });

  res.json({
    success: true,
    message: 'Nota Fiscal cancelada com sucesso!',
    invoice: updated,
  });
});

// 10. Download do XML da NFS-e / DPS
nfseRouter.get('/invoices/:id/xml', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const invoice = await prisma.nfseInvoice.findFirst({
    where: { id, tenantId },
  });
  if (!invoice) throw HttpError.notFound('Nota Fiscal não encontrada.');

  const xmlContent = invoice.xmlNfse || invoice.xmlDps || '';
  const filename = `NFSe_${invoice.numeroNfse || invoice.numeroDps}.xml`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xmlContent);
});
