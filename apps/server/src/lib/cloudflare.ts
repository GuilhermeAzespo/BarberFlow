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
  tunnelSynced?: boolean;
  tunnelWarning?: string;
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
 * Sincroniza automaticamente os domínios próprios (Custom Hostnames) nas regras de Ingress
 * do Cloudflare Zero Trust Tunnel (cloudflared) que atende o Fallback Origin (ex: barberflow.azespo.com.br).
 *
 * Por que isso é essencial:
 * Quando o servidor roda atrás de um Cloudflare Tunnel com IP dinâmico, o tráfego de um Custom Hostname
 * (ex: barba.lgtelecom.com.br) chega ao cloudflared com Host: barba.lgtelecom.com.br.
 * Se o domínio não estiver listado nas regras de ingress do túnel, o cloudflared cai na regra catch-all
 * "http_status:404". Além disso, ao configurar `httpHostHeader: fallbackOrigin`, o Traefik do Easypanel
 * aceita a requisição imediatamente sem precisar cadastrar o domínio do cliente manualmente no Easypanel!
 */
export async function syncDomainInCloudflareTunnel(params: {
  apiToken: string;
  zoneId: string;
  fallbackOrigin: string;
  addDomains?: string[];
  removeDomains?: string[];
}): Promise<{
  synced: boolean;
  tunnelName?: string;
  warning?: string;
}> {
  const { apiToken, zoneId, fallbackOrigin, addDomains = [], removeDomains = [] } = params;
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Descobre o Account ID a partir da Zona
    const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      method: 'GET',
      headers,
    });
    const zoneData = (await zoneRes.json()) as any;
    const accountId: string | undefined = zoneData?.result?.account?.id;

    if (!accountId) {
      return {
        synced: false,
        warning: 'Não foi possível identificar o Account ID da zona na Cloudflare.',
      };
    }

    // 2. Lista os túneis ativos na conta Cloudflare Zero Trust
    const tunnelsRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel?is_deleted=false`,
      { method: 'GET', headers }
    );
    const tunnelsData = (await tunnelsRes.json()) as any;

    if (!tunnelsRes.ok || !tunnelsData?.success) {
      const code = tunnelsRes.status;
      if (code === 403 || code === 401) {
        return {
          synced: false,
          warning:
            'Para rotear domínios automaticamente no Cloudflare Tunnel (sem erro 404), adicione a permissão "Conta (Account) → Cloudflare Tunnel → Editar" ao seu API Token na Cloudflare.',
        };
      }
      return {
        synced: false,
        warning: tunnelsData?.errors?.[0]?.message || 'Não foi possível listar os Cloudflare Tunnels da conta.',
      };
    }

    const tunnels: any[] = tunnelsData.result || [];
    if (tunnels.length === 0) {
      // Conta não utiliza Cloudflare Tunnel (usa apontamento DNS direto)
      return { synced: true };
    }

    const cleanFallback = fallbackOrigin.trim().toLowerCase();

    // 3. Procura qual túnel possui a regra de ingress para o Fallback Origin (ex: barberflow.azespo.com.br)
    for (const tunnel of tunnels) {
      const cfgRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnel.id}/configurations`,
        { method: 'GET', headers }
      );
      const cfgData = (await cfgRes.json()) as any;
      if (!cfgRes.ok || !cfgData?.success) continue;

      const currentConfig = cfgData?.result?.config || {};
      const ingress: any[] = Array.isArray(currentConfig.ingress) ? [...currentConfig.ingress] : [];

      const mainRule = ingress.find(
        (r) => typeof r?.hostname === 'string' && r.hostname.trim().toLowerCase() === cleanFallback
      );

      if (!mainRule) continue;

      // Encontramos o túnel que serve o BarberFlow!
      const toRemove = new Set(removeDomains.map((d) => d.trim().toLowerCase()).filter(Boolean));
      const toAdd = Array.from(
        new Set(
          addDomains
            .map((d) => d.trim().toLowerCase())
            .filter((d) => d && d !== cleanFallback && !toRemove.has(d))
        )
      );

      // Separa as regras com hostname da regra catch-all final (sem hostname)
      const catchAllRule =
        ingress.length > 0 && !ingress[ingress.length - 1]?.hostname
          ? ingress[ingress.length - 1]
          : { service: 'http_status:404' };

      const hostnameRules = ingress.filter(
        (r) => typeof r?.hostname === 'string' && !toRemove.has(r.hostname.trim().toLowerCase())
      );

      let modified = hostnameRules.length !== ingress.filter((r) => typeof r?.hostname === 'string').length;

      const baseOriginRequest = {
        ...(mainRule.originRequest || {}),
        httpHostHeader: fallbackOrigin.trim(),
        ...(typeof mainRule.service === 'string' && mainRule.service.startsWith('https://')
          ? { originServerName: mainRule.originRequest?.originServerName || fallbackOrigin.trim() }
          : {}),
      };

      for (const domain of toAdd) {
        const existingIdx = hostnameRules.findIndex(
          (r) => r.hostname.trim().toLowerCase() === domain
        );

        const desiredRule = {
          hostname: domain,
          service: mainRule.service,
          originRequest: baseOriginRequest,
        };

        if (existingIdx === -1) {
          hostnameRules.push(desiredRule);
          modified = true;
        } else {
          const cur = hostnameRules[existingIdx];
          if (
            cur.service !== desiredRule.service ||
            cur.originRequest?.httpHostHeader !== desiredRule.originRequest.httpHostHeader
          ) {
            hostnameRules[existingIdx] = desiredRule;
            modified = true;
          }
        }
      }

      if (modified) {
        const updatedIngress = [...hostnameRules, catchAllRule];
        const putRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnel.id}/configurations`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              config: {
                ...currentConfig,
                ingress: updatedIngress,
              },
            }),
          }
        );
        const putData = (await putRes.json()) as any;
        if (!putRes.ok || !putData?.success) {
          const errMsg = putData?.errors?.[0]?.message || 'Falha ao atualizar configuração do Cloudflare Tunnel.';
          return {
            synced: false,
            tunnelName: tunnel.name,
            warning: `Não foi possível atualizar o Cloudflare Tunnel "${tunnel.name}": ${errMsg}. Verifique se o API Token possui a permissão "Conta → Cloudflare Tunnel → Editar".`,
          };
        }
      }

      return {
        synced: true,
        tunnelName: tunnel.name,
      };
    }

    return {
      synced: true,
    };
  } catch (err: any) {
    logger.warn({ err }, 'Aviso ao sincronizar domínio no Cloudflare Tunnel');
    return {
      synced: false,
      warning: `Aviso ao sincronizar Cloudflare Tunnel: ${err?.message || 'Erro desconhecido'}`,
    };
  }
}

/**
 * Testa a conexão com a API da Cloudflare, configura o Fallback Origin do Cloudflare for SaaS
 * e verifica o acesso ao Cloudflare Tunnel para roteamento automático.
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
  tunnelSynced?: boolean;
  tunnelWarning?: string;
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

    // 2. Configura/verifica o Fallback Origin para Custom Hostnames (Cloudflare for SaaS)
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

    // 3. Sincroniza os domínios próprios ativos no Cloudflare Tunnel
    const activeTenants = await prisma.tenant.findMany({
      where: { customDomain: { not: null } },
      select: { customDomain: true },
    });
    const allCustomDomains = activeTenants
      .map((t) => t.customDomain)
      .filter((d): d is string => Boolean(d));

    const tunnelCheck = await syncDomainInCloudflareTunnel({
      apiToken,
      zoneId,
      fallbackOrigin,
      addDomains: allCustomDomains,
    });

    const tunnelInfo = tunnelCheck.synced
      ? tunnelCheck.tunnelName
        ? ` | Túnel "${tunnelCheck.tunnelName}" sincronizado!`
        : ''
      : ` | ⚠️ ${tunnelCheck.warning}`;

    return {
      success: true,
      zoneName,
      fallbackStatus,
      tunnelSynced: tunnelCheck.synced,
      tunnelWarning: tunnelCheck.warning,
      message: `Conectado à zona "${zoneName}"! (Fallback Origin: ${fallbackOrigin} [${fallbackStatus}])${tunnelInfo}`,
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
 * para emissão automática do Certificado SSL (DV HTTP) na borda da Cloudflare
 * e adiciona a rota no Cloudflare Tunnel para evitar erro 404.
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
    // 0. Garante que o domínio também está registrado nas regras de Ingress do Cloudflare Tunnel
    const tunnelSync = await syncDomainInCloudflareTunnel({
      apiToken: config.apiToken,
      zoneId: config.zoneId,
      fallbackOrigin: config.fallbackOrigin,
      addDomains: [cleanDomain],
    });

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

      const baseMsg =
        sslStatus === 'active'
          ? 'Certificado SSL ativo e validado na Cloudflare!'
          : `Certificado SSL em emissão na Cloudflare (Status: ${sslStatus}). Aguarde de 1 a 3 minutos.`;

      return {
        configured: true,
        success: true,
        hostnameStatus,
        sslStatus,
        tunnelSynced: tunnelSync.synced,
        tunnelWarning: tunnelSync.warning,
        verificationErrors,
        message: tunnelSync.warning ? `${baseMsg} (${tunnelSync.warning})` : baseMsg,
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

    const baseMsg =
      sslStatus === 'active'
        ? 'Domínio e Certificado SSL ativados na Cloudflare!'
        : 'Domínio registrado na Cloudflare! O Certificado SSL gratuito está sendo gerado (leva cerca de 1 a 2 minutos após o apontamento CNAME).';

    return {
      configured: true,
      success: true,
      hostnameStatus,
      sslStatus,
      tunnelSynced: tunnelSync.synced,
      tunnelWarning: tunnelSync.warning,
      message: tunnelSync.warning ? `${baseMsg} (${tunnelSync.warning})` : baseMsg,
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
 * Remove um Custom Hostname da Cloudflare e do Cloudflare Tunnel quando o salão desvincula o domínio próprio.
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
    await syncDomainInCloudflareTunnel({
      apiToken: config.apiToken,
      zoneId: config.zoneId,
      fallbackOrigin: config.fallbackOrigin,
      removeDomains: [cleanDomain],
    }).catch(() => {});

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
