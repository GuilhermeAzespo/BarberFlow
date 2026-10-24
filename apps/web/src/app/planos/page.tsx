'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Crown,
  Sparkles,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Users,
  MessageSquare,
  ShieldCheck,
  Calendar,
  DollarSign,
  HelpCircle,
  Flame,
  Check,
  Scissors,
  Star,
  ExternalLink,
} from 'lucide-react';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../lib/auth-context';
import { api } from '../../lib/api';

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

const DEFAULT_PLANS: PublicPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    slug: 'starter',
    description: 'Ideal para barbeiros autônomos que desejam automatizar o WhatsApp e agendamentos.',
    priceCents: 4990,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    features: [
      '1 Barbeiro / Profissional',
      'Até 300 agendamentos por mês',
      'Bot de WhatsApp com lembretes automáticos',
      'Vitrine pública online 24h',
      'Promoções e cupons por dia da semana',
      'Fluxo de caixa básico',
    ],
    badge: null,
    isHighlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    slug: 'pro',
    description: 'Perfeito para barbearias em expansão com equipe de barbeiros e alta demanda.',
    priceCents: 9990,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Até 5 Barbeiros na equipe',
      'Agendamentos 100% Ilimitados',
      'Fotos personalizadas de cada barbeiro na vitrine',
      'Níveis de permissão (Recepção, Barbeiro, Admin)',
      'Divisão automática de comissões por barbeiro',
      'Bot de WhatsApp exclusivo com cancelamento fácil',
      'Relatórios financeiros avançados',
      'Suporte prioritário via WhatsApp',
    ],
    badge: 'MAIS POPULAR',
    isHighlighted: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    slug: 'premium',
    description: 'Para salões consolidados, franquias e redes que necessitam de escala máxima.',
    priceCents: 19990,
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    features: [
      'Barbeiros 100% Ilimitados',
      'Agendamentos Ilimitados sem teto',
      'Múltiplas cadeiras e pontos de atendimento',
      'Todas as funcionalidades liberadas',
      'Exportação de relatórios financeiros completos',
      'Consultoria de implantação VIP',
      'Suporte dedicado direto no WhatsApp',
    ],
    badge: 'ESCALA MÁXIMA',
    isHighlighted: false,
  },
];

interface ComparisonFeature {
  name: string;
  category: string;
  tooltip?: string;
  starter: string | boolean;
  pro: string | boolean;
  premium: string | boolean;
}

const COMPARISON_TABLE: ComparisonFeature[] = [
  // Categoria: Capacidade & Equipe
  {
    name: 'Número de Barbeiros / Profissionais',
    category: 'Capacidade & Equipe',
    tooltip: 'Total de profissionais que podem atender na agenda e receber comissões.',
    starter: '1 Barbeiro',
    pro: 'Até 5 Barbeiros',
    premium: 'Ilimitados',
  },
  {
    name: 'Volume de Agendamentos / Mês',
    category: 'Capacidade & Equipe',
    tooltip: 'Quantidade de agendamentos que podem ser realizados mensalmente.',
    starter: 'Até 300 / mês',
    pro: '100% Ilimitados',
    premium: '100% Ilimitados',
  },
  {
    name: 'Fotos dos Barbeiros na Vitrine',
    category: 'Capacidade & Equipe',
    tooltip: 'Exibição da foto de cada profissional na vitrine pública e agendamento.',
    starter: 'Básico (Inicial)',
    pro: 'Fotos em Alta Resolução',
    premium: 'Fotos em Alta Resolução',
  },
  {
    name: 'Perfis de Permissão (Recepção, Gerente, Caixa)',
    category: 'Capacidade & Equipe',
    tooltip: 'Crie logins com restrição de acesso a dados financeiros e configurações.',
    starter: false,
    pro: true,
    premium: true,
  },
  {
    name: 'Cálculo de Comissões por Barbeiro',
    category: 'Capacidade & Equipe',
    tooltip: 'Cálculo automático da comissão percentual por serviço e fechamento.',
    starter: 'Básico',
    pro: true,
    premium: true,
  },

  // Categoria: Vitrine & Agendamento Web
  {
    name: 'Vitrine Pública Online 24h (Link na Bio)',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Promoções por Tempo Limitado com Cronômetro',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Descontos Recorrentes por Dia da Semana',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Galeria de Fotos do Salão & Cortes',
    category: 'Vitrine & Agendamento',
    starter: true,
    pro: true,
    premium: true,
  },

  // Categoria: WhatsApp & Automação
  {
    name: 'Bot de WhatsApp Conectado ao seu Número',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Confirmação Automática de Agendamentos',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Lembretes Anti-Falta Pré-Horário',
    category: 'WhatsApp & Automação',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Disparo de Credenciais de Acesso via WhatsApp',
    category: 'WhatsApp & Automação',
    starter: false,
    pro: true,
    premium: true,
  },

  // Categoria: Gestão & Financeiro
  {
    name: 'Fluxo de Caixa Diário',
    category: 'Gestão Financeira',
    starter: true,
    pro: true,
    premium: true,
  },
  {
    name: 'Extrato Financeiro com Métricas de Lucro',
    category: 'Gestão Financeira',
    starter: 'Básico',
    pro: 'Avançado',
    premium: 'Avançado + Exportação',
  },
  {
    name: 'Suporte & Atendimento',
    category: 'Suporte',
    starter: 'Padrão (Email/Fila)',
    pro: 'Prioritário WhatsApp',
    premium: 'VIP Dedicado 24/7',
  },
];

