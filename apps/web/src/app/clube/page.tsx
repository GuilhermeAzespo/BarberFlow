'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Crown,
  Sparkles,
  Users,
  DollarSign,
  Calendar,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Scissors,
  Check,
  Trash2,
  Edit2,
  Layers,
  MessageCircle,
  Zap,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useAuth } from '../../lib/auth-context';
import { api } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { DateTime } from 'luxon';

interface ClubStats {
  activeSubscribers: number;
  totalSubscribers: number;
  mrrCents: number;
  usagesThisMonth: number;
  expiringIn7Days: number;
  totalPlans: number;
}

interface ServiceItem {
  id: string;
  name: string;
  priceCents: number;
  durationMinutes: number;
}

interface ClubPlan {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  maxUsagesPerMonth: number | null;
  allowedDaysOfWeek: number[];
  isActive: boolean;
  createdAt: string;
  services: {
    serviceId: string;
    service: ServiceItem;
  }[];
  _count?: {
    subscriptions: number;
  };
}

interface CustomerSubscriber {
  id: string;
  tenantId: string;
  customerId: string;
  planId: string;
  status: 'ACTIVE' | 'PENDING_PAYMENT' | 'CANCELED' | 'EXPIRED';
  cycleStartDate: string;
  cycleEndDate: string;
  usagesCount: number;
  paymentMethod: string | null;
  lastPaymentDate: string | null;
  autoRenew: boolean;
  notes: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    whatsappJid: string | null;
  };
  plan: ClubPlan;
}

interface ClubUsageItem {
  id: string;
  customerId: string;
  serviceId: string;
  appointmentId: string | null;
  usedAt: string;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
  };
  service: {
    id: string;
    name: string;
  };
}

const WEEKDAYS = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const SUGGESTED_PLAN_PRESETS = [
  {
    name: 'Corte Ilimitado VIP',
    priceStr: '99,90',
    isUnlimitedUsages: true,
    maxUsagesPerMonth: 4,
    allowedDaysOfWeek: [1, 2, 3, 4, 5, 6],
    description: 'Corte de cabelo ilimitado durante todo o mês. Uso pessoal e intransferível.',
    tag: 'Mais Vendido',
  },
  {
    name: 'Combo Corte & Barba VIP',
    priceStr: '149,90',
    isUnlimitedUsages: true,
    maxUsagesPerMonth: 4,
    allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    description: 'Cabelo e barba sempre alinhados sem limite de visitas no mês.',
    tag: 'Ticket Alto',
  },
  {
    name: 'Clube 4 Cortes no Mês',
    priceStr: '89,90',
    isUnlimitedUsages: false,
    maxUsagesPerMonth: 4,
    allowedDaysOfWeek: [1, 2, 3, 4],
    description: 'Até 4 cortes por mês de segunda a quinta-feira com desconto exclusivo.',
    tag: 'Econômico',
  },
];

