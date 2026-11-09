import { prisma } from './prisma.js';
import type { PlanPermissions } from './tenant-access.js';

export interface AddonConfigItem {
  key: keyof PlanPermissions;
  name: string;
  shortName: string;
  description: string;
  category: string;
  isAddon: boolean;
  priceCents: number;
}

export const DEFAULT_ADDONS_CATALOG: AddonConfigItem[] = [
  {
    key: 'onlinePayments',
    name: 'Recebimento Online (Mercado Pago API)',
    shortName: 'Recebimento Online',
    description:
      'Integração direta com o Mercado Pago da própria barbearia para cobrar planos mensais do Clube VIP via Cartão de Crédito Recorrente e PIX Instantâneo, com repasse 100% direto para a conta do dono do salão e renovação automática.',
    category: 'Receita Recorrente & Pagamentos',
    isAddon: true,
    priceCents: 990,
  },
  {
    key: 'club',
    name: 'Clube de Assinatura da Barbearia (Planos VIP)',
    shortName: 'Clube VIP de Assinatura',
    description:
      'Criação e venda de planos recorrentes da barbearia (cortes ilimitados, pacotes mensais), abatimento automático de usos na agenda, controle de ciclos e faturamento recorrente garantido.',
    category: 'Receita Recorrente & Fidelização',
    isAddon: true,
    priceCents: 3990,
  },

  {
    key: 'marketing',
    name: 'Recuperação de Clientes Sumidos & Aniversariantes (WhatsApp)',
    shortName: 'Recuperação & Aniversários',
    description:
      'Robôs inteligentes que identificam clientes inativos há mais de 30 dias e aniversariantes do dia, disparando mensagens personalizadas no WhatsApp com filtros anti-ban para aumentar a frequência de retorno.',
    category: 'Fidelização & Marketing',
    isAddon: true,
    priceCents: 2490,
  },

  {
    key: 'nfse',
    name: 'Emissor de Nota Fiscal de Serviços (NFS-e)',
    shortName: 'Emissor NFS-e',
    description:
      'Emissão de NFS-e Padrão Nacional (Sefin Nacional) em 1 clique com Certificado Digital A1 (.pfx), Lei do Salão-Parceiro e envio automático da DANFSE no WhatsApp.',
    category: 'Fiscal & Financeiro',
    isAddon: true,
    priceCents: 2990,
  },
  {
    key: 'loyalty',
    name: 'Cartão Fidelidade Digital Automático',
    shortName: 'Cartão Fidelidade',
    description:
      'Programa de fidelidade digital automático: selos computados na conclusão do agendamento, notificação de selos e prêmios no WhatsApp, resgate na comanda e consulta do cliente na vitrine pública.',
    category: 'Fidelização & Marketing',
    isAddon: true,
    priceCents: 1990,
  },
  {
    key: 'customDomain',
    name: 'Domínio Próprio & DNS Personalizado (SSL)',
    shortName: 'Domínio Próprio',
    description:
      'Conexão do domínio exclusivo da barbearia (ex: agendar.suabarbearia.com.br) com Certificado SSL HTTPS automático via Cloudflare for SaaS.',
    category: 'Vitrine & Marca',
    isAddon: false,
    priceCents: 1990,
  },
  {
    key: 'reports',
    name: 'Central de Relatórios & Inteligência (BI)',
    shortName: 'Relatórios & BI',
    description:
      'Gráficos avançados de produtividade por barbeiro, faturamento por período, retenção de clientes e indicadores de crescimento.',
    category: 'Relatórios & Inteligência',
    isAddon: false,
    priceCents: 1990,
  },
  {
    key: 'satisfactionSurveys',
    name: 'Pesquisas de Satisfação Automatizadas (CSAT / NPS)',
    shortName: 'Pesquisas CSAT/NPS',
    description:
      'Disparo automático de avaliação pós-corte e pós-atendimento no WhatsApp com nota de 1 a 5 e coleta de feedback.',
    category: 'WhatsApp & Atendimento',
    isAddon: false,
    priceCents: 1490,
  },
  {
    key: 'commissions',
    name: 'Divisão e Comissões Automáticas de Barbeiros',
    shortName: 'Comissões',
    description:
      'Cálculo e rateio automático de comissão percentual por serviço e profissional integrado ao fluxo de caixa.',
    category: 'Gestão Financeira',
    isAddon: false,
    priceCents: 1490,
  },
  {
    key: 'multiUserRoles',
    name: 'Perfis de Acesso de Equipe (Recepção, Gerente, Barbeiro)',
    shortName: 'Perfis de Equipe',
    description:
      'Criação de logins individuais com restrição de menu e permissões para recepcionistas, gerentes e barbeiros.',
    category: 'Gestão de Equipe',
    isAddon: false,
    priceCents: 1490,
  },
  {
    key: 'customBotMessages',
    name: 'Personalização de Mensagens do Bot WhatsApp',
    shortName: 'Bot Personalizado',
    description:
      'Edição personalizada dos textos de boas-vindas, confirmação, lembretes anti-falta e cancelamento do assistente virtual.',
    category: 'WhatsApp & Atendimento',
    isAddon: false,
    priceCents: 990,
  },
  {
    key: 'financialExport',
    name: 'Exportação de Dados e Relatórios em CSV',
    shortName: 'Exportação CSV',
    description:
      'Download de planilhas CSV do fluxo de caixa e relatórios analíticos completos para contabilidade.',
    category: 'Gestão Financeira',
    isAddon: false,
    priceCents: 990,
  },
  {
    key: 'prioritySupport',
    name: 'Suporte VIP Prioritário no WhatsApp',
    shortName: 'Suporte VIP',
    description:
      'Canal preferencial de atendimento rápido e consultoria de implantação dedicada via WhatsApp.',
    category: 'Atendimento',
    isAddon: false,
    priceCents: 1990,
  },
];

