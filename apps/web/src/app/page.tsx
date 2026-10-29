'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import {
  Sparkles,
  MessageSquare,
  Calendar,
  DollarSign,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Clock,
  Scissors,
  Star,
  ChevronDown,
  HelpCircle,
  TrendingUp,
  Globe,
  Lock,
  ExternalLink,
  Check,
  X,
  PhoneCall,
  Flame,
  Award,
} from 'lucide-react';

interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  priceCents: number;
  maxProfessionals?: number | null;
  maxAppointmentsPerMonth?: number | null;
  whatsappEnabled: boolean;
  features?: string[] | null;
  badge?: string | null;
  isHighlighted?: boolean;
}

const DEFAULT_HOME_PLANS: PublicPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    description: 'Para quem está começando: 1 profissional e bot de WhatsApp integrado.',
    priceCents: 1999,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    features: [
      '1 Barbeiro / Profissional',
      'Até 300 agendamentos por mês',
      'Bot de WhatsApp com lembretes automáticos',
      'Vitrine pública online 24h (Link na Bio)',
      'Fluxo de caixa e controle financeiro básico',
    ],
    badge: null,
    isHighlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    description: 'Equipes de até 5 profissionais com agendamentos e lembretes ilimitados.',
    priceCents: 3999,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Até 5 Barbeiros na equipe',
      'Agendamentos 100% Ilimitados',
      'Bot de WhatsApp exclusivo com cancelamento fácil',
      'Divisão automática de comissões por barbeiro',
      'Pesquisas de satisfação automáticas (CSAT/NPS)',
      'Relatórios financeiros completos com exportação',
      'Suporte prioritário via WhatsApp',
    ],
    badge: 'MAIS POPULAR',
    isHighlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    slug: 'premium',
    description: 'Sem limites para redes, franquias e salões consolidados com domínio próprio.',
    priceCents: 6999,
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Barbeiros 100% Ilimitados',
      'Agendamentos Ilimitados sem teto',
      'Domínio próprio e DNS personalizado (agendar.seusite.com.br)',
      'Todas as funcionalidades e módulos liberados',
      'Gestão multi-cadeiras e pontos de atendimento',
      'Consultoria de implantação VIP',
      'Suporte dedicado direto no WhatsApp',
    ],
    badge: 'ESCALA MÁXIMA',
    isHighlighted: false,
  },
];

const sortPlansFixed = <T extends { slug?: string; sortOrder?: number; priceCents?: number }>(list: T[]): T[] => {
  const ORDER: Record<string, number> = { starter: 1, pro: 2, premium: 3 };
  return [...list].sort((a, b) => {
    const orderA = ORDER[(a.slug || '').toLowerCase()] ?? a.sortOrder ?? 99;
    const orderB = ORDER[(b.slug || '').toLowerCase()] ?? b.sortOrder ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.priceCents || 0) - (b.priceCents || 0);
  });
};

