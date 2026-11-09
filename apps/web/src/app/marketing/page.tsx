'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Flame,
  Gift,
  Clock,
  UserCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Send,
  Calendar,
  Settings,
  Layers,
  ArrowRight,
  Shield,
  Trophy,
  Save,
  MessageSquare,
  Sparkles,
  Zap,
  Phone,
  Check,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { DateTime } from 'luxon';

interface MarketingConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  inactiveRecoveryEnabled: boolean;
  inactiveDaysThreshold: number;
  inactiveMessageTemplate: string;
  inactiveDiscountPercent?: number | null;
  birthdayEnabled: boolean;
  birthdayMessageTemplate: string;
  birthdayDiscountPercent?: number | null;
  sendWindowStart: string;
  sendWindowEnd: string;
  minDaysBetweenMessages: number;
  maxDailyDispatches: number;
}

interface MarketingStatsData {
  config: MarketingConfig;
  isWhatsAppConnected: boolean;
  stats: {
    inactiveCount: number;
    birthdaysTodayCount: number;
    sentToday: number;
    sentThisMonth: number;
    totalSent: number;
    recoveredCount: number;
    dailyRemainingQuota: number;
  };
}

interface InactiveCustomer {
  id: string;
  name: string;
  phone: string;
  lastVisitAt: string;
  daysSinceLastVisit: number;
  lastService: string;
  lastProfessional: string;
  lastContactAt: string | null;
  canSendNow: boolean;
}

interface BirthdayCustomer {
  id: string;
  name: string;
  phone: string;
  birthDate: string;
  birthDay: number;
  birthMonth: number;
  isToday: boolean;
  daysUntil: number;
  lastContactAt: string | null;
  canSendNow: boolean;
}

interface MarketingLogItem {
  id: string;
  type: 'INACTIVE_RECOVERY' | 'BIRTHDAY';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  phone: string;
  message: string;
  errorMessage?: string | null;
  sentAt: string;
  customer?: { id: string; name: string; phone?: string | null } | null;
}

