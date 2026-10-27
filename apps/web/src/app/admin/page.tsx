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
  CreditCard,
  QrCode,
  Copy,
  Key,
  Globe,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useToast } from '../../components/Toast';
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
    id: string;
    planId: string;
    status: string;
    plan: { id: string; name: string; slug: string; priceCents: number };
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

interface MercadoPagoConfigData {
  mpPublicKey: string;
  mpAccessTokenMasked: string;
  hasAccessToken: boolean;
  mpWebhookSecret: string;
  mpSandbox: boolean;
  mpEnabled: boolean;
  isConfigured: boolean;
  webhookUrl: string;
}

export default function SuperAdminPage() {
  const { user, refresh } = useAuth();
  const { toast, confirm } = useToast();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'growth' | 'smtp' | 'integrations' | 'mercadopago' | 'logs'>('tenants');
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<'mercadopago' | 'whatsapp' | 'others'>('mercadopago');
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfigData | null>(null);
  const [mpConfig, setMpConfig] = useState<MercadoPagoConfigData | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  // Modal Alterar Status do Salão
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [updating, setUpdating] = useState(false);

  // Modal Gerenciar Plano & Limites do Salão
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedSubStatus, setSelectedSubStatus] = useState<string>('ACTIVE');
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

  // Formulário Mercado Pago
  const [mpForm, setMpForm] = useState({
    mpAccessToken: '',
    mpPublicKey: '',
    mpWebhookSecret: '',
    mpSandbox: false,
    mpEnabled: true,
  });
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [showMpToken, setShowMpToken] = useState(false);

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

  const loadMpConfig = async () => {
    try {
      const res = await api.get<{ config: MercadoPagoConfigData }>('/api/superadmin/integrations/mercadopago');
      setMpConfig(res.config);
      setMpForm({
        mpAccessToken: '',
        mpPublicKey: res.config.mpPublicKey || '',
        mpWebhookSecret: res.config.mpWebhookSecret || '',
        mpSandbox: res.config.mpSandbox,
        mpEnabled: res.config.mpEnabled,
      });
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
    Promise.all([loadOverview(), loadTenants(), loadPlans(), loadAnalytics(), loadSmtp(), loadMpConfig(), loadLogs()]).finally(() =>
      setLoading(false),
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadTenants, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  // Impersonate / Acessar Salão com 1 clique
  const handleImpersonate = async (tenantId: string, tenantName: string) => {
    const ok = await confirm({
      title: 'Acessar Painel do Salão',
      message: `Deseja entrar no painel do salão "${tenantName}" em modo suporte de atendimento?`,
      confirmText: 'Acessar Salão',
      icon: 'info',
    });
    if (!ok) return;

    setImpersonatingId(tenantId);
    try {
      const res = await api.post<{ redirectUrl: string }>(`/api/superadmin/tenants/${tenantId}/impersonate`, {});
      await refresh();
      router.push(res.redirectUrl || '/dashboard');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao acessar o salão.');
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
      toast.success('Status da instância atualizado com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar status.');
    } finally {
      setUpdating(false);
    }
  };

  // Ajustar Plano, Assinatura e Limites
  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setUpdating(true);

    try {
      await api.patch(`/api/superadmin/tenants/${selectedTenant.id}/subscription`, {
        planId: selectedPlanId || undefined,
        status: selectedSubStatus as any,
        maxProfessionalsOverride: profOverride ? Number(profOverride) : null,
      });

      setIsLimitModalOpen(false);
      await Promise.all([loadTenants(), loadOverview()]);
      toast.success(`Plano e assinatura do salão "${selectedTenant.name}" atualizados com sucesso!`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar plano e limites.');
    } finally {
      setUpdating(false);
    }
  };

  // Abrir Modal de Edição de Plano da Vitrine
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

  // Salvar Plano da Vitrine
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
      toast.success('Plano atualizado com sucesso! As alterações já estão visíveis na página inicial.');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar plano.');
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
      toast.success('Configurações de SMTP salvas com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar SMTP.');
    } finally {
      setSavingSmtp(false);
    }
  };

  // Testar Envio de E-mail
  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo) return toast.warning('Informe o e-mail de destino para o teste.');
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
      toast.success(res.message || 'E-mail de teste enviado com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar e-mail de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Disparo de Comunicado em Massa
  const handleBroadcastEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastForm.subject || !broadcastForm.message) {
      return toast.warning('Preencha o assunto e a mensagem do comunicado.');
    }

    const ok = await confirm({
      title: 'Disparo de Comunicado em Massa',
      message: 'Deseja realmente disparar este comunicado por e-mail para os salões selecionados?',
      confirmText: 'Disparar E-mails',
      icon: 'alert',
    });
    if (!ok) return;

    setSendingBroadcast(true);
    try {
      const res = await api.post<{ message: string }>('/api/superadmin/broadcast-email', broadcastForm);
      toast.success(res.message || 'Comunicado disparado com sucesso!');
      setBroadcastForm({ subject: '', message: '', target: 'ALL' });
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar comunicado.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  // Salvar Configurações do Mercado Pago
  const handleSaveMp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMp(true);
    try {
      await api.put('/api/superadmin/integrations/mercadopago', mpForm);
      await loadMpConfig();
      toast.success('Configurações do Mercado Pago salvas com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar configurações do Mercado Pago.');
    } finally {
      setSavingMp(false);
    }
  };

  // Testar Conexão com Mercado Pago
  const handleTestMp = async () => {
    setTestingMp(true);
    try {
      const res = await api.post<{ success: boolean; message: string; account?: any }>(
        '/api/superadmin/integrations/mercadopago/test',
        { accessToken: mpForm.mpAccessToken || undefined },
      );
      toast.success(res.message || 'Conexão com o Mercado Pago validada com sucesso!');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao testar conexão com o Mercado Pago.');
    } finally {
      setTestingMp(false);
    }
  };

  const publicWebhookUrl =
    mpConfig?.webhookUrl &&
    !mpConfig.webhookUrl.includes('localhost') &&
    !mpConfig.webhookUrl.includes('127.0.0.1')
      ? mpConfig.webhookUrl
      : 'https://barberflow.azespo.com.br/api/webhooks/mercadopago';

  // Copiar URL do Webhook
  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(publicWebhookUrl);
    toast.success('URL pública do Webhook copiada com sucesso!');
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

        {/* Navegação por Abas Master (Estilo Segmented Luxury Responsivo) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px',
            background: 'rgba(18, 24, 38, 0.75)',
            border: '1px solid var(--border-color)',
            borderRadius: '14px',
            marginBottom: '28px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('tenants')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'tenants' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'tenants' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'tenants' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'tenants' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'tenants' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Building size={16} color={activeTab === 'tenants' ? 'var(--primary)' : 'currentColor'} />
            <span>Salões & Instâncias ({tenants.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'plans' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'plans' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'plans' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'plans' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'plans' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <DollarSign size={16} color={activeTab === 'plans' ? 'var(--primary)' : 'currentColor'} />
            <span>Planos & Vitrine ({plans.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('growth')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'growth' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'growth' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'growth' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'growth' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'growth' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <TrendingUp size={16} color={activeTab === 'growth' ? 'var(--primary)' : 'currentColor'} />
            <span>Relatórios de Crescimento</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('smtp')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'smtp' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'smtp' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'smtp' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'smtp' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'smtp' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Mail size={16} color={activeTab === 'smtp' ? 'var(--primary)' : 'currentColor'} />
            <span>Servidor SMTP & E-mails</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'integrations' || activeTab === 'mercadopago' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'integrations' || activeTab === 'mercadopago' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'integrations' || activeTab === 'mercadopago' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'integrations' || activeTab === 'mercadopago' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'integrations' || activeTab === 'mercadopago' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={16} color={activeTab === 'integrations' || activeTab === 'mercadopago' ? 'var(--primary)' : 'currentColor'} />
            <span>Integração</span>
            {mpConfig?.isConfigured && (
              <span
                style={{
                  fontSize: '0.65rem',
                  background: mpConfig.mpSandbox ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: mpConfig.mpSandbox ? '#FBBF24' : '#10B981',
                  border: `1px solid ${mpConfig.mpSandbox ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  padding: '2px 7px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                {mpConfig.mpSandbox ? 'SANDBOX' : 'PRODUÇÃO'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: activeTab === 'logs' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
              background: activeTab === 'logs' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
              color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: activeTab === 'logs' ? '0 2px 10px rgba(229, 179, 56, 0.15)' : 'none',
              fontWeight: activeTab === 'logs' ? 700 : 600,
              fontSize: '0.88rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <FileText size={16} color={activeTab === 'logs' ? 'var(--primary)' : 'currentColor'} />
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
                                setSelectedPlanId(t.subscription?.planId || t.subscription?.plan?.id || plans[0]?.id || '');
                                setSelectedSubStatus(t.subscription?.status || 'ACTIVE');
                                setProfOverride(
                                  t.subscription?.maxProfessionalsOverride ? String(t.subscription.maxProfessionalsOverride) : '',
                                );
                                setIsLimitModalOpen(true);
                              }}
                              className="glass-card"
                              style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', borderColor: 'rgba(229, 179, 56, 0.3)' }}
                              title="Modificar plano, status da assinatura e limites deste salão"
                            >
                              Plano & Limites
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

        {/* ───────────────── ABA: Central de Integrações (Hub Modular) ───────────────── */}
        {(activeTab === 'integrations' || activeTab === 'mercadopago') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Barra Seletora de Integrações */}
            <div
              className="glass-panel"
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                borderLeft: '4px solid var(--primary)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Layers size={18} color="var(--primary)" />
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                    Painel de Integrações
                  </h2>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  Selecione o serviço para gerenciar chaves de API, webhooks e parâmetros de conexão.
                </p>
              </div>

              {/* Sub-menu de Integrações */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(10, 14, 23, 0.7)',
                  padding: '5px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => setActiveIntegrationTab('mercadopago')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: activeIntegrationTab === 'mercadopago' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                    background: activeIntegrationTab === 'mercadopago' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
                    color: activeIntegrationTab === 'mercadopago' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: activeIntegrationTab === 'mercadopago' ? 700 : 500,
                    fontSize: '0.84rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <CreditCard size={15} color={activeIntegrationTab === 'mercadopago' ? 'var(--primary)' : 'currentColor'} />
                  <span>Integração Mercado Pago</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      background: mpConfig?.isConfigured
                        ? mpConfig.mpSandbox
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(239, 68, 68, 0.15)',
                      color: mpConfig?.isConfigured
                        ? mpConfig.mpSandbox
                          ? '#FBBF24'
                          : '#10B981'
                        : '#9CA3AF',
                      border: `1px solid ${
                        mpConfig?.isConfigured
                          ? mpConfig.mpSandbox
                            ? 'rgba(245, 158, 11, 0.4)'
                            : 'rgba(16, 185, 129, 0.4)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      padding: '2px 6px',
                      borderRadius: '5px',
                      fontWeight: 700,
                    }}
                  >
                    {mpConfig?.isConfigured ? (mpConfig.mpSandbox ? 'SANDBOX' : 'PRODUÇÃO') : 'INATIVO'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntegrationTab('whatsapp')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: activeIntegrationTab === 'whatsapp' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                    background: activeIntegrationTab === 'whatsapp' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
                    color: activeIntegrationTab === 'whatsapp' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: activeIntegrationTab === 'whatsapp' ? 700 : 500,
                    fontSize: '0.84rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Smartphone size={15} color={activeIntegrationTab === 'whatsapp' ? 'var(--primary)' : 'currentColor'} />
                  <span>WhatsApp API</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-dim)',
                      padding: '2px 6px',
                      borderRadius: '5px',
                      fontWeight: 600,
                    }}
                  >
                    EM BREVE
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveIntegrationTab('others')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: activeIntegrationTab === 'others' ? '1px solid rgba(229, 179, 56, 0.45)' : '1px solid transparent',
                    background: activeIntegrationTab === 'others' ? 'linear-gradient(135deg, rgba(229, 179, 56, 0.18) 0%, rgba(229, 179, 56, 0.06) 100%)' : 'transparent',
                    color: activeIntegrationTab === 'others' ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: activeIntegrationTab === 'others' ? 700 : 500,
                    fontSize: '0.84rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Globe size={15} color={activeIntegrationTab === 'others' ? 'var(--primary)' : 'currentColor'} />
                  <span>Outras Integrações</span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-dim)',
                      padding: '2px 6px',
                      borderRadius: '5px',
                      fontWeight: 600,
                    }}
                  >
                    FUTURO
                  </span>
                </button>
              </div>
            </div>

            {/* Conteúdo da Integração Mercado Pago */}
            {activeIntegrationTab === 'mercadopago' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header de Status */}
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                borderLeft: `4px solid ${mpConfig?.isConfigured ? '#10B981' : '#F59E0B'}`,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(0, 158, 227, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#009EE3',
                    }}
                  >
                    <CreditCard size={20} />
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                    Integração Oficial Mercado Pago
                  </h2>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      background: mpConfig?.isConfigured
                        ? mpConfig.mpSandbox
                          ? 'rgba(245, 158, 11, 0.2)'
                          : 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)',
                      color: mpConfig?.isConfigured
                        ? mpConfig.mpSandbox
                          ? '#FBBF24'
                          : '#10B981'
                        : '#F87171',
                      border: `1px solid ${
                        mpConfig?.isConfigured
                          ? mpConfig.mpSandbox
                            ? 'rgba(245, 158, 11, 0.4)'
                            : 'rgba(16, 185, 129, 0.4)'
                          : 'rgba(239, 68, 68, 0.4)'
                      }`,
                    }}
                  >
                    {mpConfig?.isConfigured
                      ? mpConfig.mpSandbox
                        ? 'MODO TESTE (SANDBOX)'
                        : 'CONECTADO EM PRODUÇÃO'
                      : 'NÃO CONFIGURADO'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                  Receba os pagamentos de assinatura (Starter, Pro e Premium) de todos os salões via <strong>Pix Instantâneo</strong> e <strong>Cartão de Crédito</strong>.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleTestMp}
                  disabled={testingMp}
                  className="glass-card"
                  style={{
                    padding: '10px 18px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#009EE3',
                    borderColor: 'rgba(0, 158, 227, 0.3)',
                  }}
                >
                  <Key size={16} />
                  <span>{testingMp ? 'Testando conexão...' : 'Validar Credenciais na API'}</span>
                </button>
              </div>
            </div>

            {/* Grid 2 Colunas */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                gap: '24px',
              }}
            >
              {/* Coluna 1: Formulário de Credenciais */}
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Key size={18} color="var(--primary)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Credenciais da API Mercado Pago</h3>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '20px' }}>
                  Insira o seu <strong>Access Token</strong> e <strong>Public Key</strong> obtidos no Portal de Desenvolvedores do Mercado Pago.
                </p>

                <form onSubmit={handleSaveMp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {mpForm.mpSandbox && (mpForm.mpPublicKey?.startsWith('APP_USR-') || (!mpForm.mpPublicKey && mpConfig?.mpPublicKey?.startsWith('APP_USR-'))) && (
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        fontSize: '0.82rem',
                        color: '#FBBF24',
                        lineHeight: 1.45,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '4px' }}>
                        <AlertTriangle size={15} /> Credencial de Produção em Modo Sandbox
                      </div>
                      Suas credenciais salvas começam com <code>APP_USR-</code> (Produção). Para simular pagamentos usando os cartões de teste (como <code>5480...</code>), você deve copiar as <strong>Credenciais de Teste</strong> no Mercado Pago (que começam com <code>TEST-</code>). O Mercado Pago bloqueia cartões fictícios com credenciais <code>APP_USR-</code> gerando o erro <em>Unauthorized use of live credentials</em>.
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {mpForm.mpSandbox ? 'Access Token de Teste (Sandbox) *' : 'Access Token de Produção *'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showMpToken ? 'text' : 'password'}
                        placeholder={
                          mpConfig?.hasAccessToken
                            ? `Token salvo (${mpConfig.mpAccessTokenMasked || '••••••••'}) - digite para alterar`
                            : mpForm.mpSandbox
                            ? 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000'
                            : 'APP_USR-0000000000000000-000000-00000000000000000000000000000000-000000000'
                        }
                        value={mpForm.mpAccessToken}
                        onChange={(e) => setMpForm({ ...mpForm, mpAccessToken: e.target.value })}
                        style={{ paddingRight: '42px', fontFamily: 'monospace' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowMpToken(!showMpToken)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {showMpToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                      {mpForm.mpSandbox
                        ? 'Para testes sandbox, utilize o token que começa com "TEST-..."'
                        : 'Para vendas reais, utilize o token que começa com "APP_USR-..."'}
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {mpForm.mpSandbox ? 'Chave Pública de Teste (Public Key) *' : 'Chave Pública de Produção (Public Key) *'}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        mpForm.mpSandbox
                          ? 'TEST-00000000-0000-0000-0000-000000000000'
                          : 'APP_USR-00000000-0000-0000-0000-000000000000'
                      }
                      value={mpForm.mpPublicKey}
                      onChange={(e) => setMpForm({ ...mpForm, mpPublicKey: e.target.value })}
                      style={{ fontFamily: 'monospace' }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                      Utilizada para tokenização segura do cartão no checkout do salão.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Chave Secreta do Webhook (Assinatura HMAC - Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Chave secreta gerada ao cadastrar o webhook (opcional)"
                      value={mpForm.mpWebhookSecret}
                      onChange={(e) => setMpForm({ ...mpForm, mpWebhookSecret: e.target.value })}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input
                        type="checkbox"
                        checked={mpForm.mpEnabled}
                        onChange={(e) => setMpForm({ ...mpForm, mpEnabled: e.target.checked })}
                      />
                      <span>
                        <strong>Ativar Checkout do Mercado Pago no SaaS</strong> (salões poderão pagar planos com Pix e Cartão)
                      </span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.86rem' }}>
                      <input
                        type="checkbox"
                        checked={mpForm.mpSandbox}
                        onChange={(e) => setMpForm({ ...mpForm, mpSandbox: e.target.checked })}
                      />
                      <span style={{ color: mpForm.mpSandbox ? '#FBBF24' : 'inherit' }}>
                        <strong>Modo Sandbox (Testes)</strong> — ative caso queira simular pagamentos sem transacionar dinheiro real
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingMp}
                    className="gold-gradient-primary gold-glow"
                    style={{ padding: '12px', fontWeight: 700, marginTop: '8px' }}
                  >
                    {savingMp ? 'Salvando...' : 'Salvar Configurações do Mercado Pago'}
                  </button>
                </form>
              </div>

              {/* Coluna 2: Instruções Passo a Passo & Webhook */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Card de Webhook */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Globe size={18} color="#10B981" />
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>URL de Notificação (Webhook)</h3>
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10B981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        letterSpacing: '0.03em',
                      }}
                    >
                      CLOUDFLARE ZERO TRUST FQDN
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '14px' }}>
                    Cadastre este endereço público oficial no Mercado Pago para que a liberação de assinaturas (Pix e Cartão) ocorra de forma 100% instantânea via túnel seguro:
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(0,0,0,0.5)',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      marginBottom: '10px',
                    }}
                  >
                    <span style={{ fontFamily: 'monospace', fontSize: '0.84rem', color: '#10B981', flex: 1, wordBreak: 'break-all', fontWeight: 600 }}>
                      {publicWebhookUrl}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyWebhook}
                      className="glass-card"
                      style={{
                        padding: '7px 14px',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Copy size={13} />
                      <span>Copiar</span>
                    </button>
                  </div>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📌</span>
                    <span>No Mercado Pago, selecione o evento <strong>Pagamentos (payment)</strong> no modo de produção.</span>
                  </div>
                </div>

                {/* Card de Instruções Passo a Passo */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <Sparkles size={18} color="var(--primary)" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Como Obter suas Credenciais</h3>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(229, 179, 56, 0.2)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: '0.78rem',
                        }}
                      >
                        1
                      </span>
                      <div>
                        <strong>Acesse o Portal de Desenvolvedores:</strong>
                        <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          Entre em{' '}
                          <a
                            href="https://www.mercadopago.com.br/developers/panel"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#009EE3', textDecoration: 'none' }}
                          >
                            mercadopago.com.br/developers/panel <ExternalLink size={11} style={{ display: 'inline' }} />
                          </a>{' '}
                          com sua conta Mercado Pago.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(229, 179, 56, 0.2)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: '0.78rem',
                        }}
                      >
                        2
                      </span>
                      <div>
                        <strong>Crie uma Nova Aplicação:</strong>
                        <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          Clique em &quot;Criar aplicação&quot;, dê o nome <strong>BarberFlow</strong> e selecione a opção &quot;Pagamentos no meu site (Checkout Transparente)&quot;.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(229, 179, 56, 0.2)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: '0.78rem',
                        }}
                      >
                        3
                      </span>
                      <div>
                        <strong>Copie as Credenciais Corretas da sua Aplicação:</strong>
                        <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          No menu lateral da sua aplicação criada no Mercado Pago, escolha conforme seu objetivo:
                        </p>
                        <div style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                          • <strong>Para Testar (Sandbox):</strong> Clique em <em>Credenciais de Teste</em>. Copie o Public Key e Access Token (começam com <code>TEST-</code>).<br />
                          • <strong>Para Vender Real (Produção):</strong> Clique em <em>Credenciais de Produção</em>. Copie as chaves (começam com <code>APP_USR-</code>) e desmarque a opção Modo Sandbox.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(229, 179, 56, 0.2)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: '0.78rem',
                        }}
                      >
                        4
                      </span>
                      <div>
                        <strong>Configure as Notificações Webhook:</strong>
                        <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          Vá na aba <strong>Webhooks</strong>, adicione a URL copiada acima e marque o evento <strong>Pagamentos (payment)</strong>.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(229, 179, 56, 0.2)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          flexShrink: 0,
                          fontSize: '0.78rem',
                        }}
                      >
                        5
                      </span>
                      <div>
                        <strong>Pronto! Teste a Conexão:</strong>
                        <p style={{ color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                          Clique em &quot;Validar Credenciais na API&quot; no topo para verificar se a conexão está 100% operacional.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

            {/* Conteúdo WhatsApp API (Roadmap) */}
            {activeIntegrationTab === 'whatsapp' && (
              <div
                className="glass-panel"
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'rgba(37, 211, 102, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#25D366',
                  }}
                >
                  <Smartphone size={30} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Integração WhatsApp Business / Evolution API
                </h3>
                <p style={{ maxWidth: '540px', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  Em breve você poderá gerenciar múltiplos servidores de WhatsApp, conexão com QR Code, disparos automáticos de lembretes e mensagens de confirmação de agendamentos diretamente por este menu.
                </p>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    background: 'rgba(229, 179, 56, 0.15)',
                    color: 'var(--primary)',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    fontWeight: 600,
                  }}
                >
                  Previsto no Roadmap
                </span>
              </div>
            )}

            {/* Conteúdo Outras Integrações (Roadmap) */}
            {activeIntegrationTab === 'others' && (
              <div
                className="glass-panel"
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818CF8',
                  }}
                >
                  <Globe size={30} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Novos Gateways de Pagamento (Asaas, Stripe, etc.)
                </h3>
                <p style={{ maxWidth: '540px', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  Esta seção foi desenhada para comportar de forma modular qualquer novo provedor de faturamento ou pagamento que desejar integrar ao BarberFlow no futuro.
                </p>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818CF8',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    fontWeight: 600,
                  }}
                >
                  Arquitetura Modular Pronta
                </span>
              </div>
            )}
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

      {/* Modal: Gerenciamento de Plano e Assinatura */}
      <Modal isOpen={isLimitModalOpen} onClose={() => setIsLimitModalOpen(false)} title="Gerenciar Plano & Assinatura do Salão">
        {selectedTenant && (
          <form onSubmit={handleUpdateLimits} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '2px' }}>
                Salão: <strong>{selectedTenant.name}</strong> ({selectedTenant.slug})
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Plano Atual: <strong style={{ color: 'var(--primary)' }}>{selectedTenant.subscription?.plan?.name || 'Sem plano'}</strong> &bull; Status:{' '}
                <span style={{ textTransform: 'uppercase' }}>{selectedTenant.subscription?.status || 'Sem assinatura'}</span>
              </p>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Alterar Plano do Salão *
              </label>
              <Select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBRL(p.priceCents)}/mês ({p.slug.toUpperCase()})
                  </option>
                ))}
              </Select>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Ao alterar o plano, permissões como Domínio Próprio (DNS), limites e vitrines entram em vigor imediatamente.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Status da Assinatura *
              </label>
              <Select value={selectedSubStatus} onChange={(e) => setSelectedSubStatus(e.target.value)}>
                <option value="ACTIVE">ACTIVE (Assinatura Ativa / Em dia)</option>
                <option value="TRIALING">TRIALING (Período de Teste Gratuito)</option>
                <option value="PAST_DUE">PAST_DUE (Pagamento Pendente / Em atraso)</option>
                <option value="CANCELED">CANCELED (Assinatura Cancelada)</option>
              </Select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Limite Personalizado de Profissionais (opcional)
              </label>
              <input
                type="number"
                min={1}
                placeholder="Deixe em branco para usar o limite padrão do plano"
                value={profOverride}
                onChange={(e) => setProfOverride(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Permite conceder mais profissionais a este cliente sem alterar o plano global.
              </span>
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
                {updating ? 'Salvando...' : 'Salvar Alterações do Plano'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal: Editar Plano da Vitrine */}
      <Modal isOpen={isPlanModalOpen} onClose={() => setIsPlanModalOpen(false)} title={`Editar Plano: ${selectedPlan?.name}`} maxWidth="620px">
        {selectedPlan && (
          <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
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
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
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
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Descrição na Vitrine
              </label>
              <input
                type="text"
                placeholder="Ex: Perfeito para equipes com múltiplos barbeiros e alta demanda."
                value={planForm.description}
                onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <span>Máx. Profissionais</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>vazio = ilimitado</span>
                </label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={planForm.maxProfessionals}
                  onChange={(e) => setPlanForm({ ...planForm, maxProfessionals: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  <span>Máx. Agendamentos/mês</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>vazio = ilimitado</span>
                </label>
                <input
                  type="number"
                  placeholder="Ilimitado"
                  value={planForm.maxAppointments}
                  onChange={(e) => setPlanForm({ ...planForm, maxAppointments: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'flex-start' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Selo de Destaque (Badge)
                </label>
                <input
                  type="text"
                  placeholder="Ex: MAIS POPULAR"
                  value={planForm.badge}
                  onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Destaque Visual
                </label>
                <label
                  style={{
                    height: '42px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '0 14px',
                    borderRadius: '8px',
                    background: planForm.isHighlighted ? 'rgba(229, 179, 56, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    border: planForm.isHighlighted ? '1px solid rgba(229, 179, 56, 0.5)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={planForm.isHighlighted}
                    onChange={(e) => setPlanForm({ ...planForm, isHighlighted: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer', margin: 0 }}
                  />
                  <Sparkles size={16} color={planForm.isHighlighted ? 'var(--primary)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: planForm.isHighlighted ? 'var(--primary)' : 'var(--text-main)', whiteSpace: 'nowrap' }}>
                    Destacar Card Dourado
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                <span>Lista de Benefícios na Vitrine</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>1 benefício por linha</span>
              </label>
              <textarea
                rows={5}
                placeholder="1 Profissional&#10;Até 300 agendamentos/mês&#10;Bot de WhatsApp integrado&#10;Fluxo de caixa básico"
                value={planForm.featuresText}
                onChange={(e) => setPlanForm({ ...planForm, featuresText: e.target.value })}
                style={{ resize: 'vertical', minHeight: '110px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="glass-card"
                style={{ padding: '12px 24px', fontWeight: 600, border: '1px solid var(--border-color)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={updating}
                className="gold-gradient-primary gold-glow"
                style={{ flex: 1, padding: '12px', fontWeight: 600, cursor: 'pointer' }}
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
