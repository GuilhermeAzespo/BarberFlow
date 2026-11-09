'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Crown,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Users,
  MessageSquare,
  ShieldCheck,
  Calendar,
  DollarSign,
  HelpCircle,
  Flame,
  Check,
  Scissors,
  Star,
  ExternalLink,
  CreditCard,
  QrCode,
  Copy,
  Clock,
  Lock,
  RefreshCw,
  Tag,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { DateTime } from 'luxon';
import { getCycleFreeMonthsLabel } from '../../lib/cycles';

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceCents: number;
  maxProfessionals?: number | null;
  maxAppointmentsPerMonth?: number | null;
  whatsappEnabled: boolean;
  features?: any;
  badge?: string | null;
  isHighlighted?: boolean;
}

const getPlanFeatures = (plan: PublicPlan): string[] => {
  if (Array.isArray(plan.features)) return plan.features;
  if (plan.features && typeof plan.features === 'object') {
    if (Array.isArray((plan.features as any).items)) {
      return (plan.features as any).items;
    }
  }
  if (typeof plan.features === 'string') {
    try {
      const parsed = JSON.parse(plan.features);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch {}
  }
  return [];
};

const EXPIRATION_MONTHS = [
  { value: '01', label: '01 - Jan' },
  { value: '02', label: '02 - Fev' },
  { value: '03', label: '03 - Mar' },
  { value: '04', label: '04 - Abr' },
  { value: '05', label: '05 - Mai' },
  { value: '06', label: '06 - Jun' },
  { value: '07', label: '07 - Jul' },
  { value: '08', label: '08 - Ago' },
  { value: '09', label: '09 - Set' },
  { value: '10', label: '10 - Out' },
  { value: '11', label: '11 - Nov' },
  { value: '12', label: '12 - Dez' },
];

const CURRENT_YEAR = new Date().getFullYear();
const EXPIRATION_YEARS = Array.from({ length: 16 }, (_, i) => String(CURRENT_YEAR + i));

const sortPlansFixed = <T extends { slug?: string; sortOrder?: number; priceCents?: number }>(list: T[]): T[] => {
  const ORDER: Record<string, number> = {
    starter: 1,
    pro: 2,
    premium: 3,
  };
  return [...list].sort((a, b) => {
    const slugA = (a.slug || '').toLowerCase();
    const slugB = (b.slug || '').toLowerCase();
    const orderA = ORDER[slugA] ?? a.sortOrder ?? 99;
    const orderB = ORDER[slugB] ?? b.sortOrder ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.priceCents || 0) - (b.priceCents || 0);
  });
};

const DEFAULT_PLANS: PublicPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    description: 'Ideal para barbeiros autônomos que desejam automatizar o WhatsApp e agendamentos.',
    priceCents: 1999,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    features: [
      '1 Barbeiro / Profissional',
      'Até 300 agendamentos por mês',
      'Bot de WhatsApp com lembretes automáticos',
      'Vitrine pública online 24h',
      'Promoções e cupons por dia da semana',
      'Fluxo de caixa básico',
    ],
    badge: null,
    isHighlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    description: 'Perfeito para barbearias em expansão com equipe de barbeiros e alta demanda.',
    priceCents: 3999,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Até 5 Barbeiros na equipe',
      'Agendamentos 100% Ilimitados',
      'Fotos personalizadas de cada barbeiro na vitrine',
      'Níveis de permissão (Recepção, Barbeiro, Admin)',
      'Divisão automática de comissões por barbeiro',
      'Bot de WhatsApp exclusivo com cancelamento fácil',
      'Relatórios financeiros avançados',
      'Suporte prioritário via WhatsApp',
    ],
    badge: 'MAIS POPULAR',
    isHighlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    slug: 'premium',
    description: 'Para salões consolidados, franquias e redes que necessitam de escala máxima.',
    priceCents: 6999,
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Domínio Próprio & DNS Personalizado (ex: agendar.seusite.com.br)',
      'Barbeiros 100% Ilimitados',
      'Agendamentos Ilimitados sem teto',
      'Múltiplas cadeiras e pontos de atendimento',
      'Todas as funcionalidades liberadas',
      'Exportação de relatórios financeiros completos',
      'Consultoria de implantação VIP',
      'Suporte dedicado direto no WhatsApp',
    ],
    badge: 'ESCALA MÁXIMA',
    isHighlighted: false,
  },
];

interface ComparisonFeature {
  name: string;
  category: string;
  tooltip?: string;
  starter: string | boolean;
  pro: string | boolean;
  premium: string | boolean;
}

const COMPARISON_TABLE: ComparisonFeature[] = [
  // Categoria: Capacidade & Equipe
  {
    name: 'Número de Barbeiros / Profissionais',
    category: 'Capacidade & Equipe',
    tooltip: 'Total de profissionais que podem atender na agenda e receber comissões.',
    starter: '1 Barbeiro',
    pro: 'Até 5 Barbeiros',
    premium: 'Ilimitados',
  },
  {
    name: 'Volume de Agendamentos / Mês',
    category: 'Capacidade & Equipe',
    tooltip: 'Quantidade de agendamentos que podem ser realizados mensalmente.',
    starter: 'Até 300 / mês',
    pro: '100% Ilimitados',
    premium: '100% Ilimitados',
  },
  {
    name: 'Fotos dos Barbeiros na Vitrine',
    category: 'Capacidade & Equipe',
    tooltip: 'Exibição da foto de cada profissional na vitrine pública e agendamento.',
    starter: 'Básico (Inicial)',
    pro: 'Fotos em Alta Resolução',
    premium: 'Fotos em Alta Resolução',
  },
  {
    name: 'Perfis de Permissão (Recepção, Gerente, Caixa)',
    category: 'Capacidade & Equipe',
    tooltip: 'Crie logins com restrição de acesso a dados financeiros e configurações.',
    starter: false,
    pro: true,
    premium: true,
  },
  {
    name: 'Cálculo de Comissões por Barbeiro',
    category: 'Capacidade & Equipe',
    tooltip: 'Cálculo automático da comissão percentual por serviço e fechamento.',
    starter: 'Básico',
    pro: true,
    premium: true,
  },

  // Categoria: Vitrine & Agendamento Web
  {
    name: 'Vitrine Pública Online 24h (Link na Bio)',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Promoções por Tempo Limitado com Cronômetro',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Descontos Recorrentes por Dia da Semana',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Galeria de Fotos do Salão & Cortes',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Domínio Próprio & DNS (ex: agendar.suabarbearia.com.br)',
    category: 'Vitrine & Agendamento',
    tooltip: 'Conecte o endereço exclusivo da sua barbearia com SSL HTTPS incluso, sem menção a barberflow na URL.',
    starter: false,
    pro: false,
    premium: 'Incluso (Exclusivo)',
  },

  // Categoria: WhatsApp & Automação
  {
    name: 'Bot de WhatsApp Conectado ao seu Número',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Confirmação Automática de Agendamentos',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Lembretes Anti-Falta Pré-Horário',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Disparo de Credenciais de Acesso via WhatsApp',
    category: 'WhatsApp & Automação',
    starter: false,
    pro: true,
    premium: true,
  },

  // Categoria: Gestão & Financeiro
  {
    name: 'Fluxo de Caixa Diário',
    category: 'Gestão Financeira',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Extrato Financeiro com Métricas de Lucro',
    category: 'Gestão Financeira',
    starter: 'Básico',
    pro: 'Avançado',
    premium: 'Avançado + Exportação',
  },
  {
    name: 'Suporte & Atendimento',
    category: 'Suporte',
    starter: 'Padrão (Email/Fila)',
    pro: 'Prioritário WhatsApp',
    premium: 'VIP Dedicado 24/7',
  },
];

type BillingCycle = 'MONTHLY' | 'SEMIANNUAL' | 'ANNUAL';

interface CycleOption {
  enabled: boolean;
  discountPct: number;
  maxInstallments: number;
}

interface BillingCyclesInfo {
  available: BillingCycle[];
  MONTHLY: CycleOption;
  SEMIANNUAL: CycleOption;
  ANNUAL: CycleOption;
}

const DEFAULT_BILLING_CYCLES: BillingCyclesInfo = {
  available: ['MONTHLY', 'SEMIANNUAL', 'ANNUAL'],
  MONTHLY: { enabled: true, discountPct: 0, maxInstallments: 1 },
  SEMIANNUAL: { enabled: true, discountPct: 10, maxInstallments: 6 },
  ANNUAL: { enabled: true, discountPct: 20, maxInstallments: 12 },
};

const CYCLE_META: Record<BillingCycle, { label: string; months: number; period: string }> = {
  MONTHLY: { label: 'Mensal', months: 1, period: 'mês' },
  SEMIANNUAL: { label: 'Semestral', months: 6, period: 'semestre' },
  ANNUAL: { label: 'Anual', months: 12, period: 'ano' },
};

// Espelho do cálculo do backend (lib/billing-cycles.ts) para exibição em tempo real
const calcCyclePrice = (monthlyPriceCents: number, cycle: BillingCycle, cfg: BillingCyclesInfo) => {
  const months = CYCLE_META[cycle].months;
  const gross = Math.max(0, Math.round(monthlyPriceCents)) * months;
  const discountPct = cycle === 'MONTHLY' ? 0 : cfg[cycle]?.discountPct ?? 0;
  const amount = Math.max(gross > 0 ? 100 : 0, gross - Math.round((gross * discountPct) / 100));
  const days = cycle === 'ANNUAL' ? 365 : cycle === 'SEMIANNUAL' ? 180 : 30;
  return {
    cycle,
    label: CYCLE_META[cycle].label,
    months,
    days,
    grossCents: gross,
    discountPct,
    savingsCents: gross - amount,
    amountCents: amount,
    monthlyEquivalentCents: Math.round(amount / months),
    maxInstallments: cycle === 'MONTHLY' ? 1 : cfg[cycle]?.maxInstallments ?? 1,
  };
};

