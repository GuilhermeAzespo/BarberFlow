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
  ChevronRight,
  ExternalLink,
  Info,
  ShieldAlert,
  Trash2,
  Edit2,
  Layers,
  ArrowRight,
  MessageCircle,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api';
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

export default function ClubManagementPage() {
  const { tenant, hasPlanFeature, isAddonFeature, getAddonPriceCents } = useAuth();
  const { toast, confirm } = useToast();

  const [activeTab, setActiveTab] = useState<'subscribers' | 'plans' | 'usages'>('subscribers');
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  // KPIs
  const [stats, setStats] = useState<ClubStats | null>(null);

  // Assinantes
  const [subscribers, setSubscribers] = useState<CustomerSubscriber[]>([]);
  const [subSearch, setSubSearch] = useState('');
  const [subStatus, setSubStatus] = useState<string>('ALL');
  const [subPage, setSubPage] = useState(1);
  const [subTotalPages, setSubTotalPages] = useState(1);

  // Planos
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [availableServices, setAvailableServices] = useState<ServiceItem[]>([]);

  // Utilizações
  const [usages, setUsages] = useState<ClubUsageItem[]>([]);
  const [usagePage, setUsagePage] = useState(1);
  const [usageTotalPages, setUsageTotalPages] = useState(1);

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
    notes: '',
  });
  const [savingSub, setSavingSub] = useState(false);

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

      // Carregar assinantes
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
        '/api/customers?pageSize=100'
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
  const handleOpenPlanModal = (plan?: ClubPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name,
        description: plan.description || '',
        priceStr: (plan.priceCents / 100).toFixed(2).replace('.', ','),
        isUnlimitedUsages: plan.maxUsagesPerMonth === null,
        maxUsagesPerMonth: plan.maxUsagesPerMonth || 4,
        allowedDaysOfWeek: plan.allowedDaysOfWeek && plan.allowedDaysOfWeek.length > 0 ? plan.allowedDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
        serviceIds: plan.services.map((s) => s.serviceId),
        isActive: plan.isActive,
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
      // Recarregar planos e stats
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
      return;
    }
    await loadCustomersForModal();
    setNewSubForm({
      customerId: '',
      planId: plans.find((p) => p.isActive)?.id || '',
      paymentMethod: 'PIX',
      cycleDays: 30,
      notes: '',
    });
    setSubModalOpen(true);
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
    return days.sort().map((d) => dayNames[d]).join(', ');
  };

  const getStatusBadge = (sub: CustomerSubscriber) => {
    const now = DateTime.now();
    const end = DateTime.fromISO(sub.cycleEndDate);
    const daysLeft = Math.ceil(end.diff(now, 'days').days);

    if (sub.status === 'CANCELED') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#F87171',
            border: '1px solid rgba(239, 68, 68, 0.25)',
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
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '999px',
            fontSize: '0.74rem',
            fontWeight: 700,
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#F87171',
            border: '1px solid rgba(239, 68, 68, 0.25)',
          }}
        >
          <Clock size={12} /> Expirado
        </span>
      );
    }

    if (daysLeft <= 7) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
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
          gap: '4px',
          padding: '3px 8px',
          borderRadius: '999px',
          fontSize: '0.74rem',
          fontWeight: 700,
          background: 'rgba(16, 185, 129, 0.12)',
          color: '#34D399',
          border: '1px solid rgba(16, 185, 129, 0.25)',
        }}
      >
        <CheckCircle2 size={12} /> Ativo ({daysLeft}d restantes)
      </span>
    );
  };

  const hasAccess = hasPlanFeature('club');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <Header />

        <div style={{ padding: '24px 32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Top Title Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.2), rgba(229, 179, 56, 0.05))',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Crown size={20} color="#E5B338" />
                </div>
                <div>
                  <h1
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      letterSpacing: '-0.02em',
                      color: 'var(--text-main)',
                      margin: 0,
                    }}
                  >
                    Clube de Assinatura VIP
                  </h1>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    Crie planos mensais de corte ou barba ilimitada e gere receita recorrente previsível (MRR)
                  </p>
                </div>
              </div>
            </div>

            {hasAccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleOpenPlanModal()}
                  className="btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    padding: '8px 14px',
                  }}
                >
                  <Plus size={16} /> Novo Plano
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewSubModal}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.85rem',
                    padding: '8px 16px',
                  }}
                >
                  <Crown size={16} /> Adicionar Assinante
                </button>
              </div>
            )}
          </div>

          {/* Feature Gate Banner (se o salão não possuir o recurso do plano) */}
          {!hasAccess && (
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                borderRadius: '16px',
                marginBottom: '24px',
                background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.08), rgba(11, 15, 23, 0.95))',
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
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: 'rgba(229, 179, 56, 0.2)',
                      color: '#E5B338',
                      padding: '2px 8px',
                      borderRadius: '6px',
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
                  Barbearias de alta performance faturam até 40% a mais vendendo planos mensais (ex: Corte Ilimitado por R$ 119/mês ou 4 Cortes por R$ 99/mês). O sistema BarberFlow valida os agendamentos, desconta os usos e envia parabéns no WhatsApp.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link
                  href="/settings"
                  className="btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                  }}
                >
                  <Sparkles size={16} /> Ativar no Plano PRO ou Add-on
                </Link>
              </div>
            </div>
          )}

          {/* Cards de Métricas / KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* KPI 1: Assinantes Ativos */}
            <div
              className="glass-panel"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Assinantes Ativos</span>
                <Crown size={18} color="#E5B338" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {stats?.activeSubscribers || 0}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                {stats?.totalSubscribers || 0} cadastrados no histórico
              </div>
            </div>

            {/* KPI 2: MRR Recorrente */}
            <div
              className="glass-panel"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>MRR do Clube</span>
                <DollarSign size={18} color="#34D399" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34D399', letterSpacing: '-0.02em' }}>
                {formatPrice(stats?.mrrCents || 0)}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Receita previsível mensal
              </div>
            </div>

            {/* KPI 3: Usos este mês */}
            <div
              className="glass-panel"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Cortes / Usos no Mês</span>
                <Scissors size={18} color="#60A5FA" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {stats?.usagesThisMonth || 0}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Atendimentos VIP prestados
              </div>
            </div>

            {/* KPI 4: Vencendo em 7 dias */}
            <div
              className="glass-panel"
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Vencem em 7 Dias</span>
                <Clock size={18} color="#FBBF24" />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: stats?.expiringIn7Days ? '#FBBF24' : '#FFFFFF', letterSpacing: '-0.02em' }}>
                {stats?.expiringIn7Days || 0}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Assinaturas para renovação
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '12px',
              marginBottom: '20px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('subscribers')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'subscribers' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'subscribers' ? '#0B0F17' : 'var(--text-muted)',
              }}
            >
              <Users size={16} /> Assinantes VIP ({stats?.activeSubscribers || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('plans')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'plans' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'plans' ? '#0B0F17' : 'var(--text-muted)',
              }}
            >
              <Layers size={16} /> Planos do Clube ({plans.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('usages')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.86rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeTab === 'usages' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'usages' ? '#0B0F17' : 'var(--text-muted)',
              }}
            >
              <Scissors size={16} /> Histórico de Usos
            </button>
          </div>

          {/* Conteúdo da Tab 1: Assinantes */}
          {activeTab === 'subscribers' && (
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              {/* Barra de Filtros e Busca */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '240px', maxWidth: '400px' }}>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Buscar por cliente ou telefone..."
                      value={subSearch}
                      onChange={(e) => {
                        setSubSearch(e.target.value);
                        startTransition(() => {
                          loadSubscribers(1, e.target.value, subStatus);
                        });
                      }}
                      style={{ paddingLeft: '36px', height: '36px', fontSize: '0.84rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '160px' }}>
                    <select
                      className="input-field"
                      style={{ height: '36px', fontSize: '0.84rem' }}
                      value={subStatus}
                      onChange={(e) => {
                        setSubStatus(e.target.value);
                        loadSubscribers(1, subSearch, e.target.value);
                      }}
                    >
                      <option value="ALL">Todos os Status</option>
                      <option value="ACTIVE">Apenas Ativos</option>
                      <option value="EXPIRED">Vencendo / Expirados</option>
                      <option value="CANCELED">Cancelados</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadSubscribers(subPage, subSearch, subStatus)}
                    className="btn-secondary"
                    title="Atualizar lista"
                    style={{ padding: '8px 12px', height: '36px' }}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Tabela de Assinantes */}
              {subscribers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                  <Crown size={40} color="rgba(229, 179, 56, 0.4)" style={{ margin: '0 auto 12px auto' }} />
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 4px 0' }}>
                    Nenhum assinante encontrado
                  </p>
                  <p style={{ fontSize: '0.82rem', margin: '0 0 16px 0' }}>
                    {subSearch || subStatus !== 'ALL'
                      ? 'Nenhum resultado com os filtros selecionados.'
                      : 'Comece adicionando clientes aos seus planos do clube VIP.'}
                  </p>
                  {hasAccess && (
                    <button type="button" onClick={handleOpenNewSubModal} className="btn-primary" style={{ fontSize: '0.85rem' }}>
                      <Crown size={15} style={{ marginRight: '6px' }} /> Adicionar Primeiro Assinante
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)' }}>
                        <th style={{ padding: '10px 12px' }}>Cliente</th>
                        <th style={{ padding: '10px 12px' }}>Plano VIP</th>
                        <th style={{ padding: '10px 12px' }}>Ciclo / Validade</th>
                        <th style={{ padding: '10px 12px' }}>Usos no Ciclo</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ações</th>
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
                            <td style={{ padding: '12px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{sub.customer?.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                {sub.customer?.phone || 'Sem telefone'}
                              </div>
                            </td>

                            <td style={{ padding: '12px' }}>
                              <div style={{ fontWeight: 700, color: '#E5B338' }}>{sub.plan?.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                {formatPrice(sub.plan?.priceCents || 0)}/mês
                              </div>
                            </td>

                            <td style={{ padding: '12px' }}>
                              <div style={{ color: 'var(--text-main)' }}>
                                {DateTime.fromISO(sub.cycleStartDate).toFormat('dd/MM')} até{' '}
                                <strong>{DateTime.fromISO(sub.cycleEndDate).toFormat('dd/MM/yyyy')}</strong>
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                Pgto: {sub.paymentMethod || 'Manual'}
                              </div>
                            </td>

                            <td style={{ padding: '12px', minWidth: '130px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
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

                            <td style={{ padding: '12px' }}>{getStatusBadge(sub)}</td>

                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRenewModal(sub)}
                                  className="btn-secondary"
                                  title="Renovar ciclo (+30 dias)"
                                  style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                                >
                                  <RefreshCw size={12} style={{ marginRight: '4px' }} /> Renovar
                                </button>
                                {sub.status !== 'CANCELED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelSub(sub)}
                                    title="Cancelar assinatura"
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--text-dim)',
                                      cursor: 'pointer',
                                      padding: '5px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    <XCircle size={15} color="#EF4444" />
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

          {/* Conteúdo da Tab 2: Planos */}
          {activeTab === 'plans' && (
            <div>
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
                      borderRadius: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      border: plan.isActive ? '1px solid rgba(229, 179, 56, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: plan.isActive
                        ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.05) 0%, rgba(11, 15, 23, 0.8) 100%)'
                        : 'rgba(255, 255, 255, 0.02)',
                      opacity: plan.isActive ? 1 : 0.65,
                    }}
                  >
                    <div>
                      {/* Top Row: Plan Name & Badge */}
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
                              padding: '2px 8px',
                              borderRadius: '6px',
                              display: 'inline-block',
                              marginBottom: '6px',
                            }}
                          >
                            Plano VIP
                          </span>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                            {plan.name}
                          </h3>
                        </div>

                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: plan.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                            color: plan.isActive ? '#34D399' : 'var(--text-dim)',
                          }}
                        >
                          {plan.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>

                      {/* Description */}
                      {plan.description && (
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                          {plan.description}
                        </p>
                      )}

                      {/* Preço */}
                      <div style={{ margin: '14px 0', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                          {formatPrice(plan.priceCents)}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>/ mês</span>
                      </div>

                      {/* Regras e Benefícios */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                          <Check size={14} color="#34D399" />
                          <span>
                            {plan.maxUsagesPerMonth === null
                              ? 'Cortes & Utilizações Ilimitadas'
                              : `Até ${plan.maxUsagesPerMonth} utilizações por mês`}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-main)' }}>
                          <Calendar size={14} color="#34D399" />
                          <span>Dias válidos: {formatDaysOfWeek(plan.allowedDaysOfWeek)}</span>
                        </div>

                        <div style={{ marginTop: '8px' }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                            Serviços Cobertos ({plan.services.length}):
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {plan.services.map((s) => (
                              <span
                                key={s.serviceId}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
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

                    {/* Bottom Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                        {plan._count?.subscriptions || 0} assinante(s)
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenPlanModal(plan)}
                          className="btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                        >
                          <Edit2 size={12} style={{ marginRight: '4px' }} /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlan(plan)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#EF4444',
                            cursor: 'pointer',
                            padding: '6px',
                          }}
                          title="Excluir ou desativar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conteúdo da Tab 3: Utilizações */}
          {activeTab === 'usages' && (
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  Registro de Atendimentos do Clube
                </h3>
                <button
                  type="button"
                  onClick={() => loadUsages(usagePage)}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  <RefreshCw size={13} style={{ marginRight: '4px' }} /> Atualizar
                </button>
              </div>

              {usages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                  <Scissors size={32} color="rgba(255, 255, 255, 0.2)" style={{ margin: '0 auto 10px auto' }} />
                  <p style={{ fontSize: '0.9rem', margin: 0 }}>Nenhuma utilização registrada ainda.</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Quando um agendamento de cliente VIP for concluído, o sistema deduz automaticamente o uso aqui.
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)' }}>
                        <th style={{ padding: '10px 12px' }}>Cliente VIP</th>
                        <th style={{ padding: '10px 12px' }}>Serviço Utilizado</th>
                        <th style={{ padding: '10px 12px' }}>Data e Hora</th>
                        <th style={{ padding: '10px 12px' }}>Agendamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usages.map((u) => (
                        <tr key={u.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{u.customer?.name}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{u.customer?.phone}</div>
                          </td>
                          <td style={{ padding: '12px', color: '#E5B338', fontWeight: 600 }}>
                            {u.service?.name}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--text-main)' }}>
                            {DateTime.fromISO(u.usedAt).toFormat('dd/MM/yyyy HH:mm')}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span
                              style={{
                                fontSize: '0.74rem',
                                color: 'var(--text-dim)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '2px 8px',
                                borderRadius: '4px',
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

      {/* MODAL NOVO / EDITAR PLANO */}
      <Modal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        title={editingPlan ? 'Editar Plano do Clube' : 'Criar Novo Plano do Clube VIP'}
      >
        <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="label">Nome do Plano *</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="Ex: Corte Ilimitado VIP, Clube Barba & Cabelo"
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Valor Mensal (R$) *</label>
            <input
              type="text"
              required
              className="input-field"
              placeholder="99,90"
              value={planForm.priceStr}
              onChange={(e) => setPlanForm({ ...planForm, priceStr: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Limite de Utilizações por Mês</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={planForm.isUnlimitedUsages}
                  onChange={(e) => setPlanForm({ ...planForm, isUnlimitedUsages: e.target.checked })}
                />
                <span style={{ color: '#E5B338', fontWeight: 700 }}>Ilimitado</span>
              </label>

              {!planForm.isUnlimitedUsages && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input-field"
                    style={{ width: '80px', height: '34px' }}
                    value={planForm.maxUsagesPerMonth}
                    onChange={(e) => setPlanForm({ ...planForm, maxUsagesPerMonth: parseInt(e.target.value) || 1 })}
                  />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>cortes/usos por ciclo</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label">Dias da Semana Válidos</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
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
                      padding: '5px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
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
            <label className="label">Serviços Cobertos pelo Plano *</label>
            <div
              className="custom-scrollbar"
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                marginTop: '6px',
              }}
            >
              {availableServices.map((svc) => {
                const checked = planForm.serviceIds.includes(svc.id);
                return (
                  <label
                    key={svc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      background: checked ? 'rgba(229, 179, 56, 0.08)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPlanForm({ ...planForm, serviceIds: [...planForm.serviceIds, svc.id] });
                          } else {
                            setPlanForm({ ...planForm, serviceIds: planForm.serviceIds.filter((id) => id !== svc.id) });
                          }
                        }}
                      />
                      <span style={{ color: 'var(--text-main)' }}>{svc.name}</span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {formatPrice(svc.priceCents)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">Descrição ou Regras (Opcional)</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Ex: Não acumulativo para o mês seguinte. Válido para qualquer barbeiro da casa."
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={planForm.isActive}
                onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
              />
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>Plano Ativo para Novas Vendas</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setPlanModalOpen(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={savingPlan} className="btn-primary">
              {savingPlan ? 'Salvando...' : 'Salvar Plano'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL NOVO ASSINANTE */}
      <Modal
        isOpen={subModalOpen}
        onClose={() => setSubModalOpen(false)}
        title="Cadastrar Assinante no Clube VIP"
      >
        <form onSubmit={handleSaveSub} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="label">Cliente *</label>
            <div style={{ marginBottom: '6px' }}>
              <input
                type="text"
                placeholder="Filtrar cliente por nome..."
                className="input-field"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ height: '32px', fontSize: '0.8rem' }}
              />
            </div>
            <select
              className="input-field"
              required
              value={newSubForm.customerId}
              onChange={(e) => setNewSubForm({ ...newSubForm, customerId: e.target.value })}
            >
              <option value="">Selecione o cliente...</option>
              {availableCustomers
                .filter((c) =>
                  customerSearch ? c.name.toLowerCase().includes(customerSearch.toLowerCase()) : true
                )
                .slice(0, 50)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="label">Plano Escolhido *</label>
            <select
              className="input-field"
              required
              value={newSubForm.planId}
              onChange={(e) => setNewSubForm({ ...newSubForm, planId: e.target.value })}
            >
              {plans
                .filter((p) => p.isActive)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} - {formatPrice(p.priceCents)}/mês
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label className="label">Forma de Pagamento</label>
              <select
                className="input-field"
                value={newSubForm.paymentMethod}
                onChange={(e) => setNewSubForm({ ...newSubForm, paymentMethod: e.target.value })}
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="MANUAL">Outro / Manual</option>
              </select>
            </div>

            <div>
              <label className="label">Duração do Ciclo</label>
              <select
                className="input-field"
                value={newSubForm.cycleDays}
                onChange={(e) => setNewSubForm({ ...newSubForm, cycleDays: parseInt(e.target.value) || 30 })}
              >
                <option value={30}>30 Dias (Padrão Mensal)</option>
                <option value={60}>60 Dias (Bimestral)</option>
                <option value={90}>90 Dias (Trimestral)</option>
                <option value={180}>180 Dias (Semestral)</option>
                <option value={365}>365 Dias (Anual)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Observações da Matrícula (Opcional)</label>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Ex: Pagamento adiantado via PIX, início imediato."
              value={newSubForm.notes}
              onChange={(e) => setNewSubForm({ ...newSubForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setSubModalOpen(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button type="submit" disabled={savingSub} className="btn-primary">
              {savingSub ? 'Cadastrando...' : 'Confirmar Assinatura'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL RENOVAÇÃO MANUAL DE CICLO */}
      <Modal
        isOpen={renewModalOpen}
        onClose={() => setRenewModalOpen(false)}
        title="Renovar Assinatura VIP"
      >
        {renewingSub && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(229, 179, 56, 0.08)',
                border: '1px solid rgba(229, 179, 56, 0.25)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '1rem' }}>
                {renewingSub.customer?.name}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#E5B338', marginTop: '2px' }}>
                Plano: {renewingSub.plan?.name} ({formatPrice(renewingSub.plan?.priceCents || 0)}/mês)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                Ciclo Atual: {DateTime.fromISO(renewingSub.cycleStartDate).toFormat('dd/MM/yyyy')} até{' '}
                {DateTime.fromISO(renewingSub.cycleEndDate).toFormat('dd/MM/yyyy')}
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Ao confirmar a renovação, o ciclo da assinatura será estendido por mais <strong>30 dias</strong> a contar de hoje (ou do fim do ciclo anterior) e o contador de cortes/usos será zerado para o novo mês.
            </p>

            <div>
              <label className="label">Forma de Pagamento da Renovação</label>
              <select
                className="input-field"
                value={renewPaymentMethod}
                onChange={(e) => setRenewPaymentMethod(e.target.value)}
              >
                <option value="PIX">PIX</option>
                <option value="CARTAO_CREDITO">Cartão de Crédito</option>
                <option value="CARTAO_DEBITO">Cartão de Débito</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="MANUAL">Outro / Manual</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setRenewModalOpen(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={processingRenew}
                onClick={handleProcessRenew}
                className="btn-primary"
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
