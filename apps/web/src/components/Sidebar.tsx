'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  UserCheck,
  DollarSign,
  MessageSquare,
  MessageCircle,
  Settings,
  Sparkles,
  Crown,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { SYSTEM_VERSION } from '../lib/constants';
import { useWhatsAppNotifications } from '../lib/whatsapp-notifications-context';

export const ALL_MENU_KEYS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendário & Agenda', href: '/calendar', icon: Calendar },
  { key: 'professionals', label: 'Profissionais', href: '/professionals', icon: Users },
  { key: 'services', label: 'Serviços & Preços', href: '/services', icon: Scissors },
  { key: 'customers', label: 'Clientes', href: '/customers', icon: UserCheck },
  { key: 'finance', label: 'Fluxo de Caixa', href: '/finance', icon: DollarSign },
  { key: 'chat', label: 'Atendimento / Chat', href: '/chat', icon: MessageCircle, highlight: true },
  { key: 'whatsapp', label: 'Bot WhatsApp', href: '/whatsapp', icon: MessageSquare },
  { key: 'settings', label: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { canAccessMenu, subscription } = useAuth();
  const { unreadCount: whatsappUnreadCount } = useWhatsAppNotifications();
  const visibleMenuItems = ALL_MENU_KEYS.filter((item) => canAccessMenu(item.key));

  return (
    <aside
      className="glass-panel"
      style={{
        width: 'var(--sidebar-width, 240px)',
        height: '100vh',
        maxHeight: '100vh',
        position: 'sticky',
        top: 0,
        borderRadius: 0,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        padding: '16px 10px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 30,
        overflow: 'hidden',
        transition: 'width 0.2s ease, padding 0.2s ease',
      }}
    >
      {/* Container de navegação com scroll interno suave quando necessário */}
      <div
        className="custom-scrollbar"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: '2px',
          marginBottom: '12px',
        }}
      >
        {/* Brand */}
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '2px 8px 20px 8px',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #E5B338, #966C0F)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px var(--primary-glow)',
            }}
          >
            <Sparkles size={20} color="#0B0F17" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-main)', margin: 0 }}>
              Barber<span style={{ color: 'var(--primary)' }}>Flow</span>
            </h1>
          </div>
        </Link>

        {/* Navigation links operacionais */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: active ? 600 : 500,
                  color: active ? '#0B0F17' : item.highlight ? '#FBBF24' : 'var(--text-muted)',
                  background: active
                    ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                    : item.highlight
                    ? 'rgba(245, 158, 11, 0.08)'
                    : 'transparent',
                  transition: 'all 0.2s ease',
                  border: item.highlight && !active ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid transparent',
                  position: 'relative',
                  minWidth: 0,
                }}
              >
                <Icon size={17} style={{ flexShrink: 0 }} color={active ? '#0B0F17' : item.highlight ? '#FBBF24' : 'currentColor'} />
                <span className="sidebar-label text-nowrap-ellipsis" style={{ flex: 1, minWidth: 0 }}>
                  {item.label}
                </span>
                {item.key === 'chat' && whatsappUnreadCount > 0 && (
                  <span
                    className="sidebar-badge"
                    style={{
                      marginLeft: 'auto',
                      background: active ? '#0B0F17' : '#EF4444',
                      color: active ? '#E5B338' : '#FFFFFF',
                      borderRadius: '10px',
                      padding: '1px 6px',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      boxShadow: active ? 'none' : '0 0 8px rgba(239, 68, 68, 0.7)',
                      flexShrink: 0,
                    }}
                  >
                    {whatsappUnreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Divisor & Links Gerais do Sistema */}
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ padding: '0 10px 4px 10px', fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Plataforma & Conta
          </div>

          <Link
            href="/novidades"
            title="Novidades"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: pathname === '/novidades' ? 700 : 500,
              color: pathname === '/novidades' ? '#0B0F17' : '#E5B338',
              background: pathname === '/novidades'
                ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                : 'rgba(229, 179, 56, 0.08)',
              border: pathname === '/novidades' ? 'none' : '1px solid rgba(229, 179, 56, 0.2)',
              transition: 'all 0.2s ease',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Sparkles size={16} style={{ flexShrink: 0 }} />
              <span className="sidebar-label text-nowrap-ellipsis">Novidades</span>
            </div>
            <span
              className="sidebar-badge"
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                padding: '2px 5px',
                borderRadius: '6px',
                background: pathname === '/novidades' ? 'rgba(0,0,0,0.3)' : 'rgba(229, 179, 56, 0.25)',
                color: pathname === '/novidades' ? '#0B0F17' : '#E5B338',
                letterSpacing: '0.04em',
                flexShrink: 0,
              }}
            >
              {SYSTEM_VERSION}
            </span>
          </Link>

          <Link
            href="/planos"
            title="Planos & Upgrade"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: pathname === '/planos' ? 700 : 500,
              color: pathname === '/planos' ? '#0B0F17' : 'var(--text-muted)',
              background: pathname === '/planos'
                ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                : 'transparent',
              transition: 'all 0.2s ease',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Crown size={16} style={{ flexShrink: 0 }} color={pathname === '/planos' ? '#0B0F17' : 'var(--primary)'} />
              <span className="sidebar-label text-nowrap-ellipsis">Planos & Upgrade</span>
            </div>
            {subscription && (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: pathname === '/planos' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)',
                  color: pathname === '/planos' ? '#0B0F17' : 'var(--text-dim)',
                }}
              >
                {subscription.plan.name}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Footer Banner - FIXO e ANCORADO no final da barra lateral */}
      <Link
        href="/planos"
        className="glass-card"
        style={{
          padding: '12px 14px',
          borderRadius: '12px',
          background: 'rgba(229, 179, 56, 0.05)',
          border: '1px solid rgba(229, 179, 56, 0.2)',
          textDecoration: 'none',
          display: 'block',
          flexShrink: 0,
          marginTop: 'auto',
          transition: 'border-color 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
          <span style={{ fontSize: '0.8rem', color: '#FBBF24', fontWeight: 700 }}>
            BarberFlow {subscription?.plan.name || 'Starter'}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>
            Ver limites →
          </span>
        </div>
        <div style={{ fontSize: '0.74rem', lineHeight: 1.35, margin: '0 0 8px 0' }}>
          {subscription?.status === 'TRIALING' ? (
            <span style={{ color: (subscription.trialDaysLeft ?? 0) <= 3 ? '#F87171' : '#FBBF24', fontWeight: 600 }}>
              {(subscription.trialDaysLeft ?? 0) <= 0
                ? '⚠️ Teste encerrado (14 dias)'
                : `⏱️ Teste: ${subscription.trialDaysLeft} dia(s) restante(s)`}
            </span>
          ) : subscription?.status === 'ACTIVE' ? (
            <span style={{ color: '#10B981', fontWeight: 600 }}>
              {subscription.renewDaysLeft !== null && subscription.renewDaysLeft !== undefined
                ? `📅 Renova em ${subscription.renewDaysLeft} dia(s)`
                : '✨ Assinatura Ativa'}
            </span>
          ) : subscription?.status === 'PAST_DUE' ? (
            <span style={{ color: '#F43F5E', fontWeight: 600 }}>
              ⚠️ Pagamento pendente
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)' }}>
              Agendamentos e WhatsApp integrados.
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            Versão do Sistema:
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10B981', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 7px', borderRadius: '4px' }}>
            {SYSTEM_VERSION}
          </span>
        </div>
      </Link>
    </aside>
  );
}
