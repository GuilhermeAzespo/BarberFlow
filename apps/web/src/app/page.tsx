'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  MessageSquare,
  Calendar,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <nav
        className="glass-panel"
        style={{
          borderRadius: 0,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          padding: '18px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #E5B338, #966C0F)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px var(--primary-glow)',
            }}
          >
            <Sparkles size={20} color="#0B0F17" />
          </div>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Barber<span style={{ color: 'var(--primary)' }}>Flow</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Link
            href="/login"
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              padding: '8px 16px',
              borderRadius: '8px',
              transition: 'color 0.2s',
            }}
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="gold-gradient-primary"
            style={{
              padding: '10px 22px',
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Experimente Grátis</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main style={{ flex: 1 }}>
        <section
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '80px 24px 60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              borderRadius: '30px',
              background: 'rgba(229, 179, 56, 0.12)',
              border: '1px solid rgba(229, 179, 56, 0.25)',
              color: '#FBBF24',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '24px',
            }}
          >
            <Zap size={15} />
            <span>Plataforma SaaS 100% Automatizada com WhatsApp</span>
          </div>

          <h1
            style={{
              fontSize: '3.6rem',
              fontWeight: 800,
              lineHeight: 1.15,
              maxWidth: '900px',
              marginBottom: '24px',
            }}
          >
            A gestão da sua barbearia no{' '}
            <span className="gold-gradient-text">piloto automático</span>.
          </h1>

          <p
            style={{
              fontSize: '1.2rem',
              color: 'var(--text-muted)',
              maxWidth: '680px',
              lineHeight: 1.6,
              marginBottom: '40px',
            }}
          >
            Conecte seu WhatsApp com um simples QR Code e deixe o bot agendar horários,
            enviar lembretes e registrar seu faturamento sem nenhuma intervenção manual.
          </p>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/register"
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '16px 36px',
                fontSize: '1.1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span>Cadastrar Meu Salão</span>
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/login"
              className="glass-card"
              style={{
                padding: '16px 32px',
                fontSize: '1.1rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Já tenho conta
            </Link>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '32px',
              marginTop: '48px',
              color: 'var(--text-dim)',
              fontSize: '0.9rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10B981" /> 14 dias de teste grátis
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10B981" /> Sem cartão de crédito
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10B981" /> Ativação instantânea
            </span>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section style={{ maxWidth: '1200px', margin: '40px auto 80px auto', padding: '0 24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#34D399',
                }}
              >
                <MessageSquare size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                Bot de WhatsApp Inteligente
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                Conecte seu WhatsApp com QR Code em segundos. O bot apresenta os serviços, verifica
                profissionais disponíveis e confirma horários em tempo real.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(229, 179, 56, 0.15)',
                  border: '1px solid rgba(229, 179, 56, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#FBBF24',
                }}
              >
                <Calendar size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                Calendário & Agenda Visual
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                Visão completa dos agendamentos de cada profissional, intervalos de almoço,
                status em tempo real e prevenção contra conflitos de horário.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#22D3EE',
                }}
              >
                <DollarSign size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                Fluxo de Caixa Automático
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.95rem' }}>
                Ao concluir um agendamento, o valor é automaticamente computado como receita.
                Monitore despesas, métodos de pagamento (Pix, Cartão) e margem de lucro.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Plans */}
        <section style={{ maxWidth: '1100px', margin: '40px auto 100px auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 700, marginBottom: '14px' }}>
            Planos sob medida para o seu crescimento
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '50px' }}>
            Comece no teste grátis de 14 dias e evolua conforme a sua barbearia cresce.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '24px',
              textAlign: 'left',
            }}
          >
            {/* Starter */}
            <div className="glass-panel" style={{ padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>Starter</h4>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Ideal para barbeiros autônomos que desejam automatizar o WhatsApp.
                </p>
                <div style={{ marginBottom: '28px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>R$ 49,90</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/mês</span>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> 1 Profissional
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Até 300 agendamentos/mês
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Bot de WhatsApp integrado
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Fluxo de caixa básico
                  </li>
                </ul>
              </div>
              <Link
                href="/register"
                className="glass-card"
                style={{
                  marginTop: '32px',
                  padding: '12px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                Começar no Starter
              </Link>
            </div>

            {/* Pro (Highlighted) */}
            <div
              className="glass-panel gold-glow"
              style={{
                padding: '36px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderColor: 'var(--primary)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-12px',
                  right: '24px',
                  background: 'linear-gradient(135deg, #E5B338, #C99520)',
                  color: '#0B0F17',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                MAIS POPULAR
              </div>
              <div>
                <h4 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '8px' }}>Pro</h4>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Perfeito para equipes com múltiplos barbeiros e alta demanda.
                </p>
                <div style={{ marginBottom: '28px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>R$ 99,90</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/mês</span>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Até 5 Profissionais
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Agendamentos ilimitados
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Bot de WhatsApp personalizado
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Lembretes automáticos
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Relatórios financeiros completos
                  </li>
                </ul>
              </div>
              <Link
                href="/register"
                className="gold-gradient-primary"
                style={{
                  marginTop: '32px',
                  padding: '12px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                Testar Pro Grátis
              </Link>
            </div>

            {/* Premium */}
            <div className="glass-panel" style={{ padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>Premium</h4>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                  Para salões de grande porte e redes que necessitam de capacidade total.
                </p>
                <div style={{ marginBottom: '28px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 800 }}>R$ 199,90</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/mês</span>
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Profissionais ilimitados
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Agendamentos ilimitados
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Suporte prioritário
                  </li>
                  <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <CheckCircle2 size={16} color="#E5B338" /> Todas as funcionalidades inclusas
                  </li>
                </ul>
              </div>
              <Link
                href="/register"
                className="glass-card"
                style={{
                  marginTop: '32px',
                  padding: '12px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                }}
              >
                Começar no Premium
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '32px 48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--text-dim)',
          fontSize: '0.88rem',
        }}
      >
        <span>© {new Date().getFullYear()} BarberFlow SaaS. Todos os direitos reservados.</span>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Link href="/login">Área do Cliente</Link>
          <Link href="/register">Cadastrar Salão</Link>
        </div>
      </footer>
    </div>
  );
}
