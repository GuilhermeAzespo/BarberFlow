'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Award,
  Gift,
  Scissors,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  Plus,
  Minus,
  Settings,
  Share2,
  Copy,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  RefreshCw,
  Save,
  Check,
  UserCheck,
  Star,
  Layers,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { Select } from '../../components/Select';
import { useAuth } from '../../lib/auth-context';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/Toast';
import { DateTime } from 'luxon';

interface LoyaltyConfig {
  id: string;
  tenantId: string;
  enabled: boolean;
  targetStamps: number;
  rewardText: string;
  autoSendWhatsApp: boolean;
  showInPublicShowcase: boolean;
}

interface LoyaltyCustomerCard {
  id: string;
  tenantId: string;
  customerId: string;
  currentStamps: number;
  completedCycles: number;
  rewardsAvailable: number;
  lastStampAt: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    whatsappJid: string | null;
  };
}

interface LoyaltyTransaction {
  id: string;
  type: 'STAMP_ADDED' | 'REWARD_REDEEMED' | 'MANUAL_ADJUSTMENT';
  stampsChange: number;
  notes: string | null;
  createdAt: string;
}

interface LoyaltyStatsData {
  config: LoyaltyConfig;
  stats: {
    totalCards: number;
    totalStampsDistributed: number;
    totalRewardsRedeemed: number;
    rewardsReadyToRedeem: number;
  };
}

