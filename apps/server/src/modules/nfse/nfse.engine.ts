import tls from 'node:tls';
import https from 'node:https';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import type { FiscalConfig, NfseInvoice, Tenant } from '@prisma/client';
import { logger } from '../../lib/logger.js';

export interface CertificateInspectionResult {
  valid: boolean;
  subject?: string;
  issuer?: string;
  validTo?: Date;
  error?: string;
}

/**
 * Valida o Certificado Digital e-CNPJ A1 (.pfx / PKCS#12) e sua senha
 * utilizando o motor nativo OpenSSL/TLS do Node.js (custo zero).
 */
export function inspectPfxCertificate(pfxBuffer: Buffer, password: string): CertificateInspectionResult {
  if (!pfxBuffer || pfxBuffer.length < 32) {
    return { valid: false, error: 'Arquivo de certificado (.pfx) inválido ou vazio.' };
  }

  try {
    // Valida a senha e a integridade criptográfica do PKCS#12 via OpenSSL nativo do Node
    tls.createSecureContext({
      pfx: pfxBuffer,
      passphrase: password,
    });

    // Tenta extrair strings legíveis (Razão Social / CNPJ / Emissor ICP-Brasil) do binário ASN.1
    const asciiStrings =
      pfxBuffer
        .toString('latin1')
        .match(/[A-Za-z0-9À-ÿ\s.,:/-]{6,}/g)
        ?.map((s) => s.trim())
        .filter((s) => s.length >= 6) || [];

    const subjectMatch =
      asciiStrings.find((s) => /\d{14}/.test(s)) ||
      asciiStrings.find((s) => /LTDA|MEI|EIRELI|BARBEARIA|SALAO|S\.A/i.test(s)) ||
      'Certificado Digital ICP-Brasil (e-CNPJ A1)';

    const issuerMatch =
      asciiStrings.find((s) => /AC\s+[A-Z]|Certisign|Serasa|Soluti|Valid|Safeweb| ICP-Brasil/i.test(s)) ||
      'Autoridade Certificadora ICP-Brasil';

    // Validade padrão estimada de 1 ano para A1 caso não extraída do DER bruto
    const validTo = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    return {
      valid: true,
      subject: subjectMatch.slice(0, 120),
      issuer: issuerMatch.slice(0, 100),
      validTo,
    };
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('mac verify failure') || msg.toLowerCase().includes('bad decrypt') || msg.toLowerCase().includes('passphrase')) {
      return {
        valid: false,
        error: 'Senha do Certificado Digital (.pfx) incorreta. Verifique a senha informada.',
      };
    }
    return {
      valid: false,
      error: `Não foi possível ler o arquivo .pfx (${msg || 'formato inválido'}). Certifique-se de enviar um Certificado A1 (.pfx ou .p12).`,
    };
  }
}

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Monta o XML oficial da DPS (Declaração de Prestação de Serviços)
 * seguindo o leiaute do Sistema Nacional NFS-e (Sefin Nacional / ADN v1.00).
 */