const ADDONS_SETTING_ID = 'addons_catalog';

export async function getAddonsCatalog(): Promise<AddonConfigItem[]> {
  try {
    const [catalogRow, globalRow, defaultRow] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { id: ADDONS_SETTING_ID } }),
      prisma.systemSetting.findUnique({ where: { id: 'global' } }),
      prisma.systemSetting.findUnique({ where: { id: 'default' } }),
    ]);

    const fallbackNfsePrice =
      globalRow?.nfseAddonPriceCents ?? defaultRow?.nfseAddonPriceCents ?? 2990;

    let savedMap = new Map<string, Partial<AddonConfigItem>>();
    if (catalogRow?.smtpHost) {
      try {
        const parsed = JSON.parse(catalogRow.smtpHost);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.key === 'string') {
              savedMap.set(item.key, item);
            }
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return DEFAULT_ADDONS_CATALOG.map((def) => {
      const saved = savedMap.get(def.key);
      const defaultPrice = def.key === 'nfse' ? fallbackNfsePrice : def.priceCents;
      return {
        ...def,
        name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim() : def.name,
        shortName:
          typeof saved?.shortName === 'string' && saved.shortName.trim()
            ? saved.shortName.trim()
            : def.shortName,
        description:
          typeof saved?.description === 'string' && saved.description.trim()
            ? saved.description.trim()
            : def.description,
        isAddon: typeof saved?.isAddon === 'boolean' ? saved.isAddon : def.isAddon,
        priceCents:
          typeof saved?.priceCents === 'number' && saved.priceCents >= 0
            ? Math.round(saved.priceCents)
            : defaultPrice,
      };
    });
  } catch {
    return DEFAULT_ADDONS_CATALOG;
  }
}

export async function getAddonByKey(key: keyof PlanPermissions): Promise<AddonConfigItem> {
  const catalog = await getAddonsCatalog();
  return (
    catalog.find((item) => item.key === key) ||
    DEFAULT_ADDONS_CATALOG.find((item) => item.key === key) ||
    DEFAULT_ADDONS_CATALOG[0]
  );
}

export async function saveAddonsCatalog(
  updates: Array<{
    key: keyof PlanPermissions;
    isAddon?: boolean;
    priceCents?: number;
    name?: string;
    description?: string;
  }>,
): Promise<AddonConfigItem[]> {
  const current = await getAddonsCatalog();
  const updateMap = new Map(updates.map((u) => [u.key, u]));

  const nextCatalog = current.map((item) => {
    const u = updateMap.get(item.key);
    if (!u) return item;
    return {
      ...item,
      isAddon: typeof u.isAddon === 'boolean' ? u.isAddon : item.isAddon,
      priceCents:
        typeof u.priceCents === 'number' && u.priceCents >= 0
          ? Math.round(u.priceCents)
          : item.priceCents,
      name: typeof u.name === 'string' && u.name.trim() ? u.name.trim() : item.name,
      description:
        typeof u.description === 'string' && u.description.trim()
          ? u.description.trim()
          : item.description,
    };
  });

  const serialized = JSON.stringify(nextCatalog);
  const nfseItem = nextCatalog.find((i) => i.key === 'nfse');
  const nfsePriceCents = nfseItem ? nfseItem.priceCents : 2990;

  await prisma.systemSetting.upsert({
    where: { id: ADDONS_SETTING_ID },
    create: {
      id: ADDONS_SETTING_ID,
      smtpHost: serialized,
      nfseAddonPriceCents: nfsePriceCents,
    },
    update: {
      smtpHost: serialized,
      nfseAddonPriceCents: nfsePriceCents,
    },
  });

  // Mantém sincronizado nos registros global e default para retrocompatibilidade
  await prisma.systemSetting
    .upsert({
      where: { id: 'global' },
      create: { id: 'global', nfseAddonPriceCents: nfsePriceCents },
      update: { nfseAddonPriceCents: nfsePriceCents },
    })
    .catch(() => {});

  await prisma.systemSetting
    .upsert({
      where: { id: 'default' },
      create: { id: 'default', nfseAddonPriceCents: nfsePriceCents },
      update: { nfseAddonPriceCents: nfsePriceCents },
    })
    .catch(() => {});

  return nextCatalog;
}