export default function LoyaltyPage() {
  const { tenant, hasPlanFeature, isAddonFeature } = useAuth();
  const { toast, confirm } = useToast();

  const [activeTab, setActiveTab] = useState<'cards' | 'config'>('cards');
  const [loading, setLoading] = useState(true);
  const [statsData, setStatsData] = useState<LoyaltyStatsData | null>(null);

  // Lista de clientes
  const [cards, setCards] = useState<LoyaltyCustomerCard[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'READY_TO_REDEEM'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Configuração
  const [configForm, setConfigForm] = useState({
    enabled: true,
    targetStamps: 10,
    rewardText: '1 Corte ou Barba Grátis',
    autoSendWhatsApp: true,
    showInPublicShowcase: true,
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Modal de Detalhes / Extrato
  const [selectedCustomer, setSelectedCustomer] = useState<{
    customerName: string;
    card: LoyaltyCustomerCard;
    transactions: LoyaltyTransaction[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Copiado
  const [copiedLink, setCopiedLink] = useState(false);

  // Carrega métricas e configurações
  const loadStatsAndConfig = async () => {
    try {
      const res = await api.get<LoyaltyStatsData>('/api/loyalty/stats');
      setStatsData(res);
      if (res.config) {
        setConfigForm({
          enabled: res.config.enabled,
          targetStamps: res.config.targetStamps,
          rewardText: res.config.rewardText,
          autoSendWhatsApp: res.config.autoSendWhatsApp,
          showInPublicShowcase: res.config.showInPublicShowcase,
        });
      }
    } catch (err) {
      console.error('Erro ao carregar dados de fidelidade', err);
    }
  };

  // Carrega lista de cartões com debounce
  const loadCards = async () => {
    try {
      const query = new URLSearchParams({
        search,
        filter,
        page: String(page),
        limit: '20',
      });
      const res = await api.get<{
        cards: LoyaltyCustomerCard[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/api/loyalty/cards?${query.toString()}`);
      setCards(res.cards);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error('Erro ao listar cartões fidelidade', err);
    }
  };

  useEffect(() => {
    Promise.all([loadStatsAndConfig(), loadCards()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCards();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, filter, page]);

  // Salvar configuração do programa
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await api.put<{ config: LoyaltyConfig; message: string }>('/api/loyalty/config', configForm);
      toast.success(res.message || 'Configurações de fidelidade salvas!');
      await loadStatsAndConfig();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Ajuste rápido de selos (+1 ou -1)
  const handleQuickStamp = async (card: LoyaltyCustomerCard, change: number) => {
    try {
      const res = await api.post<{ success: boolean; card: LoyaltyCustomerCard; message: string }>(
        `/api/loyalty/cards/${card.customerId}/manual-stamp`,
        { stampsChange: change, notes: change > 0 ? '+1 Selo manual pela equipe' : 'Ajuste manual de selos' },
      );
      toast.success(res.message || 'Selo computado com sucesso!');
      await Promise.all([loadStatsAndConfig(), loadCards()]);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao computar selo.');
    }
  };

  // Resgate de prêmio
  const handleRedeemReward = async (card: LoyaltyCustomerCard) => {
    const ok = await confirm({
      title: '🎁 Confirmar Resgate de Prêmio',
      message: `Deseja confirmar o resgate de 1 prêmio (${configForm.rewardText}) para o cliente ${card.customer.name}? Esta ação descontará 1 recompensa do saldo dele.`,
      confirmText: 'Confirmar Resgate',
      icon: 'info',
    });

    if (!ok) return;

    try {
      const res = await api.post<{ success: boolean; card: LoyaltyCustomerCard; message: string }>(
        `/api/loyalty/cards/${card.customerId}/redeem`,
        {},
      );
      toast.success(res.message || 'Prêmio resgatado com sucesso!');
      await Promise.all([loadStatsAndConfig(), loadCards()]);
      if (selectedCustomer) {
        setSelectedCustomer(null);
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao resgatar prêmio.');
    }
  };

  // Abrir modal de extrato do cliente
  const handleOpenDetails = async (card: LoyaltyCustomerCard) => {
    setLoadingDetails(true);
    try {
      const res = await api.get<{
        config: LoyaltyConfig;
        card: LoyaltyCustomerCard & { transactions: LoyaltyTransaction[] };
      }>(`/api/loyalty/cards/${card.customerId}`);
      setSelectedCustomer({
        customerName: card.customer.name,
        card: res.card,
        transactions: res.card.transactions || [],
      });
    } catch (err: unknown) {
      toast.error('Erro ao carregar extrato do cliente.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const showcaseUrl = tenant ? `https://barberflow.azespo.com.br/${tenant.slug}` : '';

  const handleCopyLink = () => {
    if (!showcaseUrl) return;
    navigator.clipboard.writeText(showcaseUrl);
    setCopiedLink(true);
    toast.success('Link da vitrine com fidelidade copiado!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const target = configForm.targetStamps || 10;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />

        <div className="main-content-scrollable" style={{ padding: '28px 32px' }}>
          {/* Top Bar Header */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    padding: '8px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.2) 0%, rgba(229, 179, 56, 0.05) 100%)',
                    border: '1px solid rgba(229, 179, 56, 0.3)',
                    color: 'var(--primary)',
                  }}
                >
                  <Award size={24} />
                </div>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
                  Cartão Fidelidade Digital
                </h1>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: configForm.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: configForm.enabled ? '#34D399' : '#F87171',
                    border: configForm.enabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                >
                  {configForm.enabled ? '● Ativo' : '○ Pausado'}
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px' }}>
                Fidelize seus clientes no piloto automático: a cada agendamento concluído o cliente ganha selos, recebe celebrações no WhatsApp e resgata prêmios!
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={handleCopyLink}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                }}
              >
                {copiedLink ? <Check size={15} color="#10B981" /> : <Copy size={15} />}
                <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link da Vitrine'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'cards' ? 'config' : 'cards')}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  padding: '9px 14px',
                  borderRadius: '8px',
                  background: activeTab === 'config' ? 'rgba(229, 179, 56, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                  border: activeTab === 'config' ? '1px solid rgba(229, 179, 56, 0.4)' : '1px solid var(--border-color)',
                  color: activeTab === 'config' ? 'var(--primary)' : 'var(--text-main)',
                }}
              >
                <Settings size={15} />
                <span>{activeTab === 'config' ? 'Ver Clientes' : 'Configurar Programa'}</span>
              </button>
            </div>
          </div>

          {/* 4 Cards de Métricas Principais */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Clientes com Cartão</span>
                <UserCheck size={18} color="var(--primary)" />
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)' }}>
                {statsData?.stats.totalCards ?? 0}
              </span>
              <span style={{ fontSize: '0.74rem', color: '#10B981', display: 'block', marginTop: '4px' }}>
                Participantes acumulando selos
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Selos Distribuídos</span>
                <Scissors size={18} color="#E5B338" />
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#E5B338' }}>
                {statsData?.stats.totalStampsDistributed ?? 0}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Concedidos após cortes concluídos
              </span>
            </div>

            <div
              className="glass-panel"
              style={{
                padding: '20px',
                border: statsData?.stats.rewardsReadyToRedeem ? '1px solid rgba(16, 185, 129, 0.4)' : undefined,
                background: statsData?.stats.rewardsReadyToRedeem
                  ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(18, 24, 38, 0.6) 100%)'
                  : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Prontos para Resgate</span>
                <Gift size={18} color="#34D399" />
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34D399' }}>
                {statsData?.stats.rewardsReadyToRedeem ?? 0}
              </span>
              <span style={{ fontSize: '0.74rem', color: '#34D399', display: 'block', marginTop: '4px', fontWeight: 600 }}>
                {statsData?.stats.rewardsReadyToRedeem
                  ? '⚡ Clientes com corte grátis disponível!'
                  : 'Nenhum resgate pendente'}
              </span>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Prêmios Já Entregues</span>
                <Award size={18} color="#A78BFA" />
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#A78BFA' }}>
                {statsData?.stats.totalRewardsRedeemed ?? 0}
              </span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Resgatados na recepção
              </span>
            </div>
          </div>

          {/* ───────────────── ABA 1: Clientes & Selos ───────────────── */}
          {activeTab === 'cards' && (
            <div>
              {/* Filtros e Busca */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: '420px' }}>
                  <Search
                    size={16}
                    color="var(--text-dim)"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome ou WhatsApp..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="input-field"
                    style={{ paddingLeft: '38px', fontSize: '0.86rem' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('ALL');
                      setPage(1);
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: filter === 'ALL' ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                      background: filter === 'ALL' ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      color: filter === 'ALL' ? 'var(--primary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Todos os Clientes
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFilter('READY_TO_REDEEM');
                      setPage(1);
                    }}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: filter === 'READY_TO_REDEEM' ? '1px solid #10B981' : '1px solid var(--border-color)',
                      background: filter === 'READY_TO_REDEEM' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                      color: filter === 'READY_TO_REDEEM' ? '#34D399' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Gift size={14} />
                    <span>Prontos para Resgate ({statsData?.stats.rewardsReadyToRedeem ?? 0})</span>
                  </button>
                </div>
              </div>

              {/* Tabela de Cartões */}
              <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                    <p>Carregando clientes e cartões fidelidade...</p>
                  </div>
                ) : cards.length === 0 ? (
                  <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Award size={36} color="var(--primary)" style={{ opacity: 0.5, margin: '0 auto 12px auto' }} />
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '6px' }}>
                      Nenhum cartão fidelidade encontrado
                    </h3>
                    <p style={{ fontSize: '0.86rem', maxWidth: '420px', margin: '0 auto' }}>
                      Quando seus clientes concluírem os primeiros agendamentos na barbearia, os selos serão adicionados automaticamente aqui!
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="data-table" style={{ fontSize: '0.86rem' }}>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Progresso no Cartão</th>
                          <th>Status / Prêmio</th>
                          <th>Último Selo</th>
                          <th style={{ textAlign: 'right' }}>Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cards.map((c) => {
                          const pct = Math.min(100, Math.round((c.currentStamps / target) * 100));
                          const hasReward = c.rewardsAvailable > 0;

                          return (
                            <tr key={c.id}>
                              <td>
                                <strong style={{ color: 'var(--text-main)', display: 'block', fontSize: '0.9rem' }}>
                                  {c.customer.name}
                                </strong>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                  {c.customer.phone || 'Sem telefone'}
                                </span>
                              </td>

                              <td style={{ minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                                    {c.currentStamps} de {target} selos
                                  </span>
                                  {c.completedCycles > 0 && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                      ⭐ {c.completedCycles}x completo
                                    </span>
                                  )}
                                </div>
                                <div
                                  style={{
                                    height: '8px',
                                    borderRadius: '999px',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${pct}%`,
                                      borderRadius: '999px',
                                      background: hasReward
                                        ? 'linear-gradient(90deg, #10B981, #34D399)'
                                        : 'linear-gradient(90deg, #E5B338, #F59E0B)',
                                      transition: 'width 0.3s ease',
                                    }}
                                  />
                                </div>
                              </td>

                              <td>
                                {hasReward ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      background: 'rgba(16, 185, 129, 0.18)',
                                      border: '1px solid rgba(16, 185, 129, 0.35)',
                                      color: '#34D399',
                                      fontSize: '0.76rem',
                                      fontWeight: 800,
                                    }}
                                  >
                                    <Gift size={13} />
                                    <span>{c.rewardsAvailable}x Prêmio Disponível!</span>
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                                    Faltam {Math.max(0, target - c.currentStamps)} para {configForm.rewardText}
                                  </span>
                                )}
                              </td>

                              <td style={{ color: 'var(--text-dim)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                {c.lastStampAt
                                  ? DateTime.fromISO(c.lastStampAt).setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm')
                                  : '—'}
                              </td>

                              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  {hasReward && (
                                    <button
                                      type="button"
                                      onClick={() => handleRedeemReward(c)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        background: 'linear-gradient(135deg, #10B981, #059669)',
                                        border: 'none',
                                        color: '#FFFFFF',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                      }}
                                    >
                                      <Gift size={13} />
                                      <span>Resgatar Prêmio</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleQuickStamp(c, 1)}
                                    title="Adicionar +1 Selo"
                                    style={{
                                      padding: '5px 9px',
                                      borderRadius: '6px',
                                      background: 'rgba(229, 179, 56, 0.12)',
                                      border: '1px solid rgba(229, 179, 56, 0.3)',
                                      color: 'var(--primary)',
                                      cursor: 'pointer',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                    }}
                                  >
                                    <Plus size={12} />
                                    <span>1 Selo</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenDetails(c)}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      border: '1px solid var(--border-color)',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                      fontSize: '0.74rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Extrato
                                  </button>
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
            </div>
          )}

          {/* ───────────────── ABA 2: Configuração do Programa ───────────────── */}
          {activeTab === 'config' && (
            <div style={{ maxWidth: '820px' }}>
              <div className="glass-panel" style={{ padding: '28px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
                  Configurações do Cartão Fidelidade
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginBottom: '24px' }}>
                  Ajuste a quantidade de cortes necessários para completar o cartão, a recompensa oferecida e os canais de disparo automático.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Status Geral */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '10px',
                      background: configForm.enabled ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                      border: configForm.enabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-color)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)', display: 'block' }}>
                        Programa de Fidelidade Ativo
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Computa automaticamente novos selos a cada agendamento marcado como concluído.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={configForm.enabled}
                      onChange={(e) => setConfigForm({ ...configForm, enabled: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  {/* Meta de Selos */}
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                      Meta de Selos por Cartão:
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {[5, 8, 10, 12, 15].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setConfigForm({ ...configForm, targetStamps: n })}
                          style={{
                            padding: '8px 18px',
                            borderRadius: '8px',
                            border: configForm.targetStamps === n ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                            background: configForm.targetStamps === n ? 'rgba(229, 179, 56, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                            color: configForm.targetStamps === n ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                          }}
                        >
                          {n} Cortes / Selos
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Descrição da Recompensa */}
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>
                      Recompensa ao Completar o Cartão:
                    </label>
                    <input
                      type="text"
                      value={configForm.rewardText}
                      onChange={(e) => setConfigForm({ ...configForm, rewardText: e.target.value })}
                      placeholder="Ex: 1 Corte de Cabelo Grátis ou Barba Terapia"
                      className="input-field"
                      style={{ fontSize: '0.88rem', padding: '10px 14px' }}
                    />
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                      Este texto será enviado na mensagem de parabéns pelo WhatsApp e exibido na vitrine do salão.
                    </span>
                  </div>

                  {/* WhatsApp Automático */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)', display: 'block' }}>
                        Notificações Automáticas no WhatsApp
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Dispara mensagens imediatas informando novos selos conquistados e celebração quando o cliente completa o cartão.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={configForm.autoSendWhatsApp}
                      onChange={(e) => setConfigForm({ ...configForm, autoSendWhatsApp: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  {/* Exibir na Vitrine Pública */}
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--text-main)', display: 'block' }}>
                        Exibir Cartão Fidelidade na Vitrine Online (Link na Bio)
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Permite que os clientes consultem seus selos a qualquer momento digitando o número do celular na sua vitrine pública.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={configForm.showInPublicShowcase}
                      onChange={(e) => setConfigForm({ ...configForm, showInPublicShowcase: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  {/* Botão de Salvar */}
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={savingConfig}
                      className="btn btn-primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 22px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                      }}
                    >
                      <Save size={16} />
                      <span>{savingConfig ? 'Salvando...' : 'Salvar Configurações'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal de Detalhes / Extrato de Selos do Cliente */}
        {selectedCustomer && (
          <Modal
            isOpen={true}
            onClose={() => setSelectedCustomer(null)}
            title={`Extrato de Fidelidade — ${selectedCustomer.customerName}`}
          >
            <div style={{ padding: '8px 4px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(229, 179, 56, 0.08)',
                  border: '1px solid rgba(229, 179, 56, 0.25)',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>Status Atual:</span>
                  <strong style={{ fontSize: '1.1rem', color: 'var(--primary)' }}>
                    {selectedCustomer.card.currentStamps} de {target} selos
                  </strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>Prêmios Acumulados:</span>
                  <strong style={{ fontSize: '1.1rem', color: '#10B981' }}>
                    {selectedCustomer.card.rewardsAvailable} disponível(is)
                  </strong>
                </div>
              </div>

              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
                Histórico de Selos e Resgates
              </h4>

              {selectedCustomer.transactions.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textAlign: 'center', padding: '16px' }}>
                  Nenhuma transação registrada ainda para este cliente.
                </p>
              ) : (
                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Data/Hora</th>
                        <th>Tipo</th>
                        <th>Selos</th>
                        <th>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCustomer.transactions.map((t) => (
                        <tr key={t.id}>
                          <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                            {DateTime.fromISO(t.createdAt).setZone('America/Sao_Paulo').toFormat('dd/LL/yyyy HH:mm')}
                          </td>
                          <td>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background:
                                  t.type === 'REWARD_REDEEMED'
                                    ? 'rgba(16, 185, 129, 0.15)'
                                    : 'rgba(229, 179, 56, 0.15)',
                                color: t.type === 'REWARD_REDEEMED' ? '#34D399' : '#E5B338',
                              }}
                            >
                              {t.type === 'REWARD_REDEEMED'
                                ? 'Resgate'
                                : t.type === 'STAMP_ADDED'
                                ? 'Selo Corte'
                                : 'Ajuste'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {t.stampsChange > 0 ? `+${t.stampsChange}` : t.stampsChange}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>{t.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedCustomer.card.rewardsAvailable > 0 && (
                <div style={{ marginTop: '20px', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleRedeemReward(selectedCustomer.card)}
                    className="btn btn-primary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #10B981, #059669)',
                      border: 'none',
                    }}
                  >
                    <Gift size={16} />
                    <span>Resgatar 1 Prêmio Agora</span>
                  </button>
                </div>
              )}
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}
