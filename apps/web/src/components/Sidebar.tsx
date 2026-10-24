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
  Settings,
  Sparkles,
  Crown,
} from 'lucide-react';
import { useAuth } from '../lib/auth-context';

export const ALL_MENU_KEYS = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { key: 'calendar', label: 'Calendário & Agenda', href: '/calendar', icon: Calendar },
  { key: 'professionals', label: 'Profissionais', href: '/professionals', icon: Users },
  { key: 'services', label: 'Serviços & Preços', href: '/services', icon: Scissors },
  { key: 'customers', label: 'Clientes', href: '/customers', icon: UserCheck },
  { key: 'finance', label: 'Fluxo de Caixa', href: '/finance', icon: DollarSign },
  { key: 'whatsapp', label: 'Bot WhatsApp', href: '/whatsapp', icon: MessageSquare, highlight: true },
  { key: 'settings', label: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { canAccessMenu, subscription } = useAuth();
  const visibleMenuItems = ALL_MENU_KEYS.filter((item) => canAccessMenu(item.key));

  return (
    <aside
      className="glass-panel"
      style={{
        width: '260px',
        minHeight: '100vh',
        borderRadius: 0,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div>
        {/* Brand */}
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '2px 8px 24px 8px',
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
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: active ? 600 : 500,
                  color: active ? '#0B0F17' : item.highlight ? '#FBBF24' : 'var(--text-muted)',
                  background: active
                    ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                    : item.highlight
                    ? 'rgba(245, 158, 11, 0.08)'
                    : 'transparent',
                  transition: 'all 0.2s ease',
                  border: item.highlight && !active ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid transparent',
                }}
              >
                <Icon size={18} color={active ? '#0B0F17' : item.highlight ? '#FBBF24' : 'currentColor'} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Divisor & Links Gerais do Sistema */}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ padding: '0 12px 6px 12px', fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Plataforma & Conta
          </div>

          <Link
            href="/novidades"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: pathname === '/novidades' ? 700 : 500,
              color: pathname === '/novidades' ? '#0B0F17' : '#E5B338',
              background: pathname === '/novidades'
                ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                : 'rgba(229, 179, 56, 0.08)',
              border: pathname === '/novidades' ? 'none' : '1px solid rgba(229, 179, 56, 0.2)',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={16} />
              <span>Novidades</span>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '6px',
                background: pathname === '/novidades' ? 'rgba(0,0,0,0.3)' : 'rgba(229, 179, 56, 0.25)',
                color: pathname === '/novidades' ? '#0B0F17' : '#E5B338',
                letterSpacing: '0.04em',
              }}
            >
              v2.4
            </span>
          </Link>

          <Link
            href="/planos"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '9px 14px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: pathname === '/planos' ? 700 : 500,
              color: pathname === '/planos' ? '#0B0F17' : 'var(--text-muted)',
              background: pathname === '/planos'
                ? 'linear-gradient(135deg, #E5B338 0%, #C99520 100%)'
                : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Crown size={16} color={pathname === '/planos' ? '#0B0F17' : 'var(--primary)'} />
              <span>Planos & Upgrade</span>
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

      {/* Footer Banner */}
      <Link
        href="/planos"
        className="glass-card"
        style={{
          padding: '14px',
          borderRadius: '12px',
          background: 'rgba(229, 179, 56, 0.05)',
          border: '1px solid rgba(229, 179, 56, 0.2)',
          textDecoration: 'none',
          display: 'block',
          transition: 'border-color 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.78rem', color: '#FBBF24', fontWeight: 700 }}>
            BarberFlow {subscription?.plan.name || 'Pro'}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontWeight: 600 }}>
            Ver limites →
          </span>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4, margin: 0 }}>
          Agendamentos e WhatsApp integrados. Clique para comparar planos.
        </p>
      </Link>
    </aside>
  );
}
