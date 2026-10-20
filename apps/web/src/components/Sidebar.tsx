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
} from 'lucide-react';

const menuItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Calendário & Agenda', href: '/calendar', icon: Calendar },
  { label: 'Profissionais', href: '/professionals', icon: Users },
  { label: 'Serviços & Preços', href: '/services', icon: Scissors },
  { label: 'Clientes', href: '/customers', icon: UserCheck },
  { label: 'Fluxo de Caixa', href: '/finance', icon: DollarSign },
  { label: 'Bot WhatsApp', href: '/whatsapp', icon: MessageSquare, highlight: true },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

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

        {/* Navigation links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {menuItems.map((item) => {
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
      </div>

      {/* Footer Banner */}
      <div
        className="glass-card"
        style={{
          padding: '14px',
          borderRadius: '12px',
          background: 'rgba(229, 179, 56, 0.05)',
          border: '1px solid rgba(229, 179, 56, 0.15)',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: '#FBBF24', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
          BarberFlow Automation
        </span>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>
          Agendamentos 100% integrados via WhatsApp e sincronizados em tempo real.
        </p>
      </div>
    </aside>
  );
}