export default function MarketingPage() {
  const { tenant, hasPlanFeature, isAddonFeature } = useAuth();
  const { toast, confirm } = useToast();

  const [activeTab, setActiveTab] = useState<'eligible' | 'config' | 'logs'>('eligible');
  const [subTab, setSubTab] = useState<'inactive' | 'birthdays'>('inactive');
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState<MarketingStatsData | null>(null);

  // Lista de inativos
  const [inactiveList, setInactiveList] = useState<InactiveCustomer[]>([]);
  const [inactiveSearch, setInactiveSearch] = useState('');
  const [inactivePage, setInactivePage] = useState(1);
  const [inactiveTotalPages, setInactiveTotalPages] = useState(1);

  // Lista de aniversariantes
  const [birthdaysToday, setBirthdaysToday] = useState<BirthdayCustomer[]>([]);
  const [birthdaysUpcoming, setBirthdaysUpcoming] = useState<BirthdayCustomer[]>([]);

  // Configuração
  const [configForm, setConfigForm] = useState<Partial<MarketingConfig>>({
    enabled: true,
    inactiveRecoveryEnabled: true,
    inactiveDaysThreshold: 30,
    inactiveMessageTemplate:
      'Olá, {cliente}! Sentimos sua falta aqui na {barbearia}. Que tal renovar o visual esta semana? Agende seu horário em 1 clique: {link}',
    inactiveDiscountPercent: 10,
    birthdayEnabled: true,
    birthdayMessageTemplate:
      '🎉 Parabéns, {cliente}! A equipe da {barbearia} deseja um feliz aniversário! Preparamos um presente especial para você: agende com desconto exclusivo pelo link: {link}',
    birthdayDiscountPercent: 15,
    sendWindowStart: '09:00',
    sendWindowEnd: '19:00',
    minDaysBetweenMessages: 30,
    maxDailyDispatches: 20,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Histórico
  const [logs, setLogs] = useState<MarketingLogItem[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);

  // Modal Envio Individual / Personalizado
  const [modalCustomer, setModalCustomer] = useState<{ id: string; name: string; phone: string; type: 'INACTIVE_RECOVERY' | 'BIRTHDAY' } | null>(null);
  const [customMsg, setCustomMsg] = useState('');
  const [sendingSingle, setSendingSingle] = useState(false);

  // Modal Teste no WhatsApp
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testType, setTestType] = useState<'INACTIVE_RECOVERY' | 'BIRTHDAY'>('INACTIVE_RECOVERY');
  const [sendingTest, setSendingTest] = useState(false);

  // Disparo em lote
  const [dispatchingBatch, setDispatchingBatch] = useState(false);

  // Carrega métricas e configurações
  const loadStatsAndConfig = async () => {
    try {
      const res = await api.get<MarketingStatsData>('/api/marketing/stats');
      setStatsData(res);
      if (res.config) {
        setConfigForm(res.config);
      }
    } catch (err) {
      console.error('Erro ao carregar dados de marketing', err);
    }
  };

  // Carrega inativos
  const loadInactive = async () => {
    try {
      const query = new URLSearchParams({
        page: String(inactivePage),
        pageSize: '15',
        ...(inactiveSearch ? { search: inactiveSearch } : {}),
      });
      const res = await api.get<{ customers: InactiveCustomer[]; totalPages: number }>(
        `/api/marketing/inactive?${query.toString()}`
      );
      setInactiveList(res.customers);
      setInactiveTotalPages(res.totalPages);
    } catch (err) {
      console.error('Erro ao carregar inativos', err);
    }
  };

  // Carrega aniversariantes
  const loadBirthdays = async () => {
    try {
      const res = await api.get<{ today: BirthdayCustomer[]; upcoming: BirthdayCustomer[] }>(
        '/api/marketing/birthdays'
      );
      setBirthdaysToday(res.today);
      setBirthdaysUpcoming(res.upcoming);
    } catch (err) {
      console.error('Erro ao carregar aniversariantes', err);
    }
  };

  // Carrega logs
  const loadLogs = async () => {
    try {
      const res = await api.get<{ logs: MarketingLogItem[]; totalPages: number }>(
        `/api/marketing/logs?page=${logsPage}&pageSize=20`
      );
      setLogs(res.logs);
      setLogsTotalPages(res.totalPages);
    } catch (err) {
      console.error('Erro ao carregar logs', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadStatsAndConfig(), loadInactive(), loadBirthdays()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadInactive();
    }
  }, [inactivePage, inactiveSearch]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, logsPage]);

  // Salvar configurações
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put('/api/marketing/config', configForm);
      toast.success('Configurações de marketing salvas com sucesso!');
      await loadStatsAndConfig();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Envio individual
  const handleSendSingle = async () => {
    if (!modalCustomer) return;
    setSendingSingle(true);
    try {
      await api.post('/api/marketing/send-single', {
        customerId: modalCustomer.id,
        type: modalCustomer.type,
        customMessage: customMsg || undefined,
      });
      toast.success(`Mensagem de WhatsApp enviada com sucesso para ${modalCustomer.name}!`);
      setModalCustomer(null);
      setCustomMsg('');
      await Promise.all([loadStatsAndConfig(), loadInactive(), loadBirthdays()]);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem via WhatsApp.');
    } finally {
      setSendingSingle(false);
    }
  };

  // Disparo em lote
  const handleBatchDispatch = async (type: 'INACTIVE_RECOVERY' | 'BIRTHDAY') => {
    const count =
      type === 'INACTIVE_RECOVERY'
        ? statsData?.stats.inactiveCount || 0
        : birthdaysToday.filter((b) => b.canSendNow).length;

    const ok = await confirm({
      title: type === 'INACTIVE_RECOVERY' ? '⏳ Confirmar Resgate de Clientes' : '🎉 Confirmar Parabéns de Aniversário',
      message: `Deseja iniciar o disparo automático via WhatsApp para os clientes elegíveis? O sistema respeitará os limites de segurança anti-ban diários.`,
      confirmText: 'Iniciar Disparos',
      icon: 'info',
    });

    if (!ok) return;

    setDispatchingBatch(true);
    try {
      const res = await api.post<{ success: boolean; sentCount: number; failedCount: number }>(
        '/api/marketing/send-batch',
        { type }
      );
      toast.success(`Disparo concluído: ${res.sentCount} mensagens enviadas com sucesso!`);
      await Promise.all([loadStatsAndConfig(), loadInactive(), loadBirthdays()]);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao executar disparos em lote.');
    } finally {
      setDispatchingBatch(false);
    }
  };

  // Enviar teste para telefone informado
  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = testPhone.replace(/\D/g, '');
    if (clean.length < 10) {
      toast.warning('Informe um número de WhatsApp válido com DDD.');
      return;
    }

    setSendingTest(true);
    try {
      await api.post('/api/marketing/send-test', {
        phone: clean,
        type: testType,
      });
      toast.success(`Mensagem de teste enviada para ${testPhone}! Verifique seu WhatsApp.`);
      setIsTestModalOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  const hasAccess = hasPlanFeature('marketing');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />

        <main style={{ flex: 1, padding: '32px', maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Header & Status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    color: '#0B0F17',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Flame size={22} />
                </div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                  Campanhas & Retorno de Clientes
                </h1>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '6px', maxWidth: '720px' }}>
                Robôs inteligentes para resgatar automaticamente clientes que estão há semanas sem cortar e parabenizar
                aniversariantes com ofertas exclusivas direto no WhatsApp.
              </p>
            </div>

            {/* Status do WhatsApp e Ações */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '12px',
                  background: statsData?.isWhatsAppConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  border: `1px solid ${statsData?.isWhatsAppConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: statsData?.isWhatsAppConnected ? '#34D399' : '#F87171',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: statsData?.isWhatsAppConnected ? '#10B981' : '#EF4444',
                  }}
                />
                <span>{statsData?.isWhatsAppConnected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}</span>
              </div>

              <button
                onClick={() => setIsTestModalOpen(true)}
                className="glass-card"
                style={{
                  padding: '9px 16px',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Phone size={15} color="var(--primary)" />
                <span>Testar Mensagem</span>
              </button>
            </div>
          </div>

          {/* Banner de Bloqueio se não tiver no Plano */}
          {!hasAccess && (
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                borderRadius: '16px',
                border: '1.5px solid rgba(229, 179, 56, 0.4)',
                background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)',
                marginBottom: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                    color: '#0B0F17',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFF' }}>
                    Módulo de Recuperação & Aniversários Disponível no Plano Pro
                  </h3>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    Faça upgrade do seu plano ou ative este módulo para colocar seus robôs de retorno para rodar 24h por dia.
                  </p>
                </div>
              </div>
              <Link
                href="/planos"
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '10px 22px',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              >
                Fazer Upgrade do Plano
              </Link>
            </div>
          )}

          {/* Cards de Métricas e KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '18px',
              marginBottom: '32px',
            }}
          >
            {/* Card 1: Aniversariantes */}
            <div
              className="glass-panel"
              style={{
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                background: 'radial-gradient(ellipse at top right, rgba(245, 158, 11, 0.1) 0%, transparent 70%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Aniversariantes de Hoje
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#F59E0B',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  🎉 Hoje
                </span>
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FDE68A', marginBottom: '4px' }}>
                {statsData?.stats.birthdaysTodayCount ?? 0}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Felicitações automáticas com desconto
              </span>
            </div>

            {/* Card 2: Clientes Sumidos */}
            <div
              className="glass-panel"
              style={{
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                background: 'radial-gradient(ellipse at top right, rgba(239, 68, 68, 0.1) 0%, transparent 70%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Clientes Sumidos ({'>'}{configForm.inactiveDaysThreshold || 30} dias)
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#F87171',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  ⏳ Resgate
                </span>
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#FCA5A5', marginBottom: '4px' }}>
                {statsData?.stats.inactiveCount ?? 0}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Prontos para serem resgatados
              </span>
            </div>

            {/* Card 3: Disparos no Mês */}
            <div
              className="glass-panel"
              style={{
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                background: 'radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Disparos este Mês
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60A5FA',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  🛡️ Anti-Ban
                </span>
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#93C5FD', marginBottom: '4px' }}>
                {statsData?.stats.sentThisMonth ?? 0}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                {statsData?.stats.sentToday ?? 0} hoje • {statsData?.stats.dailyRemainingQuota ?? 20} restantes
              </span>
            </div>

            {/* Card 4: Clientes Recuperados */}
            <div
              className="glass-panel"
              style={{
                padding: '22px',
                borderRadius: '16px',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                background: 'radial-gradient(ellipse at top right, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Clientes Recuperados (ROI)
                </span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34D399',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                  }}
                >
                  💰 Retorno
                </span>
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#6EE7B7', marginBottom: '4px' }}>
                {statsData?.stats.recoveredCount ?? 0}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Clientes que voltaram após mensagem
              </span>
            </div>
          </div>

          {/* Abas Principais */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '12px',
              marginBottom: '24px',
            }}
          >
            <button
              onClick={() => setActiveTab('eligible')}
              className={activeTab === 'eligible' ? 'gold-gradient-primary gold-glow' : 'glass-card'}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <UserCheck size={16} />
              <span>Clientes Elegíveis</span>
            </button>

            <button
              onClick={() => setActiveTab('config')}
              className={activeTab === 'config' ? 'gold-gradient-primary gold-glow' : 'glass-card'}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Settings size={16} />
              <span>Configuração dos Robôs & Textos</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={activeTab === 'logs' ? 'gold-gradient-primary gold-glow' : 'glass-card'}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Clock size={16} />
              <span>Histórico de Envios</span>
            </button>
          </div>

          {/* ───────────────── ABA 1: Clientes Elegíveis ───────────────── */}
          {activeTab === 'eligible' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Seletor de Sub-Aba: Inativos vs Aniversariantes */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSubTab('inactive')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      background: subTab === 'inactive' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: subTab === 'inactive' ? '#F87171' : 'var(--text-muted)',
                      border: subTab === 'inactive' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    ⏳ Clientes Sumidos ({statsData?.stats.inactiveCount ?? 0})
                  </button>

                  <button
                    onClick={() => setSubTab('birthdays')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      background: subTab === 'birthdays' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                      color: subTab === 'birthdays' ? '#F59E0B' : 'var(--text-muted)',
                      border: subTab === 'birthdays' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    🎂 Aniversariantes ({birthdaysToday.length + birthdaysUpcoming.length})
                  </button>
                </div>

                {/* Botão de Disparo em Lote para a aba ativa */}
                <div>
                  {subTab === 'inactive' ? (
                    <button
                      onClick={() => handleBatchDispatch('INACTIVE_RECOVERY')}
                      disabled={dispatchingBatch || (statsData?.stats.inactiveCount ?? 0) === 0}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        cursor: dispatchingBatch || (statsData?.stats.inactiveCount ?? 0) === 0 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: dispatchingBatch || (statsData?.stats.inactiveCount ?? 0) === 0 ? 0.5 : 1,
                      }}
                    >
                      {dispatchingBatch ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                      <span>Disparar Resgate para Elegíveis</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBatchDispatch('BIRTHDAY')}
                      disabled={dispatchingBatch || birthdaysToday.filter((b) => b.canSendNow).length === 0}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        padding: '9px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        cursor: dispatchingBatch || birthdaysToday.filter((b) => b.canSendNow).length === 0 ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        opacity: dispatchingBatch || birthdaysToday.filter((b) => b.canSendNow).length === 0 ? 0.5 : 1,
                      }}
                    >
                      {dispatchingBatch ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                      <span>Parabenizar Aniversariantes de Hoje ({birthdaysToday.filter((b) => b.canSendNow).length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Sub-Aba Inativos */}
              {subTab === 'inactive' && (
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                  {/* Busca */}
                  <div style={{ marginBottom: '20px', maxWidth: '340px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={16}
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }}
                      />
                      <input
                        type="text"
                        value={inactiveSearch}
                        onChange={(e) => {
                          setInactiveSearch(e.target.value);
                          setInactivePage(1);
                        }}
                        placeholder="Buscar cliente sumido por nome ou telefone..."
                        style={{
                          width: '100%',
                          padding: '9px 12px 9px 36px',
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          borderRadius: '8px',
                          color: '#FFF',
                          fontSize: '0.86rem',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {inactiveList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
                      <UserCheck size={42} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                      <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#FFF' }}>
                        Nenhum cliente sumido no momento!
                      </h4>
                      <p style={{ margin: '6px 0 0', fontSize: '0.86rem' }}>
                        Todos os seus clientes estão com visitas recentes ou agendamentos futuros marcados. Excelente trabalho!
                      </p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '12px 14px', fontWeight: 600 }}>Cliente</th>
                            <th style={{ padding: '12px 14px', fontWeight: 600 }}>WhatsApp</th>
                            <th style={{ padding: '12px 14px', fontWeight: 600 }}>Última Visita</th>
                            <th style={{ padding: '12px 14px', fontWeight: 600 }}>Tempo Ausente</th>
                            <th style={{ padding: '12px 14px', fontWeight: 600 }}>Último Contato</th>
                            <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inactiveList.map((c) => (
                            <tr
                              key={c.id}
                              style={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              <td style={{ padding: '12px 14px', fontWeight: 700, color: '#FFF' }}>
                                {c.name}
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <a
                                  href={`https://wa.me/${c.phone}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: '#34D399', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Phone size={13} />
                                  <span>{c.phone}</span>
                                </a>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                                {DateTime.fromISO(c.lastVisitAt).toFormat('dd/MM/yyyy')} ({c.lastService})
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#F87171',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                  }}
                                >
                                  {c.daysSinceLastVisit} dias sem vir
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                                {c.lastContactAt
                                  ? DateTime.fromISO(c.lastContactAt).toFormat('dd/MM às HH:mm')
                                  : 'Nunca contactado'}
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                <button
                                  onClick={() => {
                                    setModalCustomer({ id: c.id, name: c.name, phone: c.phone, type: 'INACTIVE_RECOVERY' });
                                    setCustomMsg('');
                                  }}
                                  className="gold-gradient-primary gold-glow"
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                  }}
                                >
                                  <Send size={12} />
                                  <span>Enviar WhatsApp</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-Aba Aniversariantes */}
              {subTab === 'birthdays' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Bloco Aniversariantes de Hoje */}
                  <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <span style={{ fontSize: '1.4rem' }}>🎉</span>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FDE68A' }}>
                        Aniversariantes de Hoje ({birthdaysToday.length})
                      </h3>
                    </div>

                    {birthdaysToday.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                        Nenhum cliente fazendo aniversário hoje.
                      </p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Cliente</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>WhatsApp</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Data</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Último Contato</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {birthdaysToday.map((b) => (
                              <tr key={b.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                <td style={{ padding: '12px 14px', fontWeight: 700, color: '#FFF' }}>{b.name}</td>
                                <td style={{ padding: '12px 14px', color: '#34D399' }}>{b.phone}</td>
                                <td style={{ padding: '12px 14px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', fontWeight: 700 }}>
                                    Hoje! 🎉
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', color: 'var(--text-dim)' }}>
                                  {b.lastContactAt ? DateTime.fromISO(b.lastContactAt).toFormat('dd/MM/yyyy') : 'Ainda não enviado'}
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                  <button
                                    onClick={() => {
                                      setModalCustomer({ id: b.id, name: b.name, phone: b.phone, type: 'BIRTHDAY' });
                                      setCustomMsg('');
                                    }}
                                    className="gold-gradient-primary gold-glow"
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 700,
                                      border: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Enviar Parabéns 🎂
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Bloco Próximos Aniversariantes da Semana */}
                  <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <Calendar size={18} color="var(--primary)" />
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#FFF' }}>
                        Próximos nos Próximos 7 Dias ({birthdaysUpcoming.length})
                      </h3>
                    </div>

                    {birthdaysUpcoming.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                        Nenhum aniversário cadastrado para a próxima semana.
                      </p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Cliente</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>WhatsApp</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Data</th>
                              <th style={{ padding: '10px 14px', fontWeight: 600 }}>Previsão</th>
                            </tr>
                          </thead>
                          <tbody>
                            {birthdaysUpcoming.map((b) => (
                              <tr key={b.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                                <td style={{ padding: '12px 14px', fontWeight: 700, color: '#FFF' }}>{b.name}</td>
                                <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{b.phone}</td>
                                <td style={{ padding: '12px 14px', color: 'var(--primary)', fontWeight: 600 }}>
                                  {String(b.birthDay).padStart(2, '0')}/{String(b.birthMonth).padStart(2, '0')}
                                </td>
                                <td style={{ padding: '12px 14px', color: 'var(--text-dim)' }}>
                                  Em {b.daysUntil} dia(s)
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───────────────── ABA 2: Configuração dos Robôs & Textos ───────────────── */}
          {activeTab === 'config' && (
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Card Robô 1: Clientes Inativos */}
              <div className="glass-panel" style={{ padding: '26px', borderRadius: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#F87171',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Clock size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFF' }}>
                        Robô de Recuperação de Clientes Inativos ("Clientes Sumidos")
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Identifica clientes regulares cujo último agendamento foi há mais de X dias e dispara convite.
                      </p>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={configForm.inactiveRecoveryEnabled}
                      onChange={(e) => setConfigForm({ ...configForm, inactiveRecoveryEnabled: e.target.checked })}
                      style={{ transform: 'scale(1.2)' }}
                    />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: configForm.inactiveRecoveryEnabled ? '#34D399' : 'var(--text-dim)' }}>
                      {configForm.inactiveRecoveryEnabled ? 'Ativo' : 'Pausado'}
                    </span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Prazo de Ausência para Considerar "Sumido"
                    </label>
                    <select
                      value={configForm.inactiveDaysThreshold}
                      onChange={(e) => setConfigForm({ ...configForm, inactiveDaysThreshold: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#FFF',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    >
                      <option value={15}>15 dias sem agendar</option>
                      <option value={20}>20 dias sem agendar</option>
                      <option value={25}>25 dias sem agendar (Recomendado)</option>
                      <option value={30}>30 dias sem agendar (1 mês)</option>
                      <option value={45}>45 dias sem agendar</option>
                      <option value={60}>60 dias sem agendar (2 meses)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Desconto de Incentivo Opcional (% OFF)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={configForm.inactiveDiscountPercent ?? ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          inactiveDiscountPercent: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="Ex: 10 (aplica a tag {desconto})"
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#FFF',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                    Mensagem de WhatsApp Personalizada
                  </label>
                  <textarea
                    rows={3}
                    value={configForm.inactiveMessageTemplate}
                    onChange={(e) => setConfigForm({ ...configForm, inactiveMessageTemplate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#FFF',
                      fontSize: '0.88rem',
                      outline: 'none',
                      lineHeight: 1.5,
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', display: 'block', marginTop: '6px' }}>
                    Tags disponíveis: <code>{'{cliente}'}</code>, <code>{'{barbearia}'}</code>, <code>{'{link}'}</code>, <code>{'{dias}'}</code>, <code>{'{desconto}'}</code>
                  </span>
                </div>
              </div>

              {/* Card Robô 2: Aniversariantes */}
              <div className="glass-panel" style={{ padding: '26px', borderRadius: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#F59E0B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Gift size={20} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFF' }}>
                        Robô de Felicitações de Aniversário
                      </h3>
                      <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Dispara automaticamente no dia do aniversário do cliente com mensagem festiva e presente.
                      </p>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={configForm.birthdayEnabled}
                      onChange={(e) => setConfigForm({ ...configForm, birthdayEnabled: e.target.checked })}
                      style={{ transform: 'scale(1.2)' }}
                    />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: configForm.birthdayEnabled ? '#34D399' : 'var(--text-dim)' }}>
                      {configForm.birthdayEnabled ? 'Ativo' : 'Pausado'}
                    </span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Presente de Aniversário (% de Desconto ou Mimo)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={configForm.birthdayDiscountPercent ?? ''}
                      onChange={(e) =>
                        setConfigForm({
                          ...configForm,
                          birthdayDiscountPercent: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="Ex: 15 (aplica a tag {desconto})"
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#FFF',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                    Mensagem de Felicitações no WhatsApp
                  </label>
                  <textarea
                    rows={3}
                    value={configForm.birthdayMessageTemplate}
                    onChange={(e) => setConfigForm({ ...configForm, birthdayMessageTemplate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#FFF',
                      fontSize: '0.88rem',
                      outline: 'none',
                      lineHeight: 1.5,
                      fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', display: 'block', marginTop: '6px' }}>
                    Tags disponíveis: <code>{'{cliente}'}</code>, <code>{'{barbearia}'}</code>, <code>{'{link}'}</code>, <code>{'{desconto}'}</code>
                  </span>
                </div>
              </div>

              {/* Card Anti-Ban & Regras de Disparo */}
              <div className="glass-panel" style={{ padding: '26px', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
                  <Shield size={22} color="#60A5FA" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFF' }}>
                      Filtros Inteligentes Anti-Ban & Proteção do Número WhatsApp
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      Parâmetros rígidos para blindar o seu número contra denúncias ou bloqueios do WhatsApp.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Janela de Horário Comercial
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="time"
                        value={configForm.sendWindowStart}
                        onChange={(e) => setConfigForm({ ...configForm, sendWindowStart: e.target.value })}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#FFF',
                          outline: 'none',
                        }}
                      />
                      <span style={{ color: 'var(--text-dim)' }}>às</span>
                      <input
                        type="time"
                        value={configForm.sendWindowEnd}
                        onChange={(e) => setConfigForm({ ...configForm, sendWindowEnd: e.target.value })}
                        style={{
                          flex: 1,
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#FFF',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Intervalo Mínimo por Cliente (dias)
                    </label>
                    <input
                      type="number"
                      min={7}
                      max={90}
                      value={configForm.minDaysBetweenMessages}
                      onChange={(e) => setConfigForm({ ...configForm, minDaysBetweenMessages: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#FFF',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                      Evita repetições para o mesmo cliente
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                      Limite Diário Máximo (mensagens/dia)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={configForm.maxDailyDispatches}
                      onChange={(e) => setConfigForm({ ...configForm, maxDailyDispatches: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#FFF',
                        outline: 'none',
                      }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
                      Protege o score do seu WhatsApp
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão Salvar */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '12px 28px',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: savingConfig ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {savingConfig ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  <span>Salvar Regras de Automação</span>
                </button>
              </div>
            </form>
          )}

          {/* ───────────────── ABA 3: Histórico de Disparos ───────────────── */}
          {activeTab === 'logs' && (
            <div className="glass-panel" style={{ padding: '24px', borderRadius: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#FFF' }}>
                  Auditoria de Mensagens Enviadas
                </h3>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-dim)' }}>
                  Total de {statsData?.stats.totalSent ?? 0} disparos registrados
                </span>
              </div>

              {logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)' }}>
                  <Clock size={36} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                  <p style={{ margin: 0 }}>Nenhum disparo registrado até o momento.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '12px 14px', fontWeight: 600 }}>Data / Hora</th>
                        <th style={{ padding: '12px 14px', fontWeight: 600 }}>Tipo de Campanha</th>
                        <th style={{ padding: '12px 14px', fontWeight: 600 }}>Cliente</th>
                        <th style={{ padding: '12px 14px', fontWeight: 600 }}>Telefone</th>
                        <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                          <td style={{ padding: '12px 14px', color: 'var(--text-dim)' }}>
                            {DateTime.fromISO(log.sentAt).toFormat('dd/MM/yyyy HH:mm:ss')}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {log.type === 'BIRTHDAY' ? (
                              <span style={{ padding: '2px 8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 700, fontSize: '0.78rem' }}>
                                🎂 Aniversário
                              </span>
                            ) : (
                              <span style={{ padding: '2px 8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#F87171', fontWeight: 700, fontSize: '0.78rem' }}>
                                ⏳ Resgate Inativo
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#FFF' }}>
                            {log.customer?.name || 'Cliente'}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#34D399' }}>
                            {log.phone}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {log.status === 'SENT' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#34D399', fontWeight: 700, fontSize: '0.78rem' }}>
                                <Check size={14} /> Entregue
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#F87171', fontWeight: 700, fontSize: '0.78rem' }}>
                                <AlertTriangle size={14} /> Falha ({log.errorMessage || 'Erro'})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ───────────────── Modal Envio Individual ───────────────── */}
      {modalCustomer && (
        <Modal
          isOpen={Boolean(modalCustomer)}
          onClose={() => setModalCustomer(null)}
          title={`Disparar WhatsApp para ${modalCustomer.name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Destinatário: <strong>{modalCustomer.name}</strong> ({modalCustomer.phone})
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
                Mensagem (deixe em branco para usar o template padrão do robô)
              </label>
              <textarea
                rows={4}
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="Digite uma mensagem específica ou deixe em branco para usar o template oficial configurado..."
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#FFF',
                  fontSize: '0.88rem',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setModalCustomer(null)}
                className="glass-card"
                style={{ padding: '10px 18px', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={sendingSingle}
                onClick={handleSendSingle}
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: sendingSingle ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {sendingSingle ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                <span>Disparar Mensagem Agora</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ───────────────── Modal Teste no WhatsApp ───────────────── */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        title="Enviar Mensagem de Teste no WhatsApp"
      >
        <form onSubmit={handleSendTest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Digite o seu número para receber uma prévia exata de como a mensagem chegará no WhatsApp do cliente.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
              Tipo da Mensagem de Teste
            </label>
            <select
              value={testType}
              onChange={(e) => setTestType(e.target.value as any)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#FFF',
                outline: 'none',
              }}
            >
              <option value="INACTIVE_RECOVERY">⏳ Recuperação de Clientes Sumidos</option>
              <option value="BIRTHDAY">🎂 Parabéns de Aniversário</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.84rem', color: '#E2E8F0', fontWeight: 600, marginBottom: '6px' }}>
              Seu Número de WhatsApp (com DDD)
            </label>
            <input
              type="tel"
              required
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Ex: 11999998888"
              style={{
                width: '100%',
                padding: '11px 14px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#FFF',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsTestModalOpen(false)}
              className="glass-card"
              style={{ padding: '10px 18px', fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={sendingTest}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: sendingTest ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {sendingTest ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
              <span>Enviar Teste Agora</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

