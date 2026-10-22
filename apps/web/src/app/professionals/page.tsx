'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  Phone,
  Percent,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Eye,
  EyeOff,
  Lock,
  Calendar as CalendarIcon,
  Check,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';

interface UserPermissions {
  allowedMenus?: string[];
  canViewAllAppointments?: boolean;
}

interface ProfessionalUser {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  permissions?: UserPermissions | null;
}

interface Professional {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  color: string;
  commissionPercent: number;
  isActive: boolean;
  serviceIds: string[];
  user?: ProfessionalUser | null;
}

interface Service {
  id: string;
  name: string;
}

const AVAILABLE_MENUS: { key: string; label: string; description: string }[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Visão geral e métricas' },
  { key: 'calendar', label: 'Calendário & Agenda', description: 'Visualizar e criar agendamentos' },
  { key: 'professionals', label: 'Profissionais', description: 'Gerenciar equipe e permissões' },
  { key: 'services', label: 'Serviços & Preços', description: 'Catálogo de serviços e valores' },
  { key: 'customers', label: 'Clientes', description: 'Base e histórico de clientes' },
  { key: 'finance', label: 'Fluxo de Caixa', description: 'Receitas, despesas e faturamento' },
  { key: 'whatsapp', label: 'Bot WhatsApp', description: 'QR Code e automações de mensagens' },
  { key: 'settings', label: 'Configurações', description: 'Horários de funcionamento do salão' },
];