export interface SubscribedAddonItem {
  key: string;
  name: string;
  shortName: string;
  priceCents: number;
  activatedAt?: string;
  expiresAt?: string | null;
}

export interface AddonCatalogItem {
  key: string;
  name: string;
  shortName: string;
  description: string;
  priceCents: number;
  icon: string;
  category: string;
  isAddon: boolean;
  includedInPlan?: boolean;
  contracted?: boolean;
  expiresAt?: string | null;
}

const DEFAULT_MARKETPLACE_ADDONS: AddonCatalogItem[] = [
  {
    key: 'onlinePayments',
    name: 'Recebimento Online (Mercado Pago API)',
    shortName: 'Recebimento Online',
    description:
      'Receba pagamentos via PIX e Cartão de Crédito dos planos mensais do Clube VIP diretamente na conta Mercado Pago do seu salão, com liberação automática.',
    priceCents: 990,
    icon: 'CreditCard',
    category: 'Pagamentos & Integrações',
    isAddon: true,
  },
  {
    key: 'club',
    name: 'Clube de Assinatura VIP (MRR)',
    shortName: 'Clube VIP',
    description:
      'Crie planos recorrentes de corte ou barba ilimitada para seus clientes, controle usos mensais e gere receita recorrente previsível.',
    priceCents: 3990,
    icon: 'Crown',
    category: 'Receita Recorrente',
    isAddon: true,
  },
  {
    key: 'marketing',
    name: 'Campanhas & Retorno de Clientes',
    shortName: 'Automação de Retorno',
    description:
      'Resgate automático via WhatsApp de clientes sumidos (15, 30, 45 dias) e mensagens automáticas de feliz aniversário com cupom.',
    priceCents: 2990,
    icon: 'Flame',
    category: 'Automação & Vendas',
    isAddon: true,
  },
  {
    key: 'loyalty',
    name: 'Cartão Fidelidade Digital & Cashback',
    shortName: 'Fidelidade Digital',
    description:
      'Programa de selos automáticos (ex: complete 10 cortes e ganhe 1 grátis) integrado ao WhatsApp para fidelizar clientes.',
    priceCents: 1990,
    icon: 'Star',
    category: 'Fidelização',
    isAddon: true,
  },
  {
    key: 'nfse',
    name: 'Módulo Fiscal NFS-e Automática',
    shortName: 'Módulo Fiscal NFS-e',
    description:
      'Emissão automática de Nota Fiscal de Serviço Eletrônica (Padrão Nacional / Municipal) a cada atendimento concluído e envio em PDF no WhatsApp.',
    priceCents: 2990,
    icon: 'FileText',
    category: 'Fiscal & Contábil',
    isAddon: true,
  },
];

const isAddonIncludedInPlan = (plan: PublicPlan | null | undefined, addonKey: string): boolean => {
  if (!plan) return false;
  const slug = (plan.slug || '').toLowerCase();
  const defaultIncludedBySlug: Record<string, Record<string, boolean>> = {
    starter: {
      customDomain: false,
      nfse: false,
      loyalty: false,
      marketing: false,
      club: false,
      onlinePayments: false,
      exportCsv: false,
      multiLocation: false,
    },
    pro: {
      customDomain: false,
      nfse: false,
      loyalty: true,
      marketing: false,
      club: false,
      onlinePayments: false,
      exportCsv: false,
      multiLocation: false,
    },
    premium: {
      customDomain: true,
      nfse: false,
      loyalty: true,
      marketing: true,
      club: true,
      onlinePayments: false,
      exportCsv: true,
      multiLocation: true,
    },
  };
  let perms: Record<string, boolean> = { ...(defaultIncludedBySlug[slug] || defaultIncludedBySlug.starter) };
  if (plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)) {
    const rawPerms = (plan.features as any).permissions;
    if (rawPerms && typeof rawPerms === 'object') {
      perms = { ...perms, ...rawPerms };
    }
  }
  return Boolean(perms[addonKey]);
};

const getAddonRouteHref = (addonKey: string): string => {
  switch (addonKey) {
    case 'onlinePayments':
      return '/settings';
    case 'club':
      return '/clube';
    case 'marketing':
      return '/campanhas';
    case 'loyalty':
      return '/fidelidade';
    case 'nfse':
      return '/fiscal';
    default:
      return '/settings';
  }
};

interface BillingStatusResponse {
  subscription: {
    status: string;
    autoRenew?: boolean;
    trialEndsAt?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    lastPaymentAt?: string | null;
    isTrial?: boolean;
    isLifetime?: boolean;
    trialDaysLeft?: number | null;
    renewDaysLeft?: number | null;
    billingCycle?: BillingCycle;
    billingCycleLabel?: string;
    activeAddons?: SubscribedAddonItem[];
    plan: {
      id: string;
      name: string;
      slug: string;
      priceCents: number;
    };
  } | null;
  invoiceBreakdown?: {
    planName: string;
    planPriceCents: number;
    addons: SubscribedAddonItem[];
    addonsTotalCents: number;
    totalMonthlyCents: number;
  };
  addons?: AddonCatalogItem[];
  plans: PublicPlan[];
  billingCycles?: BillingCyclesInfo;
  mercadopago: {
    isConfigured: boolean;
    enabled: boolean;
    publicKey?: string | null;
    sandbox: boolean;
  };
}

interface PaymentHistoryItem {
  id: string;
  amountCents: number;
  method: 'PIX' | 'CREDIT_CARD';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED';
  paidAt?: string | null;
  createdAt: string;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  plan: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function PlanosPage() {
  const { tenant, subscription, refresh, isTrialExpired } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PublicPlan[]>(sortPlansFixed(DEFAULT_PLANS));
  const [activeProfsCount, setActiveProfsCount] = useState<number>(1);
  const [billingInfo, setBillingInfo] = useState<BillingStatusResponse | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modal de Checkout Mercado Pago (Plano ou Add-on do Marketplace)
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<PublicPlan | null>(null);
  const [selectedAddonForCheckout, setSelectedAddonForCheckout] = useState<AddonCatalogItem | null>(null);
  const [cancellingAddonKey, setCancellingAddonKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'CREDIT_CARD'>('PIX');

  // PIX State
  const [pixCpf, setPixCpf] = useState('');
  const [generatingPix, setGeneratingPix] = useState(false);
  const [checkingPix, setCheckingPix] = useState(false);
  const [pixResult, setPixResult] = useState<{
    paymentId: string;
    qrCode?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    amountCents: number;
    planName: string;
    expiresAt?: string;
  } | null>(null);
  const [pixPaidSuccess, setPixPaidSuccess] = useState(false);

  // Cartão de Crédito State
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardholderName: '',
    cardholderCpf: '',
    expMonth: '12',
    expYear: '2028',
    cvv: '',
  });
  const [processingCard, setProcessingCard] = useState(false);
  const [cardPaidSuccess, setCardPaidSuccess] = useState(false);

