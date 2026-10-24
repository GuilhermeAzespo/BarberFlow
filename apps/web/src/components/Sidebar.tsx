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
        height: '100vh',
        maxHeight: '100vh',
        position: 'sticky',
        top: 0,
        borderRadius: 0,
        borderTop: 0,
        borderBottom: 0,
        borderLeft: 0,
        padding: '20px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 30,
        overflow: 'hidden',
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  fontSize: '0.88rem',
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
                <Icon size={17} color={active ? '#0B0F17' : item.highlight ? '#FBBF24' : 'currentColor'} />
                <span>{item.label}</span>
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
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '10px',
              fontSize: '0.86rem',
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
              v2.5
            </span>
          </Link>

          <Link
            href="/planos"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '10px',
              fontSize: '0.86rem',
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
        <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.35, margin: '0 0 8px 0' }}>
          Agendamentos e WhatsApp integrados.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            Versão do Sistema:
          </span>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10B981', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 7px', borderRadius: '4px' }}>
            v2.5
          </span>
        </div>
      </Link>
    </aside>
  );
}
