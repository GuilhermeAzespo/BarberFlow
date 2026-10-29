'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Mail,
  Phone,
  Clock,
  Send,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Building,
  User,
  HelpCircle,
  ShieldCheck,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/Toast';

export default function ContatoPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [successSent, setSuccessSent] = useState(false);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    barbershopName: '',
    subject: 'Contratação / Dúvida Comercial',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Preencha os campos obrigatórios (Nome, E-mail e Mensagem).');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>('/api/public/contact', form);
      toast.success(res.message || 'Mensagem enviada com sucesso!');
      setSuccessSent(true);
      setForm({
        name: '',
        email: '',
        phone: '',
        barbershopName: '',
        subject: 'Contratação / Dúvida Comercial',
        message: '',
      });
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem. Tente novamente ou use o WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      {/* Navbar Superior */}
      <header
        className="glass-panel"
        style={{
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          padding: '16px 40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(11, 15, 23, 0.85)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="BarberFlow" style={{ height: '46px', width: 'auto', objectFit: 'contain' }} />
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <Link href="/" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={14} /> Voltar ao Início
            </Link>
            <Link href="/termos" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Termos de Serviço
            </Link>
            <Link href="/privacidade" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Privacidade & LGPD
            </Link>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link
            href="/login"
            style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', padding: '8px 16px' }}
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="gold-gradient-primary gold-glow"
            style={{ padding: '8px 18px', fontSize: '0.88rem', fontWeight: 700, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>Experimente Grátis</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      {/* Hero Header */}
      <main style={{ flex: 1, maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '50px 24px 80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              borderRadius: '30px',
              background: 'rgba(229, 179, 56, 0.12)',
              border: '1px solid rgba(229, 179, 56, 0.25)',
              color: 'var(--primary)',
              fontSize: '0.84rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '16px',
            }}
          >
            <MessageSquare size={14} />
            <span>Canais Oficiais de Atendimento</span>
          </div>
          <h1 style={{ fontSize: '2.8rem', fontWeight: 800, marginBottom: '14px', lineHeight: 1.2 }}>
            Estamos prontos para atender você
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>
            Fale diretamente com nossa equipe especializada para tirar dúvidas comerciais, solicitar suporte técnico ou entender como o BarberFlow automatiza sua barbearia.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '32px', alignItems: 'start' }}>
          {/* Formulário de Contato */}
          <div className="glass-panel" style={{ padding: '36px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
              Envie uma mensagem
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '28px' }}>
              Preencha os campos abaixo e responderemos no seu WhatsApp ou e-mail com agilidade.
            </p>

            {successSent ? (
              <div
                style={{
                  padding: '28px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                    color: '#34D399',
                  }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#34D399', marginBottom: '8px' }}>
                  Mensagem Recebida com Sucesso!
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '24px' }}>
                  Nossa equipe de especialistas já foi notificada. Em breve entraremos em contato com você.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSuccessSent(false)}
                    className="glass-card"
                    style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: 600 }}
                  >
                    Enviar outra mensagem
                  </button>
                  <a
                    href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Acabei%20de%20enviar%20uma%20mensagem%20no%20site%20e%20gostaria%20de%20atendimento%20r%C3%A1pido."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gold-gradient-primary gold-glow"
                    style={{ padding: '10px 20px', fontSize: '0.88rem', fontWeight: 700, borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <span>Falar no WhatsApp Agora</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Seu Nome *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: João da Silva"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                      Nome da Barbearia / Salão
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Barbearia Vip Cortes"
                      value={form.barbershopName}
                      onChange={(e) => setForm({ ...form, barbershopName: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                      E-mail de Contato *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="seuemail@exemplo.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                      WhatsApp com DDD
                    </label>
                    <input
                      type="tel"
                      placeholder="(11) 98765-4321"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.9rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Assunto do Contato
                  </label>
                  <select
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    <option value="Contratação / Dúvida Comercial">Quero Contratar / Dúvida Comercial</option>
                    <option value="Dúvidas sobre o Bot de WhatsApp">Dúvidas sobre o Bot de WhatsApp</option>
                    <option value="Suporte Técnico">Suporte Técnico da Plataforma</option>
                    <option value="Privacidade & LGPD">Privacidade, Dados & LGPD</option>
                    <option value="Parcerias e Integrações">Parcerias e Integrações</option>
                    <option value="Outro assunto">Outro Assunto</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                    Sua Mensagem *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Conte como podemos te ajudar..."
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '0.9rem',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '14px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginTop: '8px',
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Enviando Mensagem...</span>
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      <span>Enviar Mensagem</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Coluna Lateral: Informações e WhatsApp Direto */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Card WhatsApp Oficial */}
            <div
              className="glass-panel"
              style={{
                padding: '32px',
                borderColor: 'rgba(37, 211, 102, 0.35)',
                background: 'linear-gradient(135deg, rgba(37, 211, 102, 0.1) 0%, rgba(18, 24, 38, 0.85) 100%)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(37, 211, 102, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: '#25D366',
                }}
              >
                <MessageSquare size={26} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
                Atendimento Imediato no WhatsApp
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '22px' }}>
                Prefere conversar em tempo real? Fale diretamente com nossos consultores para demonstração guiada e suporte rápido.
              </p>
              <a
                href="https://wa.me/5511999999999?text=Ol%C3%A1!%20Gostaria%20de%20conhecer%20mais%20sobre%20o%20BarberFlow."
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#25D366',
                  color: '#0B0F17',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  boxShadow: '0 4px 16px rgba(37, 211, 102, 0.3)',
                  transition: 'opacity 0.2s',
                }}
              >
                <span>Chamar no WhatsApp</span>
                <ExternalLink size={16} />
              </a>
            </div>

            {/* Informações de Canais e Horários */}
            <div className="glass-panel" style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '20px' }}>
                Canais & Horários
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Mail size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-main)', display: 'block' }}>E-mail de Suporte</strong>
                    <span style={{ color: 'var(--text-muted)' }}>contato@barberflow.com.br</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Clock size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-main)', display: 'block' }}>Horário de Atendimento</strong>
                    <span style={{ color: 'var(--text-muted)' }}>Segunda a Sexta: 08:00 às 20:00</span>
                    <span style={{ color: 'var(--text-dim)', display: 'block', fontSize: '0.82rem' }}>
                      Sábado: 09:00 às 16:00
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <ShieldCheck size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ color: 'var(--text-main)', display: 'block' }}>Status da Plataforma</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
                      <span style={{ color: '#34D399', fontSize: '0.84rem', fontWeight: 600 }}>
                        99.9% Operacional (Sistemas Online)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Selo LGPD e Segurança */}
            <div className="glass-card" style={{ padding: '20px', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                🔒 <strong>Segurança e Privacidade:</strong> Suas informações enviadas através deste formulário são tratadas com estrita confidencialidade nos termos da LGPD e nunca serão repassadas a terceiros.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '32px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          color: 'var(--text-dim)',
          fontSize: '0.88rem',
          background: 'rgba(11, 15, 23, 0.95)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="BarberFlow" style={{ height: '30px', width: 'auto', objectFit: 'contain' }} />
          <span>© {new Date().getFullYear()} BarberFlow SaaS. Todos os direitos reservados.</span>
        </div>
        <div style={{ display: 'flex', gap: '22px' }}>
          <Link href="/termos">Termos de Serviço</Link>
          <Link href="/privacidade">Privacidade & LGPD</Link>
          <Link href="/contato" style={{ color: 'var(--primary)', fontWeight: 600 }}>Contato</Link>
          <Link href="/login">Área do Cliente</Link>
        </div>
      </footer>
    </div>
  );
}
