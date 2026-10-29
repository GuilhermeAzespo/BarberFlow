'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { api } from '../lib/api';
import { LogOut, User as UserIcon, AlertTriangle, Shield, CheckCircle, ShieldAlert, ArrowLeft, Sparkles, Crown, Clock, Bell, MessageCircle, Scissors } from 'lucide-react';
import { useWhatsAppNotifications } from '../lib/whatsapp-notifications-context';

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
  const { unreadCount: whatsappUnreadCount, unreadConversations } = useWhatsAppNotifications();
  const [delayedAppointments, setDelayedAppointments] = useState<DelayedAppointmentItem[]>([]);
  const [delayedCount, setDelayedCount] = useState(0);
  const [isDelayedOpen, setIsDelayedOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const totalAlerts = delayedCount + whatsappUnreadCount;

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

      <header
        className="glass-panel"
        style={{
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          padding: 'var(--header-padding, 10px 24px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 40,
          minHeight: '68px',
          gap: '12px',
          transition: 'padding 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexShrink: 1 }}>
          <div style={{ minWidth: 0 }}>
            <h2
              className="compact-title text-nowrap-ellipsis"
              style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2, maxWidth: '180px', margin: 0 }}
            >
              {tenant ? tenant.name : 'BarberFlow'}
            </h2>
            <Link
              href="/planos"
              title="Clique para ver detalhes do plano e limites"
              style={{
                fontSize: '0.76rem',
                color: 'var(--primary)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 700,
                background: 'rgba(229, 179, 56, 0.1)',
                padding: '1px 7px',
                borderRadius: '6px',
                border: '1px solid rgba(229, 179, 56, 0.25)',
                marginTop: '2px',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Crown size={11} />
              <span>{user?.role === 'SUPER_ADMIN' ? 'Painel Master' : `Plano ${subscription?.plan.name || 'Starter'}`}</span>
            </Link>
          </div>

          {access?.warning && (
            <div
              title={access.warning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '20px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#FBBF24',
                fontSize: '0.74rem',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '280px',
                flexShrink: 1,
              }}
            >
              <AlertTriangle size={13} style={{ flexShrink: 0 }} />
              <span className="text-nowrap-ellipsis">{access.warning}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
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
                height: '44px',
                width: 'auto',
                maxWidth: '120px',
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
                height: '44px',
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
              padding: '5px 12px',
              borderRadius: '8px',
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: '#A78BFA',
              fontSize: '0.80rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
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
            padding: '5px 10px',
            borderRadius: '20px',
            background: 'rgba(229, 179, 56, 0.1)',
            border: '1px solid rgba(229, 179, 56, 0.3)',
            color: 'var(--primary)',
            fontSize: '0.78rem',
            fontWeight: 700,
            textDecoration: 'none',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <Sparkles size={13} />
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
              title={
                totalAlerts > 0
                  ? `${totalAlerts} notificação(ões) pendente(s)`
                  : 'Notificações Internas'
              }
              style={{
                position: 'relative',
                background: totalAlerts > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${totalAlerts > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`,
                color: totalAlerts > 0 ? '#EF4444' : 'var(--text-muted)',
                borderRadius: '8px',
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = totalAlerts > 0 ? '#F87171' : 'var(--text-main)';
                e.currentTarget.style.borderColor = totalAlerts > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = totalAlerts > 0 ? '#EF4444' : 'var(--text-muted)';
                e.currentTarget.style.borderColor = totalAlerts > 0 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <Bell size={18} />
              {totalAlerts > 0 && (
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
                  {totalAlerts}
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
                  maxWidth: 'calc(100vw - 32px)',
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
                    <Bell size={16} color={totalAlerts > 0 ? '#EF4444' : 'var(--text-muted)'} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Central de Notificações
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {whatsappUnreadCount > 0 && (
                      <span
                        style={{
                          fontSize: '0.70rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '10px',
                          background: 'rgba(37, 211, 102, 0.15)',
                          color: '#34D399',
                          border: '1px solid rgba(37, 211, 102, 0.35)',
                        }}
                      >
                        {whatsappUnreadCount} WhatsApp
                      </span>
                    )}
                    {delayedCount > 0 && (
                      <span
                        style={{
                          fontSize: '0.70rem',
                          fontWeight: 700,
                          padding: '2px 7px',
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
                </div>

                {totalAlerts === 0 ? (
                  <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.84rem' }}>
                    <CheckCircle size={24} color="#10B981" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                    Tudo em dia! Nenhuma mensagem nova ou atendimento pendente.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto' }}>
                    {/* Seção 1: Mensagens do WhatsApp Não Lidas */}
                    {whatsappUnreadCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#34D399', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <MessageCircle size={13} color="#25D366" /> Mensagens do WhatsApp
                          </span>
                          <Link
                            href="/chat"
                            onClick={() => setIsDelayedOpen(false)}
                            style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            Ir para o Chat →
                          </Link>
                        </div>

                        {unreadConversations.map((conv) => (
                          <Link
                            key={conv.id}
                            href={`/chat?id=${conv.id}`}
                            onClick={() => setIsDelayedOpen(false)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              background: 'rgba(37, 211, 102, 0.08)',
                              border: '1px solid rgba(37, 211, 102, 0.22)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '3px',
                              textDecoration: 'none',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.16)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(37, 211, 102, 0.08)';
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.84rem', color: '#FFFFFF' }}>
                                {conv.contactName || conv.phone || 'Cliente'}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                                {new Date(conv.lastMessageAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.76rem', color: '#E5E7EB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {conv.lastMessage || 'Nova mensagem recebida'}
                            </p>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* Divisor */}
                    {whatsappUnreadCount > 0 && delayedCount > 0 && (
                      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '2px 0' }} />
                    )}

                    {/* Seção 2: Atendimentos Atrasados */}
                    {delayedCount > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <AlertTriangle size={13} color="#EF4444" /> Atendimentos Atrasados
                          </span>
                          <Link
                            href="/calendar"
                            onClick={() => setIsDelayedOpen(false)}
                            style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                          >
                            Ver Agenda →
                          </Link>
                        </div>

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-main)',
              flexShrink: 0,
            }}
          >
            <UserIcon size={15} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              title={user?.name}
              className="text-nowrap-ellipsis"
              style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', maxWidth: '140px' }}
            >
              {user?.name}
            </span>
            <span
              title={user?.email}
              className="hide-on-compact text-nowrap-ellipsis"
              style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '140px' }}
            >
              {user?.email}
            </span>
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
