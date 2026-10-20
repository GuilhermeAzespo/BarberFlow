'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth-context';
import { LogOut, User as UserIcon, AlertTriangle, Shield, CheckCircle, ShieldAlert, ArrowLeft } from 'lucide-react';

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
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {tenant?.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={tenant.name}
            style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
          />
        ) : tenant ? (
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #E5B338, #A17514)',
              color: '#0B0F17',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '1.1rem',
            }}
          >
            {tenant.name.charAt(0).toUpperCase()}
          </div>
        ) : (
          <img
            src="/logo.png"
            alt="BarberFlow"
            style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
          />
        )}

        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.2 }}>
            {tenant ? tenant.name : 'BarberFlow'}
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {user?.role === 'SUPER_ADMIN' ? 'Painel Master SaaS' : `${subscription?.plan.name || 'Trial'} Plan`}
          </span>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