export default function ClubManagementPage() {
  const { hasPlanFeature } = useAuth();
  const { toast, confirm } = useToast();

  const [activeTab, setActiveTab] = useState<'subscribers' | 'plans' | 'usages'>('subscribers');
  const [, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  // KPIs
  const [stats, setStats] = useState<ClubStats | null>(null);

  // Assinantes
  const [subscribers, setSubscribers] = useState<CustomerSubscriber[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [subStatus, setSubStatus] = useState<string>('ALL');
  const [subPage, setSubPage] = useState(1);
  const [, setSubTotalPages] = useState(1);

  // Planos
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceItem[]>([]);

  // Utilizações
  const [usages, setUsages] = useState<ClubUsageItem[]>([]);
  const [usagePage, setUsagePage] = useState(1);
  const [, setUsageTotalPages] = useState(1);

  // Modal Novo/Editar Plano
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ClubPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    priceStr: '',
    isUnlimitedUsages: true,
    maxUsagesPerMonth: 4,
    allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    serviceIds: [] as string[],
    isActive: true,
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Modal Novo Assinante
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [availableCustomers, setAvailableCustomers] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newSubForm, setNewSubForm] = useState({
    customerId: '',
    planId: '',
    paymentMethod: 'PIX',
    cycleDays: 30,
    autoRenew: true,
    notes: '',
  });
  const [savingSub, setSavingSub] = useState(false);
  const [togglingSubId, setTogglingSubId] = useState<string | null>(null);
  const [runningBotWarnings, setRunningBotWarnings] = useState(false);

  // Modal Renovar Assinatura
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewingSub, setRenewingSub] = useState<CustomerSubscriber | null>(null);
  const [renewPaymentMethod, setRenewPaymentMethod] = useState('PIX');
  const [processingRenew, setProcessingRenew] = useState(false);

  // Carregamento de dados inicial
  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, plansRes, servicesRes] = await Promise.all([
        api.get<ClubStats>('/api/club/stats'),
        api.get<{ plans: ClubPlan[] }>('/api/club/plans?includeInactive=true'),
        api.get<{ services: ServiceItem[] }>('/api/services?active=true'),
      ]);

      setStats(statsRes);
      setPlans(plansRes.plans);
      setAvailableServices(servicesRes.services);

      await loadSubscribers(1, subSearch, subStatus);
    } catch (err: any) {
      console.error('Erro ao carregar dados do Clube:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscribers = async (page = 1, search = '', status = 'ALL') => {
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: '15',
      });
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'ALL') q.set('status', status);

      const res = await api.get<{
        subscriptions: CustomerSubscriber[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/club/subscriptions?${q.toString()}`);

      setSubscribers(res.subscriptions);
      setSubPage(res.page);
      setSubTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error('Erro ao listar assinantes:', err);
    }
  };

  const loadUsages = async (page = 1) => {
    try {
      const res = await api.get<{
        usages: ClubUsageItem[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/club/usages?page=${page}&pageSize=15`);

      setUsages(res.usages);
      setUsagePage(res.page);
      setUsageTotalPages(res.totalPages || 1);
    } catch (err: any) {
      console.error('Erro ao carregar utilizações:', err);
    }
  };

  const loadCustomersForModal = async () => {
    try {
      const res = await api.get<{ customers: { id: string; name: string; phone: string | null }[] }>(
        '/api/customers?pageSize=100',
      );
      setAvailableCustomers(res.customers || []);
    } catch (err) {
      console.error('Erro ao buscar clientes:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'usages') {
      loadUsages(1);
    }
  }, [activeTab]);

  // Ações de Planos
  const handleOpenPlanModal = (plan?: ClubPlan, preset?: (typeof SUGGESTED_PLAN_PRESETS)[number]) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name,
        description: plan.description || '',
        priceStr: (plan.priceCents / 100).toFixed(2).replace('.', ','),
        isUnlimitedUsages: plan.maxUsagesPerMonth === null,
        maxUsagesPerMonth: plan.maxUsagesPerMonth || 4,
        allowedDaysOfWeek:
          plan.allowedDaysOfWeek && plan.allowedDaysOfWeek.length > 0
            ? plan.allowedDaysOfWeek
            : [0, 1, 2, 3, 4, 5, 6],
        serviceIds: plan.services.map((s) => s.serviceId),
        isActive: plan.isActive,
      });
    } else if (preset) {
      setEditingPlan(null);
      setPlanForm({
        name: preset.name,
        description: preset.description,
        priceStr: preset.priceStr,
        isUnlimitedUsages: preset.isUnlimitedUsages,
        maxUsagesPerMonth: preset.maxUsagesPerMonth,
        allowedDaysOfWeek: preset.allowedDaysOfWeek,
        serviceIds: availableServices.map((s) => s.id),
        isActive: true,
      });
    } else {
      setEditingPlan(null);
      setPlanForm({
        name: '',
        description: '',
        priceStr: '99,90',
        isUnlimitedUsages: true,
        maxUsagesPerMonth: 4,
        allowedDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        serviceIds: availableServices.map((s) => s.id),
        isActive: true,
      });
    }
    setPlanModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planForm.name.trim()) {
      toast.warning('Informe o nome do plano');
      return;
    }
    const cleanPrice = parseFloat(planForm.priceStr.replace(',', '.'));
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      toast.warning('Informe um valor mensal válido');
      return;
    }
    if (planForm.serviceIds.length === 0) {
      toast.warning('Selecione ao menos um serviço incluso no plano');
      return;
    }

    try {
      setSavingPlan(true);
      const payload = {
        name: planForm.name.trim(),
        description: planForm.description.trim() || null,
        priceCents: Math.round(cleanPrice * 100),
        maxUsagesPerMonth: planForm.isUnlimitedUsages ? null : planForm.maxUsagesPerMonth,
        allowedDaysOfWeek: planForm.allowedDaysOfWeek,
        serviceIds: planForm.serviceIds,
        isActive: planForm.isActive,
      };

      if (editingPlan) {
        await api.put(`/api/club/plans/${editingPlan.id}`, payload);
        toast.success('Plano do clube atualizado com sucesso!');
      } else {
        await api.post('/api/club/plans', payload);
        toast.success('Novo plano do clube criado com sucesso!');
      }

      setPlanModalOpen(false);
      const [plansRes, statsRes] = await Promise.all([
        api.get<{ plans: ClubPlan[] }>('/api/club/plans?includeInactive=true'),
        api.get<ClubStats>('/api/club/stats'),
      ]);
      setPlans(plansRes.plans);
      setStats(statsRes);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar plano');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = async (plan: ClubPlan) => {
    const ok = await confirm({
      title: 'Desativar ou Excluir Plano',
      message: `Deseja realmente desativar ou excluir o plano "${plan.name}"? Se houver assinantes ativos nele, o plano será mantido como inativo para não quebrar os contratos vigentes.`,
      danger: true,
      confirmText: 'Confirmar',
      cancelText: 'Voltar',
    });
    if (!ok) return;

    try {
      await api.delete(`/api/club/plans/${plan.id}`);
      toast.success('Plano removido ou desativado com sucesso!');
      const [plansRes, statsRes] = await Promise.all([
        api.get<{ plans: ClubPlan[] }>('/api/club/plans?includeInactive=true'),
        api.get<ClubStats>('/api/club/stats'),
      ]);
      setPlans(plansRes.plans);
      setStats(statsRes);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover plano');
    }
  };

  // Ações de Assinantes
  const handleOpenNewSubModal = async () => {
    if (plans.filter((p) => p.isActive).length === 0) {
      toast.warning('Crie ao menos um plano ativo antes de cadastrar assinantes.');
      setActiveTab('plans');
      handleOpenPlanModal();
      return;
    }
    await loadCustomersForModal();
    setNewSubForm({
      customerId: '',
      planId: plans.find((p) => p.isActive)?.id || '',
      paymentMethod: 'PIX',
      cycleDays: 30,
      autoRenew: true,
      notes: '',
    });
    setSubModalOpen(true);
  };

  const handleToggleAutoRenew = async (sub: CustomerSubscriber) => {
    const nextValue = !sub.autoRenew;
    try {
      setTogglingSubId(sub.id);
      const res = await api.patch<{ subscription: CustomerSubscriber; message: string }>(
        `/api/club/subscriptions/${sub.id}/auto-renew`,
        { autoRenew: nextValue },
      );
      setSubscribers((prev) =>
        prev.map((item) => (item.id === sub.id ? { ...item, autoRenew: nextValue } : item)),
      );
      toast.success(
        res.message ||
          (nextValue
            ? `Auto-Renew ativado para ${sub.customer?.name}!`
            : `Renovação alterada para Manual para ${sub.customer?.name}.`),
      );
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao alterar modo de renovação');
    } finally {
      setTogglingSubId(null);
    }
  };

  const handleRunBotWarnings = async () => {
    try {
      setRunningBotWarnings(true);
      const res = await api.post<{
        checkedCount: number;
        messagesSent: number;
        autoRenewedCount: number;
        expiredCount: number;
        message: string;
      }>('/api/club/bot-warnings/run', {});
      toast.success(
        res.message ||
          `Verificação concluída: ${res.messagesSent} aviso(s) enviado(s) pelo Bot (${res.autoRenewedCount} auto-renovada(s)).`,
      );
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao executar avisos do Bot');
    } finally {
      setRunningBotWarnings(false);
    }
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubForm.customerId) {
      toast.warning('Selecione o cliente assinante');
      return;
    }
    if (!newSubForm.planId) {
      toast.warning('Selecione o plano do clube');
      return;
    }

    try {
      setSavingSub(true);
      await api.post('/api/club/subscriptions', newSubForm);
      toast.success('Cliente cadastrado no Clube VIP com sucesso!');
      setSubModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cadastrar assinante');
    } finally {
      setSavingSub(false);
    }
  };

  const handleOpenRenewModal = (sub: CustomerSubscriber) => {
    setRenewingSub(sub);
    setRenewPaymentMethod(sub.paymentMethod || 'PIX');
    setRenewModalOpen(true);
  };

  const handleProcessRenew = async () => {
    if (!renewingSub) return;
    try {
      setProcessingRenew(true);
      await api.post(`/api/club/subscriptions/${renewingSub.id}/renew`, {
        paymentMethod: renewPaymentMethod,
      });
      toast.success(`Ciclo renovado para ${renewingSub.customer.name}! +30 dias adicionados.`);
      setRenewModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao renovar assinatura');
    } finally {
      setProcessingRenew(false);
    }
  };

  const handleCancelSub = async (sub: CustomerSubscriber) => {
    const ok = await confirm({
      title: 'Cancelar Assinatura VIP',
      message: `Deseja realmente cancelar a assinatura VIP de "${sub.customer.name}"? O cliente perderá a cobertura do clube imediatamente.`,
      danger: true,
      confirmText: 'Cancelar Assinatura',
      cancelText: 'Voltar',
    });
    if (!ok) return;

    try {
      await api.post(`/api/club/subscriptions/${sub.id}/cancel`, {
        notes: 'Cancelado manualmente pela recepção',
      });
      toast.info('Assinatura cancelada com sucesso.');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao cancelar assinatura');
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDaysOfWeek = (days: number[]) => {
    if (!days || days.length === 0 || days.length === 7) return 'Todos os dias';
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return [...days].sort().map((d) => dayNames[d]).join(', ');
  };

  const getStatusBadge = (sub: CustomerSubscriber) => {
    const now = DateTime.now();
    const end = DateTime.fromISO(sub.cycleEndDate);
    const daysLeft = Math.ceil(end.diff(now, 'days').days);
    const isLifetime = end.diff(now, 'years').years > 10;

    if (sub.status === 'CANCELED') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.14)',
            color: '#F87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <XCircle size={12} /> Cancelado
        </span>
      );
    }

    if (sub.status === 'EXPIRED' || daysLeft < 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.14)',
            color: '#F87171',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <Clock size={12} /> Expirado
        </span>
      );
    }

    if (isLifetime) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(229, 179, 56, 0.18)',
            color: '#E5B338',
            border: '1px solid rgba(229, 179, 56, 0.4)',
          }}
        >
          ♾️ Vitalícia
        </span>
      );
    }

    if (daysLeft <= 7) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(245, 158, 11, 0.14)',
            color: '#FBBF24',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <AlertTriangle size={12} /> Vence em {daysLeft} dia{daysLeft === 1 ? '' : 's'}
        </span>
      );
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '0.74rem',
          fontWeight: 700,
          background: 'rgba(16, 185, 129, 0.14)',
          color: '#34D399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        <CheckCircle2 size={12} /> Ativo ({daysLeft}d)
      </span>
    );
  };

  const hasAccess = hasPlanFeature('club');
  const activePlansCount = plans.filter((p) => p.isActive).length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <Header />

        <div style={{ padding: '28px 32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Top Title Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '26px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.22) 0%, rgba(229, 179, 56, 0.06) 100%)',
                    border: '1px solid rgba(229, 179, 56, 0.38)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(229, 179, 56, 0.15)',
                  }}
                >
                  <Crown size={22} color="#E5B338" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h1
                      style={{
                        fontSize: '1.6rem',
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: 'var(--text-main)',
                        margin: 0,
                      }}
                    >
                      Clube de Assinatura VIP
                    </h1>
                    <span
                      style={{
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: activePlansCount > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(229, 179, 56, 0.15)',
                        color: activePlansCount > 0 ? '#34D399' : '#E5B338',
                        border:
                          activePlansCount > 0
                            ? '1px solid rgba(16, 185, 129, 0.32)'
                            : '1px solid rgba(229, 179, 56, 0.35)',
                      }}
                    >
                      {activePlansCount > 0 ? `● ${activePlansCount} Plano(s) Ativo(s)` : '★ Receita Recorrente'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                    Crie planos mensais de corte ou barba ilimitada e gere receita recorrente previsível (MRR)
                  </p>
                </div>
              </div>
            </div>

            {hasAccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={runningBotWarnings}
                  onClick={handleRunBotWarnings}
                  title="Executa a régua de avisos D-3, D0 e D+2 no WhatsApp conforme a opção Auto-Renew de cada cliente"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.38)',
                    color: '#34D399',
                    cursor: runningBotWarnings ? 'wait' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <MessageCircle size={16} />
                  <span>{runningBotWarnings ? 'Disparando Bot...' : 'Verificar & Avisar via Bot'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenPlanModal()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(229, 179, 56, 0.12)',
                    border: '1px solid rgba(229, 179, 56, 0.4)',
                    color: '#E5B338',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Plus size={16} />
                  <span>Novo Plano VIP</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenNewSubModal}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    padding: '10px 18px',
                    borderRadius: '10px',
                  }}
                >
                  <Crown size={16} />
                  <span>Adicionar Assinante</span>
                </button>
              </div>
            )}
          </div>

          {/* Feature Gate Banner */}
          {!hasAccess && (
            <div
              className="glass-panel"
              style={{
                padding: '24px 28px',
                borderRadius: '16px',
                marginBottom: '26px',
                background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.1) 0%, rgba(18, 24, 38, 0.95) 100%)',
                border: '1px solid rgba(229, 179, 56, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '20px',
              }}
            >
              <div style={{ maxWidth: '780px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Crown size={20} color="#E5B338" />
                  <span
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      background: 'rgba(229, 179, 56, 0.2)',
                      color: '#E5B338',
                      padding: '3px 10px',
                      borderRadius: '999px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Recurso Premium & Pro
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                  Fidelize clientes e garanta caixa todo mês com o Clube de Assinatura
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  Barbearias de alta performance faturam até 40% a mais vendendo planos mensais (ex: Corte Ilimitado por R$ 99,90/mês). O BarberFlow valida os agendamentos, abate os usos automaticamente e avisa pelo WhatsApp.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link
                  href="/planos"
                  className="gold-gradient-primary gold-glow"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '11px 20px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    borderRadius: '10px',
                    textDecoration: 'none',
                  }}
                >
                  <Sparkles size={16} /> Liberar Clube VIP
                </Link>
              </div>
            </div>
          )}

          {/* Cards de Métricas / KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '16px',
              marginBottom: '26px',
            }}
          >
            {/* KPI 1: Assinantes Ativos */}
            <div
              className="glass-panel"
              style={{
                padding: '20px 22px',
                borderRadius: '14px',
                borderTop: '2px solid rgba(229, 179, 56, 0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Assinantes Ativos</span>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(229, 179, 56, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Crown size={17} color="#E5B338" />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {stats?.activeSubscribers || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                {stats?.totalSubscribers || 0} cadastrados no histórico
              </div>
            </div>

            {/* KPI 2: MRR Recorrente */}
            <div
              className="glass-panel"
              style={{
                padding: '20px 22px',
                borderRadius: '14px',
                borderTop: '2px solid rgba(16, 185, 129, 0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>MRR do Clube</span>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(16, 185, 129, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <DollarSign size={17} color="#34D399" />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#34D399', letterSpacing: '-0.02em' }}>
                {formatPrice(stats?.mrrCents || 0)}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Receita previsível mensal
              </div>
            </div>

            {/* KPI 3: Usos este mês */}
            <div
              className="glass-panel"
              style={{
                padding: '20px 22px',
                borderRadius: '14px',
                borderTop: '2px solid rgba(59, 130, 246, 0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cortes / Usos no Mês</span>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(59, 130, 246, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Scissors size={17} color="#60A5FA" />
                </div>
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {stats?.usagesThisMonth || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Atendimentos VIP prestados
              </div>
            </div>

            {/* KPI 4: Vencendo em 7 dias */}
            <div
              className="glass-panel"
              style={{
                padding: '20px 22px',
                borderRadius: '14px',
                borderTop: '2px solid rgba(245, 158, 11, 0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>Vencem em 7 Dias</span>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Clock size={17} color="#FBBF24" />
                </div>
              </div>
              <div
                style={{
                  fontSize: '1.9rem',
                  fontWeight: 800,
                  color: stats?.expiringIn7Days ? '#FBBF24' : '#FFFFFF',
                  letterSpacing: '-0.02em',
                }}
              >
                {stats?.expiringIn7Days || 0}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Assinaturas próximas da renovação
              </div>
            </div>
          </div>

          {/* Segmented Luxury Tabs Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px',
              background: 'rgba(18, 24, 38, 0.75)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              marginBottom: '24px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('subscribers')}
              style={{
                flex: '1 1 200px',
                justifyContent: 'center',
                padding: '10px 16px',
                borderRadius: '10px',
                border:
                  activeTab === 'subscribers' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                background:
                  activeTab === 'subscribers'
                    ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.2) 0%, rgba(229, 179, 56, 0.06) 100%)'
                    : 'transparent',
                color: activeTab === 'subscribers' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'subscribers' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
                fontWeight: activeTab === 'subscribers' ? 700 : 600,
                fontSize: '0.86rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Users size={16} />
              <span>Assinantes VIP ({stats?.activeSubscribers || 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              style={{
                flex: '1 1 200px',
                justifyContent: 'center',
                padding: '10px 16px',
                borderRadius: '10px',
                border: activeTab === 'plans' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                background:
                  activeTab === 'plans'
                    ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.2) 0%, rgba(229, 179, 56, 0.06) 100%)'
                    : 'transparent',
                color: activeTab === 'plans' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'plans' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
                fontWeight: activeTab === 'plans' ? 700 : 600,
                fontSize: '0.86rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Layers size={16} />
              <span>Planos do Clube ({plans.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('usages')}
              style={{
                flex: '1 1 200px',
                justifyContent: 'center',
                padding: '10px 16px',
                borderRadius: '10px',
                border: activeTab === 'usages' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                background:
                  activeTab === 'usages'
                    ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.2) 0%, rgba(229, 179, 56, 0.06) 100%)'
                    : 'transparent',
                color: activeTab === 'usages' ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'usages' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
                fontWeight: activeTab === 'usages' ? 700 : 600,
                fontSize: '0.86rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Scissors size={16} />
              <span>Histórico de Usos</span>
            </button>
          </div>

          {/* ───────────────── ABA 1: Assinantes VIP ───────────────── */}
          {activeTab === 'subscribers' && (
            <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
              {/* Barra de Filtros e Busca */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '420px' }}>
                  <Search
                    size={16}
                    style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
                  />
                  <input
                    type="text"
                    placeholder="Buscar por nome do cliente ou WhatsApp..."
                    value={subSearch}
                    onChange={(e) => {
                      setSubSearch(e.target.value);
                      startTransition(() => {
                        loadSubscribers(1, e.target.value, subStatus);
                      });
                    }}
                    style={{ paddingLeft: '40px', fontSize: '0.88rem' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '190px' }}>
                    <Select
                      value={subStatus}
                      onChange={(e) => {
                        setSubStatus(e.target.value);
                        loadSubscribers(1, subSearch, e.target.value);
                      }}
                    >
                      <option value="ALL">Todos os Status</option>
                      <option value="ACTIVE">Apenas Ativos</option>
                      <option value="EXPIRED">Vencidos / Expirados</option>
                      <option value="CANCELED">Cancelados</option>
                    </Select>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadSubscribers(subPage, subSearch, subStatus)}
                    title="Atualizar lista de assinantes"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>

              {/* Tabela de Assinantes ou Empty State */}
              {subscribers.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '48px 24px',
                    borderRadius: '14px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(229, 179, 56, 0.25)',
                  }}
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '16px',
                      background: 'rgba(229, 179, 56, 0.14)',
                      border: '1px solid rgba(229, 179, 56, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px auto',
                    }}
                  >
                    <Crown size={28} color="#E5B338" />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
                    Nenhum assinante encontrado
                  </h3>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px auto', lineHeight: 1.5 }}>
                    {subSearch || subStatus !== 'ALL'
                      ? 'Nenhum assinante corresponde aos filtros selecionados.'
                      : activePlansCount === 0
                        ? 'Para matricular seu primeiro assinante VIP, crie primeiro um plano mensal para sua barbearia (ex: Corte Ilimitado).'
                        : 'Comece matriculando seus clientes nos planos do Clube VIP para gerar receita recorrente todo mês.'}
                  </p>
                  {hasAccess && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {activePlansCount === 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('plans');
                            handleOpenPlanModal();
                          }}
                          className="gold-gradient-primary gold-glow"
                          style={{
                            padding: '11px 22px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <Plus size={16} /> Criar Primeiro Plano VIP
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOpenNewSubModal}
                          className="gold-gradient-primary gold-glow"
                          style={{
                            padding: '11px 22px',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            borderRadius: '10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <Crown size={16} /> Adicionar Primeiro Assinante
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        <th style={{ padding: '12px 14px' }}>Cliente</th>
                        <th style={{ padding: '12px 14px' }}>Plano VIP</th>
                        <th style={{ padding: '12px 14px' }}>Ciclo / Validade</th>
                        <th style={{ padding: '12px 14px' }}>Renovação (Auto-Renew)</th>
                        <th style={{ padding: '12px 14px' }}>Usos no Ciclo</th>
                        <th style={{ padding: '12px 14px' }}>Status</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscribers.map((sub) => {
                        const isUnlimited = sub.plan?.maxUsagesPerMonth === null;
                        const max = sub.plan?.maxUsagesPerMonth || 1;
                        const pct = isUnlimited ? 100 : Math.min(100, (sub.usagesCount / max) * 100);

                        return (
                          <tr
                            key={sub.id}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <td style={{ padding: '14px' }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{sub.customer?.name}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                                {sub.customer?.phone || 'Sem telefone'}
                              </div>
                            </td>

                            <td style={{ padding: '14px' }}>
                              <div style={{ fontWeight: 700, color: '#E5B338' }}>{sub.plan?.name}</div>
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                                {formatPrice(sub.plan?.priceCents || 0)}/mês
                              </div>
                            </td>

                            <td style={{ padding: '14px' }}>
                              <div style={{ color: 'var(--text-main)' }}>
                                {DateTime.fromISO(sub.cycleEndDate).diffNow('years').years > 10 ? (
                                  <strong style={{ color: '#E5B338' }}>♾️ Vitalícia (Sem expiração)</strong>
                                ) : (
                                  <>
                                    {DateTime.fromISO(sub.cycleStartDate).toFormat('dd/MM')} até{' '}
                                    <strong>{DateTime.fromISO(sub.cycleEndDate).toFormat('dd/MM/yyyy')}</strong>
                                  </>
                                )}
                              </div>
                              <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>
                                Pgto: {sub.paymentMethod || 'Manual'}
                              </div>
                            </td>

                            <td style={{ padding: '14px' }}>
                              <button
                                type="button"
                                disabled={togglingSubId === sub.id || sub.status === 'CANCELED'}
                                onClick={() => handleToggleAutoRenew(sub)}
                                title="Clique para alternar entre Renovação Automática (Auto-Renew) e Renovação Manual"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 11px',
                                  borderRadius: '999px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  cursor: sub.status === 'CANCELED' ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.15s ease',
                                  background: sub.autoRenew
                                    ? 'rgba(16, 185, 129, 0.14)'
                                    : 'rgba(245, 158, 11, 0.14)',
                                  color: sub.autoRenew ? '#34D399' : '#FBBF24',
                                  border: sub.autoRenew
                                    ? '1px solid rgba(16, 185, 129, 0.35)'
                                    : '1px solid rgba(245, 158, 11, 0.35)',
                                }}
                              >
                                <RefreshCw size={12} />
                                {sub.autoRenew ? 'Automática (ON)' : 'Manual (OFF)'}
                              </button>
                              <div style={{ fontSize: '0.69rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                                {sub.autoRenew ? 'Renova ciclo no D0 + Bot' : 'Cliente decide renovar'}
                              </div>
                            </td>

                            <td style={{ padding: '14px', minWidth: '130px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.79rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                  {sub.usagesCount} {isUnlimited ? 'cortes (Ilimitado)' : `de ${max}`}
                                </span>
                              </div>
                              {!isUnlimited && (
                                <div
                                  style={{
                                    width: '100%',
                                    height: '6px',
                                    borderRadius: '999px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      borderRadius: '999px',
                                      background: pct >= 100 ? '#EF4444' : pct >= 75 ? '#FBBF24' : '#10B981',
                                    }}
                                  />
                                </div>
                              )}
                            </td>

                            <td style={{ padding: '14px' }}>{getStatusBadge(sub)}</td>

                            <td style={{ padding: '14px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRenewModal(sub)}
                                  title="Renovar ciclo (+30 dias)"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.76rem',
                                    fontWeight: 600,
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    border: '1px solid var(--border-color)',
                                    color: 'var(--text-main)',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <RefreshCw size={12} /> Renovar
                                </button>
                                {sub.status !== 'CANCELED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelSub(sub)}
                                    title="Cancelar assinatura"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '30px',
                                      height: '30px',
                                      background: 'rgba(239, 68, 68, 0.1)',
                                      border: '1px solid rgba(239, 68, 68, 0.25)',
                                      color: '#EF4444',
                                      cursor: 'pointer',
                                      borderRadius: '8px',
                                    }}
                                  >
                                    <XCircle size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ───────────────── ABA 2: Planos do Clube ───────────────── */}
          {activeTab === 'plans' && (
            <div>
              {plans.length === 0 ? (
                <div className="glass-panel" style={{ padding: '32px 28px', borderRadius: '16px' }}>
                  <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 28px auto' }}>
                    <div
                      style={{
                        width: '56px',
                        height: '56px',
                        borderRadius: '16px',
                        background: 'rgba(229, 179, 56, 0.15)',
                        border: '1px solid rgba(229, 179, 56, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 14px auto',
                      }}
                    >
                      <Layers size={26} color="#E5B338" />
                    </div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 8px 0' }}>
                      Crie os Planos do seu Clube de Assinatura VIP
                    </h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                      Você ainda não cadastrou nenhum plano VIP. Escolha um dos modelos campeões de venda abaixo com 1 clique ou crie um plano 100% personalizado:
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenPlanModal()}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        padding: '11px 22px',
                        fontSize: '0.88rem',
                        fontWeight: 700,
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Plus size={16} /> Criar Plano Personalizado
                    </button>
                  </div>

                  {/* Modelos de Planos Sugeridos com 1 Clique */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '16px',
                    }}
                  >
                    {SUGGESTED_PLAN_PRESETS.map((preset, idx) => (
                      <div
                        key={idx}
                        className="glass-card"
                        style={{
                          padding: '20px',
                          borderRadius: '14px',
                          border: '1px solid rgba(229, 179, 56, 0.25)',
                          background: 'rgba(18, 24, 38, 0.65)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '14px',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background: 'rgba(229, 179, 56, 0.16)',
                                color: '#E5B338',
                              }}
                            >
                              Sugestão • {preset.tag}
                            </span>
                            <Zap size={15} color="#E5B338" />
                          </div>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                            {preset.name}
                          </h4>
                          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#34D399', marginBottom: '8px' }}>
                            R$ {preset.priceStr} <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 500 }}>/ mês</span>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.45 }}>
                            {preset.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenPlanModal(undefined, preset)}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            borderRadius: '9px',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            background: 'rgba(229, 179, 56, 0.14)',
                            border: '1px solid rgba(229, 179, 56, 0.38)',
                            color: '#E5B338',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          <Plus size={14} /> Usar Este Modelo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px',
                  }}
                >
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="glass-panel"
                      style={{
                        padding: '24px',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        border: plan.isActive
                          ? '1px solid rgba(229, 179, 56, 0.35)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        background: plan.isActive
                          ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.06) 0%, rgba(18, 24, 38, 0.85) 100%)'
                          : 'rgba(255, 255, 255, 0.02)',
                        opacity: plan.isActive ? 1 : 0.65,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                          <div>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: '#E5B338',
                                background: 'rgba(229, 179, 56, 0.15)',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                display: 'inline-block',
                                marginBottom: '6px',
                              }}
                            >
                              Plano VIP
                            </span>
                            <h3 style={{ fontSize: '1.22rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                              {plan.name}
                            </h3>
                          </div>

                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '3px 9px',
                              borderRadius: '999px',
                              background: plan.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                              color: plan.isActive ? '#34D399' : 'var(--text-dim)',
                              border: plan.isActive ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
                            }}
                          >
                            {plan.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>

                        {plan.description && (
                          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.45 }}>
                            {plan.description}
                          </p>
                        )}

                        <div style={{ margin: '14px 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                            {formatPrice(plan.priceCents)}
                          </span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>/ mês</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.83rem', color: 'var(--text-main)' }}>
                            <Check size={14} color="#34D399" />
                            <span>
                              {plan.maxUsagesPerMonth === null
                                ? 'Cortes & Utilizações Ilimitadas'
                                : `Até ${plan.maxUsagesPerMonth} utilizações por mês`}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.83rem', color: 'var(--text-main)' }}>
                            <Calendar size={14} color="#34D399" />
                            <span>Dias válidos: {formatDaysOfWeek(plan.allowedDaysOfWeek)}</span>
                          </div>

                          <div style={{ marginTop: '8px' }}>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                              Serviços Cobertos ({plan.services.length}):
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                              {plan.services.map((s) => (
                                <span
                                  key={s.serviceId}
                                  style={{
                                    fontSize: '0.73rem',
                                    padding: '3px 9px',
                                    borderRadius: '6px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    color: 'var(--text-main)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                  }}
                                >
                                  {s.service?.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                          {plan._count?.subscriptions || 0} assinante(s)
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenPlanModal(plan)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '7px 12px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-main)',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePlan(plan)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              color: '#EF4444',
                              cursor: 'pointer',
                              borderRadius: '8px',
                            }}
                            title="Excluir ou desativar plano"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ───────────────── ABA 3: Histórico de Usos ───────────────── */}
          {activeTab === 'usages' && (
            <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                    Registro de Atendimentos do Clube VIP
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Histórico automático de serviços abatidos pelos assinantes na agenda
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadUsages(usagePage)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '9px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} /> Atualizar
                </button>
              </div>

              {usages.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '44px 20px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <Scissors size={32} color="rgba(229, 179, 56, 0.45)" style={{ margin: '0 auto 10px auto' }} />
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    Nenhuma utilização registrada ainda
                  </p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0 }}>
                    Quando um agendamento de cliente VIP for concluído na agenda, o sistema registra e deduz automaticamente o uso aqui.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        <th style={{ padding: '12px 14px' }}>Cliente VIP</th>
                        <th style={{ padding: '12px 14px' }}>Serviço Utilizado</th>
                        <th style={{ padding: '12px 14px' }}>Data e Hora</th>
                        <th style={{ padding: '12px 14px' }}>Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usages.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '14px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{u.customer?.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{u.customer?.phone}</div>
                          </td>
                          <td style={{ padding: '14px', color: '#E5B338', fontWeight: 700 }}>{u.service?.name}</td>
                          <td style={{ padding: '14px', color: 'var(--text-main)' }}>
                            {DateTime.fromISO(u.usedAt).toFormat('dd/MM/yyyy HH:mm')}
                          </td>
                          <td style={{ padding: '14px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-dim)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                              }}
                            >
                              {u.appointmentId ? `Agendamento #${u.appointmentId.slice(-6).toUpperCase()}` : 'Manual'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ───────────────── MODAL NOVO / EDITAR PLANO VIP ───────────────── */}
      <Modal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        title={editingPlan ? 'Editar Plano do Clube VIP' : 'Criar Novo Plano do Clube VIP'}
      >
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Nome do Plano *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Corte Ilimitado VIP"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Valor Mensal (R$) *
              </label>
              <input
                type="text"
                required
                placeholder="99,90"
                value={planForm.priceStr}
                onChange={(e) => setPlanForm({ ...planForm, priceStr: e.target.value })}
              />
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
            }}
          >
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Limite de Utilizações por Mês
            </label>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={planForm.isUnlimitedUsages}
                  onChange={(e) => setPlanForm({ ...planForm, isUnlimitedUsages: e.target.checked })}
                />
                <span style={{ color: '#E5B338', fontWeight: 700 }}>Cortes / Usos Ilimitados no Mês</span>
              </label>

              {!planForm.isUnlimitedUsages && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    style={{ width: '84px', padding: '7px 10px' }}
                    value={planForm.maxUsagesPerMonth}
                    onChange={(e) => setPlanForm({ ...planForm, maxUsagesPerMonth: parseInt(e.target.value) || 1 })}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>usos/mês</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Dias da Semana Permitidos
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {WEEKDAYS.map((w) => {
                const selected = planForm.allowedDaysOfWeek.includes(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() => {
                      if (selected) {
                        setPlanForm({
                          ...planForm,
                          allowedDaysOfWeek: planForm.allowedDaysOfWeek.filter((x) => x !== w.value),
                        });
                      } else {
                        setPlanForm({
                          ...planForm,
                          allowedDaysOfWeek: [...planForm.allowedDaysOfWeek, w.value],
                        });
                      }
                    }}
                    style={{
                      padding: '6px 13px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: selected ? '1px solid #E5B338' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: selected ? 'rgba(229, 179, 56, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: selected ? '#E5B338' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Serviços Cobertos pelo Plano *
            </label>
            <div
              className="custom-scrollbar"
              style={{
                maxHeight: '165px',
                overflowY: 'auto',
                border: '1px solid var(--border-color)',
                background: 'rgba(11, 15, 23, 0.55)',
                borderRadius: '10px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {availableServices.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', padding: '8px', margin: 0 }}>
                  Nenhum serviço ativo cadastrado no salão.
                </p>
              ) : (
                availableServices.map((svc) => {
                  const checked = planForm.serviceIds.includes(svc.id);
                  return (
                    <label
                      key={svc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: checked ? 'rgba(229, 179, 56, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: checked ? '1px solid rgba(229, 179, 56, 0.3)' : '1px solid transparent',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPlanForm({ ...planForm, serviceIds: [...planForm.serviceIds, svc.id] });
                            } else {
                              setPlanForm({
                                ...planForm,
                                serviceIds: planForm.serviceIds.filter((id) => id !== svc.id),
                              });
                            }
                          }}
                        />
                        <span style={{ color: 'var(--text-main)', fontWeight: checked ? 600 : 400 }}>{svc.name}</span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: '#E5B338', fontWeight: 600 }}>
                        {formatPrice(svc.priceCents)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Descrição ou Regras (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Não acumulativo para o mês seguinte. Válido para qualquer barbeiro da casa."
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.86rem' }}>
              <input
                type="checkbox"
                checked={planForm.isActive}
                onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
              />
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>Plano Ativo para Novas Vendas</span>
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => setPlanModalOpen(false)}
              style={{
                padding: '11px 18px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.88rem',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingPlan}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '11px 24px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.88rem',
              }}
            >
              {savingPlan ? 'Salvando...' : 'Salvar Plano'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ───────────────── MODAL CADASTRAR NOVO ASSINANTE ───────────────── */}
      <Modal
        isOpen={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        title="Cadastrar Assinante no Clube VIP"
      >
        <form onSubmit={handleSaveSub} style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '4px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Cliente *
            </label>
            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="Filtrar cliente por nome..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ fontSize: '0.84rem', padding: '8px 12px' }}
              />
            </div>
            <Select
              value={newSubForm.customerId}
              onChange={(e) => setNewSubForm({ ...newSubForm, customerId: e.target.value })}
            >
              <option value="">Selecione o cliente...</option>
              {availableCustomers
                .filter((c) =>
                  customerSearch ? c.name.toLowerCase().includes(customerSearch.toLowerCase()) : true,
                )
                .slice(0, 50)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Plano Escolhido *
            </label>
            <Select
              value={newSubForm.planId}
              onChange={(e) => setNewSubForm({ ...newSubForm, planId: e.target.value })}
            >
              {plans
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatPrice(p.priceCents)}/mês
                  </option>
                ))}
            </Select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Forma de Pagamento
              </label>
              <Select
                value={newSubForm.paymentMethod}
                onChange={(e) => setNewSubForm({ ...newSubForm, paymentMethod: e.target.value })}
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="MANUAL">Outro / Manual</option>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Duração do Ciclo
              </label>
              <Select
                value={String(newSubForm.cycleDays)}
                onChange={(e) => setNewSubForm({ ...newSubForm, cycleDays: parseInt(e.target.value) || 30 })}
              >
                <option value="30">30 Dias (Mensal)</option>
                <option value="60">60 Dias (Bimestral)</option>
                <option value="90">90 Dias (Trimestral)</option>
                <option value="180">180 Dias (Semestral)</option>
                <option value="365">365 Dias (Anual)</option>
                <option value="36500">♾️ Vitalícia (Sem Expiração)</option>
              </Select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Modo de Renovação (Auto-Renew vs. Manual) *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setNewSubForm({ ...newSubForm, autoRenew: true })}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: newSubForm.autoRenew
                    ? '1.5px solid #10B981'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: newSubForm.autoRenew
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    color: newSubForm.autoRenew ? '#34D399' : 'var(--text-main)',
                  }}
                >
                  <RefreshCw size={14} /> Automática (Auto-Renew)
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
                  Renova automaticamente no vencimento e envia avisos pelo Bot.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setNewSubForm({ ...newSubForm, autoRenew: false })}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: !newSubForm.autoRenew
                    ? '1.5px solid #F59E0B'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  background: !newSubForm.autoRenew
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(255, 255, 255, 0.03)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    color: !newSubForm.autoRenew ? '#FBBF24' : 'var(--text-main)',
                  }}
                >
                  <Calendar size={14} /> Renovação Manual
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
                  Bot envia os mesmos avisos (D-3, D0, D+2) e o cliente escolhe renovar.
                </div>
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Observações da Matrícula (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Pagamento via PIX confirmado na recepção."
              value={newSubForm.notes}
              onChange={(e) => setNewSubForm({ ...newSubForm, notes: e.target.value })}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '8px',
              paddingTop: '14px',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => setSubModalOpen(false)}
              style={{
                padding: '11px 18px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.88rem',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingSub}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '11px 24px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.88rem',
              }}
            >
              {savingSub ? 'Cadastrando...' : 'Confirmar Assinatura'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ───────────────── MODAL RENOVAÇÃO MANUAL DE CICLO ───────────────── */}
      <Modal
        isOpen={renewModalOpen}
        onClose={() => setRenewModalOpen(false)}
        title="Renovar Assinatura VIP"
      >
        {renewingSub && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '4px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                background: 'rgba(229, 179, 56, 0.08)',
                border: '1px solid rgba(229, 179, 56, 0.25)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1rem' }}>
                {renewingSub.customer?.name}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#E5B338', marginTop: '2px', fontWeight: 600 }}>
                Plano: {renewingSub.plan?.name} ({formatPrice(renewingSub.plan?.priceCents || 0)}/mês)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Ciclo Atual: {DateTime.fromISO(renewingSub.cycleStartDate).toFormat('dd/MM/yyyy')} até{' '}
                {DateTime.fromISO(renewingSub.cycleEndDate).toFormat('dd/MM/yyyy')}
              </div>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Ao confirmar a renovação, o ciclo da assinatura será estendido por mais <strong>30 dias</strong> e o contador de cortes/usos será zerado para o novo período.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                Forma de Pagamento da Renovação
              </label>
              <Select
                value={renewPaymentMethod}
                onChange={(e) => setRenewPaymentMethod(e.target.value)}
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="MANUAL">Outro / Manual</option>
              </Select>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '8px',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-color)',
              }}
            >
              <button
                type="button"
                onClick={() => setRenewModalOpen(false)}
                style={{
                  padding: '11px 18px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={processingRenew}
                onClick={handleProcessRenew}
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '11px 24px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                }}
              >
                {processingRenew ? 'Processando...' : 'Confirmar Renovação (+30 dias)'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