  // Cupom de Desconto State
  const [couponInput, setCouponInput] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    description: string;
    discountType: 'PERCENTAGE' | 'FIXED_CENTS';
    discountValue: number;
    discountCents: number;
    finalAmountCents: number;
  } | null>(null);

  // Ciclo de Cobrança (Mensal / Semestral / Anual) + Parcelamento + Auto-Renew
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY');
  const [installments, setInstallments] = useState(1);
  const [checkoutAutoRenew, setCheckoutAutoRenew] = useState<boolean>(true);
  const [togglingAutoRenew, setTogglingAutoRenew] = useState<boolean>(false);
  const cyclesCfg: BillingCyclesInfo = billingInfo?.billingCycles || DEFAULT_BILLING_CYCLES;
  const availableCycles: BillingCycle[] = (cyclesCfg.available?.length ? cyclesCfg.available : ['MONTHLY']) as BillingCycle[];
  const checkoutCycle = selectedPlanForCheckout
    ? calcCyclePrice(selectedPlanForCheckout.priceCents, billingCycle, cyclesCfg)
    : null;

  // Add-ons contratados à parte que entram na fatura do plano selecionado no checkout
  const activeContractedAddons: SubscribedAddonItem[] =
    billingInfo?.invoiceBreakdown?.addons || billingInfo?.subscription?.activeAddons || [];
  const checkoutBillableAddons: SubscribedAddonItem[] = selectedPlanForCheckout
    ? activeContractedAddons.filter((a) => !isAddonIncludedInPlan(selectedPlanForCheckout, a.key))
    : [];
  const checkoutAddonsMonthlyCents = checkoutBillableAddons.reduce((acc, a) => acc + a.priceCents, 0);
  const checkoutAddonsCycleCents = checkoutAddonsMonthlyCents * (checkoutCycle?.months || 1);
  const checkoutBaseInvoiceCents = selectedAddonForCheckout
    ? selectedAddonForCheckout.priceCents
    : (checkoutCycle?.amountCents ?? 0) + checkoutAddonsCycleCents;
  const checkoutAmountCents = appliedCoupon
    ? appliedCoupon.finalAmountCents
    : checkoutBaseInvoiceCents;

  // Catálogo do Marketplace de Add-ons
  const marketplaceAddons: AddonCatalogItem[] = (
    billingInfo?.addons?.length ? billingInfo.addons : DEFAULT_MARKETPLACE_ADDONS
  ).filter((item) => item.isAddon !== false);

  // Garante que o ciclo selecionado continue disponível caso o Super Admin desative algum
  useEffect(() => {
    if (!availableCycles.includes(billingCycle)) setBillingCycle('MONTHLY');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingInfo]);

  const handleChangeCycle = (cycle: BillingCycle) => {
    if (cycle === billingCycle) return;
    setBillingCycle(cycle);
    setInstallments(1);
    if (selectedPlanForCheckout) {
      setPixResult(null);
      if (appliedCoupon) {
        setAppliedCoupon(null);
        toast.info('O ciclo mudou o valor da assinatura. Aplique o cupom novamente para recalcular o desconto.');
      }
    }
  };

  const loadBilling = async () => {
    try {
      const res = await api.get<BillingStatusResponse>('/api/billing/status');
      setBillingInfo(res);
      if (typeof res.subscription?.autoRenew === 'boolean') {
        setCheckoutAutoRenew(res.subscription.autoRenew);
      }
      if (res.plans && res.plans.length > 0) {
        setPlans(sortPlansFixed(res.plans));
      }
    } catch {
      // Ignora erro
    }

    try {
      setLoadingHistory(true);
      const resHist = await api.get<{ payments: PaymentHistoryItem[] }>('/api/billing/history');
      setPaymentHistory(resHist.payments || []);
    } catch {
      // Ignora erro
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadBilling();

    api
      .get<{ professionals: any[] }>('/api/professionals?active=true')
      .then((res) => {
        if (res.professionals) {
          setActiveProfsCount(res.professionals.length);
        }
      })
      .catch(() => {});
  }, []);

  // Polling automático para verificação de PIX (Plano ou Add-on)
  useEffect(() => {
    if (!pixResult?.paymentId || pixPaidSuccess) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get<{ isPaid: boolean; status: string }>(
          `/api/billing/payments/${pixResult.paymentId}/status`,
        );
        if (res.isPaid) {
          setPixPaidSuccess(true);
          toast.success(
            selectedAddonForCheckout
              ? `🎉 Pagamento PIX aprovado! O Add-on "${selectedAddonForCheckout.name}" já está liberado para uso!`
              : '🎉 Pagamento PIX aprovado com sucesso! O plano do seu salão foi ativado agora mesmo.',
          );
          await refresh();
          await loadBilling();
        }
      } catch {
        // Ignora falha transitória
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [pixResult?.paymentId, pixPaidSuccess, selectedAddonForCheckout]);

  const currentPlanSlug = (subscription?.plan?.slug || 'starter').toLowerCase();
  const isTrial = subscription?.status === 'TRIALING';
  const isLifetime = Boolean(
    subscription?.isLifetime ||
      (subscription?.status === 'ACTIVE' && !subscription?.currentPeriodEnd && !subscription?.trialEndsAt),
  );
  const isStarter = currentPlanSlug === 'starter';
  const isPro = currentPlanSlug === 'pro';
  const isPremium = currentPlanSlug === 'premium';

  const maxProfs = subscription?.limits?.maxProfessionals;
  const maxAppointments = subscription?.limits?.maxAppointmentsPerMonth;

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length > 11) {
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const handleToggleSaaSAutoRenew = async () => {
    const currentAutoRenew = billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true;
    const nextValue = !currentAutoRenew;
    try {
      setTogglingAutoRenew(true);
      const res = await api.patch<{ autoRenew: boolean; message: string }>('/api/billing/auto-renew', {
        autoRenew: nextValue,
      });
      setCheckoutAutoRenew(res.autoRenew);
      setBillingInfo((prev) =>
        prev && prev.subscription
          ? { ...prev, subscription: { ...prev.subscription, autoRenew: res.autoRenew } }
          : prev,
      );
      toast.success(res.message);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao atualizar preferência de renovação automática.');
    } finally {
      setTogglingAutoRenew(false);
    }
  };

  const handleOpenCheckout = (plan: PublicPlan) => {
    setSelectedAddonForCheckout(null);
    setSelectedPlanForCheckout(plan);
    setPixResult(null);
    setPixPaidSuccess(false);
    setCardPaidSuccess(false);
    setPaymentMethod('PIX');
    setCouponInput('');
    setAppliedCoupon(null);
    setInstallments(1);
    setCheckoutAutoRenew(billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true);
  };

  const handleOpenAddonCheckout = (addon: AddonCatalogItem) => {
    setSelectedPlanForCheckout(null);
    setSelectedAddonForCheckout(addon);
    setPixResult(null);
    setPixPaidSuccess(false);
    setCardPaidSuccess(false);
    setPaymentMethod('PIX');
    setCouponInput('');
    setAppliedCoupon(null);
    setInstallments(1);
  };

  const handleCloseCheckout = () => {
    setSelectedPlanForCheckout(null);
    setSelectedAddonForCheckout(null);
    setPixResult(null);
    setPixPaidSuccess(false);
    setCardPaidSuccess(false);
    setCouponInput('');
    setAppliedCoupon(null);
  };

  const handleCancelAddon = async (addonKey: string, addonName: string) => {
    if (
      !window.confirm(
        `Deseja realmente cancelar apenas o Add-on "${addonName}"?\n\n• O seu Plano atual continuará 100% ativo normalmente.\n• O valor deste Add-on será removido da sua fatura imediatamente.`,
      )
    ) {
      return;
    }

    try {
      setCancellingAddonKey(addonKey);
      const res = await api.post<{
        success: boolean;
        message: string;
        activeAddons: SubscribedAddonItem[];
      }>(`/api/billing/addon/${addonKey}/cancel`, {});
      toast.success(res.message || `Add-on "${addonName}" cancelado e removido da sua fatura.`);
      if (appliedCoupon) {
        setAppliedCoupon(null);
      }
      setPixResult(null);
      await refresh();
      await loadBilling();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível cancelar o Add-on.');
    } finally {
      setCancellingAddonKey(null);
    }
  };

  // Validar Cupom de Desconto (Plano ou Add-on)
  const handleValidateCoupon = async () => {
    if (!couponInput.trim() || (!selectedPlanForCheckout && !selectedAddonForCheckout)) return;
    setValidatingCoupon(true);
    try {
      const payload = selectedAddonForCheckout
        ? {
            code: couponInput.trim(),
            targetType: 'ADDON' as const,
            addonKey: selectedAddonForCheckout.key,
          }
        : {
            code: couponInput.trim(),
            targetType: 'PLAN' as const,
            planId: selectedPlanForCheckout!.id,
            billingCycle,
          };

      const res = await api.post<{
        valid: boolean;
        code: string;
        description: string;
        discountType: 'PERCENTAGE' | 'FIXED_CENTS';
        discountValue: number;
        discountCents: number;
        finalAmountCents: number;
        message: string;
      }>('/api/billing/coupons/validate', payload);

      if (res.valid) {
        setAppliedCoupon({
          code: res.code,
          description: res.description,
          discountType: res.discountType,
          discountValue: res.discountValue,
          discountCents: res.discountCents,
          finalAmountCents: res.finalAmountCents,
        });
        toast.success(res.message);
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Cupom inválido ou expirado.');
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    toast.info('Cupom de desconto removido.');
  };

  // Gerar PIX via Mercado Pago (Plano ou Add-on)
  const handleGeneratePix = async () => {
    if (!selectedPlanForCheckout && !selectedAddonForCheckout) return;
    setGeneratingPix(true);
    setPixResult(null);
    setPixPaidSuccess(false);

    try {
      const endpoint = selectedAddonForCheckout
        ? `/api/billing/addon/${selectedAddonForCheckout.key}/pix`
        : '/api/billing/checkout/pix';
      const payload = selectedAddonForCheckout
        ? {
            payerCpf: pixCpf ? pixCpf.replace(/\D/g, '') : undefined,
            couponCode: appliedCoupon?.code,
          }
        : {
            planId: selectedPlanForCheckout!.id,
            payerCpf: pixCpf ? pixCpf.replace(/\D/g, '') : undefined,
            couponCode: appliedCoupon?.code,
            billingCycle,
            autoRenew: checkoutAutoRenew,
          };

      const res = await api.post<{
        paymentId: string;
        qrCode?: string;
        qrCodeBase64?: string;
        ticketUrl?: string;
        amountCents: number;
        planName: string;
        expiresAt?: string;
      }>(endpoint, payload);

      setPixResult(res);
      toast.success('Código Pix gerado com sucesso! Efetue o pagamento no aplicativo do seu banco.');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao gerar cobrança Pix no Mercado Pago.');
    } finally {
      setGeneratingPix(false);
    }
  };

  // Consulta manual de PIX
  const handleCheckPixManual = async () => {
    if (!pixResult?.paymentId) return;
    setCheckingPix(true);
    try {
      const res = await api.get<{ isPaid: boolean; status: string }>(
        `/api/billing/payments/${pixResult.paymentId}/status`,
      );
      if (res.isPaid) {
        setPixPaidSuccess(true);
        toast.success(
          selectedAddonForCheckout
            ? `🎉 Pagamento PIX aprovado! O Add-on "${selectedAddonForCheckout.name}" já está liberado!`
            : '🎉 Pagamento PIX aprovado com sucesso!',
        );
        await refresh();
        await loadBilling();
      } else {
        toast.info('Pagamento ainda em processamento. Se já pagou, aguarde alguns segundos.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao consultar status do Pix.');
    } finally {
      setCheckingPix(false);
    }
  };

  // Pagar via Cartão de Crédito (Plano ou Add-on)
  const handlePayCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanForCheckout && !selectedAddonForCheckout) return;

    if (!cardForm.cardNumber || !cardForm.cardholderName || !cardForm.cardholderCpf || !cardForm.cvv || !cardForm.expMonth || !cardForm.expYear) {
      return toast.warning('Preencha todos os campos do cartão de crédito (inclusive validade e CVV).');
    }

    setProcessingCard(true);
    try {
      const endpoint = selectedAddonForCheckout
        ? `/api/billing/addon/${selectedAddonForCheckout.key}/card`
        : '/api/billing/checkout/card';
      const payload = selectedAddonForCheckout
        ? {
            cardNumber: cardForm.cardNumber,
            cardholderName: cardForm.cardholderName,
            cardholderCpf: cardForm.cardholderCpf,
            expMonth: cardForm.expMonth,
            expYear: cardForm.expYear,
            cvv: cardForm.cvv,
            installments: 1,
            couponCode: appliedCoupon?.code,
          }
        : {
            planId: selectedPlanForCheckout!.id,
            cardNumber: cardForm.cardNumber,
            cardholderName: cardForm.cardholderName,
            cardholderCpf: cardForm.cardholderCpf,
            expMonth: cardForm.expMonth,
            expYear: cardForm.expYear,
            cvv: cardForm.cvv,
            installments,
            couponCode: appliedCoupon?.code,
            billingCycle,
            autoRenew: checkoutAutoRenew,
          };

      const res = await api.post<{ success: boolean; message: string; status: string }>(endpoint, payload);

      if (res.success || res.status === 'approved') {
        setCardPaidSuccess(true);
        toast.success(
          selectedAddonForCheckout
            ? `🎉 Pagamento aprovado! O Add-on "${selectedAddonForCheckout.name}" foi ativado agora mesmo!`
            : '🎉 Pagamento aprovado! O plano do seu salão foi ativado agora mesmo.',
        );
        await refresh();
        await loadBilling();
      } else {
        toast.warning(res.message || 'Pagamento em análise ou não autorizado pela operadora.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao processar cartão de crédito no Mercado Pago.');
    } finally {
      setProcessingCard(false);
    }
  };

  const copyPixCode = () => {
    if (pixResult?.qrCode) {
      navigator.clipboard.writeText(pixResult.qrCode);
      toast.success('Código Pix Copia e Cola copiado com sucesso!');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {/* Header Superior */}
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.15)',
                border: '1px solid rgba(229, 179, 56, 0.3)',
                color: 'var(--primary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                marginBottom: '12px',
              }}
            >
              <Crown size={15} />
              <span>Gestão de Planos & Assinatura</span>
            </div>

            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
              Compare e Escolha o Plano Perfeito para o seu Crescimento
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '640px', margin: '0 auto' }}>
              Descubra todas as vantagens de cada plano e desbloqueie mais capacidade, automação e lucratividade para o seu salão.
            </p>
          </div>

          {/* Banner de Teste Gratuito Expirado */}
          {isTrialExpired && (
            <div
              style={{
                padding: '20px 24px',
                borderRadius: '16px',
                marginBottom: '24px',
                background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.16) 0%, rgba(185, 28, 28, 0.28) 100%)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} color="#F87171" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 4px 0' }}>
                  Seu período de teste de 14 dias terminou
                </h3>
                <p style={{ fontSize: '0.86rem', color: '#FCA5A5', margin: 0, lineHeight: 1.45 }}>
                  O acesso à agenda, cadastro de clientes, automações e demais funcionalidades foi temporariamente pausado.
                  Escolha um dos planos abaixo e ative sua assinatura via <strong>Pix</strong> ou <strong>Cartão de Crédito</strong> para desbloquear tudo imediatamente.
                </p>
              </div>
            </div>
          )}

          {/* Banner do Plano Atual & Limites em Uso */}
          <div
            className="glass-panel"
            style={{
              padding: '24px 28px',
              borderRadius: '16px',
              marginBottom: '32px',
              background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.08) 0%, rgba(18, 24, 38, 0.95) 100%)',
              border: '1px solid rgba(229, 179, 56, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Sua Assinatura Atual
                </span>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: isLifetime
                      ? 'rgba(229, 179, 56, 0.2)'
                      : isTrial
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(16, 185, 129, 0.2)',
                    color: isLifetime ? '#E5B338' : isTrial ? '#FBBF24' : '#10B981',
                    border: `1px solid ${
                      isLifetime
                        ? 'rgba(229, 179, 56, 0.45)'
                        : isTrial
                          ? 'rgba(245, 158, 11, 0.4)'
                          : 'rgba(16, 185, 129, 0.4)'
                    }`,
                  }}
                >
                  {isLifetime ? '♾️ Licença Vitalícia' : isTrial ? 'Período de Testes (Trial)' : 'Plano Ativo'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Plano {subscription?.plan?.name || 'Starter'}
                </h2>
                <span style={{ fontSize: '1rem', color: 'var(--primary)', fontWeight: 700 }}>
                  {formatBRL(subscription?.plan?.priceCents || 4990)} / mês
                </span>
                {billingInfo?.subscription?.billingCycle && billingInfo.subscription.billingCycle !== 'MONTHLY' && (
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'rgba(229, 179, 56, 0.18)',
                      color: 'var(--primary)',
                      border: '1px solid rgba(229, 179, 56, 0.35)',
                    }}
                  >
                    Ciclo {billingInfo.subscription.billingCycleLabel}
                  </span>
                )}
              </div>

              {/* Status de Trial / Renovação */}
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {isTrial ? (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      background: (subscription?.trialDaysLeft ?? 0) <= 3 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: (subscription?.trialDaysLeft ?? 0) <= 3 ? '#F87171' : '#FBBF24',
                      border: `1px solid ${(subscription?.trialDaysLeft ?? 0) <= 3 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                    }}
                  >
                    <Clock size={13} />
                    <span>
                      {(subscription?.trialDaysLeft ?? 0) <= 0
                        ? '⚠️ Período de teste de 14 dias encerrado'
                        : `⏱️ Período de teste: ${subscription?.trialDaysLeft} dia(s) restante(s)`}
                    </span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10B981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <Calendar size={13} />
                    <span>
                      {subscription?.currentPeriodEnd
                        ? `📅 Renova em ${DateTime.fromISO(subscription.currentPeriodEnd).toFormat('dd/LL/yyyy')} (em ${subscription?.renewDaysLeft ?? 30} dias)`
                        : '♾️ Licença Vitalícia Ativa — Sem vencimento'}
                    </span>
                  </div>
                )}

                {/* Botão Toggle Auto-Renew da Assinatura SaaS (oculto em licenças vitalícias) */}
                {!isLifetime && (
                  <button
                    type="button"
                    disabled={togglingAutoRenew}
                    onClick={handleToggleSaaSAutoRenew}
                    title="Clique para alternar entre Renovação Automática (Auto-Renew) e Renovação Manual"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: togglingAutoRenew ? 'wait' : 'pointer',
                      background:
                        (billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true)
                          ? 'rgba(16, 185, 129, 0.14)'
                          : 'rgba(245, 158, 11, 0.14)',
                      color:
                        (billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true)
                          ? '#34D399'
                          : '#FBBF24',
                      border:
                        (billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true)
                          ? '1px solid rgba(16, 185, 129, 0.35)'
                          : '1px solid rgba(245, 158, 11, 0.35)',
                    }}
                  >
                    <RefreshCw size={12} className={togglingAutoRenew ? 'spin' : ''} />
                    <span>
                      Auto-Renew:{' '}
                      {(billingInfo?.subscription?.autoRenew ?? subscription?.autoRenew ?? true)
                        ? 'Automático (ON)'
                        : 'Manual (OFF)'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Metrificadores de Capacidade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} color="var(--primary)" />
                  <span>Barbeiros na Equipe</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {activeProfsCount} / {maxProfs !== null ? maxProfs : '∞'}
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: maxProfs ? `${Math.min((activeProfsCount / maxProfs) * 100, 100)}%` : '30%',
                      height: '100%',
                      background: maxProfs && activeProfsCount >= maxProfs ? '#EF4444' : 'var(--primary)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--primary)" />
                  <span>Agendamentos / Mês</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {maxAppointments !== null ? `${maxAppointments} máx` : 'Ilimitados ∞'}
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: maxAppointments ? '40%' : '100%',
                      height: '100%',
                      background: '#10B981',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={14} color="#10B981" />
                  <span>WhatsApp Bot</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} />
                  <span>Ativo</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Lembretes 100% integrados
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenCheckout(plans.find((p) => p.slug === currentPlanSlug) || plans[0])}
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '0.86rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  border: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <CreditCard size={16} />
                <span>{isTrial ? 'Pagar / Efetivar Assinatura' : 'Renovar com Mercado Pago'}</span>
              </button>
            </div>

            {/* Resumo Detalhado da Fatura do Cliente (Plano + Add-ons Contratados à Parte) */}
            <div
              style={{
                width: '100%',
                marginTop: '6px',
                paddingTop: '18px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div
                style={{
                  flex: '1 1 480px',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid rgba(229, 179, 56, 0.25)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: 'var(--primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    🧾 Demonstrativo da Sua Fatura Mensal
                  </span>
                  <a
                    href="#marketplace-addons"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#60A5FA',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>+ Adicionar Módulos no Marketplace</span>
                    <ArrowRight size={13} />
                  </a>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.86rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'var(--text-main)',
                    }}
                  >
                    <span>
                      Plano: <strong>{subscription?.plan?.name || 'Starter'}</strong>
                    </span>
                    <strong style={{ color: 'var(--text-main)' }}>
                      {formatBRL(subscription?.plan?.priceCents || 4990)}
                    </strong>
                  </div>

                  {activeContractedAddons.length > 0 ? (
                    activeContractedAddons.map((addon) => (
                      <div
                        key={addon.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          background: 'rgba(229, 179, 56, 0.08)',
                          border: '1px solid rgba(229, 179, 56, 0.2)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#F8FAFC' }}>
                            Addon: <strong>{addon.name}</strong>
                          </span>
                          <button
                            type="button"
                            disabled={cancellingAddonKey === addon.key}
                            onClick={() => handleCancelAddon(addon.key, addon.name)}
                            title="Cancelar apenas este Add-on e manter somente a fatura do plano"
                            style={{
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: 'rgba(239, 68, 68, 0.14)',
                              color: '#F87171',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              cursor: cancellingAddonKey === addon.key ? 'wait' : 'pointer',
                            }}
                          >
                            {cancellingAddonKey === addon.key ? 'Cancelando...' : '✕ Cancelar apenas este Add-on'}
                          </button>
                        </div>
                        <strong style={{ color: '#FBBF24' }}>{formatBRL(addon.priceCents)}</strong>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: 'var(--text-dim)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <span>Add-ons à parte contratados:</span>
                      <span>Nenhum no momento (R$ 0,00)</span>
                    </div>
                  )}

                  <div
                    style={{
                      marginTop: '4px',
                      paddingTop: '8px',
                      borderTop: '1px dashed rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.96rem',
                    }}
                  >
                    <strong style={{ color: '#F8FAFC' }}>Total da Fatura Mensal:</strong>
                    <strong style={{ fontSize: '1.12rem', color: '#34D399' }}>
                      {formatBRL(
                        (subscription?.plan?.priceCents || 4990) +
                          activeContractedAddons.reduce((sum, a) => sum + a.priceCents, 0),
                      )}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────── ALERTA: O QUE VOCÊ ESTÁ PERDENDO ───────────────── */}
          {!isPremium && (
            <div
              className="glass-panel"
              style={{
                padding: '24px 28px',
                borderRadius: '16px',
                marginBottom: '36px',
                background: 'rgba(239, 68, 68, 0.04)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F87171', margin: 0 }}>
                    O que o seu salão está perdendo no Plano {isStarter ? 'Starter' : 'Pro'}?
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Recursos bloqueados que você pode destravar hoje mesmo com o upgrade
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {isStarter && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Limite de Apenas 1 Barbeiro
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Você não consegue cadastrar múltiplos profissionais nem dividir comissões automaticamente entre sua equipe.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Teto de 300 Agendamentos / Mês
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Em meses de grande movimento, novos clientes correm o risco de não conseguir agendar pela sua vitrine web.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Sem Perfis de Equipe (Recepção / Caixa)
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Não é possível conceder acessos restritos para sua recepcionista sem exibir dados confidenciais do salão.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Relatórios de Faturamento Restritos
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Falta de visão aprofundada de quais serviços são mais rentáveis e quais horários trazem mais lucro.
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {isPro && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Limite de 5 Barbeiros
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Se seu salão tiver mais de 5 cadeiras ou novos barbeiros contratados, precisará de vagas adicionais.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Exportação Contábil & Suporte VIP
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          No plano Premium você tem canal de atendimento direto 24/7 e exportação completa para contabilidade.
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Botão de Upgrade Rápido */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FBBF24', fontSize: '0.88rem', fontWeight: 600 }}>
                  <Sparkles size={16} />
                  <span>
                    O upgrade é liberado em instantes e mantém 100% de todo o seu histórico e clientes!
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenCheckout(plans.find((p) => p.slug === (isStarter ? 'pro' : 'premium')) || plans[1])}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span>Fazer Upgrade para {isStarter ? 'Plano Pro' : 'Plano Premium'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ───────────────── CARDS DOS PLANOS (PRICING) ───────────────── */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Tabela Comparativa de Planos</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                Planos flexíveis que acompanham o crescimento da sua barbearia. Escolha o ciclo ideal e economize.
              </p>
            </div>

            {/* Seletor de Ciclo de Cobrança (Mensal / Semestral / Anual) */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px',
                  borderRadius: '14px',
                  background: 'rgba(18, 24, 38, 0.85)',
                  border: '1px solid rgba(229, 179, 56, 0.25)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                }}
              >
                {availableCycles.map((cycle) => {
                  const isActive = billingCycle === cycle;
                  const discountPct = cycle === 'MONTHLY' ? 0 : cyclesCfg[cycle]?.discountPct ?? 0;
                  return (
                    <button
                      key={cycle}
                      type="button"
                      onClick={() => handleChangeCycle(cycle)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isActive
                          ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                          : 'transparent',
                        color: isActive ? '#0B0F17' : 'var(--text-muted)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span>{CYCLE_META[cycle].label}</span>
                      {discountPct > 0 && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: isActive ? 'rgba(0,0,0,0.25)' : 'rgba(16, 185, 129, 0.2)',
                            color: isActive ? '#0B0F17' : '#34D399',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {(() => {
                            const freeText = getCycleFreeMonthsLabel(CYCLE_META[cycle].months, discountPct);
                            return freeText ? `${discountPct}% OFF • ${freeText}` : `${discountPct}% OFF`;
                          })()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
                alignItems: 'stretch',
              }}
            >
              {sortPlansFixed(plans).map((p) => {
                const isCurrent = currentPlanSlug === p.slug.toLowerCase();
                const isProCard = p.slug.toLowerCase() === 'pro';
                const cardCycle = calcCyclePrice(p.priceCents, billingCycle, cyclesCfg);

                return (
                  <div
                    key={p.id}
                    className="glass-panel"
                    style={{
                      padding: '32px 26px',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      background: isCurrent
                        ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.12) 0%, rgba(18, 24, 38, 0.95) 100%)'
                        : isProCard
                        ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(18, 24, 38, 0.9) 100%)'
                        : 'rgba(18, 24, 38, 0.7)',
                      border: isCurrent
                        ? '2px solid var(--primary)'
                        : isProCard
                        ? '1.5px solid rgba(229, 179, 56, 0.4)'
                        : '1px solid var(--border-color)',
                      boxShadow: isCurrent || isProCard ? '0 0 25px rgba(229, 179, 56, 0.15)' : 'none',
                    }}
                  >
                    {/* Badge Superior */}
                    {isCurrent ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                          color: '#0B0F17',
                          padding: '3px 14px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          boxShadow: '0 2px 10px rgba(229, 179, 56, 0.4)',
                        }}
                      >
                        ✓ SEU PLANO ATUAL
                      </div>
                    ) : p.badge ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#10B981',
                          color: '#0B0F17',
                          padding: '3px 14px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {p.badge}
                      </div>
                    ) : null}

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                          {p.name}
                        </h3>
                        {isProCard && <Flame size={20} color="var(--primary)" />}
                      </div>

                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5, minHeight: '40px', marginBottom: '18px' }}>
                        {p.description}
                      </p>

                      <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '2.3rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                            {formatBRL(cardCycle.monthlyEquivalentCents)}
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>/ mês</span>
                        </div>
                        {billingCycle !== 'MONTHLY' ? (
                          <div style={{ marginTop: '6px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                              Cobrado {formatBRL(cardCycle.amountCents)} a cada {cardCycle.months} meses
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#10B981', fontWeight: 700 }}>
                              Economia de {formatBRL(cardCycle.savingsCents)} no ciclo ({cardCycle.discountPct}% OFF
                              {(() => {
                                const free = getCycleFreeMonthsLabel(cardCycle.months, cardCycle.discountPct);
                                return free ? ` • ${free}` : '';
                              })()})
                            </span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                            Sem fidelidade • Cancele quando quiser
                          </span>
                        )}
                      </div>

                      {/* Lista de Recursos */}
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {getPlanFeatures(p).map((feat, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                            <Check size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Botão de Ação */}
                    <div>
                      {isCurrent ? (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckout(p)}
                          className="gold-gradient-primary gold-glow"
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: '#0B0F17',
                            border: 'none',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <CreditCard size={16} />
                          <span>{isTrial ? 'Efetivar Assinatura (Mercado Pago)' : 'Renovar Plano Atual'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenCheckout(p)}
                          className={isProCard ? 'gold-gradient-primary gold-glow' : 'glass-card'}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: isProCard ? '#0B0F17' : 'var(--text-main)',
                            border: !isProCard ? '1px solid var(--border-color)' : undefined,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <span>Mudar para {p.name}</span>
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ───────────────── MARKETPLACE DE ADD-ONS & MÓDULOS EXTRAS ───────────────── */}
          <div id="marketplace-addons" style={{ marginBottom: '48px', scrollMarginTop: '24px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 14px',
                  borderRadius: '20px',
                  background: 'rgba(59, 130, 246, 0.14)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: '#60A5FA',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  marginBottom: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <Sparkles size={14} />
                <span>Marketplace Oficial BarberFlow</span>
              </div>
              <h2 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '8px' }}>
                Marketplace de Add-ons & Módulos Extras
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', maxWidth: '720px', margin: '0 auto' }}>
                Contrate módulos avulsos sob demanda com liberação automática após o pagamento. Os Add-ons contratados à parte são somados à sua fatura mensal e podem ser cancelados individualmente a qualquer momento, mantendo apenas o seu plano.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '20px',
                alignItems: 'stretch',
              }}
            >
              {marketplaceAddons.map((addon) => {
                const currentPlanObj =
                  plans.find((p) => p.slug.toLowerCase() === currentPlanSlug) || null;
                const isIncludedInCurrentPlan =
                  typeof addon.includedInPlan === 'boolean'
                    ? addon.includedInPlan
                    : isAddonIncludedInPlan(currentPlanObj, addon.key);
                const isContracted =
                  Boolean(addon.contracted) ||
                  activeContractedAddons.some((a) => a.key === addon.key);
                const isUnlocked =
                  isIncludedInCurrentPlan ||
                  isContracted ||
                  Boolean((subscription?.limits?.permissions as any)?.[addon.key]);
                const routeHref = getAddonRouteHref(addon.key);

                return (
                  <div
                    key={addon.key}
                    className="glass-panel"
                    style={{
                      padding: '24px',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '18px',
                      background: isContracted
                        ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.1) 0%, rgba(18, 24, 38, 0.95) 100%)'
                        : isIncludedInCurrentPlan
                          ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(18, 24, 38, 0.92) 100%)'
                          : 'rgba(18, 24, 38, 0.78)',
                      border: isContracted
                        ? '1.5px solid rgba(229, 179, 56, 0.45)'
                        : isIncludedInCurrentPlan
                          ? '1.5px solid rgba(16, 185, 129, 0.35)'
                          : '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          marginBottom: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            padding: '3px 9px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {addon.category}
                        </span>

                        {isIncludedInCurrentPlan ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: 'rgba(16, 185, 129, 0.18)',
                              color: '#34D399',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                            }}
                          >
                            ✓ Incluso no Seu Plano
                          </span>
                        ) : isContracted ? (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: 'rgba(229, 179, 56, 0.2)',
                              color: '#FBBF24',
                              border: '1px solid rgba(229, 179, 56, 0.4)',
                            }}
                          >
                            ● Ativo na Sua Fatura
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: '999px',
                              background: 'rgba(59, 130, 246, 0.16)',
                              color: '#60A5FA',
                              border: '1px solid rgba(59, 130, 246, 0.35)',
                            }}
                          >
                            ⚡ Add-on Disponível
                          </span>
                        )}
                      </div>

                      <h3
                        style={{
                          fontSize: '1.18rem',
                          fontWeight: 800,
                          color: 'var(--text-main)',
                          margin: '0 0 8px 0',
                          lineHeight: 1.3,
                        }}
                      >
                        {addon.name}
                      </h3>

                      <p
                        style={{
                          fontSize: '0.84rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.5,
                          margin: '0 0 16px 0',
                        }}
                      >
                        {addon.description}
                      </p>
                    </div>

                    <div>
                      <div
                        style={{
                          paddingTop: '14px',
                          marginBottom: '14px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block' }}>
                            Valor do Add-on à parte
                          </span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <strong style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>
                              {formatBRL(addon.priceCents)}
                            </strong>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>/ mês</span>
                          </div>
                        </div>

                        {isIncludedInCurrentPlan && (
                          <span style={{ fontSize: '0.76rem', color: '#34D399', fontWeight: 700 }}>
                            Grátis no {subscription?.plan?.name}
                          </span>
                        )}
                      </div>

                      {isIncludedInCurrentPlan ? (
                        <Link
                          href={routeHref}
                          style={{
                            width: '100%',
                            padding: '11px 14px',
                            borderRadius: '10px',
                            background: 'rgba(16, 185, 129, 0.14)',
                            border: '1px solid rgba(16, 185, 129, 0.35)',
                            color: '#34D399',
                            fontSize: '0.85rem',
                            fontWeight: 800,
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                        >
                          <CheckCircle2 size={16} />
                          <span>Módulo Liberado • Abrir Agora</span>
                        </Link>
                      ) : isContracted ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <Link
                            href={routeHref}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '10px',
                              background: 'rgba(16, 185, 129, 0.14)',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              color: '#34D399',
                              fontSize: '0.84rem',
                              fontWeight: 800,
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            <CheckCircle2 size={15} />
                            <span>Módulo Ativo • Acessar e Configurar</span>
                          </Link>

                          <button
                            type="button"
                            disabled={cancellingAddonKey === addon.key}
                            onClick={() => handleCancelAddon(addon.key, addon.name)}
                            style={{
                              width: '100%',
                              padding: '9px 12px',
                              borderRadius: '8px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              color: '#F87171',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: cancellingAddonKey === addon.key ? 'wait' : 'pointer',
                            }}
                          >
                            {cancellingAddonKey === addon.key
                              ? 'Cancelando Add-on...'
                              : '✕ Cancelar apenas este Add-on (manter só o plano)'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenAddonCheckout(addon)}
                          className="gold-gradient-primary gold-glow"
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '10px',
                            border: 'none',
                            color: '#0B0F17',
                            fontSize: '0.86rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                          }}
                        >
                          <Zap size={16} />
                          <span>
                            {isUnlocked ? 'Ativar na Fatura' : 'Contratar Agora'} (+ {formatBRL(addon.priceCents)}/mês)
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ───────────────── MATRIZ COMPARATIVA DETALHADA ───────────────── */}
          <div className="glass-panel" style={{ padding: '32px', borderRadius: '16px', marginBottom: '40px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px' }}>
                Matriz Comparativa de Recursos
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Veja em detalhes o que cada plano oferece lado a lado.
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: 'var(--text-dim)', fontWeight: 700, width: '40%' }}>
                      Recurso
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'starter' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Starter {currentPlanSlug === 'starter' && '(Atual)'}
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'pro' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Pro ⭐ {currentPlanSlug === 'pro' && '(Atual)'}
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'premium' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Premium {currentPlanSlug === 'premium' && '(Atual)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_TABLE.map((row, idx) => {
                    const renderCell = (val: string | boolean) => {
                      if (typeof val === 'boolean') {
                        return val ? (
                          <CheckCircle2 size={18} color="#10B981" style={{ margin: '0 auto' }} />
                        ) : (
                          <XCircle size={18} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto' }} />
                        );
                      }
                      return <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{val}</span>;
                    };

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                            {row.name}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                            {row.category}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {renderCell(row.starter)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--primary)', background: 'rgba(229, 179, 56, 0.03)' }}>
                          {renderCell(row.pro)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-main)' }}>
                          {renderCell(row.premium)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ───────────────── HISTÓRICO DE FATURAS & PAGAMENTOS ───────────────── */}
          <div className="glass-panel" style={{ padding: '28px', borderRadius: '16px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={20} color="var(--primary)" />
                  Histórico de Faturas & Pagamentos
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: 0 }}>
                  Acompanhe seus recibos, comprovantes Pix e transações de cartão de crédito Mercado Pago.
                </p>
              </div>

              <button
                type="button"
                onClick={loadBilling}
                disabled={loadingHistory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} className={loadingHistory ? 'spin' : ''} />
                <span>Atualizar Histórico</span>
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Carregando histórico de pagamentos...
              </div>
            ) : paymentHistory.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '12px',
                  border: '1px dashed var(--border-color)',
                }}
              >
                <CreditCard size={32} color="var(--text-dim)" style={{ marginBottom: '8px' }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 6px 0', fontWeight: 600 }}>
                  Nenhum pagamento registrado ainda.
                </p>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  Assim que você efetuar o pagamento via Pix ou Cartão de Crédito, seus comprovantes aparecerão aqui.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 12px' }}>Data</th>
                      <th style={{ padding: '10px 12px' }}>Plano</th>
                      <th style={{ padding: '10px 12px' }}>Método</th>
                      <th style={{ padding: '10px 12px' }}>Valor</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((item) => {
                      const dt = DateTime.fromISO(item.paidAt || item.createdAt).setLocale('pt-BR');
                      const dateStr = dt.isValid ? dt.toFormat('dd/MM/yyyy HH:mm') : '-';
                      const isApproved = item.status === 'APPROVED';
                      const isPending = item.status === 'PENDING';

                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            fontSize: '0.86rem',
                          }}
                        >
                          <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{dateStr}</td>
                          <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                            {item.plan?.name || 'Plano'}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                            {item.method === 'PIX' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <QrCode size={14} color="#10B981" /> Pix
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <CreditCard size={14} color="#60A5FA" />
                                Cartão {item.cardBrand ? `(${item.cardBrand.toUpperCase()}` : ''}
                                {item.cardLastFour ? ` •••• ${item.cardLastFour})` : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                            {formatBRL(item.amountCents)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {isApproved ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  color: '#10B981',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                }}
                              >
                                <CheckCircle2 size={12} /> Aprovado
                              </span>
                            ) : isPending ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(245, 158, 11, 0.15)',
                                  color: '#F59E0B',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                }}
                              >
                                <Clock size={12} /> Pendente
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#EF4444',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                }}
                              >
                                <XCircle size={12} /> {item.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ───────────────── FAQ DE DÚVIDAS SOBRE PLANOS ───────────────── */}
          <div style={{ maxWidth: '820px', margin: '0 auto 40px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <HelpCircle size={24} color="var(--primary)" style={{ marginBottom: '6px' }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Dúvidas Frequentes sobre Assinaturas</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                {
                  q: 'O que acontece com os meus dados e clientes ao fazer o upgrade?',
                  a: 'Absolutamente tudo é mantido! Seu histórico financeiro, cadastros de clientes, serviços e conexões do WhatsApp permanecem intactos. O upgrade apenas libera novos recursos e capacidades na hora.',
                },
                {
                  q: 'Quanto tempo leva para o novo plano ser ativado?',
                  a: 'A ativação é imediata. Assim que o pagamento via Pix ou Cartão é processado pelo Mercado Pago, os limites e recursos são atualizados automaticamente na sua conta.',
                },
                {
                  q: 'Posso cancelar ou trocar de plano a qualquer momento?',
                  a: 'Sim! Não temos contrato de fidelidade nem multas rescisórias. Você tem total liberdade para mudar de plano de acordo com o tamanho e a demanda da sua barbearia.',
                },
                {
                  q: 'Quais as formas de pagamento disponíveis?',
                  a: 'Aceitamos Pix oficial do Mercado Pago (com liberação instantânea e QR Code na tela) e Cartão de Crédito com ativação na hora.',
                },
              ].map((faq, i) => (
                <div
                  key={i}
                  className="glass-card"
                  style={{
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                    {faq.q}
                  </h4>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Modal de Checkout Mercado Pago (Planos ou Add-ons do Marketplace) */}
      {(selectedPlanForCheckout || selectedAddonForCheckout) && (
        <Modal
          isOpen={Boolean(selectedPlanForCheckout || selectedAddonForCheckout)}
          onClose={handleCloseCheckout}
          title={
            selectedAddonForCheckout
              ? `Contratar Add-on • ${selectedAddonForCheckout.shortName || selectedAddonForCheckout.name}`
              : `Assinatura BarberFlow • Plano ${selectedPlanForCheckout?.name}`
          }
          maxWidth="560px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header / Resumo do Plano ou Add-on */}
            <div
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.12) 0%, rgba(18, 24, 38, 0.95) 100%)',
                border: '1px solid rgba(229, 179, 56, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {selectedAddonForCheckout
                    ? 'Add-on do Marketplace • Liberação Automática'
                    : `Plano Selecionado • Ciclo ${CYCLE_META[billingCycle].label}`}
                </span>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '2px 0 0 0', color: 'var(--text-main)' }}>
                  {selectedAddonForCheckout ? selectedAddonForCheckout.name : selectedPlanForCheckout?.name}
                </h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedAddonForCheckout
                    ? 'Liberado imediatamente após confirmação e incluído na sua fatura mensal'
                    : billingCycle === 'MONTHLY'
                      ? '30 dias de acesso com liberação imediata'
                      : `${checkoutCycle?.days || 30} dias de acesso (${checkoutCycle?.months} meses)`}
                </span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {appliedCoupon ? (
                  <>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textDecoration: 'line-through', display: 'block' }}>
                      {formatBRL(checkoutBaseInvoiceCents)}
                    </span>
                    <span style={{ fontSize: '1.45rem', fontWeight: 800, color: '#34D399' }}>
                      {formatBRL(appliedCoupon.finalAmountCents)}
                    </span>
                  </>
                ) : checkoutCycle && checkoutCycle.discountPct > 0 ? (
                  <>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textDecoration: 'line-through', display: 'block' }}>
                      {formatBRL(checkoutCycle.grossCents + checkoutAddonsCycleCents)}
                    </span>
                    <span style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {formatBRL(checkoutAmountCents)}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--primary)' }}>
                    {formatBRL(checkoutAmountCents)}
                  </span>
                )}
                <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', display: 'block' }}>
                  {selectedAddonForCheckout
                    ? '/ mês'
                    : billingCycle === 'MONTHLY'
                      ? '/ mês'
                      : `total (${CYCLE_META[billingCycle].period})`}
                </span>
              </div>
            </div>

            {/* Demonstrativo Detalhado da Fatura (Plano + Add-ons) */}
            {selectedAddonForCheckout ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  fontSize: '0.83rem',
                }}
              >
                <div style={{ fontWeight: 800, color: '#60A5FA', marginBottom: '8px', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  🧾 Como ficará sua Fatura Mensal após contratar este Add-on:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Plano: {subscription?.plan?.name || 'Starter'}</span>
                    <span>{formatBRL(subscription?.plan?.priceCents || 4990)}</span>
                  </div>
                  {activeContractedAddons
                    .filter((a) => a.key !== selectedAddonForCheckout.key)
                    .map((a) => (
                      <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>Addon ativo: {a.name}</span>
                        <span>{formatBRL(a.priceCents)}</span>
                      </div>
                    ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#FBBF24', fontWeight: 700 }}>
                    <span>+ Addon: {selectedAddonForCheckout.name}</span>
                    <span>{formatBRL(selectedAddonForCheckout.priceCents)}</span>
                  </div>
                  <div
                    style={{
                      marginTop: '4px',
                      paddingTop: '6px',
                      borderTop: '1px dashed rgba(255, 255, 255, 0.14)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontWeight: 800,
                      color: '#F8FAFC',
                    }}
                  >
                    <span>Total nas próximas faturas mensais:</span>
                    <span style={{ color: '#34D399' }}>
                      {formatBRL(
                        (subscription?.plan?.priceCents || 4990) +
                          activeContractedAddons
                            .filter((a) => a.key !== selectedAddonForCheckout.key)
                            .reduce((s, a) => s + a.priceCents, 0) +
                          selectedAddonForCheckout.priceCents,
                      )}
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  💡 Hoje você pagará apenas <strong>{formatBRL(checkoutAmountCents)}</strong> para ativar o Add-on imediatamente. Você pode cancelar somente o Add-on quando quiser.
                </div>
              </div>
            ) : (
              selectedPlanForCheckout &&
              checkoutBillableAddons.length > 0 && (
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    fontSize: '0.84rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--primary)', marginBottom: '8px', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                    🧾 Composição da Sua Fatura (Plano + Add-ons Contratados)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-main)' }}>
                      <span>
                        Plano: <strong>{selectedPlanForCheckout.name}</strong>
                        {checkoutCycle && checkoutCycle.months > 1 ? ` (${checkoutCycle.months} meses)` : ''}
                      </span>
                      <strong>{formatBRL(checkoutCycle?.amountCents || selectedPlanForCheckout.priceCents)}</strong>
                    </div>
                    {checkoutBillableAddons.map((addon) => (
                      <div
                        key={addon.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          flexWrap: 'wrap',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          background: 'rgba(229, 179, 56, 0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: '#FBBF24' }}>
                            Addon: <strong>{addon.name}</strong>
                          </span>
                          <button
                            type="button"
                            disabled={cancellingAddonKey === addon.key}
                            onClick={() => handleCancelAddon(addon.key, addon.name)}
                            style={{
                              padding: '2px 7px',
                              borderRadius: '5px',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: 'rgba(239, 68, 68, 0.16)',
                              color: '#F87171',
                              border: '1px solid rgba(239, 68, 68, 0.35)',
                              cursor: cancellingAddonKey === addon.key ? 'wait' : 'pointer',
                            }}
                          >
                            {cancellingAddonKey === addon.key ? 'Cancelando...' : '✕ Cancelar Add-on'}
                          </button>
                        </div>
                        <strong style={{ color: '#FBBF24' }}>
                          {formatBRL(addon.priceCents * (checkoutCycle?.months || 1))}
                        </strong>
                      </div>
                    ))}
                    <div
                      style={{
                        marginTop: '4px',
                        paddingTop: '6px',
                        borderTop: '1px dashed rgba(255, 255, 255, 0.14)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 800,
                        fontSize: '0.94rem',
                      }}
                    >
                      <span style={{ color: '#F8FAFC' }}>Total:</span>
                      <span style={{ color: '#34D399' }}>{formatBRL(checkoutAmountCents)}</span>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Seletor Rápido de Ciclo no Modal (apenas para Checkout de Plano) */}
            {selectedPlanForCheckout && (
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                  Escolha o Ciclo de Cobrança:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${availableCycles.length}, 1fr)`, gap: '8px' }}>
                  {availableCycles.map((cycle) => {
                    const isActive = billingCycle === cycle;
                    const optPrice = calcCyclePrice(selectedPlanForCheckout.priceCents, cycle, cyclesCfg);
                    return (
                      <button
                        key={cycle}
                        type="button"
                        onClick={() => handleChangeCycle(cycle)}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '10px',
                          border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                          background: isActive ? 'rgba(229, 179, 56, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                          color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{CYCLE_META[cycle].label}</div>
                        <div style={{ fontSize: '0.74rem', marginTop: '2px', color: isActive ? '#F8FAFC' : 'var(--text-dim)' }}>
                          {formatBRL(optPrice.monthlyEquivalentCents)}/mês
                        </div>
                        {optPrice.discountPct > 0 && (
                          <span
                            style={{
                              display: 'inline-block',
                              marginTop: '4px',
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: isActive ? 'var(--primary)' : 'rgba(16, 185, 129, 0.2)',
                              color: isActive ? '#0B0F17' : '#34D399',
                            }}
                          >
                            {optPrice.discountPct}% OFF
                            {(() => {
                              const free = getCycleFreeMonthsLabel(CYCLE_META[cycle].months, optPrice.discountPct);
                              return free ? ` • ${free}` : '';
                            })()}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bloco de Cupom de Desconto */}
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                background: appliedCoupon ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                border: appliedCoupon
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : '1px solid var(--border-color)',
              }}
            >
              {appliedCoupon ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={16} color="#34D399" />
                    <div>
                      <strong style={{ fontSize: '0.88rem', color: '#34D399', letterSpacing: '0.04em' }}>
                        {appliedCoupon.code}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        (-{formatBRL(appliedCoupon.discountCents)} de economia)
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#EF4444',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Remover Cupom
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Tag
                      size={15}
                      color="var(--text-dim)"
                      style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                    <input
                      type="text"
                      placeholder="Possui cupom de desconto?"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleValidateCoupon();
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 10px 8px 32px',
                        borderRadius: '6px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.82rem',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleValidateCoupon}
                    disabled={validatingCoupon || !couponInput.trim()}
                    className="glass-card"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--primary)',
                      borderColor: 'rgba(229, 179, 56, 0.35)',
                      cursor: validatingCoupon || !couponInput.trim() ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {validatingCoupon ? 'Validando...' : 'Aplicar'}
                  </button>
                </div>
              )}
            </div>

            {/* Seletor de Modo de Renovação (Auto-Renew vs. Manual) no Checkout (apenas Plano) */}
            {selectedPlanForCheckout && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
                  Preferência de Renovação dos Próximos Ciclos:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setCheckoutAutoRenew(true)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: checkoutAutoRenew ? '1.5px solid #10B981' : '1px solid var(--border-color)',
                      background: checkoutAutoRenew ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: checkoutAutoRenew ? '#34D399' : 'var(--text-main)' }}>
                      <RefreshCw size={13} /> Renovação Automática
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      Gera e envia a renovação automaticamente no vencimento.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCheckoutAutoRenew(false)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: !checkoutAutoRenew ? '1.5px solid #F59E0B' : '1px solid var(--border-color)',
                      background: !checkoutAutoRenew ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: !checkoutAutoRenew ? '#FBBF24' : 'var(--text-main)' }}>
                      <Calendar size={13} /> Renovação Manual
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                      Você recebe os avisos (D-3, D0, D+2) e escolhe quando renovar.
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Abas de Método de Pagamento */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '4px',
                borderRadius: '10px',
              }}
            >
              <button
                type="button"
                onClick={() => setPaymentMethod('PIX')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: paymentMethod === 'PIX' ? 'var(--primary)' : 'transparent',
                  color: paymentMethod === 'PIX' ? '#0B0F17' : 'var(--text-muted)',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <QrCode size={16} />
                <span>Pix Instantâneo</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('CREDIT_CARD')}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: paymentMethod === 'CREDIT_CARD' ? 'var(--primary)' : 'transparent',
                  color: paymentMethod === 'CREDIT_CARD' ? '#0B0F17' : 'var(--text-muted)',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <CreditCard size={16} />
                <span>Cartão de Crédito</span>
              </button>
            </div>

            {/* Conteúdo da Aba PIX */}
            {paymentMethod === 'PIX' && (
              <div>
                {pixPaidSuccess ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '30px 20px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderRadius: '12px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <CheckCircle2 size={54} color="#10B981" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10B981', margin: '0 0 6px 0' }}>
                      Pagamento Pix Confirmado!
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 20px 0' }}>
                      {selectedAddonForCheckout ? (
                        <>
                          O Add-on <strong>{selectedAddonForCheckout.name}</strong> foi ativado e já está liberado para o seu salão!
                        </>
                      ) : (
                        <>
                          O plano <strong>{selectedPlanForCheckout?.name}</strong> foi ativado para o seu salão. Todos os recursos já estão disponíveis.
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={handleCloseCheckout}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        padding: '10px 24px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Concluir e Voltar
                    </button>
                  </div>
                ) : pixResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                    <div
                      style={{
                        background: '#FFFFFF',
                        padding: '16px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      {pixResult.qrCodeBase64 ? (
                        <img
                          src={`data:image/png;base64,${pixResult.qrCodeBase64}`}
                          alt="QR Code Pix"
                          style={{ width: '200px', height: '200px', display: 'block' }}
                        />
                      ) : (
                        <div style={{ width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '0.8rem', textAlign: 'center' }}>
                          Abra o app do seu banco e use o Copia e Cola abaixo
                        </div>
                      )}
                    </div>

                    <div style={{ width: '100%' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        Código Pix Copia e Cola:
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          readOnly
                          value={pixResult.qrCode || ''}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-main)',
                            fontSize: '0.8rem',
                            fontFamily: 'monospace',
                          }}
                        />
                        <button
                          type="button"
                          onClick={copyPixCode}
                          className="gold-gradient-primary"
                          style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.84rem',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Copy size={14} />
                          <span>Copiar</span>
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        fontSize: '0.82rem',
                        color: '#F59E0B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Clock size={16} className="spin" />
                      <span>Aguardando pagamento... Verificando a cada 3 segundos automaticamente.</span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'space-between' }}>
                      <button
                        type="button"
                        onClick={() => setPixResult(null)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '8px',
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-muted)',
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                        }}
                      >
                        Gerar Outro Pix
                      </button>

                      <button
                        type="button"
                        onClick={handleCheckPixManual}
                        disabled={checkingPix}
                        className="glass-card"
                        style={{
                          padding: '10px 16px',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <RefreshCw size={14} className={checkingPix ? 'spin' : ''} />
                        <span>{checkingPix ? 'Verificando...' : 'Já paguei, verificar agora'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        CPF ou CNPJ do Pagador (Opcional para emissão do Pix):
                      </label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={pixCpf}
                        onChange={(e) => setPixCpf(formatCpf(e.target.value))}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          fontSize: '0.9rem',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontSize: '0.82rem',
                        color: 'var(--text-main)',
                        lineHeight: 1.5,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 700, marginBottom: '4px' }}>
                        <Zap size={15} /> Liberação Instantânea via Mercado Pago
                      </div>
                      O QR Code Pix e a chave Copia e Cola serão gerados na hora. Assim que pagar no aplicativo do seu banco, o sistema reconhece e libera o acesso automaticamente em segundos.
                    </div>

                    <button
                      type="button"
                      onClick={handleGeneratePix}
                      disabled={generatingPix}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        border: 'none',
                        cursor: generatingPix ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '6px',
                      }}
                    >
                      {generatingPix ? (
                        <>
                          <RefreshCw size={16} className="spin" />
                          <span>Gerando Cobrança Pix no Mercado Pago...</span>
                        </>
                      ) : (
                        <>
                          <QrCode size={18} />
                          <span>
                            Gerar QR Code Pix ({formatBRL(checkoutAmountCents)})
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Conteúdo da Aba Cartão de Crédito */}
            {paymentMethod === 'CREDIT_CARD' && (
              <div>
                {cardPaidSuccess ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '30px 20px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      borderRadius: '12px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <CheckCircle2 size={54} color="#10B981" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10B981', margin: '0 0 6px 0' }}>
                      Pagamento com Cartão Aprovado!
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 20px 0' }}>
                      {selectedAddonForCheckout ? (
                        <>
                          O Add-on <strong>{selectedAddonForCheckout.name}</strong> foi ativado e já está liberado para uso!
                        </>
                      ) : (
                        <>
                          Sua assinatura do plano <strong>{selectedPlanForCheckout?.name}</strong> foi ativada com sucesso.
                        </>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={handleCloseCheckout}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        padding: '10px 24px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Concluir e Voltar
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePayCard} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Número do Cartão de Crédito *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          required
                          placeholder="0000 0000 0000 0000"
                          maxLength={19}
                          value={cardForm.cardNumber}
                          onChange={(e) => setCardForm({ ...cardForm, cardNumber: formatCardNumber(e.target.value) })}
                          style={{
                            width: '100%',
                            padding: '11px 40px 11px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            letterSpacing: '0.04em',
                          }}
                        />
                        <CreditCard
                          size={18}
                          color="var(--text-dim)"
                          style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        Nome Impresso no Cartão *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="NOME COMO ESTÁ NO CARTÃO"
                        value={cardForm.cardholderName}
                        onChange={(e) => setCardForm({ ...cardForm, cardholderName: e.target.value.toUpperCase() })}
                        style={{
                          width: '100%',
                          padding: '11px 12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          fontSize: '0.9rem',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        CPF ou CNPJ do Titular *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="000.000.000-00"
                        value={cardForm.cardholderCpf}
                        onChange={(e) => setCardForm({ ...cardForm, cardholderCpf: formatCpf(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '11px 12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-main)',
                          fontSize: '0.9rem',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Validade *
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <Select
                            value={cardForm.expMonth}
                            onChange={(e) => setCardForm({ ...cardForm, expMonth: e.target.value })}
                            placeholder="Mês"
                          >
                            {EXPIRATION_MONTHS.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={cardForm.expYear}
                            onChange={(e) => setCardForm({ ...cardForm, expYear: e.target.value })}
                            placeholder="Ano"
                          >
                            {EXPIRATION_YEARS.map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          CVV *
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="123"
                          maxLength={4}
                          value={cardForm.cvv}
                          onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          style={{
                            width: '100%',
                            padding: '11px 10px',
                            textAlign: 'center',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-main)',
                            fontSize: '0.9rem',
                            letterSpacing: '0.15em',
                          }}
                        />
                      </div>
                    </div>

                    {/* Seletor de Parcelamento no Cartão (apenas para Planos) */}
                    {selectedPlanForCheckout && (
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Opções de Parcelamento *
                        </label>
                        <Select
                          value={String(installments)}
                          onChange={(e) => setInstallments(Number(e.target.value))}
                        >
                          {Array.from({ length: checkoutCycle?.maxInstallments || 1 }, (_, i) => i + 1).map((n) => {
                            const parcelCents = Math.round(checkoutAmountCents / n);
                            return (
                              <option key={n} value={n}>
                                {n}x de {formatBRL(parcelCents)} {n === 1 ? 'à vista' : 'sem juros'}
                              </option>
                            );
                          })}
                        </Select>
                        {checkoutCycle && checkoutCycle.maxInstallments > 1 && (
                          <span style={{ fontSize: '0.73rem', color: '#10B981', display: 'block', marginTop: '4px' }}>
                            ✓ Parcelamento em até {checkoutCycle.maxInstallments}x sem juros no ciclo {checkoutCycle.label}
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      <Lock size={14} color="#10B981" />
                      <span>Transação segura de ponta a ponta criptografada pelo Mercado Pago.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={processingCard}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '0.95rem',
                        border: 'none',
                        cursor: processingCard ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      {processingCard ? (
                        <>
                          <RefreshCw size={16} className="spin" />
                          <span>Processando Cartão com Mercado Pago...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={18} />
                          <span>
                            Pagar {formatBRL(checkoutAmountCents)}
                            {selectedPlanForCheckout && installments > 1
                              ? ` em ${installments}x de ${formatBRL(Math.round(checkoutAmountCents / installments))}`
                              : ''}{' '}
                            com Cartão
                          </span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