export default function LandingPage() {
  const [plans, setPlans] = useState<PublicPlan[]>(() => sortPlansFixed(DEFAULT_HOME_PLANS));
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    api
      .get<{ plans: PublicPlan[] }>('/api/public/plans')
      .then((res) => {
        if (res.plans && res.plans.length > 0) {
          setPlans(sortPlansFixed(res.plans));
        }
      })
      .catch(() => {
        // Mantém fallback caso a API demore a responder
      });
  }, []);

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const faqs = [
    {
      q: 'Preciso deixar o computador ou o celular ligado para o WhatsApp funcionar?',
      a: 'Não! O bot do BarberFlow roda 100% em nossos servidores em nuvem de alta disponibilidade. Uma vez conectado via QR Code, o sistema responde clientes, envia confirmações e lembretes 24 horas por dia, 7 dias por semana, mesmo que seu celular esteja desligado ou sem bateria.',
    },
    {
      q: 'Como o bot sabe quais horários e barbeiros estão livres?',
      a: 'O bot é diretamente integrado ao calendário do BarberFlow em tempo real. Ele consulta automaticamente a duração de cada serviço, a escala do profissional, intervalos de almoço e bloqueios manuais, garantindo que nenhum cliente agende em horário conflitante.',
    },
    {
      q: 'O que acontece se o cliente quiser cancelar ou reagendar pelo WhatsApp?',
      a: 'O cliente pode enviar "cancelar" ou "reagendar" direto no WhatsApp. O bot identifica o agendamento em aberto, libera a vaga na agenda para outro cliente e atualiza seu painel instantaneamente, sem que você precise parar o atendimento.',
    },
    {
      q: 'Meus barbeiros podem ter acesso ao sistema sem ver os dados financeiros?',
      a: 'Sim! Você cria perfis de acesso individualizados. O barbeiro tem login próprio para visualizar exclusivamente sua agenda diária e suas comissões acumuladas, sem visualizar o fluxo de caixa geral ou configurações da barbearia.',
    },
    {
      q: 'Como funciona o teste grátis de 14 dias? Preciso colocar cartão de crédito?',
      a: 'Você não precisa de cartão de crédito para iniciar o teste! Basta criar sua conta em menos de 1 minuto, cadastrar seus serviços e barbeiros, ler o QR Code do WhatsApp e usar a plataforma gratuitamente por 14 dias completos. Se gostar, escolhe o plano que melhor se adapta à sua barbearia.',
    },
    {
      q: 'O BarberFlow está em conformidade com a LGPD?',
      a: 'Sim, 100%! Seguimos rigorosamente a Lei Geral de Proteção de Dados (Lei 13.709/2018). As informações dos seus clientes são criptografadas, protegidas por isolamento lógico multi-tenant e nunca compartilhadas com terceiros.',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', color: 'var(--text-main)' }}>
      {/* ───────────────── Top Navbar ───────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '36px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/logo.png"
              alt="BarberFlow"
              style={{
                height: '50px',
                width: 'auto',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 14px rgba(0, 0, 0, 0.4))',
              }}
            />
          </Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <a href="#recursos" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              Recursos
            </a>
            <a href="#como-funciona" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              Como Funciona
            </a>
            <a href="#demonstracao" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              Demonstração
            </a>
            <a href="#planos" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              Planos & Preços
            </a>
            <a href="#faq" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              FAQ
            </a>
            <Link href="/contato" style={{ fontSize: '0.92rem', color: 'var(--text-muted)', transition: 'color 0.2s' }}>
              Contato
            </Link>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            href="/login"
            style={{
              fontSize: '0.92rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              padding: '8px 18px',
              borderRadius: '8px',
              transition: 'all 0.2s',
            }}
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="gold-gradient-primary gold-glow"
            style={{
              padding: '10px 22px',
              fontSize: '0.92rem',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Experimente Grátis</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {/* ───────────────── Hero Section ───────────────── */}
      <main style={{ flex: 1 }}>
        <section
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            padding: '70px 24px 60px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/* Badge Interativa */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 18px',
              borderRadius: '30px',
              background: 'rgba(229, 179, 56, 0.12)',
              border: '1px solid rgba(229, 179, 56, 0.3)',
              color: '#FBBF24',
              fontSize: '0.86rem',
              fontWeight: 700,
              marginBottom: '28px',
              boxShadow: '0 0 20px rgba(229, 179, 56, 0.15)',
            }}
          >
            <Flame size={16} color="#F59E0B" />
            <span>Automação Inteligente via WhatsApp com IA • Teste 14 Dias Grátis</span>
          </div>

          {/* Título Principal */}
          <h1
            style={{
              fontSize: '3.8rem',
              fontWeight: 800,
              lineHeight: 1.15,
              maxWidth: '960px',
              marginBottom: '26px',
              letterSpacing: '-0.03em',
            }}
          >
            A gestão da sua barbearia no{' '}
            <span className="gold-gradient-text">piloto automático</span> com WhatsApp.
          </h1>

          {/* Subtítulo */}
          <p
            style={{
              fontSize: '1.22rem',
              color: 'var(--text-muted)',
              maxWidth: '740px',
              lineHeight: 1.65,
              marginBottom: '42px',
            }}
          >
            Conecte seu WhatsApp com um simples QR Code e deixe o bot agendar horários,
            enviar lembretes para zerar faltas, calcular comissões e registrar o faturamento
            sem você precisar parar o corte para responder mensagens.
          </p>

          {/* Ações Hero */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link
              href="/register"
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '16px 36px',
                fontSize: '1.1rem',
                fontWeight: 700,
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s',
              }}
            >
              <span>Cadastrar Minha Barbearia Grátis</span>
              <ArrowRight size={18} />
            </Link>
            <a
              href="#demonstracao"
              className="glass-card"
              style={{
                padding: '16px 32px',
                fontSize: '1.1rem',
                fontWeight: 600,
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Ver Demonstração ao Vivo</span>
              <ChevronDown size={18} />
            </a>
          </div>

          {/* Benefícios Rápidos */}
          <div
            style={{
              display: 'flex',
              gap: '28px',
              marginTop: '44px',
              color: 'var(--text-dim)',
              fontSize: '0.92rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={17} color="#10B981" /> 14 dias grátis sem compromisso
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={17} color="#10B981" /> Sem cartão de crédito
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={17} color="#10B981" /> Conexão do WhatsApp em 10 segundos
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={17} color="#10B981" /> Cancelamento com 1 clique
            </span>
          </div>

          {/* ───────────────── Showcase Interativo Hero (WhatsApp Simulator + Dashboard) ───────────────── */}
          <div
            id="demonstracao"
            style={{
              width: '100%',
              marginTop: '60px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '28px',
              textAlign: 'left',
            }}
          >
            {/* Lado Esquerdo: Simulador de WhatsApp do Cliente */}
            <div
              className="glass-panel"
              style={{
                padding: '28px',
                borderRadius: '20px',
                borderColor: 'rgba(37, 211, 102, 0.35)',
                background: 'linear-gradient(180deg, rgba(37, 211, 102, 0.08) 0%, rgba(18, 24, 38, 0.95) 100%)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              }}
            >
              {/* Header do WhatsApp */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: '#128C7E',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      color: '#FFF',
                    }}
                  >
                    💈
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <strong style={{ fontSize: '0.98rem' }}>Barbearia BarberFlow</strong>
                      <CheckCircle2 size={15} color="#25D366" />
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#25D366', fontWeight: 600 }}>
                      ● Bot Ativo 24h (IA Online)
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Hoje</span>
              </div>

              {/* Balões de Conversa Realistas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
                {/* Mensagem do Cliente */}
                <div
                  style={{
                    alignSelf: 'flex-end',
                    background: '#005C4B',
                    color: '#E9EDEF',
                    padding: '12px 16px',
                    borderRadius: '14px 14px 2px 14px',
                    maxWidth: '85%',
                    lineHeight: 1.5,
                  }}
                >
                  <p>Boa tarde! Gostaria de agendar um <strong>Corte Degradê</strong> com o barbeiro <strong>Lucas</strong> para hoje por volta das 16h30.</p>
                  <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.6)', float: 'right', marginTop: '4px' }}>
                    14:10 ✓✓
                  </span>
                </div>

                {/* Resposta do Bot Instantânea */}
                <div
                  style={{
                    alignSelf: 'flex-start',
                    background: '#202C33',
                    color: '#E9EDEF',
                    padding: '14px 18px',
                    borderRadius: '14px 14px 14px 2px',
                    maxWidth: '90%',
                    lineHeight: 1.5,
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <p style={{ marginBottom: '8px' }}>
                    Fala, Bruno! 💈 Verifiquei a agenda do <strong>Lucas</strong> em tempo real:
                  </p>
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      marginBottom: '10px',
                      fontSize: '0.84rem',
                    }}
                  >
                    <div>✂️ <strong>Serviço:</strong> Corte Degradê Masculino</div>
                    <div>👤 <strong>Profissional:</strong> Lucas (Barbeiro Master)</div>
                    <div>🕒 <strong>Horário:</strong> Hoje às 16:30</div>
                    <div>💵 <strong>Valor:</strong> R$ 45,00 (45 min)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span
                      style={{
                        background: '#00A884',
                        color: '#0B0F17',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                    >
                      ✓ Agendamento Confirmado!
                    </span>
                    <span
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                      }}
                    >
                      🔔 Lembrete programado (14:30)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Lado Direito: Preview ao vivo do Dashboard do Dono */}
            <div
              className="glass-panel"
              style={{
                padding: '28px',
                borderRadius: '20px',
                borderColor: 'rgba(229, 179, 56, 0.35)',
                background: 'linear-gradient(180deg, rgba(229, 179, 56, 0.08) 0%, rgba(18, 24, 38, 0.95) 100%)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: 'rgba(229, 179, 56, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                      }}
                    >
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.98rem', display: 'block' }}>Painel Gerencial em Tempo Real</strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Visão de Hoje • BarberFlow</span>
                    </div>
                  </div>
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#34D399',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                    }}
                  >
                    ● 100% Sincronizado
                  </span>
                </div>

                {/* Métricas Rápidas */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  <div className="glass-card" style={{ padding: '16px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                      Faturamento Hoje
                    </span>
                    <strong style={{ fontSize: '1.45rem', color: 'var(--primary)', display: 'block' }}>
                      R$ 1.840,00
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: '#34D399', fontWeight: 600 }}>
                      +28% que semana passada
                    </span>
                  </div>

                  <div className="glass-card" style={{ padding: '16px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                      Agendamentos Concluídos
                    </span>
                    <strong style={{ fontSize: '1.45rem', color: 'var(--text-main)', display: 'block' }}>
                      24 cortes
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                      0 faltas (No-show: 0%)
                    </span>
                  </div>
                </div>

                {/* Barra de Status das Comissões */}
                <div className="glass-card" style={{ padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: '8px' }}>
                    <span>Comissões Calculadas Automaticamente</span>
                    <strong style={{ color: 'var(--primary)' }}>R$ 736,00 (40%)</strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: '65%', height: '100%', background: 'linear-gradient(90deg, #E5B338, #F59E0B)' }} />
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.85rem',
                  color: 'var(--text-dim)',
                }}
              >
                <span>Tudo sem instalar app nos celulares da sua equipe.</span>
                <Link href="/register" style={{ color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Testar Grátis <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────── Barra de Números de Impacto ───────────────── */}
        <section
          style={{
            borderTop: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(18, 24, 38, 0.5)',
            padding: '40px 24px',
          }}
        >
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '32px',
              textAlign: 'center',
            }}
          >
            <div>
              <strong style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', display: 'block', marginBottom: '4px' }}>
                +150.000
              </strong>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>Agendamentos processados via WhatsApp</span>
            </div>

            <div>
              <strong style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10B981', display: 'block', marginBottom: '4px' }}>
                -85%
              </strong>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>Faltas de clientes com lembretes automáticos</span>
            </div>

            <div>
              <strong style={{ fontSize: '2.5rem', fontWeight: 800, color: '#38BDF8', display: 'block', marginBottom: '4px' }}>
                15h
              </strong>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>Economizadas por semana sem responder mensagens</span>
            </div>

            <div>
              <strong style={{ fontSize: '2.5rem', fontWeight: 800, color: '#F43F5E', display: 'block', marginBottom: '4px' }}>
                4.9 / 5.0
              </strong>
              <span style={{ fontSize: '0.92rem', color: 'var(--text-muted)' }}>Nota média de satisfação das barbearias</span>
            </div>
          </div>
        </section>

        {/* ───────────────── Seção Antes vs Depois do BarberFlow ───────────────── */}
        <section style={{ maxWidth: '1200px', margin: '80px auto', padding: '0 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '14px' }}>
              Por que barbearias perdem dinheiro todos os dias?
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
              Veja como o BarberFlow elimina os maiores gargalos que travam o faturamento do seu salão.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '28px',
            }}
          >
            {/* O Caos Antes */}
            <div
              className="glass-panel"
              style={{
                padding: '36px',
                borderColor: 'rgba(239, 68, 68, 0.3)',
                background: 'rgba(239, 68, 68, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#EF4444', marginBottom: '20px' }}>
                <X size={24} />
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Sem o BarberFlow (Modo Antigo)</h3>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.94rem' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span>
                  <span>WhatsApp tocando enquanto você corta cabelo e clientes esperando horas por resposta.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span>
                  <span>Clientes esquecem do horário, não avisam e deixam sua cadeira vazia no horário nobre.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span>
                  <span>Anotações no caderninho ou planilhas confusas com erros no cálculo de comissões dos barbeiros.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <span style={{ color: '#EF4444', fontWeight: 700 }}>✕</span>
                  <span>Falta de controle de entradas de Pix e Cartão, sem saber o lucro real no fim do mês.</span>
                </li>
              </ul>
            </div>

            {/* A Paz com BarberFlow */}
            <div
              className="glass-panel"
              style={{
                padding: '36px',
                borderColor: 'rgba(16, 185, 129, 0.4)',
                background: 'rgba(16, 185, 129, 0.05)',
                boxShadow: '0 0 25px rgba(16, 185, 129, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10B981', marginBottom: '20px' }}>
                <Check size={24} />
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Com o BarberFlow (Piloto Automático)</h3>
              </div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.94rem' }}>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Bot de WhatsApp 24h:</strong> responde em 3 segundos, agenda o horário e confirma no sistema.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Lembretes Automáticos:</strong> mensagem no WhatsApp 2h antes reduz faltas em até 85%.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Comissões no Centavo:</strong> divisão automática por profissional e relatório fechado em 1 clique.</span>
                </li>
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <CheckCircle2 size={18} color="#10B981" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span><strong>Vitrine Online com Link na Bio:</strong> endereço exclusivo para os clientes agendarem direto pelo Instagram.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ───────────────── Seção de Recursos Completos ───────────────── */}
        <section id="recursos" style={{ maxWidth: '1200px', margin: '80px auto', padding: '0 24px', scrollMarginTop: '100px' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.12)',
                color: 'var(--primary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '12px',
              }}
            >
              <Zap size={14} />
              <span>Funcionalidades de Elite</span>
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '14px' }}>
              Tudo o que seu salão precisa em um único lugar
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto' }}>
              Desenvolvido exclusivamente para o fluxo e a rotina real de barbearias brasileiras.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
            }}
          >
            {/* Card 1: Bot WhatsApp */}
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
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Bot de WhatsApp Inteligente (IA)
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Conecte seu próprio número em 10 segundos com QR Code. O bot apresenta a lista de serviços,
                fotos e disponibilidade dos barbeiros e confirma horários em tempo real.
              </p>
            </div>

            {/* Card 2: Vitrine Pública */}
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
                <Globe size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Vitrine Pública & Link na Bio
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Um endereço web lindo (<code>/[slug]</code>) ou com seu domínio próprio. Seus clientes
                agendam em segundos pelo celular sem precisar baixar nenhum aplicativo da loja.
              </p>
            </div>

            {/* Card 3: Calendário Multi-Profissional */}
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
                <Calendar size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Agenda Visual Multi-Profissional
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Controle horários de almoço, folgas, atrasos e bloqueios manuais. Cada barbeiro tem sua
                própria cor e visualização personalizada para total organização.
              </p>
            </div>

            {/* Card 4: Gestão de Comissões */}
            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#C084FC',
                }}
              >
                <Users size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Divisão Automática de Comissões
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Defina comissões personalizadas por profissional ou serviço. O sistema calcula
                automaticamente o rateio diário ou semanal sem nenhuma planilha manual.
              </p>
            </div>

            {/* Card 5: Fluxo de Caixa */}
            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#FACC15',
                }}
              >
                <DollarSign size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Fluxo de Caixa & Métricas Reais
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Monitore entradas por método de pagamento (Pix, Dinheiro, Cartão), controle despesas operacionais
                e saiba exatamente quanto sobrou de lucro líquido no fechamento do caixa.
              </p>
            </div>

            {/* Card 6: Pesquisas CSAT/NPS */}
            <div className="glass-panel" style={{ padding: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                  color: '#FB7185',
                }}
              >
                <Star size={24} />
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px', color: 'var(--text-main)', fontWeight: 700 }}>
                Pesquisa de Satisfação Pós-Corte
              </h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '0.94rem' }}>
                Assim que o cliente sai da cadeira, o bot do WhatsApp envia uma pergunta de nota de 1 a 5.
                Acompanhe quais barbeiros recebem mais elogios e fidelizam clientes.
              </p>
            </div>
          </div>
        </section>

        {/* ───────────────── Seção Como Funciona em 3 Passos ───────────────── */}
        <section id="como-funciona" style={{ maxWidth: '1200px', margin: '80px auto', padding: '0 24px', scrollMarginTop: '100px' }}>
          <div style={{ textAlign: 'center', marginBottom: '50px' }}>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '14px' }}>
              Como começar em 3 passos simples
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto' }}>
              Você não precisa ser técnico. Em menos de 2 minutos sua barbearia já estará rodando no piloto automático.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '28px',
            }}
          >
            <div className="glass-panel" style={{ padding: '36px', position: 'relative' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#0B0F17',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                }}
              >
                1
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px' }}>
                Cadastre sua Barbearia
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', lineHeight: 1.6 }}>
                Crie sua conta em 1 minuto, adicione seus serviços (preços e tempos) e cadastre os barbeiros da sua equipe.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '36px', position: 'relative' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#0B0F17',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                }}
              >
                2
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px' }}>
                Conecte seu WhatsApp
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', lineHeight: 1.6 }}>
                Abra a aba WhatsApp no painel e aponte a câmera do seu celular para ler o QR Code, exatamente como no WhatsApp Web.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '36px', position: 'relative' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: '#0B0F17',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '20px',
                }}
              >
                3
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px' }}>
                Coloque o Link na Bio
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', lineHeight: 1.6 }}>
                Divulgue seu link no Instagram e deixe o bot do WhatsApp responder seus clientes e encher sua agenda no piloto automático.
              </p>
            </div>
          </div>
        </section>

        {/* ───────────────── Seção de Planos e Preços (Sequência Fixa) ───────────────── */}
        <section id="planos" style={{ maxWidth: '1180px', margin: '80px auto 100px auto', padding: '0 24px', scrollMarginTop: '100px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 14px',
              borderRadius: '20px',
              background: 'rgba(229, 179, 56, 0.12)',
              color: 'var(--primary)',
              fontSize: '0.82rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '12px',
            }}
          >
            <DollarSign size={14} />
            <span>Preço Justo & Sem Letras Miúdas</span>
          </div>

          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '14px' }}>
            Planos sob medida para o tamanho da sua barbearia
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto 48px auto' }}>
            Comece no teste grátis de 14 dias sem cartão de crédito e evolua conforme sua barbearia cresce.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
              gap: '26px',
              textAlign: 'left',
              alignItems: 'stretch',
            }}
          >
            {plans.map((p) => {
              const isHighlight = p.slug.toLowerCase() === 'pro' || p.isHighlighted;
              const features =
                Array.isArray(p.features) && p.features.length > 0
                  ? p.features
                  : [
                      p.maxProfessionals ? `Até ${p.maxProfessionals} Profissionais` : 'Profissionais ilimitados',
                      p.maxAppointmentsPerMonth ? `Até ${p.maxAppointmentsPerMonth} agendamentos/mês` : 'Agendamentos ilimitados',
                      p.whatsappEnabled ? 'Bot de WhatsApp integrado' : 'WhatsApp não incluso',
                      'Painel de Gestão e Caixa',
                    ];

              return (
                <div
                  key={p.id || p.slug}
                  className={`glass-panel ${isHighlight ? 'gold-glow' : ''}`}
                  style={{
                    padding: '38px 30px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderColor: isHighlight ? 'var(--primary)' : 'var(--border-color)',
                    borderWidth: isHighlight ? '2px' : '1px',
                    position: 'relative',
                    background: isHighlight
                      ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.1) 0%, rgba(18, 24, 38, 0.95) 100%)'
                      : 'rgba(18, 24, 38, 0.7)',
                  }}
                >
                  {p.badge && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-13px',
                        right: '24px',
                        background: 'linear-gradient(135deg, #E5B338, #C99520)',
                        color: '#0B0F17',
                        padding: '5px 14px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        boxShadow: '0 4px 12px rgba(229, 179, 56, 0.4)',
                      }}
                    >
                      {p.badge}
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h3
                        style={{
                          fontSize: '1.45rem',
                          fontWeight: 700,
                          color: isHighlight ? 'var(--primary)' : 'var(--text-main)',
                        }}
                      >
                        {p.name}
                      </h3>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                        /{p.slug.toUpperCase()}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '24px', minHeight: '44px', lineHeight: 1.5 }}>
                      {p.description || 'Plano sob medida para o crescimento do seu salão.'}
                    </p>

                    <div style={{ marginBottom: '28px' }}>
                      <span style={{ fontSize: '2.6rem', fontWeight: 800 }}>{formatBRL(p.priceCents)}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>/mês</span>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '20px', marginBottom: '24px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em', display: 'block', marginBottom: '14px' }}>
                        Benefícios Inclusos:
                      </span>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                        {features.map((feat, idx) => (
                          <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Link
                    href={`/register?plan=${p.slug}`}
                    className={isHighlight ? 'gold-gradient-primary gold-glow' : 'glass-card'}
                    style={{
                      padding: '14px',
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      marginTop: '12px',
                    }}
                  >
                    <span>Começar no {p.name}</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Garantia do Teste */}
          <div
            className="glass-card"
            style={{
              marginTop: '40px',
              padding: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '14px',
              borderColor: 'rgba(229, 179, 56, 0.3)',
            }}
          >
            <ShieldCheck size={28} color="var(--primary)" />
            <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>
              <strong>Garantia Total de 14 Dias Sem Compromisso:</strong> Use todas as ferramentas livremente. Não pedimos cartão de crédito na inscrição.
            </div>
          </div>
        </section>

        {/* ───────────────── Seção FAQ (Perguntas Frequentes) ───────────────── */}
        <section id="faq" style={{ maxWidth: '900px', margin: '80px auto', padding: '0 24px', scrollMarginTop: '100px' }}>
          <div style={{ textAlign: 'center', marginBottom: '44px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.12)',
                color: 'var(--primary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '12px',
              }}
            >
              <HelpCircle size={14} />
              <span>Tire Suas Dúvidas</span>
            </div>
            <h2 style={{ fontSize: '2.4rem', fontWeight: 800, marginBottom: '14px' }}>
              Perguntas Frequentes
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.02rem' }}>
              Respondemos as principais dúvidas dos donos de barbearia antes de começar.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="glass-panel"
                  style={{
                    overflow: 'hidden',
                    borderColor: isOpen ? 'rgba(229, 179, 56, 0.4)' : 'var(--border-color)',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    style={{
                      width: '100%',
                      padding: '22px 26px',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                      fontSize: '1.02rem',
                      fontWeight: 600,
                      color: isOpen ? 'var(--primary)' : 'var(--text-main)',
                      gap: '16px',
                    }}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      size={18}
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        color: isOpen ? 'var(--primary)' : 'var(--text-dim)',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div
                      style={{
                        padding: '0 26px 22px 26px',
                        color: 'var(--text-muted)',
                        fontSize: '0.94rem',
                        lineHeight: 1.7,
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        paddingTop: '16px',
                      }}
                    >
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ───────────────── CTA Final Grandioso ───────────────── */}
        <section style={{ maxWidth: '1100px', margin: '80px auto 100px auto', padding: '0 24px' }}>
          <div
            className="glass-panel"
            style={{
              padding: '60px 40px',
              borderRadius: '24px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.15) 0%, rgba(18, 24, 38, 0.95) 100%)',
              borderColor: 'rgba(229, 179, 56, 0.4)',
              boxShadow: '0 0 40px rgba(229, 179, 56, 0.12)',
            }}
          >
            <h2 style={{ fontSize: '2.8rem', fontWeight: 800, marginBottom: '18px', lineHeight: 1.2 }}>
              Pronto para colocar sua barbearia no piloto automático?
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.15rem', maxWidth: '680px', margin: '0 auto 36px auto', lineHeight: 1.6 }}>
              Junte-se a centenas de barbeiros em todo o Brasil que economizam horas todos os dias e faturam mais com o BarberFlow.
            </p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                href="/register"
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '16px 38px',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span>Começar Teste Grátis de 14 Dias</span>
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/contato"
                className="glass-card"
                style={{
                  padding: '16px 32px',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderRadius: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>Falar com Consultor</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────────── Footer Institucional Completo ───────────────── */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(11, 15, 23, 0.95)',
          padding: '60px 48px 32px 48px',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '40px',
            marginBottom: '48px',
          }}
        >
          {/* Coluna 1: Marca & Descrição */}
          <div>
            <Link href="/" style={{ display: 'inline-block', marginBottom: '16px' }}>
              <img
                src="/logo.png"
                alt="BarberFlow"
                style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
              />
            </Link>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
              A plataforma SaaS definitiva para gestão e automação inteligente de barbearias e salões via WhatsApp.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#10B981' }}>
              <ShieldCheck size={16} />
              <span>Conforme com a LGPD (Lei 13.709/18)</span>
            </div>
          </div>

          {/* Coluna 2: Produto & Navegação */}
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)', marginBottom: '18px' }}>
              Produto
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <li><a href="#recursos" style={{ color: 'inherit' }}>Recursos Completos</a></li>
              <li><a href="#demonstracao" style={{ color: 'inherit' }}>Demonstração do Bot</a></li>
              <li><a href="#como-funciona" style={{ color: 'inherit' }}>Como Funciona</a></li>
              <li><a href="#planos" style={{ color: 'inherit' }}>Planos & Preços</a></li>
              <li><Link href="/novidades" style={{ color: 'inherit' }}>Novidades & Atualizações</Link></li>
            </ul>
          </div>

          {/* Coluna 3: Institucional & Jurídico */}
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)', marginBottom: '18px' }}>
              Segurança & Jurídico
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <li>
                <Link href="/termos" style={{ color: 'inherit' }}>
                  Termos de Serviço
                </Link>
              </li>
              <li>
                <Link href="/privacidade" style={{ color: 'inherit' }}>
                  Privacidade & Segurança (LGPD)
                </Link>
              </li>
              <li>
                <Link href="/contato" style={{ color: 'inherit' }}>
                  Fale Conosco / Contato
                </Link>
              </li>
              <li>
                <Link href="/login" style={{ color: 'inherit' }}>
                  Acesso de Clientes
                </Link>
              </li>
            </ul>
          </div>

          {/* Coluna 4: Suporte Oficial */}
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)', marginBottom: '18px' }}>
              Atendimento Oficial
            </h4>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              <li>
                <span style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.8rem' }}>E-mail:</span>
                <a href="mailto:contato@barberflow.com.br" style={{ color: 'var(--primary)' }}>contato@barberflow.com.br</a>
              </li>
              <li>
                <span style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.8rem' }}>WhatsApp Suporte:</span>
                <Link href="/contato" style={{ color: '#25D366' }}>Suporte Especializado 24h</Link>
              </li>
              <li>
                <span style={{ display: 'block', color: 'var(--text-dim)', fontSize: '0.8rem' }}>Horário:</span>
                <span>Seg a Sex: 08h às 20h • Sáb: 09h às 16h</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Linha Final de Copyright */}
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            paddingTop: '28px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            fontSize: '0.85rem',
            color: 'var(--text-dim)',
          }}
        >
          <span>© {new Date().getFullYear()} BarberFlow SaaS. Todos os direitos reservados. CNPJ sob regime brasileiro.</span>
          <div style={{ display: 'flex', gap: '20px' }}>
            <Link href="/termos">Termos</Link>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/contato">Contato</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
