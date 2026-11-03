import tls from 'node:tls';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

export interface CloudflareConfig {
  apiToken: string | null;
  zoneId: string | null;
  fallbackOrigin: string;
  enabled: boolean;
  isConfigured: boolean;
}

export interface CustomHostnameProvisionResult {
  configured: boolean;
  success: boolean;
  hostnameStatus?: string; // 'active' | 'pending' | 'moved' | 'deleted'
  sslStatus?: string;      // 'active' | 'pending_validation' | 'pending_issuance' | 'pending_deployment' | 'initializing'
  verificationErrors?: string[];
  message: string;
}

export const DEFAULT_FALLBACK_ORIGIN = process.env.PUBLIC_ROOT_DOMAIN || 'barberflow.azespo.com.br';

export async function getActiveCloudflareConfig(): Promise<CloudflareConfig> {
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });

  const apiToken = setting?.cfApiToken || process.env.CLOUDFLARE_API_TOKEN || null;
  const zoneId = setting?.cfZoneId || process.env.CLOUDFLARE_ZONE_ID || null;
  const fallbackOrigin =
    setting?.cfFallbackOrigin || process.env.CLOUDFLARE_FALLBACK_ORIGIN || DEFAULT_FALLBACK_ORIGIN;
  const isConfigured = Boolean(apiToken && apiToken.trim().length > 10 && zoneId && zoneId.trim().length > 10);
  const enabled = setting?.cfEnabled ?? isConfigured;

  return {
    apiToken: apiToken ? apiToken.trim() : null,
    zoneId: zoneId ? zoneId.trim() : null,
    fallbackOrigin: fallbackOrigin.trim(),
    enabled,
    isConfigured: enabled && isConfigured,
  };
}

/**
 * Testa a conexão com a API da Cloudflare e garante que o Fallback Origin do Cloudflare for SaaS esteja configurado.
 */