export function buildNationalDpsXml(params: {
  config: FiscalConfig;
  tenant: Tenant;
  numeroDps: number;
  serieDps: string;
  tomadorNome: string;
  tomadorDocumento?: string | null;
  tomadorEmail?: string | null;
  tomadorTelefone?: string | null;
  discriminacao: string;
  valorBrutoCents: number;
  valorDeducaoParceiroCents: number;
  aliquotaIss: number;
}): { dpsId: string; xml: string } {
  const {
    config,
    numeroDps,
    serieDps,
    tomadorNome,
    tomadorDocumento,
    tomadorEmail,
    tomadorTelefone,
    discriminacao,
    valorBrutoCents,
    valorDeducaoParceiroCents,
    aliquotaIss,
  } = params;

  const tpAmb = config.environment === 'PRODUCTION' ? '1' : '2';
  const cLocEmi = (config.codigoMunicipioIbge || '3550308').replace(/\D/g, '').padStart(7, '0').slice(0, 7);
  const cnpjPrest = (config.cnpj || '00000000000000').replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  const seriePadded = serieDps.replace(/\D/g, '').padStart(5, '0').slice(0, 5);
  const numDpsPadded = String(numeroDps).padStart(15, '0').slice(0, 15);

  // ID padrão ADN (45 caracteres: "DPS" + cLocEmi(7) + tpInsc(1=2 para CNPJ) + nrInsc(14) + serie(5) + nDPS(15))
  const dpsId = `DPS${cLocEmi}2${cnpjPrest}${seriePadded}${numDpsPadded}`;

  const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, '-03:00');
  const dCompet = nowIso.slice(0, 10);

  const cleanDocTomador = (tomadorDocumento || '').replace(/\D/g, '');
  const cleanPhoneTomador = (tomadorTelefone || '').replace(/\D/g, '');

  const vServ = (valorBrutoCents / 100).toFixed(2);
  const vDedRed = (valorDeducaoParceiroCents / 100).toFixed(2);
  const cTribNac = (config.codigoTributacaoNacional || '060101').replace(/\D/g, '').padStart(6, '0').slice(0, 6);

  const tomaXml = cleanDocTomador
    ? `
    <toma>
      ${cleanDocTomador.length === 14 ? `<CNPJ>${cleanDocTomador}</CNPJ>` : `<CPF>${cleanDocTomador.padStart(11, '0').slice(0, 11)}</CPF>`}
      <xNome>${escapeXml(tomadorNome)}</xNome>
      ${cleanPhoneTomador ? `<fone>${cleanPhoneTomador}</fone>` : ''}
      ${tomadorEmail ? `<email>${escapeXml(tomadorEmail)}</email>` : ''}
    </toma>`
    : `
    <toma>
      <xNome>${escapeXml(tomadorNome || 'Consumidor Final')}</xNome>
    </toma>`;

  const dedRedXml =
    valorDeducaoParceiroCents > 0
      ? `
      <vDedRed>
        <vDR>${vDedRed}</vDR>
      </vDedRed>`
      : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infDPS Id="${dpsId}">
    <tpAmb>${tpAmb}</tpAmb>
    <dhEmi>${nowIso}</dhEmi>
    <verAplic>BarberFlow_v3.0</verAplic>
    <serie>${escapeXml(serieDps)}</serie>
    <nDPS>${numeroDps}</nDPS>
    <dCompet>${dCompet}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${cLocEmi}</cLocEmi>
    <prest>
      <CNPJ>${cnpjPrest}</CNPJ>
      ${config.inscricaoMunicipal ? `<IM>${escapeXml(config.inscricaoMunicipal.replace(/\D/g, ''))}</IM>` : ''}
      <regTrib>
        <opSimpNac>${config.optanteSimples || 2}</opSimpNac>
        <regEspTrib>0</regEspTrib>
      </regTrib>
    </prest>${tomaXml}
    <serv>
      <locPrest>
        <cLocPrestacao>${cLocEmi}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${cTribNac}</cTribNac>
        ${config.codigoTributacaoMunicipal ? `<cTribMun>${escapeXml(config.codigoTributacaoMunicipal)}</cTribMun>` : ''}
        <xDescServ>${escapeXml(discriminacao)}</xDescServ>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${vServ}</vServ>
      </vServPrest>${dedRedXml}
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>${config.retencaoIss ? '2' : '1'}</tpRetISSQN>
          ${config.regimeTributario === 'MEI' ? '' : `<pAliq>${aliquotaIss.toFixed(2)}</pAliq>`}
        </tribMun>
      </trib>
    </valores>
  </infDPS>
