'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  User,
  Scissors,
  Globe,
  Copy,
  ExternalLink,
  Check,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { DateTime } from 'luxon';

interface DashboardData {
  metrics: {
    todayRevenueCents: number;
    monthRevenueCents: number;
    todayAppointmentsTotal: number;
    todayCompletedCount: number;
    todayPendingCount: number;
    todayCanceledCount: number;
    monthAppointmentsCount: number;
    monthCustomersCount: number;
  };
  todayAppointments: Array<{
    id: string;
    startAt: string;
    status: string;
    priceCents: number;
    customer: { id: string; name: string; phone?: string | null };
    service: { id: string; name: string; durationMinutes: number; priceCents: number };
    professional: { id: string; name: string; color: string };
  }>;
  whatsApp: {
    status: string;
    phoneNumber?: string | null;
    botEnabled: boolean;
  };
}

export default function DashboardPage() {
  const { tenant } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const publicBookingUrl = tenant?.slug && origin ? `${origin}/${tenant.slug}` : (tenant?.slug ? `/${tenant.slug}` : '');

  const handleCopyLink = () => {
    if (!publicBookingUrl) return;
    const fullUrl = publicBookingUrl.startsWith('http') ? publicBookingUrl : `${window.location.origin}${publicBookingUrl}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(fullUrl);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const loadDashboard = async () => {
    try {
      const res = await api.get<DashboardData>('/api/dashboard');
      setData(res);
    } catch {
      // Falha tratada silenciosamente
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 15000); // Polling a cada 15s para novidades em tempo real
    return () => clearInterval(interval);
  }, []);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Welcome & Quick CTA */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>
                Olá, {tenant?.name || 'Salão'} 👋
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Acompanhe o faturamento de hoje e o fluxo de agendamentos em tempo real.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <Link
                href="/calendar"
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Calendar size={16} />
                <span>Abrir Calendário</span>
              </Link>
            </div>
          </div>

          {/* WhatsApp Alert Card if Disconnected */}
          {data?.whatsApp.status !== 'CONNECTED' && (
            <div
              className="glass-panel"
              style={{
                padding: '20px 24px',
                marginBottom: '28px',
                borderColor: 'rgba(245, 158, 11, 0.3)',
                background: 'rgba(245, 158, 11, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FBBF24',
                  }}
                >
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#FBBF24', marginBottom: '2px' }}>
                    WhatsApp do salão não está conectado
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Conecte seu número para permitir que seus clientes agendem horários automaticamente via chat.
                  </p>
                </div>
              </div>

              <Link
                href="/whatsapp"
                className="gold-gradient-primary"
                style={{ padding: '8px 18px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>Conectar via QR Code</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* Personalized Public Booking Link Banner */}
          {tenant?.slug && (
            <div
              className="glass-panel"
              style={{
                padding: '16px 22px',
                marginBottom: '28px',
                border: '1px solid rgba(212, 175, 55, 0.25)',
                background: 'linear-gradient(90deg, rgba(212, 175, 55, 0.08) 0%, rgba(18, 18, 20, 0.4) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '260px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(212, 175, 55, 0.15)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--gold-primary)',
                    flexShrink: 0,
                  }}
                >
                  <Globe size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 600 }}>Página da Barbearia & Agendamento:</span>
                    <code
                      style={{
                        color: 'var(--gold-light)',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        background: 'rgba(0, 0, 0, 0.35)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {publicBookingUrl || `/${tenant.slug}`}
                    </code>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Seus clientes podem conhecer a barbearia, ver fotos, serviços, barbeiros e agendar horários online.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="glass-card"
                  style={{
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    fontWeight: 500,
                    color: copied ? '#10B981' : 'var(--text-primary)',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
                {publicBookingUrl && (
                  <a
                    href={publicBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gold-gradient-primary"
                    style={{
                      padding: '8px 14px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    <span>Ver Página</span>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '20px',
              marginBottom: '32px',
            }}
          >
            {/* Faturamento do Dia */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Faturamento de Hoje</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(229, 179, 56, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#E5B338',
                  }}
                >
                  <DollarSign size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                {loading ? '...' : formatBRL(data?.metrics.todayRevenueCents || 0)}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Lançado automaticamente no caixa</span>
            </div>

            {/* Agendamentos Hoje */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Agendamentos Hoje</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34D399',
                  }}
                >
                  <Calendar size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                {loading ? '...' : data?.metrics.todayAppointmentsTotal || 0}
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.78rem' }}>
                <span style={{ color: '#34D399' }}>{data?.metrics.todayCompletedCount || 0} concluídos</span>
                <span style={{ color: 'var(--text-dim)' }}>•</span>
                <span style={{ color: '#FBBF24' }}>{data?.metrics.todayPendingCount || 0} pendentes</span>
              </div>
            </div>

            {/* Faturamento do Mês */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Faturamento do Mês</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(6, 182, 212, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#22D3EE',
                  }}
                >
                  <TrendingUp size={18} />
                </div>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
                {loading ? '...' : formatBRL(data?.metrics.monthRevenueCents || 0)}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                {data?.metrics.monthAppointmentsCount || 0} atendimentos realizados
              </span>
            </div>

            {/* Status do WhatsApp Bot */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Bot de WhatsApp</span>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: data?.whatsApp.status === 'CONNECTED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: data?.whatsApp.status === 'CONNECTED' ? '#34D399' : '#FB7185',
                  }}
                >
                  <MessageSquare size={18} />
                </div>
              </div>
              <div style={{ marginBottom: '6px' }}>
                <span className={`badge ${data?.whatsApp.status === 'CONNECTED' ? 'badge-success' : 'badge-danger'}`}>
                  {data?.whatsApp.status === 'CONNECTED' ? 'Ativo & Respondendo' : 'Desconectado'}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                {data?.whatsApp.phoneNumber ? `Número: +${data.whatsApp.phoneNumber}` : 'Nenhum número pareado'}
              </span>
            </div>
          </div>

          {/* Today's Appointments List */}
          <div className="glass-panel" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Agenda de Hoje</h3>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {DateTime.now().setZone(tenant?.timezone || 'America/Sao_Paulo').toFormat("cccc, dd 'de' MMMM", { locale: 'pt-BR' })}
                </span>
              </div>

              <Link
                href="/calendar"
                style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <span>Ver agenda completa</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {loading ? (
              <p style={{ color: 'var(--text-dim)', padding: '20px 0' }}>Carregando atendimentos...</p>
            ) : data?.todayAppointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                <Calendar size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p style={{ fontSize: '1rem', fontWeight: 500 }}>Nenhum agendamento para hoje ainda.</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Os horários agendados pelos clientes no WhatsApp aparecerão aqui automaticamente.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {data?.todayAppointments.map((app) => {
                  const timeStr = DateTime.fromISO(app.startAt, { zone: tenant?.timezone || 'America/Sao_Paulo' }).toFormat('HH:mm');
                  const isCompleted = app.status === 'COMPLETED';
                  const isCanceled = app.status === 'CANCELED';

                  return (
                    <div
                      key={app.id}
                      className="glass-card"
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Clock size={16} color="var(--primary)" />
                          <span>{timeStr}</span>
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>{app.customer.name}</span>
                            {app.customer.phone && (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                ({app.customer.phone})
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Scissors size={14} />
                              {app.service.name} ({app.service.durationMinutes} min)
                            </span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: app.professional.color || '#E5B338',
                                }}
                              />
                              {app.professional.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                          {formatBRL(app.priceCents)}
                        </span>

                        <span
                          className={`badge ${
                            isCompleted ? 'badge-success' : isCanceled ? 'badge-danger' : 'badge-warning'
                          }`}
                        >
                          {isCompleted ? 'Concluído' : isCanceled ? 'Cancelado' : 'Agendado'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
