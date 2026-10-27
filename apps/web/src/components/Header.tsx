'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { api } from '../lib/api';
import { LogOut, User as UserIcon, AlertTriangle, Shield, CheckCircle, ShieldAlert, ArrowLeft, Sparkles, Crown, Clock, Bell, MessageCircle, Scissors } from 'lucide-react';

interface DelayedAppointmentItem {
  id: string;
  startAt: string;
  endAt: string;
  customer: {
    name: string;
    phone?: string | null;
  };
  service: {
    name: string;
    durationMinutes: number;
    priceCents: number;
  };
  professional: {
    name: string;
    color?: string | null;
  };
}

export function Header() {
  const { user, tenant, subscription, access, isImpersonated, exitImpersonation, logout } = useAuth();
  const [delayedAppointments, setDelayedAppointments] = useState<DelayedAppointmentItem[]>([]);
  const [delayedCount, setDelayedCount] = useState(0);
  const [isDelayedOpen, setIsDelayedOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN' || !tenant) return;

    let isMounted = true;
    const fetchDelayed = async () => {
      try {
        const res = await api.get<{ delayedAppointments: DelayedAppointmentItem[]; count: number }>('/api/appointments/delayed');
        if (isMounted) {
          setDelayedAppointments(res.delayedAppointments || []);
          setDelayedCount(res.count ?? res.delayedAppointments?.length ?? 0);
        }
      } catch {
        // Silently fail if not loaded or background polling
      }
    };

    fetchDelayed();
    const interval = setInterval(fetchDelayed, 45000); // Polling a cada 45s

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user, tenant]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDelayedOpen(false);
      }
    };
    if (isDelayedOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDelayedOpen]);

  return (
    <>
      {isImpersonated && (
        <div
          style={{
            background: 'linear-gradient(90deg, #F59E0B, #D97706)',
            color: '#0B0F17',
            padding: '8px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 600,
            fontSize: '0.86rem',
            boxShadow: '0 2px 12px rgba(245, 158, 11, 0.35)',
            zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} />
            <span>
              <strong>Modo Suporte Super Admin:</strong> Você está acessando a conta de{' '}
              <u>{tenant?.name ?? 'Salão'}</u> com permissões completas de gerenciamento.
            </span>
          </div>
          <button
            onClick={exitImpersonation}
            style={{
              background: '#0B0F17',
              color: '#FBBF24',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              padding: '6px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1A2333')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#0B0F17')}
          >
            <ArrowLeft size={14} />
            <span>Sair do Salão & Voltar ao Super Admin</span>
          </button>
        </div>
      )}

      {/* Banner de Aviso de Fim de Trial / Renovação */}
      {subscription && user?.role !== 'SUPER_ADMIN' && (
        <>
          {subscription.status === 'TRIALING' && (subscription.trialDaysLeft ?? 99) <= 3 && (
            <div
              style={{
                background: (subscription.trialDaysLeft ?? 0) <= 0
                  ? 'linear-gradient(90deg, #991B1B 0%, #B91C1C 100%)'
                  : 'linear-gradient(90deg, #78350F 0%, #B45309 100%)',
                color: '#FFFFFF',
                padding: '9px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.86rem',
                fontWeight: 600,
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                zIndex: 45,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="#FDE047" />
                <span>
                  {(subscription.trialDaysLeft ?? 0) <= 0 ? (
                    <>
                      <strong>Seu período de teste de 14 dias terminou!</strong> Cadastre um cartão de crédito ou realize o pagamento via Pix para continuar utilizando o BarberFlow.
                    </>
                  ) : (
                    <>
                      <strong>Atenção:</strong> Seu teste gratuito de 14 dias está acabando! Restam apenas <strong>{subscription.trialDaysLeft} dia(s)</strong>.
                      Escolha seu plano e ative o pagamento via Pix ou Cartão para não interromper seu salão.
                    </>
                  )}
                </span>
              </div>
              <Link
                href="/planos"
                style={{
                  background: '#E5B338',
                  color: '#0B0F17',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(229, 179, 56, 0.4)',
                }}
              >
                <span>Ativar Assinatura Agora →</span>
              </Link>
            </div>
          )}

          {subscription.status === 'ACTIVE' && subscription.renewDaysLeft !== null && subscription.renewDaysLeft !== undefined && subscription.renewDaysLeft <= 3 && (
            <div
              style={{
                background: 'linear-gradient(90deg, #1E1B4B 0%, #312E81 100%)',
                borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#E0E7FF',
                padding: '8px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.84rem',
                fontWeight: 500,
                zIndex: 45,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={16} color="#A78BFA" />
                <span>
                  {subscription.renewDaysLeft <= 0 ? (
                    <>
                      Sua assinatura mensal renovou hoje! Efetue a confirmação via Pix ou Cartão para manter seus recursos 100% ativos.
                    </>
                  ) : (
                    <>
                      Sua assinatura do <strong>Plano {subscription.plan.name}</strong> renova em <strong>{subscription.renewDaysLeft} dia(s)</strong>.
                    </>
                  )}
                </span>
              </div>
              <Link
                href="/planos"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#FFFFFF',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  textDecoration: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                Ver Faturas / Planos →
              </Link>
            </div>
          )}
        </>
      )}

      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 40, minHeight: '74px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>
            {tenant ? tenant.name : 'BarberFlow'}
          </h2>
          <Link
            href="/planos"
            title="Clique para ver detalhes do plano e limites"
            style={{
              fontSize: '0.8rem',
              color: 'var(--primary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 700,
              background: 'rgba(229, 179, 56, 0.1)',
              padding: '2px 8px',
              borderRadius: '6px',
              border: '1px solid rgba(229, 179, 56, 0.25)',
              marginTop: '2px',
              transition: 'all 0.15s ease',
            }}
          >
            <Crown size={12} />
            <span>{user?.role === 'SUPER_ADMIN' ? 'Painel Master SaaS' : `Plano ${subscription?.plan.name || 'Starter'}`}</span>
          </Link>
        </div>

        {access?.warning && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#FBBF24',
              fontSize: '0.78rem',
              fontWeight: 500,
              marginLeft: '12px',
            }}
          >
            <AlertTriangle size={14} />
            <span>{access.warning}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        {/* Logo do Salão na Direita (ou BarberFlow se não configurada) */}
        {tenant?.logoUrl ? (
          <Link
            href="/settings"
            title={`Logo de ${tenant.name} - Clique para alterar`}
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              paddingRight: '16px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'opacity 0.2s',
            }}
          >
            <img
              src={tenant.logoUrl}
              alt={tenant.name}
              style={{
                height: '52px',
                width: 'auto',
                maxWidth: '140px',
                objectFit: 'contain',
                borderRadius: '8px',
                filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.35))',
              }}
            />
          </Link>
        ) : (
          <Link
            href="/dashboard"
            title="BarberFlow"
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              paddingRight: '16px',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <img
              src="/logo.png"
              alt="BarberFlow"
              style={{
                height: '52px',
                width: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 14px rgba(0, 0, 0, 0.45))',
              }}
            />
          </Link>
        )}

        {user?.role === 'SUPER_ADMIN' && (
          <Link
            href="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#A78BFA',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <Shield size={14} />
            <span>Painel Super Admin</span>
          </Link>
        )}

        <Link
          href="/novidades"
          title="Ver o que há de novo no BarberFlow"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '20px',
            background: 'rgba(229, 179, 56, 0.1)',
            border: '1px solid rgba(229, 179, 56, 0.3)',
            color: 'var(--primary)',
            fontSize: '0.8rem',
            fontWeight: 700,
            textDecoration: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <Sparkles size={14} />
          <span>Novidades</span>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 6px #10B981',
            }}
          />
        </Link>

        {/* Notificações Internas do Salão / Barbeiro */}
        {user?.role !== 'SUPER_ADMIN' && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsDelayedOpen(!isDelayedOpen)}
              title={delayedCount > 0 ? `${delayedCount} atendimento(s) atrasado(s)` : 'Notificações Internas'}
              style={{
                position: 'relative',
                background: delayedCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${delayedCount > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`,
                color: delayedCount > 0 ? '#EF4444' : 'var(--text-muted)',
                borderRadius: '8px',
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = delayedCount > 0 ? '#F87171' : 'var(--text-main)';
                e.currentTarget.style.borderColor = delayedCount > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = delayedCount > 0 ? '#EF4444' : 'var(--text-muted)';
                e.currentTarget.style.borderColor = delayedCount > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <Bell size={18} />
              {delayedCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.7)',
                    lineHeight: 1.2,
                  }}
                >
                  {delayedCount}
                </span>
              )}
            </button>

            {isDelayedOpen && (
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 10px)',
                  width: '360px',
                  borderRadius: '12px',
                  padding: '14px',
                  background: 'rgba(15, 21, 32, 0.98)',
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color={delayedCount > 0 ? '#EF4444' : 'var(--text-muted)'} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Notificações do Salão
                    </span>
                  </div>
                  {delayedCount > 0 && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#EF4444',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      {delayedCount} atrasado(s)
                    </span>
                  )}
                </div>

                {delayedCount === 0 ? (
                  <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.84rem' }}>
                    <CheckCircle size={24} color="#10B981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    Tudo em dia! Nenhum corte ou atendimento atrasado no momento.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                    {delayedAppointments.map((app) => {
                      const endTime = new Date(app.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      const cleanPhone = app.customer.phone ? app.customer.phone.replace(/\D/g, '') : null;

                      return (
                        <div
                          key={app.id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.86rem', color: '#F3F4F6' }}>
                              {app.customer.name}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#EF4444' }}>
                              Previsto até {endTime}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <Scissors size={12} color="var(--primary)" />
                            <span>{app.service.name}</span>
                            <span>•</span>
                            <span style={{ color: app.professional.color || 'var(--primary)', fontWeight: 600 }}>
                              {app.professional.name}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Olá ${app.customer.name}! Notamos um atraso no seu agendamento de ${app.service.name} com ${app.professional.name}. Se precisar de suporte ou tiver algum imprevisto, estamos à disposição!`)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.74rem',
                                  color: '#25D366',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: 'rgba(37, 211, 102, 0.1)',
                                  border: '1px solid rgba(37, 211, 102, 0.25)',
                                }}
                              >
                                <MessageCircle size={12} />
                                <span>Avisar Cliente</span>
                              </a>
                            )}
                            <Link
                              href="/calendar"
                              onClick={() => setIsDelayedOpen(false)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.74rem',
                                color: 'var(--primary)',
                                fontWeight: 600,
                                textDecoration: 'none',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                background: 'rgba(229, 179, 56, 0.1)',
                                border: '1px solid rgba(229, 179, 56, 0.25)',
                              }}
                            >
                              <span>Ver Agenda →</span>
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '8px', textAlign: 'center' }}>
                  <Link
                    href="/calendar"
                    onClick={() => setIsDelayedOpen(false)}
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textDecoration: 'none',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                  >
                    Gerenciar todos os agendamentos na Agenda →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-main)',
            }}
          >
            <UserIcon size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{user?.name}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</span>
          </div>
        </div>

        <button
          onClick={logout}
          title="Sair da conta"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#FB7185')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  </>
  );
}
