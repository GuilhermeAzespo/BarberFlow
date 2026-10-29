'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart3,
  Star,
  Scissors,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Filter,
  Sparkles,
  MessageSquare,
  Award,
  ThumbsUp,
  Percent,
  RefreshCw,
  Search,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
  UserCheck,
  Phone,
  HelpCircle,
  Crown,
  Lock,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { DatePicker } from '../../components/DatePicker';

type ActiveTab = 'satisfaction' | 'cuts' | 'appointments';
type DatePreset = 'TODAY' | '7D' | '30D' | 'MONTH' | 'LAST_MONTH' | 'YEAR';

interface ProfessionalOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

// ─── Interfaces Tab 1: Pesquisa de Satisfação ────────────────────────────────
interface SatisfactionReport {
  period: { start: string; end: string };
  summary: {
    totalSurveys: number;
    averageRating: number;
    csatPercentage: number;
    npsScore: number;
    feedbackCount: number;
    ratingCounts: Record<number, number>;
    attendant: { total: number; averageRating: number };
    service: { total: number; averageRating: number };
  };
  professionalRatings: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    totalSurveys: number;
    averageRating: number;
    fiveStarCount: number;
  }>;
  feedbacks: Array<{
    id: string;
    type: 'ATTENDANT' | 'SERVICE';
    rating: number;
    feedback?: string | null;
    customerName: string;
    customerPhone?: string | null;
    professionalName?: string | null;
    serviceName?: string | null;
    createdAt: string;
  }>;
}

// ─── Interfaces Tab 2: Cortes por Barbeiro ───────────────────────────────────
interface CutsByBarberReport {
  period: { start: string; end: string };
  summary: {
    totalSalonCuts: number;
    totalSalonRevenueCents: number;
    salonAverageTicketCents: number;
    activeBarbersCount: number;
    topBarberName: string;
    topBarberCuts: number;
  };
  barbers: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    colorHex?: string | null;
    completedCuts: number;
    revenueCents: number;
    averageTicketCents: number;
    sharePercentage: number;
    averageRating: number | null;
    topServices: Array<{
      name: string;
      count: number;
      revenueCents: number;
    }>;
  }>;
}

// ─── Interfaces Tab 3: Agendamentos ──────────────────────────────────────────
interface AppointmentsReport {
  period: { start: string; end: string };
  summary: {
    totalAppointments: number;
    completedCount: number;
    scheduledCount: number;
    canceledCount: number;
    noShowCount: number;
    completionRate: number;
    cancellationRate: number;
    noShowRate: number;
    realizedRevenueCents: number;
    lostRevenueCents: number;
    sourceCounts: {
      WHATSAPP_BOT: number;
      PANEL: number;
      ONLINE_BOOKING: number;
    };
  };
  topCancellationReasons: Array<{ reason: string; count: number }>;
  timeline: Array<{
    date: string;
    total: number;
    completed: number;
    canceled: number;
    scheduled: number;
  }>;
  appointments: Array<{
    id: string;
    startAt: string;
    status: string;
    source: string;
    priceCents: number;
    customerName: string;
    customerPhone?: string | null;
    professionalName: string;
    serviceName: string;
    cancelReason?: string | null;
  }>;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
};

