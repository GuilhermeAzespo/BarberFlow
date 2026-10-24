'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Trash2, HelpCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  icon?: 'alert' | 'trash' | 'info';
}

interface ToastContextType {
  toast: {
    success: (message: string, options?: { title?: string; duration?: number }) => void;
    error: (message: string, options?: { title?: string; duration?: number }) => void;
    warning: (message: string, options?: { title?: string; duration?: number }) => void;
    info: (message: string, options?: { title?: string; duration?: number }) => void;
  };
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type: ToastType, message: string, options?: { title?: string; duration?: number }) => {
    const id = Math.random().toString(36).substring(2, 9);
    const duration = options?.duration ?? (type === 'error' ? 5500 : 3800);
    const newItem: ToastItem = {
      id,
      type,
      title: options?.title,
      message,
      duration,
    };

    setToasts((prev) => [...prev.slice(-4), newItem]); // Mantém no máximo 5 toasts ativos

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmDialog({
        isOpen: true,
        options,
        resolve: (val: boolean) => {
          setConfirmDialog(null);
          resolve(val);
        },
      });
    });
  }, []);

  const toastMethods = {
    success: (msg: string, opts?: { title?: string; duration?: number }) => addToast('success', msg, opts),
    error: (msg: string, opts?: { title?: string; duration?: number }) => addToast('error', msg, opts),
    warning: (msg: string, opts?: { title?: string; duration?: number }) => addToast('warning', msg, opts),
    info: (msg: string, opts?: { title?: string; duration?: number }) => addToast('info', msg, opts),
  };

  return (
    <ToastContext.Provider value={{ toast: toastMethods, confirm }}>
      {children}

      {/* Container de Toasts Flutuantes */}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '420px',
          width: 'calc(100vw - 48px)',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onClose={() => removeToast(item.id)} />
        ))}
      </div>

      {/* Modal de Confirmação Luxury */}
      {confirmDialog && confirmDialog.isOpen && (
        <ConfirmDialogModal
          options={confirmDialog.options}
          onConfirm={() => confirmDialog.resolve(true)}
          onCancel={() => confirmDialog.resolve(false)}
        />
      )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const getStyle = () => {
    switch (item.type) {
      case 'success':
        return {
          icon: <CheckCircle2 size={20} color="#10B981" style={{ flexShrink: 0 }} />,
          border: '1px solid rgba(16, 185, 129, 0.35)',
          glow: '0 8px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(16, 185, 129, 0.15)',
          defaultTitle: 'Sucesso',
          barColor: '#10B981',
        };
      case 'error':
        return {
          icon: <XCircle size={20} color="#F43F5E" style={{ flexShrink: 0 }} />,
          border: '1px solid rgba(244, 63, 94, 0.4)',
          glow: '0 8px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(244, 63, 94, 0.18)',
          defaultTitle: 'Atenção / Erro',
          barColor: '#F43F5E',
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={20} color="#F59E0B" style={{ flexShrink: 0 }} />,
          border: '1px solid rgba(245, 158, 11, 0.4)',
          glow: '0 8px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(245, 158, 11, 0.18)',
          defaultTitle: 'Aviso',
          barColor: '#F59E0B',
        };
      case 'info':
      default:
        return {
          icon: <Info size={20} color="#E5B338" style={{ flexShrink: 0 }} />,
          border: '1px solid rgba(229, 179, 56, 0.35)',
          glow: '0 8px 30px rgba(0, 0, 0, 0.7), 0 0 15px rgba(229, 179, 56, 0.15)',
          defaultTitle: 'Informação',
          barColor: '#E5B338',
        };
    }
  };

  const config = getStyle();

  return (
    <div
      style={{
        pointerEvents: 'auto',
        position: 'relative',
        backgroundColor: '#0F1626',
        borderRadius: '12px',
        border: config.border,
        boxShadow: config.glow,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        color: '#F8FAFC',
        animation: 'bfToastIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        overflow: 'hidden',
      }}
    >
      <div style={{ marginTop: '2px' }}>{config.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '2px' }}>
          {item.title || config.defaultTitle}
        </h4>
        <p style={{ fontSize: '0.82rem', color: '#CBD5E1', lineHeight: '1.4', wordBreak: 'break-word' }}>
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          padding: '4px',
          color: '#94A3B8',
          cursor: 'pointer',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#FFFFFF')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
      >
        <X size={16} />
      </button>

      {/* Barra de progresso sutil */}
      {item.duration && item.duration > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '2px',
            backgroundColor: config.barColor,
            animation: `bfToastProgress ${item.duration}ms linear forwards`,
            opacity: 0.6,
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialogModal({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isDanger = options.danger ?? false;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onCancel}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#0F1626',
          border: isDanger ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid rgba(229, 179, 56, 0.35)',
          boxShadow: isDanger
            ? '0 25px 50px rgba(0, 0, 0, 0.75), 0 0 30px rgba(244, 63, 94, 0.2)'
            : '0 25px 50px rgba(0, 0, 0, 0.75), 0 0 30px rgba(229, 179, 56, 0.15)',
          borderRadius: '16px',
          padding: '24px',
          animation: 'bfToastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              backgroundColor: isDanger ? 'rgba(244, 63, 94, 0.12)' : 'rgba(229, 179, 56, 0.12)',
              border: isDanger ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(229, 179, 56, 0.3)',
            }}
          >
            {isDanger || options.icon === 'trash' ? (
              <Trash2 size={22} color="#F43F5E" />
            ) : options.icon === 'alert' ? (
              <AlertTriangle size={22} color="#F59E0B" />
            ) : (
              <HelpCircle size={22} color="#E5B338" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>
              {options.title || (isDanger ? 'Confirmar Exclusão' : 'Confirmação')}
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#94A3B8', lineHeight: '1.5' }}>{options.message}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: '#CBD5E1',
              fontWeight: 500,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)')}
          >
            {options.cancelText || 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={isDanger ? undefined : 'gold-gradient-primary gold-glow'}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: isDanger ? '1px solid rgba(244, 63, 94, 0.6)' : 'none',
              backgroundColor: isDanger ? '#E11D48' : undefined,
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
              boxShadow: isDanger ? '0 4px 14px rgba(225, 29, 72, 0.35)' : undefined,
              transition: 'all 0.15s ease',
            }}
          >
            {options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