export default function PlanosPage() {
  const { tenant, subscription } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>(DEFAULT_PLANS);
  const [activeProfsCount, setActiveProfsCount] = useState<number>(1);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<PublicPlan | null>(null);

  useEffect(() => {
    api
      .get<{ plans: PublicPlan[] }>('/api/public/plans')
      .then((res) => {
        if (res.plans && res.plans.length > 0) {
          setPlans(res.plans);
        }
      })
      .catch(() => {});

    api
      .get<{ professionals: any[] }>('/api/professionals?active=true')
      .then((res) => {
        if (res.professionals) {
          setActiveProfsCount(res.professionals.length);
        }
      })
      .catch(() => {});
  }, []);

  const currentPlanSlug = (subscription?.plan?.slug || 'starter').toLowerCase();
  const isTrial = subscription?.status === 'TRIALING';
  const isStarter = currentPlanSlug === 'starter';
  const isPro = currentPlanSlug === 'pro';
  const isPremium = currentPlanSlug === 'premium';

  const maxProfs = subscription?.limits?.maxProfessionals;
  const maxAppointments = subscription?.limits?.maxAppointmentsPerMonth;

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleOpenUpgrade = (plan: PublicPlan) => {
    setSelectedUpgradePlan(plan);
  };

  const handleConfirmUpgradeWhatsApp = (plan: PublicPlan) => {
    const salonName = tenant?.name || 'Minha Barbearia';
    const planName = plan.name;
    const msg = `🚀 *Solicitação de Upgrade - BarberFlow*\n\n` +
      `💈 *Barbearia:* ${salonName}\n` +
      `💎 *Plano Desejado:* ${planName} (${formatBRL(plan.priceCents)}/mês)\n` +
      `👤 *Plano Atual:* ${subscription?.plan.name || 'Starter / Testes'}\n\n` +
      `Olá! Gostaria de ativar o upgrade do meu salão para o *Plano ${planName}* agora mesmo. Como prosseguimos?`;

    const waUrl = `https://wa.me/5519982131483?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    setSelectedUpgradePlan(null);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1240px', width: '100%', margin: '0 auto' }}>
          {/* Header Superior */}
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                background: 'rgba(229, 179, 56, 0.15)',
                border: '1px solid rgba(229, 179, 56, 0.3)',
                color: 'var(--primary)',
                fontSize: '0.82rem',
                fontWeight: 700,
                marginBottom: '12px',
              }}
            >
              <Crown size={15} />
              <span>Gestão de Planos & Assinatura</span>
            </div>

            <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '10px' }}>
              Compare e Escolha o Plano Perfeito para o seu Crescimento
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '640px', margin: '0 auto' }}>
              Descubra todas as vantagens de cada plano e desbloqueie mais capacidade, automação e lucratividade para o seu salão.
            </p>
          </div>

          {/* Banner do Plano Atual & Limites em Uso */}
          <div
            className="glass-panel"
            style={{
              padding: '24px 28px',
              borderRadius: '16px',
              marginBottom: '32px',
              background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.08) 0%, rgba(18, 24, 38, 0.95) 100%)',
              border: '1px solid rgba(229, 179, 56, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '24px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  Sua Assinatura Atual
                </span>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: isTrial ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: isTrial ? '#FBBF24' : '#10B981',
                    border: `1px solid ${isTrial ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  }}
                >
                  {isTrial ? 'Período de Testes (Trial)' : 'Plano Ativo'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                  Plano {subscription?.plan?.name || 'Starter'}
                </h2>
                <span style={{ fontSize: '1rem', color: 'var(--primary)', fontWeight: 700 }}>
                  {formatBRL(subscription?.plan?.priceCents || 4990)} / mês
                </span>
              </div>
            </div>

            {/* Metrificadores de Capacidade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} color="var(--primary)" />
                  <span>Barbeiros na Equipe</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {activeProfsCount} / {maxProfs !== null ? maxProfs : '∞'}
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: maxProfs ? `${Math.min((activeProfsCount / maxProfs) * 100, 100)}%` : '30%',
                      height: '100%',
                      background: maxProfs && activeProfsCount >= maxProfs ? '#EF4444' : 'var(--primary)',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--primary)" />
                  <span>Agendamentos / Mês</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {maxAppointments !== null ? `${maxAppointments} máx` : 'Ilimitados ∞'}
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: maxAppointments ? '40%' : '100%',
                      height: '100%',
                      background: '#10B981',
                      borderRadius: '2px',
                    }}
                  />
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)', minWidth: '150px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={14} color="#10B981" />
                  <span>WhatsApp Bot</span>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={18} />
                  <span>Ativo</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Lembretes 100% integrados
                </div>
              </div>
            </div>
          </div>

          {/* ───────────────── ALERTA: O QUE VOCÊ ESTÁ PERDENDO ───────────────── */}
          {!isPremium && (
            <div
              className="glass-panel"
              style={{
                padding: '24px 28px',
                borderRadius: '16px',
                marginBottom: '36px',
                background: 'rgba(239, 68, 68, 0.04)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#F87171', margin: 0 }}>
                    O que o seu salão está perdendo no Plano {isStarter ? 'Starter' : 'Pro'}?
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Recursos bloqueados que você pode destravar hoje mesmo com o upgrade
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                {isStarter && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Limite de Apenas 1 Barbeiro
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Você não consegue cadastrar múltiplos profissionais nem dividir comissões automaticamente entre sua equipe.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Teto de 300 Agendamentos / Mês
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Em meses de grande movimento, novos clientes correm o risco de não conseguir agendar pela sua vitrine web.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Sem Perfis de Equipe (Recepção / Caixa)
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Não é possível conceder acessos restritos para sua recepcionista sem exibir dados confidenciais do salão.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Relatórios de Faturamento Restritos
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Falta de visão aprofundada de quais serviços são mais rentáveis e quais horários trazem mais lucro.
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {isPro && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Limite de 5 Barbeiros
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          Se seu salão tiver mais de 5 cadeiras ou novos barbeiros contratados, precisará de vagas adicionais.
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <XCircle size={18} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)', display: 'block' }}>
                          Exportação Contábil & Suporte VIP
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          No plano Premium você tem canal de atendimento direto 24/7 e exportação completa para contabilidade.
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Botão de Upgrade Rápido */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FBBF24', fontSize: '0.88rem', fontWeight: 600 }}>
                  <Sparkles size={16} />
                  <span>
                    O upgrade é liberado em instantes e mantém 100% de todo o seu histórico e clientes!
                  </span>
                </div>

                <button
                  onClick={() => handleOpenUpgrade(plans.find((p) => p.slug === (isStarter ? 'pro' : 'premium')) || plans[1])}
                  className="gold-gradient-primary gold-glow"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <span>Fazer Upgrade para {isStarter ? 'Plano Pro' : 'Plano Premium'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ───────────────── CARDS DOS PLANOS (PRICING) ───────────────── */}
          <div style={{ marginBottom: '48px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Tabela Comparativa de Planos</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                Planos flexíveis que acompanham o crescimento da sua barbearia. Sem contratos de fidelidade.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
                alignItems: 'stretch',
              }}
            >
              {plans.map((p) => {
                const isCurrent = currentPlanSlug === p.slug.toLowerCase();
                const isProCard = p.slug.toLowerCase() === 'pro';

                return (
                  <div
                    key={p.id}
                    className="glass-panel"
                    style={{
                      padding: '32px 26px',
                      borderRadius: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      background: isCurrent
                        ? 'linear-gradient(180deg, rgba(229, 179, 56, 0.12) 0%, rgba(18, 24, 38, 0.95) 100%)'
                        : isProCard
                        ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(18, 24, 38, 0.9) 100%)'
                        : 'rgba(18, 24, 38, 0.7)',
                      border: isCurrent
                        ? '2px solid var(--primary)'
                        : isProCard
                        ? '1.5px solid rgba(229, 179, 56, 0.4)'
                        : '1px solid var(--border-color)',
                      boxShadow: isCurrent || isProCard ? '0 0 25px rgba(229, 179, 56, 0.15)' : 'none',
                    }}
                  >
                    {/* Badge Superior */}
                    {isCurrent ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: 'linear-gradient(135deg, #E5B338, #966C0F)',
                          color: '#0B0F17',
                          padding: '3px 14px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          boxShadow: '0 2px 10px rgba(229, 179, 56, 0.4)',
                        }}
                      >
                        ✓ SEU PLANO ATUAL
                      </div>
                    ) : p.badge ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#10B981',
                          color: '#0B0F17',
                          padding: '3px 14px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {p.badge}
                      </div>
                    ) : null}

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                          {p.name}
                        </h3>
                        {isProCard && <Flame size={20} color="var(--primary)" />}
                      </div>

                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5, minHeight: '40px', marginBottom: '18px' }}>
                        {p.description}
                      </p>

                      <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ fontSize: '2.3rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
                            {formatBRL(p.priceCents)}
                          </span>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem' }}>/ mês</span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                          Sem fidelidade • Cancele quando quiser
                        </span>
                      </div>

                      {/* Lista de Recursos */}
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(p.features || []).map((feat, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.86rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                            <Check size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Botão de Ação */}
                    <div>
                      {isCurrent ? (
                        <div
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            background: 'rgba(229, 179, 56, 0.15)',
                            border: '1px solid rgba(229, 179, 56, 0.4)',
                            color: 'var(--primary)',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            textAlign: 'center',
                          }}
                        >
                          Plano Atual Ativo
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenUpgrade(p)}
                          className={isProCard ? 'gold-gradient-primary gold-glow' : 'glass-card'}
                          style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            color: isProCard ? '#0B0F17' : 'var(--text-main)',
                            border: !isProCard ? '1px solid var(--border-color)' : undefined,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <span>Fazer Upgrade para {p.name}</span>
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ───────────────── MATRIZ COMPARATIVA DETALHADA ───────────────── */}
          <div className="glass-panel" style={{ padding: '32px', borderRadius: '16px', marginBottom: '40px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px' }}>
                Matriz Comparativa de Recursos
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Veja em detalhes o que cada plano oferece lado a lado.
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '650px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: 'var(--text-dim)', fontWeight: 700, width: '40%' }}>
                      Recurso
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'starter' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Starter {currentPlanSlug === 'starter' && '(Atual)'}
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'pro' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Pro ⭐ {currentPlanSlug === 'pro' && '(Atual)'}
                    </th>
                    <th style={{ padding: '14px 16px', fontSize: '0.88rem', color: currentPlanSlug === 'premium' ? 'var(--primary)' : 'var(--text-main)', fontWeight: 700, textAlign: 'center', width: '20%' }}>
                      Premium {currentPlanSlug === 'premium' && '(Atual)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_TABLE.map((row, idx) => {
                    const renderCell = (val: string | boolean) => {
                      if (typeof val === 'boolean') {
                        return val ? (
                          <CheckCircle2 size={18} color="#10B981" style={{ margin: '0 auto' }} />
                        ) : (
                          <XCircle size={18} color="rgba(255,255,255,0.2)" style={{ margin: '0 auto' }} />
                        );
                      }
                      return <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{val}</span>;
                    };

                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', display: 'block' }}>
                            {row.name}
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                            {row.category}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          {renderCell(row.starter)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--primary)', background: 'rgba(229, 179, 56, 0.03)' }}>
                          {renderCell(row.pro)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--text-main)' }}>
                          {renderCell(row.premium)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ───────────────── FAQ DE DÚVIDAS SOBRE PLANOS ───────────────── */}
          <div style={{ maxWidth: '820px', margin: '0 auto 40px auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <HelpCircle size={24} color="var(--primary)" style={{ marginBottom: '6px' }} />
              <h3 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Dúvidas Frequentes sobre Assinaturas</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                {
                  q: 'O que acontece com os meus dados e clientes ao fazer o upgrade?',
                  a: 'Absolutamente tudo é mantido! Seu histórico financeiro, cadastros de clientes, serviços e conexões do WhatsApp permanecem intactos. O upgrade apenas libera novos recursos e capacidades na hora.',
                },
                {
                  q: 'Quanto tempo leva para o novo plano ser ativado?',
                  a: 'A ativação é imediata. Assim que o upgrade é confirmado, os limites de barbeiros e agendamentos são atualizados automaticamente na sua conta.',
                },
                {
                  q: 'Posso cancelar ou trocar de plano a qualquer momento?',
                  a: 'Sim! Não temos contrato de fidelidade nem multas rescisórias. Você tem total liberdade para mudar de plano de acordo com o tamanho e a demanda da sua barbearia.',
                },
                {
                  q: 'Quais as formas de pagamento disponíveis?',
                  a: 'Aceitamos Pix (com liberação instantânea), Cartão de Crédito com renovação mensal automática e Boleto Bancário.',
                },
              ].map((faq, i) => (
                <div
                  key={i}
                  className="glass-card"
                  style={{
                    padding: '18px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                    {faq.q}
                  </h4>
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Modal de Confirmação de Upgrade */}
      {selectedUpgradePlan && (
        <Modal
          isOpen={Boolean(selectedUpgradePlan)}
          onClose={() => setSelectedUpgradePlan(null)}
          title={`Upgrade para o Plano ${selectedUpgradePlan.name}`}
          maxWidth="520px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(229, 179, 56, 0.08)',
                border: '1px solid rgba(229, 179, 56, 0.25)',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Resumo do Upgrade
              </span>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '4px 0 2px 0' }}>
                {selectedUpgradePlan.name}
              </h4>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary)' }}>
                {formatBRL(selectedUpgradePlan.priceCents)} / mês
              </span>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.4, margin: '8px 0 0 0' }}>
                {selectedUpgradePlan.description}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                O que você desbloqueia imediatamente:
              </span>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(selectedUpgradePlan.features || []).map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-main)' }}>
                    <CheckCircle2 size={15} color="#10B981" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.82rem', color: '#10B981' }}>
              ⚡ <strong>Ativação Imediata:</strong> Enviaremos a confirmação para a equipe de atendimento via WhatsApp e seu acesso será liberado instantaneamente.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedUpgradePlan(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                }}
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={() => handleConfirmUpgradeWhatsApp(selectedUpgradePlan)}
                className="gold-gradient-primary gold-glow"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                }}
              >
                <Crown size={16} />
                <span>Confirmar Upgrade via WhatsApp</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
