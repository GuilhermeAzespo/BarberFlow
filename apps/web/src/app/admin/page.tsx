'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Building,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Settings,
  ArrowLeft,
  Smartphone,
  Sparkles,
  TrendingUp,
  Mail,
  Send,
  ExternalLink,
  Edit,
  Check,
  Eye,
  EyeOff,
  Radio,
  Clock,
  Layers,
  Lock,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { DateTime } from 'luxon';

interface SuperAdminOverview {
  metrics: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    blockedTenants: number;
    totalAppointments: number;
    mrrCents: number;
    arrCents: number;
  };
  plans: PlanItem[];
}

interface PlanItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceCents: number;
  maxProfessionals?: number | null;
  maxAppointmentsPerMonth?: number | null;
  whatsappEnabled: boolean;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  badge?: string | null;
  isHighlighted?: boolean;
  features?: string[] | null;
  _count?: {
    subscriptions: number;
  };
}

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CANCELED';
  statusReason?: string | null;
  createdAt: string;
  whatsAppStatus: string;
  subscription?: {
    status: string;
    plan: { name: string; priceCents: number };
    maxProfessionalsOverride?: number | null;
  } | null;
  _count: {
    users: number;
    professionals: number;
    appointments: number;
    customers: number;
  };
}

interface SystemLogItem {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
  tenant?: { name: string } | null;
}

interface AnalyticsData {
  growthMonths: Array<{
    label: string;
    newTenants: number;
    appointments: number;
  }>;
  plansDistribution: Array<{
    name: string;
    slug: string;
    count: number;
    revenueCents: number;
  }>;
  platformStats: {
    totalCustomers: number;
    totalProfessionals: number;
  };
}

interface SmtpConfigData {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpSecure: boolean;
  emailNotificationsEnabled: boolean;
  hasPassword: boolean;
  isConfigured: boolean;
}

