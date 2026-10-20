'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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
  };
  plans: Array<{
    id: string;
    name: string;
    slug: string;
    priceCents: number;
    maxProfessionals?: number | null;
  }>;
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

export default function SuperAdminPage() {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'tenants' | 'logs' | 'plans'>('tenants');
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const [search, setSearch] = useState('');
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

  const loadOverview = async () => {
    try {
      const res = await api.get<SuperAdminOverview>('/api/superadmin/overview');
      setOverview(res);
    } catch {
      // Ignora erro
    }
  };

  const loadTenants = async () => {
    try {
      const res = await api.get<{ tenants: TenantItem[] }>(
        `/api/superadmin/tenants?search=${encodeURIComponent(search)}`,
      );
      setTenants(res.tenants);
    } catch {
      // Ignora erro
    }
  };

  const loadLogs = async () => {
    try {
      const res = await api.get<{ logs: SystemLogItem[] }>('/api/superadmin/logs?pageSize=40');
      setLogs(res.logs);
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    Promise.all([loadOverview(), loadTenants(), loadLogs()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadTenants, 300);
    return () => clearTimeout(timer);
  }, [search]);

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

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {/* Top title & Return link */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
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
              <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Gestão Master do SaaS (Super Admin)</h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Acesso global a todas as barbearias, faturamento recorrente, auditoria de logs e status da API do WhatsApp.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="glass-card"
            style={{ padding: '10px 18px', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Meu Salão</span>
          </Link>
        </div>

        {/* Global SaaS Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '32px',
          }}
        >
          {/* MRR */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              MRR (Receita Mensal Recorrente)
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
              {loading ? '...' : formatBRL(overview?.metrics.mrrCents || 0)}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Assinaturas ativas no SaaS</span>
          </div>

          {/* Total Salões */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              Total de Salões Cadastrados
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              {loading ? '...' : overview?.metrics.totalTenants || 0}
            </div>
            <span style={{ fontSize: '0.78rem', color: '#34D399' }}>
              {overview?.metrics.activeTenants || 0} ativos no momento
            </span>
          </div>

          {/* Bloqueados / Suspensos */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              Inadimplência / Suspensos
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#FB7185', marginBottom: '4px' }}>
              {loading ? '...' : (overview?.metrics.blockedTenants || 0) + (overview?.metrics.suspendedTenants || 0)}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {overview?.metrics.blockedTenants || 0} bloqueados por pagamento
            </span>
          </div>

          {/* Total Agendamentos */}
          <div className="glass-panel" style={{ padding: '22px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
              Total de Agendamentos na Plataforma
            </span>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#22D3EE', marginBottom: '4px' }}>
              {loading ? '...' : overview?.metrics.totalAppointments || 0}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Processados via Web e WhatsApp</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('tenants')}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'tenants' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'tenants' ? '#0B0F17' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Salões Cadastrados ({tenants.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'logs' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'logs' ? '#0B0F17' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Logs de Auditoria & Debug ({logs.length})
          </button>
        </div>

        {/* TAB 1: Salões */}
        {activeTab === 'tenants' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '320px' }}>
                <input
                  type="text"
                  placeholder="Buscar por nome, slug ou e-mail..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                />
                <Search
                  size={16}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Salão / Slug</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>E-mail</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Plano</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>WhatsApp</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status da Conta</th>
                    <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Ações de Gestão</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => {
                    const isConnected = t.whatsAppStatus === 'CONNECTED';

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '14px' }}>
                          <strong style={{ display: 'block', color: 'var(--text-main)', fontSize: '0.95rem' }}>
                            {t.name}
                          </strong>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>/{t.slug}</span>
                        </td>
                        <td style={{ padding: '14px', color: 'var(--text-muted)' }}>{t.email}</td>
                        <td style={{ padding: '14px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            {t.subscription?.plan.name || 'Sem plano'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>
                            {t._count.professionals} prof. | {t._count.appointments} agend.
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`}>
                            {isConnected ? 'Conectado' : 'Desconectado'}
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
                                setProfOverride(t.subscription?.maxProfessionalsOverride ? String(t.subscription.maxProfessionalsOverride) : '');
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

        {/* TAB 2: Logs do Sistema */}
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
                        {log.tenant && (
                          <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>[{log.tenant.name}]</span>
                        )}
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
                Motivo / Justificativa (visível ao dono do salão)
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
    </div>
  );
}