export default function ProfessionalsPage() {
  const { user: currentUser, subscription } = useAuth();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [color, setColor] = useState('#E5B338');
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Segurança & Acesso
  const [hasLogin, setHasLogin] = useState(false);
  const [existingHasLogin, setExistingHasLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [canViewAllAppointments, setCanViewAllAppointments] = useState(false);
  const [allowedMenus, setAllowedMenus] = useState<string[]>(['calendar']);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get<{ professionals: Professional[] }>('/api/professionals'),
        api.get<{ services: Service[] }>('/api/services?active=true'),
      ]);
      setProfessionals(pRes.professionals);
      setServices(sRes.services);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setColor('#E5B338');
    setCommissionPercent(0);
    setSelectedServices(services.map((s) => s.id));
    setHasLogin(false);
    setExistingHasLogin(false);
    setLoginEmail('');
    setLoginPassword('');
    setShowPassword(false);
    setCanViewAllAppointments(false);
    setAllowedMenus(['calendar']);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Professional) => {
    setEditingId(p.id);
    setName(p.name);
    setPhone(p.phone || '');
    setColor(p.color || '#E5B338');
    setCommissionPercent(p.commissionPercent || 0);
    setSelectedServices(p.serviceIds || []);

    const user = p.user;
    const hasUser = !!(user && user.isActive);
    setHasLogin(hasUser);
    setExistingHasLogin(hasUser);
    setLoginEmail(user?.email || p.email || '');
    setLoginPassword('');
    setShowPassword(false);
    setCanViewAllAppointments(!!user?.permissions?.canViewAllAppointments);
    setAllowedMenus(
      user?.permissions?.allowedMenus && user.permissions.allowedMenus.length > 0
        ? user.permissions.allowedMenus
        : ['calendar']
    );

    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (hasLogin) {
      if (!loginEmail.trim() || !loginEmail.includes('@')) {
        setErrorMsg('Informe um e-mail válido para o acesso do profissional.');
        return;
      }
      if (!existingHasLogin && (!loginPassword || loginPassword.length < 6)) {
        setErrorMsg('Para habilitar o primeiro acesso, defina uma senha com no mínimo 6 caracteres.');
        return;
      }
      if (allowedMenus.length === 0) {
        setErrorMsg('Selecione ao menos 1 menu permitido para o profissional acessar.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload: Record<string, any> = {
        name,
        phone: phone || null,
        color,
        commissionPercent: Number(commissionPercent),
        serviceIds: selectedServices,
        hasLogin,
        loginEmail: hasLogin ? loginEmail.trim().toLowerCase() : undefined,
        loginPassword: hasLogin && loginPassword ? loginPassword : undefined,
        permissions: hasLogin
          ? {
              allowedMenus,
              canViewAllAppointments,
            }
          : undefined,
      };

      if (editingId) {
        await api.patch(`/api/professionals/${editingId}`, payload);
      } else {
        await api.post('/api/professionals', payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao salvar profissional.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover/desativar este profissional?')) return;
    try {
      await api.delete(`/api/professionals/${id}`);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao remover profissional.');
    }
  };

  const maxProfs = subscription?.limits.maxProfessionals;
  const activeCount = professionals.filter((p) => p.isActive).length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Profissionais da Equipe</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Gerencie barbeiros, comissões individuais e serviços atendidos por cada profissional.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {maxProfs !== null && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Limite do plano: <strong style={{ color: 'var(--text-main)' }}>{activeCount} / {maxProfs}</strong>
                </div>
              )}

              <button
                onClick={openCreateModal}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Adicionar Profissional</span>
              </button>
            </div>
          </div>

          {/* List of Professionals */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando profissionais...</p>
            ) : professionals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Users size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhum profissional cadastrado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {professionals.map((p) => (
                  <div
                    key={p.id}
                    className="glass-card"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      opacity: p.isActive ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: p.color || '#E5B338',
                            color: '#0B0F17',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '1.2rem',
                          }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {p.isActive ? 'Ativo na agenda' : 'Desativado'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => openEditModal(p)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#FB7185',
                            cursor: 'pointer',
                            padding: '6px',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {p.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Phone size={14} />
                          <span>{p.phone}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Percent size={14} />
                        <span>Comissão: <strong>{p.commissionPercent}%</strong></span>
                      </div>
                    </div>

                    {/* Status de Acesso & Segurança */}
                    <div
                      style={{
                        marginTop: '4px',
                        paddingTop: '12px',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        {p.user && p.user.isActive ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.76rem',
                              color: '#10B981',
                              background: 'rgba(16, 185, 129, 0.1)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            <ShieldCheck size={13} />
                            <span style={{ fontWeight: 600 }}>Login Ativo</span>
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.76rem',
                              color: 'var(--text-dim)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid var(--border-color)',
                              padding: '3px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            <Lock size={13} />
                            <span>Sem login</span>
                          </div>
                        )}

                        {p.user && p.user.isActive && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            <CalendarIcon size={12} color="var(--primary)" />
                            <span>
                              {p.user.permissions?.canViewAllAppointments ? 'Agenda de todos' : 'Apenas sua agenda'}
                            </span>
                          </div>
                        )}
                      </div>

                      {p.user && p.user.isActive && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Shield size={12} color="var(--primary)" />
                          <span>
                            {p.user.permissions?.allowedMenus && p.user.permissions.allowedMenus.length > 0
                              ? `${p.user.permissions.allowedMenus.length} menu(s) liberado(s)`
                              : 'Apenas Calendário'}
                          </span>
                          {p.user.email && (
                            <span
                              style={{
                                marginLeft: 'auto',
                                opacity: 0.75,
                                maxWidth: '140px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {p.user.email}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Adicionar/Editar Profissional */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Editar Profissional' : 'Novo Profissional'}>
        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#FB7185',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Nome do Profissional *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Oliveira"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              WhatsApp / Telefone
            </label>
            <input
              type="text"
              placeholder="(11) 98888-7777"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Cor no Calendário
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '44px', height: '38px', padding: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{color}</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Comissão (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Serviços que este profissional atende:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {services.map((s) => {
                const checked = selectedServices.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (checked) {
                        setSelectedServices(selectedServices.filter((id) => id !== s.id));
                      } else {
                        setSelectedServices([...selectedServices, s.id]);
                      }
                    }}
                    className="glass-card"
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      color: checked ? '#0B0F17' : 'var(--text-muted)',
                      background: checked ? 'var(--primary)' : 'var(--bg-input)',
                      border: checked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção Segurança & Acesso ao Sistema */}
          <div
            className="glass-card"
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: hasLogin ? 'rgba(229, 179, 56, 0.04)' : 'rgba(255, 255, 255, 0.02)',
              border: hasLogin ? '1px solid rgba(229, 179, 56, 0.25)' : '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: hasLogin ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: hasLogin ? 'var(--primary)' : 'var(--text-dim)',
                  }}
                >
                  <Shield size={18} />
                </div>
                <div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Acesso ao Sistema BarberFlow
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Permita que este barbeiro acesse o sistema com usuário e permissões restritas.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hasLogin}
                  onChange={(e) => setHasLogin(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                />
                <div
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '24px',
                    background: hasLogin ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: hasLogin ? '22px' : '2px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: hasLogin ? '#0B0F17' : '#ffffff',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              </label>
            </div>

            {hasLogin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '10px', borderTop: '1px solid rgba(229, 179, 56, 0.15)' }}>
                {/* Credenciais */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      E-mail de Login *
                    </label>
                    <input
                      type="email"
                      required={hasLogin}
                      placeholder="barbeiro@exemplo.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {existingHasLogin ? 'Nova Senha (opcional)' : 'Senha de Acesso *'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required={hasLogin && !existingHasLogin}
                        placeholder={existingHasLogin ? 'Deixe vazio para manter' : 'Mínimo 6 caracteres'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visibilidade da Agenda */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Visibilidade do Calendário & Agenda
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div
                      onClick={() => setCanViewAllAppointments(false)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: !canViewAllAppointments ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        background: !canViewAllAppointments ? 'rgba(229, 179, 56, 0.1)' : 'var(--bg-input)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: !canViewAllAppointments ? 'var(--primary)' : 'var(--text-main)' }}>
                          Apenas sua própria agenda
                        </span>
                        {!canViewAllAppointments && <Check size={16} color="var(--primary)" />}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Recomendado. O profissional só vê, cria e edita os horários dele próprio.
                      </span>
                    </div>

                    <div
                      onClick={() => setCanViewAllAppointments(true)}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: canViewAllAppointments ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        background: canViewAllAppointments ? 'rgba(229, 179, 56, 0.1)' : 'var(--bg-input)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: canViewAllAppointments ? 'var(--primary)' : 'var(--text-main)' }}>
                          Toda a agenda do salão
                        </span>
                        {canViewAllAppointments && <Check size={16} color="var(--primary)" />}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        Permite ver os agendamentos e horários de todos os barbeiros da barbearia.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Menus e Telas Permitidas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Telas e Menus Permitidos
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Menus desmarcados ficarão bloqueados e ocultos
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                    {AVAILABLE_MENUS.map((menu) => {
                      const isChecked = allowedMenus.includes(menu.key);
                      return (
                        <div
                          key={menu.key}
                          onClick={() => {
                            if (isChecked) {
                              setAllowedMenus(allowedMenus.filter((k) => k !== menu.key));
                            } else {
                              setAllowedMenus([...allowedMenus, menu.key]);
                            }
                          }}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            border: isChecked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                            background: isChecked ? 'rgba(229, 179, 56, 0.08)' : 'var(--bg-input)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            style={{ marginTop: '2px', cursor: 'pointer' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isChecked ? 'var(--text-main)' : 'var(--text-muted)' }}>
                              {menu.label}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                              {menu.description}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="glass-card"
              style={{ padding: '12px 18px', fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="gold-gradient-primary gold-glow"
              style={{ flex: 1, padding: '12px', fontWeight: 600 }}
            >
              {submitting ? 'Salvando...' : 'Salvar Profissional'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
