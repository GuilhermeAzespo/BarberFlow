'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight, ArrowLeft, Lock, Mail, AlertCircle, Key, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forced initial password reset state
  const [step, setStep] = useState<'login' | 'force_new_password'>('login');
  const [loggedUser, setLoggedUser] = useState<{ id: string; name: string; email: string; role: string; permissions?: any } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const router = useRouter();
  const { refresh } = useAuth();

  const redirectAfterLogin = async (user: any) => {
    await refresh();
    if (user.role === 'SUPER_ADMIN') {
      router.push('/admin');
    } else {
      const allowed = user.permissions?.allowedMenus;
      if (allowed && Array.isArray(allowed)) {
        if (allowed.includes('dashboard')) {
          router.push('/dashboard');
        } else if (allowed.includes('calendar')) {
          router.push('/calendar');
        } else if (allowed.length > 0) {
          router.push(`/${allowed[0]}`);
        } else {
          router.push('/calendar');
        }
      } else {
        router.push('/dashboard');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{
        token: string;
        user: {
          id: string;
          name: string;
          email: string;
          role: string;
          permissions?: { allowedMenus?: string[]; mustChangePassword?: boolean } | null;
        };
        mustChangePassword?: boolean;
      }>('/api/auth/login', { email, password });

      const needsNewPassword = Boolean(
        res.mustChangePassword || res.user.permissions?.mustChangePassword
      );

      if (needsNewPassword) {
        setLoggedUser(res.user);
        setStep('force_new_password');
        setLoading(false);
        return;
      }

      await redirectAfterLogin(res.user);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Falha ao autenticar. Verifique sua conexão.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetInitialPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas digitadas não coincidem. Verifique e tente novamente.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/reset-initial-password', { newPassword });
      setPasswordSuccess(true);
      setTimeout(async () => {
        await redirectAfterLogin(loggedUser);
      }, 1000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Falha ao cadastrar nova senha. Tente novamente.');
      }
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at top center, rgba(229, 179, 56, 0.08) 0%, transparent 60%)',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '40px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Brand or First-Access Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <Link href="/" style={{ display: 'inline-block', marginBottom: '16px' }}>
            <img
              src="/logo.png"
              alt="BarberFlow"
              style={{
                height: '76px',
                width: 'auto',
                maxWidth: '220px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.4))',
              }}
            />
          </Link>
          {step === 'force_new_password' ? (
            <>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(229, 179, 56, 0.15)',
                  border: '1px solid rgba(229, 179, 56, 0.3)',
                  color: 'var(--primary)',
                  marginBottom: '12px',
                }}
              >
                <Key size={24} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>Definir Senha Definitiva</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>
                Olá, <strong style={{ color: 'var(--text-main)' }}>{loggedUser?.name || 'Profissional'}</strong>! Este é seu primeiro acesso. Por segurança, crie sua senha pessoal definitiva para continuar.
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '1.65rem', fontWeight: 700, marginBottom: '6px' }}>Acessar Plataforma</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Entre com suas credenciais para gerenciar seu salão
              </p>
            </>
          )}
        </div>

        {passwordSuccess && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              color: '#34D399',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <CheckCircle size={18} />
            <span>Senha cadastrada com sucesso! Redirecionando...</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#FB7185',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {step === 'force_new_password' ? (
          <form onSubmit={handleResetInitialPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
                Nova Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Mínimo de 6 dígitos"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ paddingLeft: '40px', paddingRight: '40px' }}
                />
                <Lock
                  size={18}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                  title={showNewPassword ? 'Ocultar senha' : 'Exibir senha'}
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
                Confirmar Nova Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Repita sua nova senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
                <Lock
                  size={18}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '10px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                lineHeight: 1.4,
              }}
            >
              🔒 Esta será sua senha permanente de acesso. Guarde-a com segurança.
            </div>

            <button
              type="submit"
              disabled={loading || passwordSuccess}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '14px',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '6px',
                opacity: loading || passwordSuccess ? 0.7 : 1,
              }}
            >
              <span>{loading ? 'Salvando...' : 'Salvar Senha & Acessar'}</span>
              {!loading && <ArrowRight size={18} />}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('login');
                setPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setError(null);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'center',
                marginTop: '4px',
                padding: '6px',
              }}
            >
              Cancelar e voltar ao login
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
                E-mail
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
                <Mail
                  size={18}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500 }}>
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
                <Lock
                  size={18}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '14px',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '10px',
                opacity: loading ? 0.7 : 1,
              }}
            >
              <span>{loading ? 'Entrando...' : 'Entrar no BarberFlow'}</span>
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
        )}

        {step === 'login' && (
          <div style={{ textAlign: 'center', marginTop: '28px', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Não tem uma conta?{' '}
            <Link href="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              Cadastre seu salão grátis
            </Link>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '18px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '0.84rem',
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-main)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <ArrowLeft size={14} />
            <span>Voltar para o site principal</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