export default function SuperAdminPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'growth' | 'smtp' | 'logs'>('tenants');
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfigData | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Modal Alterar Status do Salão
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [updating, setUpdating] = useState(false);

  // Modal Ajuste de Limites
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [profOverride, setProfOverride] = useState<string>('');

  // Modal Editar Plano
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '',
    slug: '',
    description: '',
    priceReais: '',
    maxProfessionals: '',
    maxAppointments: '',
    badge: '',
    isHighlighted: false,
    whatsappEnabled: true,
    featuresText: '',
  });

  // Formulário SMTP
  const [smtpForm, setSmtpForm] = useState({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpSecure: false,
    emailNotificationsEnabled: true,
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Comunicado em Massa
  const [broadcastForm, setBroadcastForm] = useState({
    subject: '',
    message: '',
    target: 'ALL' as 'ALL' | 'ACTIVE' | 'BLOCKED',
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Impersonation
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const loadOverview = async () => {
    try {
      const res = await api.get<SuperAdminOverview>('/api/superadmin/overview');
      setOverview(res);
      if (res.plans) setPlans(res.plans);
    } catch {
      // Ignora erro
    }
  };

  const loadTenants = async () => {
    try {
      const statusParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : '';
      const res = await api.get<{ tenants: TenantItem[] }>(
        `/api/superadmin/tenants?search=${encodeURIComponent(search)}${statusParam}&pageSize=50`,
      );
      setTenants(res.tenants);
    } catch {
      // Ignora erro
    }
  };

  const loadPlans = async () => {
    try {
      const res = await api.get<{ plans: PlanItem[] }>('/api/superadmin/plans');
      setPlans(res.plans);
    } catch {
      // Ignora erro
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await api.get<AnalyticsData>('/api/superadmin/analytics');
      setAnalytics(res);
    } catch {
      // Ignora erro
    }
  };

  const loadSmtp = async () => {
    try {
      const res = await api.get<{ config: SmtpConfigData }>('/api/superadmin/smtp');
      setSmtpConfig(res.config);
      setSmtpForm({
        smtpHost: res.config.smtpHost || '',
        smtpPort: res.config.smtpPort || 587,
        smtpUser: res.config.smtpUser || '',
        smtpPass: '',
        smtpFrom: res.config.smtpFrom || 'BarberFlow <notificacoes@barberflow.com.br>',
        smtpSecure: res.config.smtpSecure,
        emailNotificationsEnabled: res.config.emailNotificationsEnabled,
      });
      if (!testEmailTo && user?.email) {
        setTestEmailTo(user.email);
      }
    } catch {
      // Ignora erro
    }
  };

  const loadLogs = async () => {
    try {
      const res = await api.get<{ logs: SystemLogItem[] }>('/api/superadmin/logs?pageSize=50');
      setLogs(res.logs);
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    Promise.all([loadOverview(), loadTenants(), loadPlans(), loadAnalytics(), loadSmtp(), loadLogs()]).finally(() =>
      setLoading(false),
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadTenants, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  // Impersonate / Acessar Salão com 1 clique
  const handleImpersonate = async (tenantId: string, tenantName: string) => {
    if (!confirm(`Deseja entrar no painel do salão "${tenantName}" em modo suporte?`)) return;

    setImpersonatingId(tenantId);
    try {
      const res = await api.post<{ redirectUrl: string }>(`/api/superadmin/tenants/${tenantId}/impersonate`, {});
      await refresh();
      router.push(res.redirectUrl || '/dashboard');
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao acessar o salão.');
      setImpersonatingId(null);
    }
  };

  // Alterar Status
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setUpdating(true);

    try {
      await api.patch(`/api/superadmin/tenants/${selectedTenant.id}/status`, {
        status: newStatus,
        statusReason: statusReason || null,
      });

      setIsStatusModalOpen(false);
      await Promise.all([loadOverview(), loadTenants(), loadLogs()]);
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao atualizar status.');
    } finally {
      setUpdating(false);
    }
  };

  // Ajustar Limites
  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setUpdating(true);

    try {
      await api.patch(`/api/superadmin/tenants/${selectedTenant.id}/subscription`, {
        maxProfessionalsOverride: profOverride ? Number(profOverride) : null,
      });

      setIsLimitModalOpen(false);
      await loadTenants();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao ajustar limites.');
    } finally {
      setUpdating(false);
    }
  };

  // Abrir Modal de Edição de Plano
  const openEditPlan = (plan: PlanItem) => {
    setSelectedPlan(plan);
    const features = Array.isArray(plan.features) ? plan.features.join('\n') : '';
    setPlanForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || '',
      priceReais: (plan.priceCents / 100).toFixed(2),
      maxProfessionals: plan.maxProfessionals ? String(plan.maxProfessionals) : '',
      maxAppointments: plan.maxAppointmentsPerMonth ? String(plan.maxAppointmentsPerMonth) : '',
      badge: plan.badge || '',
      isHighlighted: Boolean(plan.isHighlighted),
      whatsappEnabled: plan.whatsappEnabled,
      featuresText: features,
    });
    setIsPlanModalOpen(true);
  };

  // Salvar Plano
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;
    setUpdating(true);

    try {
      const priceCents = Math.round(parseFloat(planForm.priceReais.replace(',', '.')) * 100);
      const features = planForm.featuresText
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);

      await api.patch(`/api/superadmin/plans/${selectedPlan.id}`, {
        name: planForm.name,
        slug: planForm.slug,
        description: planForm.description || null,
        priceCents,
        maxProfessionals: planForm.maxProfessionals ? Number(planForm.maxProfessionals) : null,
        maxAppointmentsPerMonth: planForm.maxAppointments ? Number(planForm.maxAppointments) : null,
        badge: planForm.badge.trim() || null,
        isHighlighted: planForm.isHighlighted,
        whatsappEnabled: planForm.whatsappEnabled,
        features,
      });

      setIsPlanModalOpen(false);
      await Promise.all([loadPlans(), loadOverview()]);
      alert('Plano atualizado com sucesso! As alterações já estão visíveis na página inicial.');
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao atualizar plano.');
    } finally {
      setUpdating(false);
    }
  };

  // Salvar Configurações de SMTP
  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      await api.put('/api/superadmin/smtp', {
        ...smtpForm,
        smtpPort: Number(smtpForm.smtpPort),
      });
      await loadSmtp();
      alert('Configurações de SMTP salvas com sucesso!');
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao salvar SMTP.');
    } finally {
      setSavingSmtp(false);
    }
  };

  // Testar Envio de E-mail
  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo) return alert('Informe o e-mail de destino para o teste.');
    setSendingTest(true);

    try {
      const res = await api.post<{ message: string }>('/api/superadmin/smtp/test', {
        to: testEmailTo,
        smtpHost: smtpForm.smtpHost,
        smtpPort: Number(smtpForm.smtpPort),
        smtpUser: smtpForm.smtpUser,
        smtpPass: smtpForm.smtpPass || undefined,
        smtpFrom: smtpForm.smtpFrom,
        smtpSecure: smtpForm.smtpSecure,
      });
      alert(res.message);
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao enviar e-mail de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Disparo de Comunicado em Massa
  const handleBroadcastEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.subject || !broadcastForm.message) {
      return alert('Preencha o assunto e a mensagem do comunicado.');
    }

    if (!confirm('Deseja realmente disparar este comunicado para os salões selecionados?')) return;

    setSendingBroadcast(true);
    try {
      const res = await api.post<{ message: string }>('/api/superadmin/broadcast-email', broadcastForm);
      alert(res.message);
      setBroadcastForm({ subject: '', message: '', target: 'ALL' });
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao enviar comunicado.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main style={{ flex: 1, padding: '32px 40px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {/* Banner do Topo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(139, 92, 246, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A78BFA',
                }}
              >
                <Shield size={18} />
              </div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Gestão Master do SaaS (Super Admin)
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Acesso total às barbearias, gerenciamento de preços da vitrine, relatórios de crescimento e infraestrutura de e-mails.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="glass-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontSize: '0.88rem',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Meu Salão</span>
          </Link>
        </div>

        {/* KPI Cards */}
        {overview && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '32px',
            }}
          >
            <div className="glass-panel" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                MRR (Receita Mensal Recorrente)
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {formatBRL(overview.metrics.mrrCents)}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  ARR {formatBRL(overview.metrics.arrCents)}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#10B981', display: 'block', marginTop: '4px' }}>
                Assinaturas ativas no SaaS
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Total de Salões Cadastrados
              </span>
              <span style={{ fontSize: '1.65rem', fontWeight: 800 }}>{overview.metrics.totalTenants}</span>
              <span style={{ fontSize: '0.75rem', color: '#10B981', display: 'block', marginTop: '4px' }}>
                {overview.metrics.activeTenants} ativos no momento
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Inadimplência / Suspensos
              </span>
              <span style={{ fontSize: '1.65rem', fontWeight: 800, color: overview.metrics.blockedTenants > 0 ? '#FB7185' : 'inherit' }}>
                {overview.metrics.blockedTenants + overview.metrics.suspendedTenants}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                {overview.metrics.blockedTenants} bloqueados por pagamento
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Agendamentos na Plataforma
              </span>
              <span style={{ fontSize: '1.65rem', fontWeight: 800, color: '#22D3EE' }}>
                {overview.metrics.totalAppointments}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Processados via Web e WhatsApp
              </span>
            </div>
          </div>
        )}

        {/* Navegação por Abas */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-color)',
            marginBottom: '24px',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('tenants')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'tenants' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'tenants' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Building size={16} />
            <span>Salões & Instâncias ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'plans' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'plans' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <DollarSign size={16} />
            <span>Planos & Vitrine ({plans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('growth')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'growth' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'growth' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <TrendingUp size={16} />
            <span>Relatórios de Crescimento</span>
          </button>

          <button
            onClick={() => setActiveTab('smtp')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'smtp' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'smtp' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Mail size={16} />
            <span>Servidor SMTP & E-mails</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'logs' ? '2px solid var(--primary)' : '2px solid transparent',
              fontWeight: 600,
              fontSize: '0.92rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <FileText size={16} />
            <span>Auditoria & Debug ({logs.length})</span>
          </button>
        </div>

        {/* ───────────────── ABA 1: Salões & Instâncias ───────────────── */}
        {activeTab === 'tenants' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            {/* Barra de Filtros */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '420px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  placeholder="Buscar por nome, slug ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
                <div style={{ width: '180px' }}>
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="ALL">Todos os Status</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="SUSPENDED">Suspensos</option>
                    <option value="BLOCKED">Bloqueados</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Tabela de Instâncias */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    <th style={{ padding: '12px 14px' }}>Salão / Slug</th>
                    <th style={{ padding: '12px 14px' }}>E-mail</th>
                    <th style={{ padding: '12px 14px' }}>Plano</th>
                    <th style={{ padding: '12px 14px' }}>WhatsApp</th>
                    <th style={{ padding: '12px 14px' }}>Status da Conta</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Ações de Gestão</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => {
                    const isImpersonating = impersonatingId === t.id;
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '14px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>{t.name}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>/{t.slug}</span>
                        </td>
                        <td style={{ padding: '14px', color: 'var(--text-muted)' }}>{t.email || '—'}</td>
                        <td style={{ padding: '14px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{t.subscription?.plan.name || 'Sem plano'}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>
                            {t._count.professionals} prof. | {t._count.appointments} agend.
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span
                            className={`badge ${
                              t.whatsAppStatus === 'CONNECTED'
                                ? 'badge-success'
                                : t.whatsAppStatus === 'QR_PENDING'
                                ? 'badge-warning'
                                : 'badge-neutral'
                            }`}
                          >
                            {t.whatsAppStatus === 'CONNECTED' ? 'CONECTADO' : t.whatsAppStatus === 'QR_PENDING' ? 'QR PENDENTE' : 'DESCONECTADO'}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span
                            className={`badge ${
                              t.status === 'ACTIVE'
                                ? 'badge-success'
                                : t.status === 'BLOCKED'
                                ? 'badge-danger'
                                : 'badge-warning'
                            }`}
                          >
                            {t.status === 'ACTIVE' ? 'Ativo' : t.status === 'BLOCKED' ? 'Bloqueado' : 'Suspenso'}
                          </span>
                          {t.statusReason && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '2px' }}>
                              {t.statusReason}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            {/* Botão de Impersonation */}
                            <button
                              onClick={() => handleImpersonate(t.id, t.name)}
                              disabled={isImpersonating}
                              className="gold-gradient-primary gold-glow"
                              title="Acessar o painel deste salão como administrador"
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <ExternalLink size={13} />
                              <span>{isImpersonating ? 'Acessando...' : 'Acessar Salão'}</span>
                            </button>

                            <button
                              onClick={() => {
                                setSelectedTenant(t);
                                setNewStatus(t.status as 'ACTIVE' | 'SUSPENDED' | 'BLOCKED');
                                setStatusReason(t.statusReason || '');
                                setIsStatusModalOpen(true);
                              }}
                              className="glass-card"
                              style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Alterar Status
                            </button>

                            <button
                              onClick={() => {
                                setSelectedTenant(t);
                                setProfOverride(
                                  t.subscription?.maxProfessionalsOverride ? String(t.subscription.maxProfessionalsOverride) : '',
                                );
                                setIsLimitModalOpen(true);
                              }}
                              className="glass-card"
                              style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              Limites
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ───────────────── ABA 2: Planos & Vitrine ───────────────── */}
        {activeTab === 'plans' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Planos & Preços da Vitrine</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  Qualquer alteração feita nos valores, limites e benefícios reflete instantaneamente na Landing Page principal.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
              }}
            >
              {plans.map((p) => {
                const features = Array.isArray(p.features) && p.features.length > 0 ? p.features : [];
                return (
                  <div
                    key={p.id}
                    className={`glass-panel ${p.isHighlighted ? 'gold-glow' : ''}`}
                    style={{
                      padding: '28px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderColor: p.isHighlighted ? 'var(--primary)' : undefined,
                      position: 'relative',
                    }}
                  >
                    {p.badge && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          right: '24px',
                          background: 'linear-gradient(135deg, #E5B338, #C99520)',
                          color: '#0B0F17',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {p.badge}
                      </div>
                    )}

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '1.35rem', fontWeight: 700, color: p.isHighlighted ? 'var(--primary)' : 'var(--text-main)' }}>
                          {p.name}
                        </h4>
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          /{p.slug}
                        </span>
                      </div>

                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px', minHeight: '36px' }}>
                        {p.description || 'Sem descrição cadastrada.'}
                      </p>

                      <div style={{ marginBottom: '22px' }}>
                        <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{formatBRL(p.priceCents)}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>/mês</span>
                      </div>

                      <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Profissionais:</span>
                          <strong>{p.maxProfessionals ? `Até ${p.maxProfessionals}` : 'Ilimitados'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Agendamentos:</span>
                          <strong>{p.maxAppointmentsPerMonth ? `Até ${p.maxAppointmentsPerMonth}/mês` : 'Ilimitados'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Assinaturas ativas:</span>
                          <strong style={{ color: 'var(--primary)' }}>{p._count?.subscriptions || 0} salões</strong>
                        </div>
                      </div>

                      <div style={{ marginBottom: '24px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Benefícios na Home ({features.length})
                        </span>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', fontSize: '0.85rem' }}>
                          {features.map((feat, idx) => (
                            <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <CheckCircle2 size={14} color="#E5B338" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <button
                      onClick={() => openEditPlan(p)}
                      className={p.isHighlighted ? 'gold-gradient-primary' : 'glass-card'}
                      style={{
                        padding: '11px',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <Edit size={15} />
                      <span>Editar Preço & Vitrine</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ───────────────── ABA 3: Relatórios de Crescimento ───────────────── */}
        {activeTab === 'growth' && analytics && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Gráficos em Barras */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
              {/* Gráfico 1: Novos Salões */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '6px' }}>
                  Crescimento de Salões Cadastrados (Últimos 6 meses)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
                  Evolução mensal de novas barbearias na plataforma BarberFlow.
                </p>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '180px', paddingBottom: '10px' }}>
                  {analytics.growthMonths.map((m, idx) => {
                    const maxVal = Math.max(...analytics.growthMonths.map((x) => x.newTenants), 5);
                    const heightPercent = Math.max(12, Math.round((m.newTenants / maxVal) * 100));
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>{m.newTenants}</span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '48px',
                            height: `${heightPercent}%`,
                            background: 'linear-gradient(180deg, #E5B338 0%, #A17514 100%)',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gráfico 2: Agendamentos */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '6px' }}>
                  Volume de Agendamentos (Últimos 6 meses)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
                  Atendimentos realizados pelos clientes através do Bot e Agenda.
                </p>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', height: '180px', paddingBottom: '10px' }}>
                  {analytics.growthMonths.map((m, idx) => {
                    const maxVal = Math.max(...analytics.growthMonths.map((x) => x.appointments), 10);
                    const heightPercent = Math.max(12, Math.round((m.appointments / maxVal) * 100));
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#22D3EE' }}>{m.appointments}</span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '48px',
                            height: `${heightPercent}%`,
                            background: 'linear-gradient(180deg, #06B6D4 0%, #0E7490 100%)',
                            borderRadius: '6px 6px 0 0',
                            transition: 'height 0.3s ease',
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Distribuição por Planos */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px' }}>
                Distribuição de Receita por Plano no SaaS
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                {analytics.plansDistribution.map((p) => (
                  <div key={p.slug} className="glass-card" style={{ padding: '16px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Plano {p.name}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 800 }}>{p.count} salões</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: 'var(--primary)', display: 'block', marginTop: '4px' }}>
                      Receita: {formatBRL(p.revenueCents)}/mês
                    </span>
                  </div>
                ))}

                <div className="glass-card" style={{ padding: '16px', background: 'rgba(229, 179, 56, 0.08)' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Total Clientes na Plataforma</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>
                      {analytics.platformStats.totalCustomers}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      e {analytics.platformStats.totalProfessionals} barbeiros
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#10B981', display: 'block', marginTop: '4px' }}>
                    Base global ativa
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────── ABA 4: Servidor SMTP & E-mails ───────────────── */}
        {activeTab === 'smtp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
              {/* Card 1: Configuração SMTP */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Mail size={20} color="var(--primary)" />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Configurações do Servidor SMTP</h3>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                  Conecte seu provedor de e-mails (Gmail, Mailgun, Sendgrid, Amazon SES, Brevo ou VPS) para envio de notificações e cobranças.
                </p>

                <form onSubmit={handleSaveSmtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Host do Servidor SMTP *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: smtp.gmail.com ou smtp.mailgun.org"
                        value={smtpForm.smtpHost}
                        onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Porta *
                      </label>
                      <input
                        type="number"
                        placeholder="587 ou 465"
                        value={smtpForm.smtpPort}
                        onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: Number(e.target.value) })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Usuário / Login SMTP
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: contato@azespo.com.br"
                      value={smtpForm.smtpUser}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Senha / Token SMTP {smtpConfig?.hasPassword && '(Deixe em branco para manter a atual)'}
                    </label>
                    <input
                      type="password"
                      placeholder={smtpConfig?.hasPassword ? '••••••••••••••••' : 'Sua senha ou App Password'}
                      value={smtpForm.smtpPass}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpPass: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Remetente (From Header) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: BarberFlow <notificacoes@barberflow.com.br>"
                      value={smtpForm.smtpFrom}
                      onChange={(e) => setSmtpForm({ ...smtpForm, smtpFrom: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={smtpForm.smtpSecure}
                        onChange={(e) => setSmtpForm({ ...smtpForm, smtpSecure: e.target.checked })}
                      />
                      <span>Conexão Segura SSL/TLS direta (geralmente para porta 465)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={smtpForm.emailNotificationsEnabled}
                        onChange={(e) => setSmtpForm({ ...smtpForm, emailNotificationsEnabled: e.target.checked })}
                      />
                      <span>Habilitar notificações automáticas do SaaS por e-mail</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSmtp}
                    className="gold-gradient-primary gold-glow"
                    style={{ padding: '12px', fontWeight: 600, marginTop: '8px' }}
                  >
                    {savingSmtp ? 'Salvando...' : 'Salvar Configurações de SMTP'}
                  </button>
                </form>
              </div>

              {/* Card 2: Teste de Envio */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <Send size={18} color="#22D3EE" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Testar Envio de E-mail</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '18px' }}>
                    Envie um e-mail com layout corporativo do BarberFlow para confirmar a entregabilidade.
                  </p>

                  <form onSubmit={handleTestEmail} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Enviar para o e-mail:
                      </label>
                      <input
                        type="email"
                        placeholder="seu-email@dominio.com"
                        value={testEmailTo}
                        onChange={(e) => setTestEmailTo(e.target.value)}
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingTest}
                      className="glass-card"
                      style={{ padding: '12px', fontWeight: 600, color: 'var(--primary)', borderColor: 'rgba(229,179,56,0.3)' }}
                    >
                      {sendingTest ? 'Enviando teste...' : 'Disparar E-mail de Teste'}
                    </button>
                  </form>
                </div>

                {/* Card 3: Comunicado em Massa */}
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <Users size={18} color="#34D399" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Comunicado em Massa para Salões</h3>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '18px' }}>
                    Dispare avisos sobre novidades, manutenção, faturas ou avisos importantes diretamente para os donos dos salões.
                  </p>

                  <form onSubmit={handleBroadcastEmail} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Destinatários:
                      </label>
                      <Select
                        value={broadcastForm.target}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, target: e.target.value as any })}
                      >
                        <option value="ALL">Todos os Salões Cadastrados</option>
                        <option value="ACTIVE">Apenas Salões Ativos</option>
                        <option value="BLOCKED">Apenas Salões Bloqueados / Inadimplentes</option>
                      </Select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Assunto do E-mail *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Novidade: Agora você pode personalizar seus relatórios!"
                        value={broadcastForm.subject}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, subject: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Mensagem *
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Digite a mensagem para os donos de salão..."
                        value={broadcastForm.message}
                        onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sendingBroadcast}
                      className="gold-gradient-primary gold-glow"
                      style={{ padding: '12px', fontWeight: 600 }}
                    >
                      {sendingBroadcast ? 'Disparando comunicado...' : 'Enviar Comunicado por E-mail'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ───────────────── ABA 5: Logs do Sistema ───────────────── */}
        {activeTab === 'logs' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px' }}>Logs de Auditoria & Eventos</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {logs.map((log) => {
                const isError = log.level === 'ERROR';
                const isWarn = log.level === 'WARN';

                return (
                  <div
                    key={log.id}
                    className="glass-card"
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      fontSize: '0.85rem',
                      borderLeft: `3px solid ${isError ? '#FB7185' : isWarn ? '#FBBF24' : '#34D399'}`,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span className={`badge ${isError ? 'badge-danger' : isWarn ? 'badge-warning' : 'badge-neutral'}`}>
                          {log.source.toUpperCase()}
                        </span>
                        {log.tenant && <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>[{log.tenant.name}]</span>}
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>
                          {DateTime.fromISO(log.createdAt).toFormat('dd/LL HH:mm:ss')}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)' }}>{log.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modal: Alterar Status do Salão */}
      <Modal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} title="Gerenciamento de Assinatura">
        {selectedTenant && (
          <form onSubmit={handleUpdateStatus} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                Salão: <strong>{selectedTenant.name}</strong> ({selectedTenant.email})
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Status da Instância
              </label>
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as 'ACTIVE' | 'SUSPENDED' | 'BLOCKED')}>
                <option value="ACTIVE">ACTIVE (Acesso Liberado)</option>
                <option value="SUSPENDED">SUSPENDED (Suspensão Administrativa)</option>
                <option value="BLOCKED">BLOCKED (Bloqueio por Inadimplência)</option>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Motivo / Justificativa (será enviado por e-mail ao dono do salão)
              </label>
              <input
                type="text"
                placeholder="Ex: Pagamento da fatura mensal pendente"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setIsStatusModalOpen(false)}
                className="glass-card"
                style={{ padding: '12px 18px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updating}
                className="gold-gradient-primary gold-glow"
                style={{ flex: 1, padding: '12px', fontWeight: 600 }}
              >
                {updating ? 'Atualizando...' : 'Confirmar Alteração'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Ajuste de Limites */}
      <Modal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} title="Ajuste de Limites da Conta">
        {selectedTenant && (
          <form onSubmit={handleUpdateLimits} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                Salão: <strong>{selectedTenant.name}</strong> (Plano {selectedTenant.subscription?.plan.name})
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Limite Personalizado de Profissionais (deixe em branco para usar o padrão do plano)
              </label>
              <input
                type="number"
                min={1}
                placeholder="Ex: 10"
                value={profOverride}
                onChange={(e) => setProfOverride(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setIsLimitModalOpen(false)}
                className="glass-card"
                style={{ padding: '12px 18px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updating}
                className="gold-gradient-primary gold-glow"
                style={{ flex: 1, padding: '12px', fontWeight: 600 }}
              >
                {updating ? 'Salvando...' : 'Salvar Limite'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Editar Plano da Vitrine */}
      <Modal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} title={`Editar Plano: ${selectedPlan?.name}`}>
        {selectedPlan && (
          <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Nome do Plano *
                </label>
                <input
                  type="text"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Preço Mensal (R$) *
                </label>
                <input
                  type="text"
                  placeholder="Ex: 99.90"
                  value={planForm.priceReais}
                  onChange={(e) => setPlanForm({ ...planForm, priceReais: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Descrição na Vitrine
              </label>
              <input
                type="text"
                placeholder="Ex: Perfeito para equipes com múltiplos barbeiros e alta demanda."
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Máx. Profissionais (vazio = ilimitado)
                </label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={planForm.maxProfessionals}
                  onChange={(e) => setPlanForm({ ...planForm, maxProfessionals: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Máx. Agendamentos/mês (vazio = ilimitado)
                </label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={planForm.maxAppointments}
                  onChange={(e) => setPlanForm({ ...planForm, maxAppointments: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Selo de Destaque (Badge)
                </label>
                <input
                  type="text"
                  placeholder="Ex: MAIS POPULAR"
                  value={planForm.badge}
                  onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', cursor: 'pointer', marginTop: '18px' }}>
                  <input
                    type="checkbox"
                    checked={planForm.isHighlighted}
                    onChange={(e) => setPlanForm({ ...planForm, isHighlighted: e.target.checked })}
                  />
                  <span>Destacar Card Dourado</span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Lista de Benefícios / Features na Home (1 por linha)
              </label>
              <textarea
                rows={5}
                placeholder="1 Profissional&#10;Até 300 agendamentos/mês&#10;Bot de WhatsApp integrado&#10;Fluxo de caixa básico"
                value={planForm.featuresText}
                onChange={(e) => setPlanForm({ ...planForm, featuresText: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="glass-card"
                style={{ padding: '12px 18px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updating}
                className="gold-gradient-primary gold-glow"
                style={{ flex: 1, padding: '12px', fontWeight: 600 }}
              >
                {updating ? 'Salvando...' : 'Salvar Alterações do Plano'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