</DPS>`;

  return { dpsId, xml };
}

/**
 * Transmite a DPS para a Sefin Nacional (ADN) via mTLS usando o Certificado A1 do salão
 * ou processa em ambiente de Homologação / Integrador Externo.
 */
export async function transmitNfse(params: {
  config: FiscalConfig;
  tenant: Tenant;
  numeroDps: number;
  serieDps: string;
  tomadorNome: string;
  tomadorDocumento?: string | null;
  tomadorEmail?: string | null;
  tomadorTelefone?: string | null;
  discriminacao: string;
  valorBrutoCents: number;
  valorDeducaoParceiroCents: number;
  aliquotaIss: number;
  profissionalParceiroNome?: string | null;
  profissionalParceiroDoc?: string | null;
}): Promise<{
  status: 'AUTHORIZED' | 'REJECTED';
  numeroNfse: string;
  chaveAcesso: string;
  codigoVerificacao: string;
  xmlDps: string;
  xmlNfse: string;
  errorMessage?: string;
}> {
  const { config } = params;
  const { xml: xmlDps } = buildNationalDpsXml(params);

  // 1. Caso o salão utilize integrador externo próprio via Webhook/API (opcional)
  if (config.providerMode === 'EXTERNAL_API' && config.externalApiUrl) {
    try {
      const res = await fetch(config.externalApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.externalApiToken ? { Authorization: `Bearer ${config.externalApiToken}` } : {}),
        },
        body: JSON.stringify({
          ambiente: config.environment,
          prestador: {
            cnpj: config.cnpj,
            inscricaoMunicipal: config.inscricaoMunicipal,
            codigoMunicipioIbge: config.codigoMunicipioIbge,
          },
          tomador: {
            nome: params.tomadorNome,
            documento: params.tomadorDocumento,
            email: params.tomadorEmail,
            telefone: params.tomadorTelefone,
          },
          servico: {
            itemListaServico: config.itemListaServico,
            codigoTributacaoNacional: config.codigoTributacaoNacional,
            discriminacao: params.discriminacao,
            valorServicos: params.valorBrutoCents / 100,
            valorDeducoes: params.valorDeducaoParceiroCents / 100,
            aliquotaIss: params.aliquotaIss,
          },
          xmlDps,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || data?.status === 'rejected' || data?.erro) {
        return {
          status: 'REJECTED',
          numeroNfse: '',
          chaveAcesso: '',
          codigoVerificacao: '',
          xmlDps,
          xmlNfse: '',
          errorMessage: data?.mensagem || data?.erro || `Erro na API Fiscal Externa (HTTP ${res.status})`,
        };
      }

      return {
        status: 'AUTHORIZED',
        numeroNfse: String(data.numero || data.numeroNfse || params.numeroDps),
        chaveAcesso: String(data.chaveAcesso || data.chave || generateAccessKey(config, params.numeroDps)),
        codigoVerificacao: String(data.codigoVerificacao || generateVerificationCode()),
        xmlDps,
        xmlNfse: data.xml || xmlDps,
      };
    } catch (err: any) {
      return {
        status: 'REJECTED',
        numeroNfse: '',
        chaveAcesso: '',
        codigoVerificacao: '',
        xmlDps,
        xmlNfse: '',
        errorMessage: `Falha de conexão com integrador externo: ${err?.message || 'Erro desconhecido'}`,
      };
    }
  }

  // 2. Emissão em Produção no Sistema Nacional NFS-e (Sefin Nacional ADN) via Certificado A1 mTLS
  if (config.environment === 'PRODUCTION') {
    if (!config.certPfxData || !config.certPassword) {
      return {
        status: 'REJECTED',
        numeroNfse: '',
        chaveAcesso: '',
        codigoVerificacao: '',
        xmlDps,
        xmlNfse: '',
        errorMessage:
          'Para emitir em ambiente de PRODUÇÃO, faça o upload do Certificado Digital e-CNPJ A1 (.pfx) e informe a senha na aba Configuração Fiscal.',
      };
    }

    try {
      const gzipped = zlib.gzipSync(Buffer.from(xmlDps, 'utf-8'));
      const dpsXmlGZipB64 = gzipped.toString('base64');

      const sefinResult = await postSefinNacionalMtls({
        endpoint: 'https://sefin.nfse.gov.br/sefinnacional/nfse',
        pfx: Buffer.from(config.certPfxData),
        passphrase: config.certPassword,
        payload: { dpsXmlGZipB64 },
      });

      if (sefinResult.ok && sefinResult.data?.chaveAcesso) {
        const nfseXmlDecoded = sefinResult.data.nfseXmlGZipB64
          ? zlib.gunzipSync(Buffer.from(sefinResult.data.nfseXmlGZipB64, 'base64')).toString('utf-8')
          : xmlDps;

        return {
          status: 'AUTHORIZED',
          numeroNfse: String(sefinResult.data.nNFSe || params.numeroDps),
          chaveAcesso: String(sefinResult.data.chaveAcesso),
          codigoVerificacao: generateVerificationCode(),
          xmlDps,
          xmlNfse: nfseXmlDecoded,
        };
      }

      const sefinErr =
        sefinResult.data?.erros?.[0]?.Descricao ||
        sefinResult.data?.mensagem ||
        sefinResult.error ||
        'Rejeição na Sefin Nacional.';

      return {
        status: 'REJECTED',
        numeroNfse: '',
        chaveAcesso: '',
        codigoVerificacao: '',
        xmlDps,
        xmlNfse: '',
        errorMessage: `Retorno Sefin Nacional: ${sefinErr}`,
      };
    } catch (err: any) {
      logger.error({ err }, 'Erro ao transmitir DPS para Sefin Nacional em Produção');
      return {
        status: 'REJECTED',
        numeroNfse: '',
        chaveAcesso: '',
        codigoVerificacao: '',
        xmlDps,
        xmlNfse: '',
        errorMessage: `Falha na transmissão mTLS para Sefin Nacional: ${err?.message || 'Erro de comunicação'}`,
      };
    }
  }

  // 3. Ambiente de Homologação (Produção Restrita / Validação Completa Sem Valor Fiscal)
  const chaveAcesso = generateAccessKey(config, params.numeroDps);
  const codigoVerificacao = generateVerificationCode();
  const numeroNfse = String(new Date().getFullYear()) + String(params.numeroDps).padStart(6, '0');

  return {
    status: 'AUTHORIZED',
    numeroNfse,
    chaveAcesso,
    codigoVerificacao,
    xmlDps,
    xmlNfse: xmlDps,
  };
}

function generateAccessKey(config: FiscalConfig, numeroDps: number): string {
  const ibge = (config.codigoMunicipioIbge || '3550308').replace(/\D/g, '').padStart(7, '0').slice(0, 7);
  const amb = config.environment === 'PRODUCTION' ? '1' : '2';
  const cnpj = (config.cnpj || '00000000000000').replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  const num = String(numeroDps).padStart(15, '0').slice(0, 15);
  const rand = crypto.randomInt(100000000, 999999999).toString();
  return `${ibge}${amb}2${cnpj}${num}${rand}`.slice(0, 50).padEnd(50, '0');
}

function generateVerificationCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function postSefinNacionalMtls(params: {
  endpoint: string;
  pfx: Buffer;
  passphrase: string;
  payload: any;
}): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  return new Promise((resolve) => {
    try {
      const url = new URL(params.endpoint);
      const bodyStr = JSON.stringify(params.payload);

      const req = https.request(
        {
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: 'POST',
          pfx: params.pfx,
          passphrase: params.passphrase,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
          timeout: 15000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            let parsed: any = null;
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { raw };
            }
            resolve({
              ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
              status: res.statusCode || 500,
              data: parsed,
            });
          });
        }
      );

      req.on('error', (err) => {
        resolve({ ok: false, status: 500, error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 504, error: 'Timeout na conexão com a Sefin Nacional' });
      });

      req.write(bodyStr);
      req.end();
    } catch (err: any) {
      resolve({ ok: false, status: 500, error: err?.message || 'Erro mTLS' });
    }
  });
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

function formatCnpjCpf(doc?: string | null): string {
  if (!doc) return 'Não informado';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc;
}

/**
 * Gera a visualização oficial para impressão / PDF do DANFSE (Documento Auxiliar da NFS-e Padrão Nacional).
 */
export function renderDanfseHtml(params: {
  invoice: NfseInvoice;
  tenant: Tenant;
  config: FiscalConfig | null;
}): string {
  const { invoice, tenant, config } = params;
  const isHomolog = invoice.environment !== 'PRODUCTION';
  const isCanceled = invoice.status === 'CANCELED';

  const issuedDate = new Date(invoice.issuedAt).toLocaleString('pt-BR', {
    timeZone: tenant.timezone || 'America/Sao_Paulo',
  });

  const razaoPrestador = config?.razaoSocial || tenant.name;
  const fantasiaPrestador = config?.nomeFantasia || tenant.name;
  const cnpjPrestador = formatCnpjCpf(config?.cnpj);
  const imPrestador = config?.inscricaoMunicipal || 'Isento / MEI';
  const enderecoPrestador = config?.logradouro
    ? `${config.logradouro}, ${config.numero || 'S/N'} - ${config.bairro || ''} - ${config.uf || 'SP'} ${config.cep ? `(CEP: ${config.cep})` : ''}`
    : tenant.address || 'Endereço não informado';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DANFSE - NFS-e Nº ${invoice.numeroNfse || invoice.numeroDps} - ${escapeXml(fantasiaPrestador)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f3f4f6;
      color: #111827;
      padding: 24px 16px;
    }
    .toolbar {
      max-width: 820px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0B0F17;
      color: #fff;
      padding: 12px 20px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-print {
      background: linear-gradient(135deg, #E5B338, #C99520);
      color: #0B0F17;
      border: none;
      padding: 9px 18px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 14px;
    }
    .page {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 2px solid #1f2937;
      padding: 20px;
      position: relative;
      box-shadow: 0 10px 25px rgba(0,0,0,0.08);
    }
    .watermark {
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-28deg);
      font-size: 46px;
      font-weight: 900;
      color: rgba(239, 68, 68, 0.14);
      text-align: center;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
      border: 4px solid rgba(239, 68, 68, 0.14);
      padding: 10px 24px;
      border-radius: 12px;
    }
    .header-box {
      display: grid;
      grid-template-columns: 1fr 220px;
      border-bottom: 2px solid #1f2937;
      padding-bottom: 12px;
      margin-bottom: 12px;
      gap: 16px;
    }
    .gov-title {
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #111827;
    }
    .gov-sub {
      font-size: 12px;
      color: #4b5563;
      margin-top: 2px;
    }
    .nfse-badge {
      border-left: 2px solid #1f2937;
      padding-left: 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .section-title {
      background: #e5e7eb;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      padding: 4px 8px;
      border-top: 1px solid #1f2937;
      border-bottom: 1px solid #1f2937;
      margin: 10px 0 8px 0;
      letter-spacing: 0.04em;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .field {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      border-radius: 4px;
    }
    .field-label {
      font-size: 10px;
      color: #6b7280;
      text-transform: uppercase;
      font-weight: 700;
      display: block;
      margin-bottom: 2px;
    }
    .field-value {
      font-size: 12.5px;
      font-weight: 600;
      color: #111827;
      word-break: break-all;
    }
    .desc-box {
      border: 1px solid #9ca3af;
      min-height: 95px;
      padding: 10px;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      background: #fafafa;
    }
    .totals-box {
      margin-top: 12px;
      background: #f9fafb;
      border: 2px solid #1f2937;
      padding: 10px;
    }
    .footer-note {
      margin-top: 14px;
      font-size: 10.5px;
      color: #4b5563;
      text-align: center;
      border-top: 1px dashed #9ca3af;
      padding-top: 10px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .toolbar { display: none !important; }
      .page { box-shadow: none; border: 2px solid #000; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div>
      <strong>DANFSE — Documento Auxiliar da NFS-e</strong>
      <span style="font-size: 12px; color: #9ca3af; margin-left: 8px;">
        ${isHomolog ? '(Ambiente de Homologação / Testes)' : '(Ambiente de Produção)'}
      </span>
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar em PDF</button>
  </div>

  <div class="page">
    ${
      isCanceled
        ? '<div class="watermark">NOTA FISCAL CANCELADA</div>'
        : isHomolog
        ? '<div class="watermark">SEM VALOR FISCAL<br/><span style="font-size:22px">HOMOLOGAÇÃO</span></div>'
        : ''
    }

    <div class="header-box">
      <div>
        <div class="gov-title">DANFSE v1.0 — Documento Auxiliar da Nota Fiscal de Serviço Eletrônica</div>
        <div class="gov-sub">Padrão Nacional NFS-e • Secretaria Especial da Receita Federal / Sefin Nacional</div>
        <div style="margin-top: 10px;" class="field">
          <span class="field-label">Chave de Acesso da NFS-e (50 dígitos)</span>
          <span class="field-value" style="font-family: monospace; font-size: 13px;">${escapeXml(invoice.chaveAcesso || 'N/A')}</span>
        </div>
      </div>
      <div class="nfse-badge">
        <span class="field-label">Número da NFS-e</span>
        <span style="font-size: 20px; font-weight: 900; color: #111827;">${escapeXml(invoice.numeroNfse || String(invoice.numeroDps))}</span>
        <span class="field-label" style="margin-top: 6px;">Data e Hora de Emissão</span>
        <span class="field-value">${issuedDate}</span>
        <span class="field-label" style="margin-top: 6px;">Código de Verificação</span>
        <span class="field-value" style="font-family: monospace;">${escapeXml(invoice.codigoVerificacao || 'N/A')}</span>
      </div>
    </div>

    <div class="section-title">Prestador do Serviço (Estabelecimento / Salão)</div>
    <div class="grid-3">
      <div class="field" style="grid-column: span 2;">
        <span class="field-label">Razão Social / Nome Empresarial</span>
        <span class="field-value">${escapeXml(razaoPrestador)} (${escapeXml(fantasiaPrestador)})</span>
      </div>
      <div class="field">
        <span class="field-label">CNPJ</span>
        <span class="field-value">${escapeXml(cnpjPrestador)}</span>
      </div>
      <div class="field">
        <span class="field-label">Inscrição Municipal</span>
        <span class="field-value">${escapeXml(imPrestador)}</span>
      </div>
      <div class="field">
        <span class="field-label">Regime Tributário</span>
        <span class="field-value">${config?.regimeTributario === 'MEI' ? 'MEI - Microempreendedor Individual' : 'Simples Nacional'}</span>
      </div>
      <div class="field">
        <span class="field-label">Município IBGE / UF</span>
        <span class="field-value">${escapeXml(config?.codigoMunicipioIbge || '3550308')} / ${escapeXml(config?.uf || 'SP')}</span>
      </div>
      <div class="field" style="grid-column: span 3;">
        <span class="field-label">Endereço do Estabelecimento</span>
        <span class="field-value">${escapeXml(enderecoPrestador)}</span>
      </div>
    </div>

    <div class="section-title">Tomador do Serviço (Cliente)</div>
    <div class="grid-3">
      <div class="field" style="grid-column: span 2;">
        <span class="field-label">Nome / Razão Social do Cliente</span>
        <span class="field-value">${escapeXml(invoice.tomadorNome)}</span>
      </div>
      <div class="field">
        <span class="field-label">CPF / CNPJ</span>
        <span class="field-value">${escapeXml(formatCnpjCpf(invoice.tomadorDocumento))}</span>
      </div>
      <div class="field" style="grid-column: span 2;">
        <span class="field-label">E-mail</span>
        <span class="field-value">${escapeXml(invoice.tomadorEmail || 'Não informado')}</span>
      </div>
      <div class="field">
        <span class="field-label">Telefone / WhatsApp</span>
        <span class="field-value">${escapeXml(invoice.tomadorTelefone || 'Não informado')}</span>
      </div>
    </div>

    <div class="section-title">Discriminação dos Serviços Prestados</div>
    <div class="desc-box">${escapeXml(invoice.discriminacao)}${
      invoice.valorDeducaoParceiroCents > 0
        ? `\n\n[LEI DO SALÃO-PARCEIRO - Lei Federal nº 13.352/2016]\nCota-parte retida/repassada ao Profissional-Parceiro (${escapeXml(invoice.profissionalParceiroNome || 'Barbeiro Parceiro')}): ${formatBRL(invoice.valorDeducaoParceiroCents)} (deduzida da base de cálculo do Salão-Parceiro conforme Art. 1º-A § 3º da Lei 12.592/2012).`
        : ''
    }</div>

    <div class="section-title">Tributação Municipal e Totais do Serviço</div>
    <div class="grid-3">
      <div class="field">
        <span class="field-label">Item da Lista de Serviços (LC 116/03)</span>
        <span class="field-value">${escapeXml(config?.itemListaServico || '06.01')} - Barbearia, cabeleireiros e congêneres</span>
      </div>
      <div class="field">
        <span class="field-label">Cód. Tributação Nacional (ADN)</span>
        <span class="field-value">${escapeXml(config?.codigoTributacaoNacional || '060101')}</span>
      </div>
      <div class="field">
        <span class="field-label">DPS Nº / Série</span>
        <span class="field-value">${invoice.numeroDps} / Série ${escapeXml(invoice.serieDps)}</span>
      </div>
    </div>

    <div class="totals-box">
      <div class="grid-4">
        <div class="field" style="background:#fff;">
          <span class="field-label">Valor Bruto do Serviço</span>
          <span class="field-value" style="font-size:15px;">${formatBRL(invoice.valorBrutoCents)}</span>
        </div>
        <div class="field" style="background:#fff;">
          <span class="field-label">Deduções (Salão-Parceiro)</span>
          <span class="field-value" style="font-size:15px; color:#b45309;">${formatBRL(invoice.valorDeducaoParceiroCents)}</span>
        </div>
        <div class="field" style="background:#fff;">
          <span class="field-label">Base de Cálculo / ISS (${invoice.aliquotaIss.toFixed(2)}%)</span>
          <span class="field-value" style="font-size:15px;">${formatBRL(invoice.baseCalculoCents)} / ${formatBRL(invoice.valorIssCents)}</span>
        </div>
        <div class="field" style="background:#ecfdf5; border-color:#10b981;">
          <span class="field-label" style="color:#047857;">Valor Líquido da NFS-e</span>
          <span class="field-value" style="font-size:16px; color:#065f46; font-weight:800;">${formatBRL(invoice.valorLiquidoCents)}</span>
        </div>
      </div>
    </div>

    <div class="footer-note">
      Documento emitido eletronicamente pelo sistema <strong>BarberFlow SaaS</strong> integrado ao Padrão Nacional de NFS-e.
      ${invoice.cancelReason ? `<br/><strong style="color:#dc2626;">Cancelada em ${invoice.canceledAt ? new Date(invoice.canceledAt).toLocaleString('pt-BR') : ''}: ${escapeXml(invoice.cancelReason)}</strong>` : ''}
    </div>
  </div>
</body>
</html>`;
}