export interface SubscribedAddonEntry {
  key: keyof PlanPermissions;
  name: string;
  shortName: string;
  priceCents: number;
  activatedAt: string;
  expiresAt?: string | null;
}

/**
 * Extrai a lista de Add-ons contratados à parte que estão ativos na Subscription.
 * Mantém compatibilidade com nfseAddonActive legado.
 */
export function parseSubscriptionActiveAddons(
  subscription: any,
  catalog: AddonConfigItem[] = DEFAULT_ADDONS_CATALOG,
): SubscribedAddonEntry[] {
  if (!subscription) return [];
  const now = new Date();
  const map = new Map<keyof PlanPermissions, SubscribedAddonEntry>();

  const raw = subscription.activeAddons;
  const list = Array.isArray(raw) ? raw : [];

  for (const item of list) {
    if (!item || typeof item.key !== 'string') continue;
    const key = item.key as keyof PlanPermissions;
    if (item.expiresAt && new Date(item.expiresAt) <= now) continue;
    const catItem =
      catalog.find((c) => c.key === key) ||
      DEFAULT_ADDONS_CATALOG.find((c) => c.key === key);
    if (!catItem) continue;
    map.set(key, {
      key,
      name: catItem.name,
      shortName: catItem.shortName,
      priceCents:
        typeof item.priceCents === 'number' && item.priceCents >= 0
          ? item.priceCents
          : catItem.priceCents,
      activatedAt: item.activatedAt || new Date().toISOString(),
      expiresAt: item.expiresAt || null,
    });
  }

  // Retrocompatibilidade com nfseAddonActive
  if (subscription.nfseAddonActive && !map.has('nfse')) {
    const expired =
      subscription.nfseAddonExpiresAt &&
      new Date(subscription.nfseAddonExpiresAt) <= now;
    if (!expired) {
      const nfseCat =
        catalog.find((c) => c.key === 'nfse') ||
        DEFAULT_ADDONS_CATALOG.find((c) => c.key === 'nfse')!;
      map.set('nfse', {
        key: 'nfse',
        name: nfseCat.name,
        shortName: nfseCat.shortName,
        priceCents: nfseCat.priceCents,
        activatedAt: new Date().toISOString(),
        expiresAt: subscription.nfseAddonExpiresAt
          ? new Date(subscription.nfseAddonExpiresAt).toISOString()
          : null,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Ativa (ou renova) um Add-on contratado à parte na assinatura do salão.
 */
export async function activateAddonOnSubscription(
  tenantId: string,
  addonKey: keyof PlanPermissions,
  cycleDays: number = 30,
): Promise<SubscribedAddonEntry> {
  const catalog = await getAddonsCatalog();
  const addonCfg =
    catalog.find((c) => c.key === addonKey) ||
    DEFAULT_ADDONS_CATALOG.find((c) => c.key === addonKey);
  if (!addonCfg) {
    throw new Error(`Módulo Add-on "${String(addonKey)}" não encontrado.`);
  }

  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const now = new Date();
  const currentEntries = parseSubscriptionActiveAddons(sub, catalog);
  const existing = currentEntries.find((e) => e.key === addonKey);

  let baseTime = now.getTime();
  if (existing?.expiresAt && new Date(existing.expiresAt).getTime() > baseTime) {
    baseTime = new Date(existing.expiresAt).getTime();
  }
  const expiresAtDate = new Date(baseTime + cycleDays * 24 * 60 * 60 * 1000);

  const newEntry: SubscribedAddonEntry = {
    key: addonKey,
    name: addonCfg.name,
    shortName: addonCfg.shortName,
    priceCents: addonCfg.priceCents,
    activatedAt: existing?.activatedAt || now.toISOString(),
    expiresAt: expiresAtDate.toISOString(),
  };

  const nextEntries = [
    ...currentEntries.filter((e) => e.key !== addonKey),
    newEntry,
  ];

  await prisma.subscription.updateMany({
    where: { tenantId },
    data: {
      activeAddons: nextEntries as any,
      lastPaymentAt: now,
      ...(addonKey === 'nfse'
        ? { nfseAddonActive: true, nfseAddonExpiresAt: expiresAtDate }
        : {}),
    },
  });

  return newEntry;
}

/**
 * Cancela apenas um Add-on específico da assinatura do salão, mantendo o plano principal intacto.
 */
export async function cancelAddonOnSubscription(
  tenantId: string,
  addonKey: keyof PlanPermissions,
): Promise<SubscribedAddonEntry[]> {
  const catalog = await getAddonsCatalog();
  const sub = await prisma.subscription.findUnique({ where: { tenantId } });
  const currentEntries = parseSubscriptionActiveAddons(sub, catalog);
  const nextEntries = currentEntries.filter((e) => e.key !== addonKey);

  await prisma.subscription.updateMany({
    where: { tenantId },
    data: {
      activeAddons: nextEntries as any,
      ...(addonKey === 'nfse'
        ? { nfseAddonActive: false, nfseAddonExpiresAt: null }
        : {}),
    },
  });

  return nextEntries;
}