export default function ReportsPage() {
  const { toast } = useToast();
  const { hasPlanFeature, subscription } = useAuth();
  const hasReportsAccess = hasPlanFeature('reports');
  const [activeTab, setActiveTab] = useState<ActiveTab>('satisfaction');

  // Filtros Globais
  const [datePreset, setDatePreset] = useState<DatePreset>('MONTH');
  const [startDate, setStartDate] = useState(() => DateTime.now().startOf('month').toFormat('yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => DateTime.now().endOf('day').toFormat('yyyy-MM-dd'));
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>('');
  const [professionalsList, setProfessionalsList] = useState<ProfessionalOption[]>([]);

  // Filtros específicos da Pesquisa
  const [surveyTypeFilter, setSurveyTypeFilter] = useState<'ALL' | 'ATTENDANT' | 'SERVICE'>('ALL');
  const [surveyRatingFilter, setSurveyRatingFilter] = useState<string>('ALL');

  // Filtros específicos de Agendamentos
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<string>('ALL');

  // Dados dos Relatórios
  const [loading, setLoading] = useState(true);
  const [satisfactionData, setSatisfactionData] = useState<SatisfactionReport | null>(null);
  const [cutsData, setCutsData] = useState<CutsByBarberReport | null>(null);
  const [appointmentsData, setAppointmentsData] = useState<AppointmentsReport | null>(null);

  // Carrega lista de profissionais para o select
  useEffect(() => {
    api
      .get<{ professionals: ProfessionalOption[] }>('/api/professionals')
      .then((res) => setProfessionalsList(res.professionals || []))
      .catch(() => {});
  }, []);

  // Altera datas conforme o preset
  const handlePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = DateTime.now();

    switch (preset) {
      case 'TODAY':
        setStartDate(now.toFormat('yyyy-MM-dd'));
        setEndDate(now.toFormat('yyyy-MM-dd'));
        break;
      case '7D':
        setStartDate(now.minus({ days: 6 }).toFormat('yyyy-MM-dd'));
        setEndDate(now.toFormat('yyyy-MM-dd'));
        break;
      case '30D':
        setStartDate(now.minus({ days: 29 }).toFormat('yyyy-MM-dd'));
        setEndDate(now.toFormat('yyyy-MM-dd'));
        break;
      case 'MONTH':
        setStartDate(now.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(now.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      case 'LAST_MONTH':
        const lastMonth = now.minus({ months: 1 });
        setStartDate(lastMonth.startOf('month').toFormat('yyyy-MM-dd'));
        setEndDate(lastMonth.endOf('month').toFormat('yyyy-MM-dd'));
        break;
      case 'YEAR':
        setStartDate(now.startOf('year').toFormat('yyyy-MM-dd'));
        setEndDate(now.endOf('year').toFormat('yyyy-MM-dd'));
        break;
    }
  };

  // Carrega relatório ativo
  const loadActiveReport = async () => {
    setLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (startDate) baseParams.set('startDate', startDate);
      if (endDate) baseParams.set('endDate', endDate);
      if (selectedProfessionalId) baseParams.set('professionalId', selectedProfessionalId);

      if (activeTab === 'satisfaction') {
        if (surveyTypeFilter !== 'ALL') baseParams.set('type', surveyTypeFilter);
        if (surveyRatingFilter !== 'ALL') baseParams.set('rating', surveyRatingFilter);
        const data = await api.get<SatisfactionReport>(`/api/reports/satisfaction?${baseParams.toString()}`);
        setSatisfactionData(data);
      } else if (activeTab === 'cuts') {
        const data = await api.get<CutsByBarberReport>(`/api/reports/cuts-by-barber?${baseParams.toString()}`);
        setCutsData(data);
      } else if (activeTab === 'appointments') {
        if (appointmentStatusFilter !== 'ALL') baseParams.set('status', appointmentStatusFilter);
        const data = await api.get<AppointmentsReport>(`/api/reports/appointments?${baseParams.toString()}`);
        setAppointmentsData(data);
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasReportsAccess) {
      setLoading(false);
      return;
    }
    loadActiveReport();
  }, [
    hasReportsAccess,
    activeTab,
    startDate,
    endDate,
    selectedProfessionalId,
    surveyTypeFilter,
    surveyRatingFilter,
    appointmentStatusFilter,
  ]);

  // Exportação CSV do relatório ativo
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    const filenamePrefix = `relatorio-${activeTab}-${startDate}-a-${endDate}`;

    if (activeTab === 'satisfaction' && satisfactionData) {
      csvContent += 'ID,Tipo,Nota,Cliente,Telefone,Profissional,Servico,Feedback,Data\n';
      satisfactionData.feedbacks.forEach((f) => {
        const row = [
          `"${f.id}"`,
          `"${f.type === 'ATTENDANT' ? 'Atendimento' : 'Corte / Serviço'}"`,
          f.rating,
          `"${f.customerName.replace(/"/g, '""')}"`,
          `"${f.customerPhone || ''}"`,
          `"${(f.professionalName || '').replace(/"/g, '""')}"`,
          `"${(f.serviceName || '').replace(/"/g, '""')}"`,
          `"${(f.feedback || '').replace(/"/g, '""')}"`,
          `"${DateTime.fromISO(f.createdAt).toFormat('dd/MM/yyyy HH:mm')}"`,
        ].join(',');
        csvContent += row + '\n';
      });
    } else if (activeTab === 'cuts' && cutsData) {
      csvContent += 'Ranking,Barbeiro,Cortes Concluidos,Faturamento (R$),Ticket Medio (R$),Participacao (%),Nota Media\n';
      cutsData.barbers.forEach((b, idx) => {
        const row = [
          idx + 1,
          `"${b.name.replace(/"/g, '""')}"`,
          b.completedCuts,
          (b.revenueCents / 100).toFixed(2),
          (b.averageTicketCents / 100).toFixed(2),
          b.sharePercentage,
          b.averageRating || 'N/A',
        ].join(',');
        csvContent += row + '\n';
      });
    } else if (activeTab === 'appointments' && appointmentsData) {
      csvContent += 'Data,Cliente,Telefone,Profissional,Servico,Valor (R$),Status,Origem,Motivo Cancelamento\n';
      appointmentsData.appointments.forEach((a) => {
        const row = [
          `"${DateTime.fromISO(a.startAt).toFormat('dd/MM/yyyy HH:mm')}"`,
          `"${a.customerName.replace(/"/g, '""')}"`,
          `"${a.customerPhone || ''}"`,
          `"${a.professionalName.replace(/"/g, '""')}"`,
          `"${a.serviceName.replace(/"/g, '""')}"`,
          (a.priceCents / 100).toFixed(2),
          `"${a.status}"`,
          `"${a.source}"`,
          `"${(a.cancelReason || '').replace(/"/g, '""')}"`,
        ].join(',');
        csvContent += row + '\n';
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filenamePrefix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório exportado com sucesso em formato CSV!');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />

        <main style={{ padding: '28px', flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {/* Cabeçalho da Página */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(229, 179, 56, 0.15)',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                  }}
                >
                  <BarChart3 size={22} />
                </div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Central de Relatórios & Inteligência
                </h1>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '4px 0 0 48px' }}>
                Análise executiva de satisfação de clientes, produtividade da equipe de barbeiros e desempenho de agendamentos.
              </p>
            </div>

            {/* Botão de Exportar */}
            {hasReportsAccess && (
              <button
                onClick={handleExportCSV}
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                }}
              >
                <Download size={16} color="var(--primary)" />
                <span>Exportar CSV</span>
              </button>
            )}
          </div>

          {!hasReportsAccess ? (
            <div
              className="glass-panel gold-glow"
              style={{
                padding: '48px 32px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '740px',
                margin: '40px auto',
                borderRadius: '20px',
              }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.25), rgba(150, 108, 15, 0.15))',
                  border: '1px solid rgba(229, 179, 56, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  boxShadow: '0 0 30px rgba(229, 179, 56, 0.3)',
                }}
              >
                <Crown size={36} color="var(--primary)" />
              </div>

              <span
                className="badge badge-warning"
                style={{
                  padding: '6px 14px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: '14px',
                }}
              >
                Módulo Exclusivo Planos Pro & Premium
              </span>

              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 10px 0', color: 'var(--text-main)' }}>
                Central de Relatórios & Inteligência
              </h2>

              <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.6, maxWidth: '560px', margin: '0 0 28px 0' }}>
                Seu salão está no plano <strong>{subscription?.plan?.name || 'Starter'}</strong>. Para ter acesso a gráficos analíticos de produtividade por barbeiro, notas e avaliações de clientes (CSAT/NPS) e histórico completo de agendamentos, faça o upgrade para o plano <strong>Pro (R$ 39,99/mês)</strong> ou <strong>Premium</strong>.
              </p>

              <div
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '12px',
                  textAlign: 'left',
                  marginBottom: '32px',
                }}
              >
                <div className="glass-card" style={{ padding: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Star size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem' }}>Pesquisas automáticas de satisfação (CSAT & NPS)</span>
                </div>
                <div className="glass-card" style={{ padding: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Scissors size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem' }}>Produtividade e faturamento por barbeiro</span>
                </div>
                <div className="glass-card" style={{ padding: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Calendar size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem' }}>Taxa de realização, cancelamento e retenção</span>
                </div>
                <div className="glass-card" style={{ padding: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <Download size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem' }}>Exportação de planilhas e relatórios em CSV</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <a
                  href="/settings"
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '12px 28px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Crown size={18} />
                  <span>Fazer Upgrade para o Pro (R$ 39,99/mês)</span>
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Abas Principais (Segmented Tabs) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px',
              borderRadius: '12px',
              marginBottom: '20px',
              overflowX: 'auto',
            }}
          >
            <button
              onClick={() => setActiveTab('satisfaction')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'satisfaction' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'satisfaction' ? '#0B0F17' : 'var(--text-muted)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <Star size={17} />
              <span>Pesquisas de Satisfação</span>
            </button>

            <button
              onClick={() => setActiveTab('cuts')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'cuts' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'cuts' ? '#0B0F17' : 'var(--text-muted)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <Scissors size={17} />
              <span>Cortes por Barbeiro</span>
            </button>

            <button
              onClick={() => setActiveTab('appointments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '8px',
                fontSize: '0.88rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                background: activeTab === 'appointments' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'appointments' ? '#0B0F17' : 'var(--text-muted)',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <Calendar size={17} />
              <span>Agendamentos & Cancelamentos</span>
            </button>
          </div>

          {/* Painel de Filtros e Seletores de Data */}
          <div
            className="glass-panel"
            style={{
              padding: '18px 22px',
              borderRadius: '12px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              {/* Presets de Data */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600, marginRight: '4px' }}>
                  Período:
                </span>
                {[
                  { key: 'TODAY', label: 'Hoje' },
                  { key: '7D', label: '7 Dias' },
                  { key: '30D', label: '30 Dias' },
                  { key: 'MONTH', label: 'Este Mês' },
                  { key: 'LAST_MONTH', label: 'Mês Anterior' },
                  { key: 'YEAR', label: 'Ano Atual' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => handlePresetChange(item.key as DatePreset)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: datePreset === item.key ? 'var(--primary)' : 'var(--border-color)',
                      background: datePreset === item.key ? 'rgba(229, 179, 56, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                      color: datePreset === item.key ? 'var(--primary)' : 'var(--text-muted)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Botão de Atualizar dados */}
              <button
                onClick={loadActiveReport}
                disabled={loading}
                title="Atualizar dados"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: loading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.8rem',
                }}
              >
                <RefreshCw size={14} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
              </button>
            </div>

            {/* Inputs de Data Customizada e Seletores de Profissional */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>De:</span>
                <div style={{ width: '155px' }}>
                  <DatePicker
                    value={startDate}
                    onChange={(val) => {
                      if (val) {
                        setStartDate(val);
                        setDatePreset('MONTH');
                      }
                    }}
                    placeholder="DD/MM/AAAA"
                    style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Até:</span>
                <div style={{ width: '155px' }}>
                  <DatePicker
                    value={endDate}
                    onChange={(val) => {
                      if (val) {
                        setEndDate(val);
                        setDatePreset('MONTH');
                      }
                    }}
                    placeholder="DD/MM/AAAA"
                    style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Filtro por Profissional */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '220px' }}>
                <Users size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <Select
                    value={selectedProfessionalId}
                    onChange={(e) => setSelectedProfessionalId(e.target.value)}
                    style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                  >
                    <option value="">Todos os Barbeiros</option>
                    {professionalsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Sub-filtros para Pesquisa de Satisfação */}
              {activeTab === 'satisfaction' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Canal:</span>
                    <div style={{ width: '190px' }}>
                      <Select
                        value={surveyTypeFilter}
                        onChange={(e) => setSurveyTypeFilter(e.target.value as 'ALL' | 'ATTENDANT' | 'SERVICE')}
                        style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                      >
                        <option value="ALL">Todas as Pesquisas</option>
                        <option value="ATTENDANT">Atendimento Humano</option>
                        <option value="SERVICE">Pós-Corte (Barbeiro)</option>
                      </Select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Nota:</span>
                    <div style={{ width: '200px' }}>
                      <Select
                        value={surveyRatingFilter}
                        onChange={(e) => setSurveyRatingFilter(e.target.value)}
                        style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                      >
                        <option value="ALL">Todas as Notas (1 a 5)</option>
                        <option value="5">Nota 5 - Excelente 🤩</option>
                        <option value="4">Nota 4 - Bom 🙂</option>
                        <option value="3">Nota 3 - Regular 😐</option>
                        <option value="2">Nota 2 - Ruim 🙁</option>
                        <option value="1">Nota 1 - Muito Ruim 😡</option>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Sub-filtros para Agendamentos */}
              {activeTab === 'appointments' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontWeight: 600 }}>Status:</span>
                  <div style={{ width: '220px' }}>
                    <Select
                      value={appointmentStatusFilter}
                      onChange={(e) => setAppointmentStatusFilter(e.target.value)}
                      style={{ padding: '7px 12px', fontSize: '0.85rem' }}
                    >
                      <option value="ALL">Todos os Status</option>
                      <option value="COMPLETED">Realizados (Concluídos)</option>
                      <option value="SCHEDULED">Agendados</option>
                      <option value="CONFIRMED">Confirmados</option>
                      <option value="CANCELED">Cancelados</option>
                      <option value="NO_SHOW">Não Compareceu (No-Show)</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* TAB 1: RELATÓRIO DE PESQUISAS DE SATISFAÇÃO */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {activeTab === 'satisfaction' && (
            <div>
              {/* KPIs de Satisfação */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                {/* Média Geral */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Média Geral
                    </span>
                    <Star size={18} color="var(--primary)" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      {satisfactionData?.summary.averageRating.toFixed(1) || '0.0'}
                    </span>
                    <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>/ 5.0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={14}
                        fill={star <= Math.round(satisfactionData?.summary.averageRating || 0) ? '#E5B338' : 'none'}
                        color={star <= Math.round(satisfactionData?.summary.averageRating || 0) ? '#E5B338' : 'rgba(255,255,255,0.2)'}
                      />
                    ))}
                    <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600, marginLeft: '6px' }}>
                      {satisfactionData?.summary.averageRating && satisfactionData.summary.averageRating >= 4.5
                        ? 'Excelente'
                        : satisfactionData?.summary.averageRating && satisfactionData.summary.averageRating >= 3.8
                        ? 'Muito Bom'
                        : 'Regular'}
                    </span>
                  </div>
                </div>

                {/* Total de Avaliações */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Avaliações Recebidas
                    </span>
                    <MessageSquare size={18} color="#38BDF8" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {satisfactionData?.summary.totalSurveys || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    {satisfactionData?.summary.feedbackCount || 0} com comentários textuais
                  </div>
                </div>

                {/* CSAT (% Positivo) */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Aprovação (CSAT)
                    </span>
                    <ThumbsUp size={18} color="#10B981" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#10B981' }}>
                    {satisfactionData?.summary.csatPercentage || 0}%
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Notas 4 e 5 (Bom ou Excelente)
                  </div>
                </div>

                {/* NPS Estimado */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      NPS Score
                    </span>
                    <Award size={18} color="var(--primary)" />
                  </div>
                  <div
                    style={{
                      fontSize: '2.2rem',
                      fontWeight: 800,
                      color:
                        (satisfactionData?.summary.npsScore || 0) >= 50
                          ? '#10B981'
                          : (satisfactionData?.summary.npsScore || 0) >= 0
                          ? '#E5B338'
                          : '#FB7185',
                    }}
                  >
                    {satisfactionData?.summary.npsScore !== undefined
                      ? `${satisfactionData.summary.npsScore > 0 ? '+' : ''}${satisfactionData.summary.npsScore}`
                      : '0'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    {(satisfactionData?.summary.npsScore || 0) >= 70
                      ? 'Zona de Excelência'
                      : (satisfactionData?.summary.npsScore || 0) >= 50
                      ? 'Zona de Qualidade'
                      : 'Zona de Aperfeiçoamento'}
                  </div>
                </div>
              </div>

              {/* Distribuição de Notas e Médias por Canal */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '20px',
                  marginBottom: '24px',
                }}
              >
                {/* Breakdown de Notas (1 a 5) */}
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                    Distribuição das Notas
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { rating: 5, label: 'Excelente 🤩', color: '#10B981' },
                      { rating: 4, label: 'Bom 🙂', color: '#34D399' },
                      { rating: 3, label: 'Regular 😐', color: '#FBBF24' },
                      { rating: 2, label: 'Ruim 🙁', color: '#F97316' },
                      { rating: 1, label: 'Muito Ruim 😡', color: '#EF4444' },
                    ].map((item) => {
                      const count = satisfactionData?.summary.ratingCounts[item.rating] || 0;
                      const total = satisfactionData?.summary.totalSurveys || 1;
                      const pct = Math.round((count / total) * 100);

                      return (
                        <div key={item.rating} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem' }}>
                          <span style={{ minWidth: '110px', color: 'var(--text-main)', fontWeight: 500 }}>
                            {item.label}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: '10px',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: item.color,
                                borderRadius: '6px',
                                transition: 'width 0.4s ease',
                              }}
                            />
                          </div>
                          <span style={{ minWidth: '55px', textAlign: 'right', fontWeight: 600, color: 'var(--text-dim)' }}>
                            {count} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Comparativo de Canal: Atendente vs Barbeiro */}
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                    Comparativo por Canal de Pesquisa
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div
                      style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <UserCheck size={18} color="var(--primary)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Atendimento Humano</span>
                      </div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {satisfactionData?.summary.attendant.averageRating.toFixed(1) || '0.0'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        {satisfactionData?.summary.attendant.total || 0} avaliações ao encerrar chat
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '16px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Scissors size={18} color="#34D399" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Pós-Corte (Barbeiro)</span>
                      </div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34D399' }}>
                        {satisfactionData?.summary.service.averageRating.toFixed(1) || '0.0'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        {satisfactionData?.summary.service.total || 0} avaliações pós-agendamento
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ranking de Barbeiros por Avaliação */}
              {satisfactionData?.professionalRatings && satisfactionData.professionalRatings.length > 0 && (
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                    Ranking de Satisfação por Barbeiro
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                    {satisfactionData.professionalRatings.map((p, idx) => (
                      <div
                        key={p.id}
                        style={{
                          padding: '14px 18px',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            style={{
                              fontSize: '0.9rem',
                              fontWeight: 800,
                              color: idx === 0 ? '#E5B338' : idx === 1 ? '#94A3B8' : idx === 2 ? '#CD7F32' : 'var(--text-dim)',
                            }}
                          >
                            #{idx + 1}
                          </span>
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#F3F4F6' }}>{p.name}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                              {p.totalSurveys} avaliação(ões) • {p.fiveStarCount} ⭐⭐⭐⭐⭐
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                            {p.averageRating.toFixed(1)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>de 5.0</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Mural de Feedbacks & Depoimentos Recentes */}
              <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Avaliações & Sugestões Recentes de Clientes
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Exibindo até 100 avaliações do período
                  </span>
                </div>

                {satisfactionData?.feedbacks && satisfactionData.feedbacks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {satisfactionData.feedbacks.map((f) => (
                      <div
                        key={f.id}
                        style={{
                          padding: '16px 20px',
                          background: 'rgba(0, 0, 0, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: f.type === 'ATTENDANT' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(229, 179, 56, 0.15)',
                                color: f.type === 'ATTENDANT' ? '#38BDF8' : 'var(--primary)',
                                border: `1px solid ${f.type === 'ATTENDANT' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(229, 179, 56, 0.3)'}`,
                              }}
                            >
                              {f.type === 'ATTENDANT' ? 'Atendimento' : 'Pós-Corte'}
                            </span>

                            <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#F3F4F6' }}>
                              {f.customerName}
                            </span>

                            {f.customerPhone && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                ({f.customerPhone})
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  size={13}
                                  fill={star <= f.rating ? '#E5B338' : 'none'}
                                  color={star <= f.rating ? '#E5B338' : 'rgba(255,255,255,0.2)'}
                                />
                              ))}
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginLeft: '4px' }}>
                                {f.rating}.0
                              </span>
                            </div>

                            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                              {DateTime.fromISO(f.createdAt).toFormat('dd/MM/yyyy HH:mm')}
                            </span>
                          </div>
                        </div>

                        {/* Detalhes do profissional/serviço */}
                        {(f.professionalName || f.serviceName) && (
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            {f.professionalName && <span>Barbeiro: <strong>{f.professionalName}</strong></span>}
                            {f.serviceName && <span style={{ marginLeft: '12px' }}>Serviço: <strong>{f.serviceName}</strong></span>}
                          </div>
                        )}

                        {/* Comentário textual (Nível 2) */}
                        {f.feedback ? (
                          <div
                            style={{
                              padding: '10px 14px',
                              background: 'rgba(255, 255, 255, 0.03)',
                              borderLeft: '3px solid var(--primary)',
                              borderRadius: '4px',
                              fontSize: '0.84rem',
                              color: '#E5E7EB',
                              fontStyle: 'italic',
                              marginTop: '2px',
                            }}
                          >
                            "{f.feedback}"
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            Sem sugestão textual deixada.
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                    Nenhuma pesquisa de satisfação encontrada para os filtros selecionados.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* TAB 2: QUANTIDADE DE CORTES POR BARBEIRO */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {activeTab === 'cuts' && (
            <div>
              {/* KPIs de Cortes & Produtividade */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                {/* Total de Cortes */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Cortes Realizados
                    </span>
                    <Scissors size={18} color="var(--primary)" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {cutsData?.summary.totalSalonCuts || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Atendimentos concluídos com sucesso
                  </div>
                </div>

                {/* Barbeiro Campeão */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Barbeiro Destaque
                    </span>
                    <Award size={18} color="#E5B338" />
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#F3F4F6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cutsData?.summary.topBarberName || 'Nenhum'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600, marginTop: '6px' }}>
                    {cutsData?.summary.topBarberCuts || 0} cortes no período
                  </div>
                </div>

                {/* Faturamento dos Cortes */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Faturamento Total
                    </span>
                    <TrendingUp size={18} color="#10B981" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#10B981' }}>
                    {formatCurrency(cutsData?.summary.totalSalonRevenueCents || 0)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Receita bruta de cortes concluídos
                  </div>
                </div>

                {/* Ticket Médio */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Ticket Médio
                    </span>
                    <Sparkles size={18} color="#38BDF8" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {formatCurrency(cutsData?.summary.salonAverageTicketCents || 0)}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Média de valor por cliente atendido
                  </div>
                </div>
              </div>

              {/* Tabela Executiva de Barbeiros */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '12px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                  Produtividade & Desempenho por Barbeiro
                </h3>

                {cutsData?.barbers && cutsData.barbers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {cutsData.barbers.map((barber, index) => (
                      <div
                        key={barber.id}
                        style={{
                          background: 'rgba(0, 0, 0, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: '12px',
                          padding: '18px 22px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background:
                                  index === 0
                                    ? 'linear-gradient(135deg, #E5B338, #966C0F)'
                                    : index === 1
                                    ? 'linear-gradient(135deg, #94A3B8, #475569)'
                                    : index === 2
                                    ? 'linear-gradient(135deg, #CD7F32, #78350F)'
                                    : 'rgba(255,255,255,0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.9rem',
                                color: index <= 2 ? '#0B0F17' : 'var(--text-muted)',
                              }}
                            >
                              #{index + 1}
                            </div>

                            <div>
                              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#F3F4F6' }}>{barber.name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {barber.sharePercentage}% da produção da barbearia
                              </div>
                            </div>
                          </div>

                          {/* Métricas do Barbeiro */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase' }}>
                                Cortes Feitos
                              </span>
                              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {barber.completedCuts}
                              </span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase' }}>
                                Faturamento
                              </span>
                              <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>
                                {formatCurrency(barber.revenueCents)}
                              </span>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase' }}>
                                Ticket Médio
                              </span>
                              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F3F4F6' }}>
                                {formatCurrency(barber.averageTicketCents)}
                              </span>
                            </div>

                            <div style={{ textAlign: 'right', minWidth: '80px' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', textTransform: 'uppercase' }}>
                                Avaliação
                              </span>
                              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                                {barber.averageRating ? `⭐ ${barber.averageRating}` : 'Sem nota'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Barra de Participação */}
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, barber.sharePercentage))}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #E5B338, #10B981)',
                              borderRadius: '4px',
                            }}
                          />
                        </div>

                        {/* Top Serviços Executados */}
                        {barber.topServices && barber.topServices.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                              Mais executados:
                            </span>
                            {barber.topServices.map((srv, sIdx) => (
                              <span
                                key={sIdx}
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '3px 8px',
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: '6px',
                                  color: 'var(--text-main)',
                                }}
                              >
                                {srv.name}: <strong>{srv.count}x</strong> ({formatCurrency(srv.revenueCents)})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                    Nenhum corte concluído encontrado para o período e filtros selecionados.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────── */}
          {/* TAB 3: AGENDAMENTOS & CANCELAMENTOS */}
          {/* ─────────────────────────────────────────────────────────────────── */}
          {activeTab === 'appointments' && (
            <div>
              {/* KPIs de Agendamentos */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px',
                }}
              >
                {/* Total */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Total Agendamentos
                    </span>
                    <Calendar size={18} color="var(--primary)" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                    {appointmentsData?.summary.totalAppointments || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Registros criados no período
                  </div>
                </div>

                {/* Concluídos / Realizados */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Realizados
                    </span>
                    <CheckCircle2 size={18} color="#10B981" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#10B981' }}>
                    {appointmentsData?.summary.completedCount || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#10B981', fontWeight: 600, marginTop: '6px' }}>
                    Taxa de Conclusão: {appointmentsData?.summary.completionRate || 0}%
                  </div>
                </div>

                {/* Futuros / Agendados */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Pendentes / Agendados
                    </span>
                    <Clock size={18} color="#38BDF8" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#38BDF8' }}>
                    {appointmentsData?.summary.scheduledCount || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Agendados ou confirmados
                  </div>
                </div>

                {/* Cancelamentos */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Cancelamentos
                    </span>
                    <XCircle size={18} color="#FB7185" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FB7185' }}>
                    {appointmentsData?.summary.canceledCount || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#FB7185', fontWeight: 600, marginTop: '6px' }}>
                    Taxa de Cancelamento: {appointmentsData?.summary.cancellationRate || 0}%
                  </div>
                </div>

                {/* No-Show / Faltas */}
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Não Compareceu
                    </span>
                    <AlertCircle size={18} color="#FBBF24" />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FBBF24' }}>
                    {appointmentsData?.summary.noShowCount || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    Taxa de Falta: {appointmentsData?.summary.noShowRate || 0}%
                  </div>
                </div>
              </div>

              {/* Receita & Canais de Origem */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '20px',
                  marginBottom: '24px',
                }}
              >
                {/* Balanço Financeiro de Agendamentos */}
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                    Impacto Financeiro dos Agendamentos
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F3F4F6' }}>Receita Realizada</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Cortes concluídos e faturados</div>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>
                        {formatCurrency(appointmentsData?.summary.realizedRevenueCents || 0)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#F3F4F6' }}>Receita Perdida</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Cancelamentos e faltas no período</div>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#FB7185' }}>
                        {formatCurrency(appointmentsData?.summary.lostRevenueCents || 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Canais de Origem */}
                <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text-main)' }}>
                    Origem dos Agendamentos
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[
                      {
                        key: 'WHATSAPP_BOT',
                        label: 'Bot WhatsApp Automático',
                        count: appointmentsData?.summary.sourceCounts.WHATSAPP_BOT || 0,
                        color: '#25D366',
                      },
                      {
                        key: 'PANEL',
                        label: 'Painel Interno do Salão',
                        count: appointmentsData?.summary.sourceCounts.PANEL || 0,
                        color: 'var(--primary)',
                      },
                      {
                        key: 'ONLINE_BOOKING',
                        label: 'Vitrine Online / Link Público',
                        count: appointmentsData?.summary.sourceCounts.ONLINE_BOOKING || 0,
                        color: '#38BDF8',
                      },
                    ].map((item) => {
                      const total = appointmentsData?.summary.totalAppointments || 1;
                      const pct = Math.round((item.count / total) * 100);

                      return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem' }}>
                          <span style={{ minWidth: '150px', color: 'var(--text-main)', fontWeight: 500 }}>
                            {item.label}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: '10px',
                              background: 'rgba(255,255,255,0.06)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: item.color,
                                borderRadius: '6px',
                              }}
                            />
                          </div>
                          <span style={{ minWidth: '60px', textAlign: 'right', fontWeight: 700, color: 'var(--text-dim)' }}>
                            {item.count} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Tabela de Agendamentos Detalhada */}
              <div className="glass-panel" style={{ padding: '22px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Listagem Analítica de Agendamentos
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Exibindo até 100 registros recentes
                  </span>
                </div>

                {appointmentsData?.appointments && appointmentsData.appointments.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-dim)' }}>
                          <th style={{ padding: '10px 14px' }}>Data / Hora</th>
                          <th style={{ padding: '10px 14px' }}>Cliente</th>
                          <th style={{ padding: '10px 14px' }}>Barbeiro</th>
                          <th style={{ padding: '10px 14px' }}>Serviço</th>
                          <th style={{ padding: '10px 14px' }}>Valor</th>
                          <th style={{ padding: '10px 14px' }}>Origem</th>
                          <th style={{ padding: '10px 14px' }}>Status</th>
                          <th style={{ padding: '10px 14px' }}>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {appointmentsData.appointments.map((a) => {
                          const statusBadges: Record<string, { label: string; bg: string; color: string }> = {
                            COMPLETED: { label: 'Realizado', bg: 'rgba(16, 185, 129, 0.15)', color: '#10B981' },
                            SCHEDULED: { label: 'Agendado', bg: 'rgba(56, 189, 248, 0.15)', color: '#38BDF8' },
                            CONFIRMED: { label: 'Confirmado', bg: 'rgba(56, 189, 248, 0.25)', color: '#38BDF8' },
                            CANCELED: { label: 'Cancelado', bg: 'rgba(244, 63, 94, 0.15)', color: '#FB7185' },
                            NO_SHOW: { label: 'Não compareceu', bg: 'rgba(251, 191, 36, 0.15)', color: '#FBBF24' },
                          };
                          const badge = statusBadges[a.status] || {
                            label: a.status,
                            bg: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-dim)',
                          };

                          return (
                            <tr
                              key={a.id}
                              style={{
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                {DateTime.fromISO(a.startAt).toFormat('dd/MM/yyyy HH:mm')}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ fontWeight: 600, color: '#F3F4F6' }}>{a.customerName}</div>
                                {a.customerPhone && (
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{a.customerPhone}</div>
                                )}
                              </td>
                              <td style={{ padding: '12px 14px', color: '#E5E7EB' }}>{a.professionalName}</td>
                              <td style={{ padding: '12px 14px', color: '#E5E7EB' }}>{a.serviceName}</td>
                              <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--primary)' }}>
                                {formatCurrency(a.priceCents)}
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                                {a.source === 'WHATSAPP_BOT'
                                  ? 'Bot WhatsApp'
                                  : a.source === 'ONLINE_BOOKING'
                                  ? 'Vitrine Online'
                                  : 'Painel'}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <span
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    background: badge.bg,
                                    color: badge.color,
                                  }}
                                >
                                  {badge.label}
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                                {a.cancelReason ? `Motivo: ${a.cancelReason}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                    Nenhum agendamento encontrado para o período e filtros selecionados.
                  </div>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </main>
      </div>
    </div>
  );
}
