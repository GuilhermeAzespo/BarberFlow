'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { LogOut, User as UserIcon, AlertTriangle, Shield, CheckCircle, ShieldAlert, ArrowLeft, Sparkles, Crown } from 'lucide-react';

export function Header() {
  const { user, tenant, subscription, access, isImpersonated, exitImpersonation, logout } = useAuth();

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