export async function testCloudflareConnection(params?: {
  apiToken?: string;
  zoneId?: string;
  fallbackOrigin?: string;
}): Promise<{
  success: boolean;
  message: string;
  zoneName?: string;
  fallbackStatus?: string;
}> {
  const active = await getActiveCloudflareConfig();
  const apiToken = (params?.apiToken || active.apiToken || '').trim();
  const zoneId = (params?.zoneId || active.zoneId || '').trim();
  const fallbackOrigin = (params?.fallbackOrigin || active.fallbackOrigin || DEFAULT_FALLBACK_ORIGIN).trim();

  if (!apiToken || !zoneId) {
    return {
      success: false,
      message: 'Informe o Zone ID e o API Token da Cloudflare para testar a conexão.',
    };
  }

  const headers = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Verifica acesso à Zona
    const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      method: 'GET',
      headers,
    });
    const zoneData = (await zoneRes.json()) as any;

    if (!zoneRes.ok || !zoneData?.success) {
      const errMsg = zoneData?.errors?.[0]?.message || 'Credenciais inválidas ou sem permissão na Zona.';
      return {
        success: false,
        message: `Erro na API Cloudflare: ${errMsg}`,
      };
    }

    const zoneName = zoneData.result?.name || zoneId;

    // 2. Tenta configurar/verificar o Fallback Origin para Custom Hostnames (Cloudflare for SaaS)
    let fallbackStatus = 'Verificado';
    try {
      const fbRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/custom_hostnames/fallback_origin`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ origin: fallbackOrigin }),
        }
      );
      const fbData = (await fbRes.json()) as any;
      if (fbData?.success) {
        fallbackStatus = fbData.result?.status || 'active';
      } else if (fbData?.errors?.[0]?.message) {
        fallbackStatus = `Aviso: ${fbData.errors[0].message}`;
      }
    } catch {
      // Ignora erro secundário de fallback origin
    }

    return {
      success: true,
      zoneName,
      fallbackStatus,
      message: `Conectado com sucesso à zona "${zoneName}" na Cloudflare! (Fallback Origin: ${fallbackOrigin} [${fallbackStatus}])`,
    };
  } catch (err: any) {
    logger.error({ err }, 'Erro ao testar conexão com Cloudflare API');
    return {
      success: false,
      message: `Falha de rede ao conectar na API da Cloudflare: ${err?.message || 'Erro desconhecido'}`,
    };
  }
}

/**
 * Registra ou sincroniza um domínio próprio (Custom Hostname) no Cloudflare for SaaS
 * para emissão automática do Certificado SSL (DV HTTP) na borda da Cloudflare,
 * eliminando o erro ERR_SSL_VERSION_OR_CIPHER_MISMATCH.
 */
export async function provisionCustomHostname(domain: string): Promise<CustomHostnameProvisionResult> {
  const config = await getActiveCloudflareConfig();
  if (!config.isConfigured || !config.apiToken || !config.zoneId) {
    return {
      configured: false,
      success: false,
      message: 'Integração Cloudflare for SaaS ainda não configurada no painel Super Admin.',
    };
  }

  const cleanDomain = domain.trim().toLowerCase();
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Consulta se o Custom Hostname já existe na zona
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames?hostname=${encodeURIComponent(cleanDomain)}`,
      { method: 'GET', headers }
    );
    const listData = (await listRes.json()) as any;

    if (!listRes.ok || !listData?.success) {
      const errMsg = listData?.errors?.[0]?.message || 'Falha ao consultar Custom Hostnames na Cloudflare.';
      logger.warn({ domain: cleanDomain, errors: listData?.errors }, 'Aviso ao consultar Custom Hostname na Cloudflare');
      return {
        configured: true,
        success: false,
        message: `Erro na API Cloudflare: ${errMsg}`,
      };
    }

    const existing = listData.result?.[0];

    if (existing) {
      const sslStatus: string = existing.ssl?.status || 'initializing';
      const hostnameStatus: string = existing.status || 'pending';
      const verificationErrors: string[] = [
        ...(existing.verification_errors || []),
        ...(existing.ssl?.validation_errors?.map((e: any) => e.message) || []),
      ].filter(Boolean);

      // Se o certificado não estiver ativo, dispara um PATCH para revalidar imediatamente na Cloudflare
      if (sslStatus !== 'active') {
        await fetch(
          `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames/${existing.id}`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              ssl: {
                method: 'http',
                type: 'dv',
                settings: {
                  min_tls_version: '1.2',
                  http2: 'on',
                  tls_1_3: 'on',
                },
              },
            }),
          }
        ).catch(() => {});
      }

      return {
        configured: true,
        success: true,
        hostnameStatus,
        sslStatus,
        verificationErrors,
        message:
          sslStatus === 'active'
            ? 'Certificado SSL ativo e validado na Cloudflare!'
            : `Certificado SSL em emissão na Cloudflare (Status: ${sslStatus}). Aguarde de 1 a 3 minutos.`,
      };
    }

    // 2. Garante que o Fallback Origin está registrado antes de criar o Custom Hostname
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames/fallback_origin`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ origin: config.fallbackOrigin }),
      }
    ).catch(() => {});

    // 3. Cria o Custom Hostname com validação HTTP DV automática
    const createRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          hostname: cleanDomain,
          ssl: {
            method: 'http',
            type: 'dv',
            settings: {
              min_tls_version: '1.2',
              http2: 'on',
              tls_1_3: 'on',
            },
          },
        }),
      }
    );

    const createData = (await createRes.json()) as any;
    if (!createRes.ok || !createData?.success) {
      const errMsg = createData?.errors?.[0]?.message || 'Não foi possível criar o Custom Hostname na Cloudflare.';
      logger.warn({ domain: cleanDomain, errors: createData?.errors }, 'Falha ao criar Custom Hostname na Cloudflare');
      return {
        configured: true,
        success: false,
        message: `Erro ao registrar SSL na Cloudflare: ${errMsg}`,
      };
    }

    const created = createData.result;
    const sslStatus: string = created?.ssl?.status || 'pending_validation';
    const hostnameStatus: string = created?.status || 'pending';

    return {
      configured: true,
      success: true,
      hostnameStatus,
      sslStatus,
      message:
        sslStatus === 'active'
          ? 'Domínio e Certificado SSL ativados na Cloudflare!'
          : 'Domínio registrado na Cloudflare! O Certificado SSL gratuito está sendo gerado (leva cerca de 1 a 2 minutos após o apontamento CNAME).',
    };
  } catch (err: any) {
    logger.error({ err, domain: cleanDomain }, 'Erro ao provisionar Custom Hostname na Cloudflare');
    return {
      configured: true,
      success: false,
      message: `Erro de comunicação com a Cloudflare: ${err?.message || 'Erro desconhecido'}`,
    };
  }
}

/**
 * Remove um Custom Hostname da Cloudflare quando o salão desvincula o domínio próprio.
 */
export async function deleteCustomHostname(domain: string): Promise<boolean> {
  const config = await getActiveCloudflareConfig();
  if (!config.isConfigured || !config.apiToken || !config.zoneId) return false;

  const cleanDomain = domain.trim().toLowerCase();
  const headers = {
    Authorization: `Bearer ${config.apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames?hostname=${encodeURIComponent(cleanDomain)}`,
      { method: 'GET', headers }
    );
    const listData = (await listRes.json()) as any;
    const existing = listData?.result?.[0];
    if (!existing?.id) return true;

    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames/${existing.id}`,
      { method: 'DELETE', headers }
    );
    return true;
  } catch (err) {
    logger.warn({ err, domain: cleanDomain }, 'Aviso ao remover Custom Hostname da Cloudflare');
    return false;
  }
}

/**
 * Executa um teste real de handshake TLS/SSL na porta 443 com SNI do domínio
 * para confirmar se o navegador conseguirá abrir https://<domain> sem ERR_SSL_VERSION_OR_CIPHER_MISMATCH.
 */
export function verifyTlsHandshake(domain: string, timeoutMs = 4000): Promise<{
  sslVerified: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { sslVerified: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const socket = tls.connect(
        {
          host: domain,
          port: 443,
          servername: domain,
          rejectUnauthorized: true,
          timeout: timeoutMs,
        },
        () => {
          const authorized = socket.authorized;
          socket.end();
          finish({ sslVerified: authorized });
        }
      );

      socket.on('timeout', () => {
        socket.destroy();
        finish({ sslVerified: false, error: 'TIMEOUT' });
      });

      socket.on('error', (err: any) => {
        socket.destroy();
        finish({
          sslVerified: false,
          error: err?.code || err?.message || 'SSL_HANDSHAKE_FAILED',
        });
      });
    } catch (err: any) {
      finish({ sslVerified: false, error: err?.message || 'SSL_ERROR' });
    }
  });
}
