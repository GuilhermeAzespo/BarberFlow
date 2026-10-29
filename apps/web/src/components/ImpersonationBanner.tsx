'use client';

import React, { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { ShieldAlert, ArrowLeft, Loader2, Sparkles } from 'lucide-react';

export function ImpersonationBanner() {
  const { isImpersonated, tenant, exitImpersonation } = useAuth();
  const [exiting, setExiting] = useState(false);

  if (!isImpersonated) return null;

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await exitImpersonation();
    } catch {
      setExiting(false);
    }
  };

  return (
    <aside
      aria-label="Aviso de personificação de suporte"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'linear-gradient(90deg, #DC2626 0%, #B91C1C 45%, #991B1B 100%)',
        color: '#FFFFFF',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 4px 18px rgba(220, 38, 38, 0.45)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.25)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '280px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.2)',
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={20} color="#FFFFFF" />
        </div>
        <div style={{ fontSize: '0.88rem', lineHeight: '1.3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                border: '1px solid rgba(255, 255, 255, 0.25)',
              }}
            >
              Modo Suporte Super Admin
            </span>
            <span>
              Você está personificando o salão{' '}
              <strong style={{ textDecoration: 'underline', color: '#FEF08A' }}>
                {tenant?.name || 'Salão'}
              </strong>
              {tenant?.slug ? ` (/${tenant.slug})` : ''}
            </span>
          </div>
          <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.85)' }}>
            Qualquer alteração feita nesta sessão refletirá em tempo real nos dados do cliente.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={handleExit}
          disabled={exiting}
          style={{
            background: '#FFFFFF',
            color: '#991B1B',
            border: 'none',
            padding: '8px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.84rem',
            cursor: exiting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
            transition: 'all 0.18s ease-in-out',
            opacity: exiting ? 0.75 : 1,
          }}
          onMouseEnter={(e) => {
            if (!exiting) {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.35)';
              e.currentTarget.style.background = '#FEF2F2';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.25)';
            e.currentTarget.style.background = '#FFFFFF';
          }}
        >
          {exiting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Saindo do Salão...</span>
            </>
          ) : (
            <>
              <ArrowLeft size={16} />
              <span>Parar de Personificar (Voltar ao Super Admin)</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
