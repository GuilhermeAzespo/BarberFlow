'use client';

import React from 'react';
import Link from 'next/link';
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Lock,
  Scale,
  Calendar,
  CreditCard,
  MessageSquare,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

export default function TermosPage() {
  const lastUpdated = '29 de Outubro de 2026';

  const sections = [
    {
      id: 'aceitacao',
      title: '1. Aceitação e Vigência dos Termos',
      content: (
        <>
          <p>
            Bem-vindo ao <strong>BarberFlow</strong> (&quot;Plataforma&quot;, &quot;nós&quot;, &quot;nosso&quot; ou &quot;SaaS&quot;). Ao criar uma conta, iniciar o período de teste gratuito de 14 dias ou utilizar qualquer um de nossos serviços, você (&quot;Cliente&quot;, &quot;Barbearia&quot;, &quot;Contratante&quot; ou &quot;Usuário&quot;) declara ter lido, compreendido e concordado integralmente com estes Termos de Serviço e com a nossa{' '}
            <Link href="/privacidade" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
              Política de Privacidade & Segurança (LGPD)
            </Link>.
          </p>
          <p style={{ marginTop: '12px' }}>
            Caso você não concorde com qualquer disposição aqui estabelecida, solicitamos que não prossiga com o cadastro e encerre o uso de nossos sistemas.
          </p>
        </>
      ),
    },
    {
      id: 'servicos',
      title: '2. Descrição e Escopo dos Serviços',
      content: (
        <>
          <p>
            O BarberFlow é um software como serviço (SaaS B2B multi-tenant) projetado para a modernização e automação operacional de barbearias, salões de beleza e estéticas masculinas, compreendendo:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Agendamento Automatizado via WhatsApp:</strong> Bot inteligente que conecta diretamente com a instância do cliente para apresentar serviços, barbeiros e confirmar horários 24 horas por dia.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Vitrine Pública Online:</strong> Endereço exclusivo (<code>/[slug]</code>) ou domínio próprio personalizado para agendamento web responsivo com link na bio do Instagram.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Controle Multi-Profissional & Comissões:</strong> Gestão de agendas individuais, bloqueios de horário, intervalos de almoço e apuração automatizada de comissões por barbeiro.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Fluxo de Caixa & Métricas:</strong> Registro automático de receitas ao finalizar agendamentos, controle de despesas e exportação de relatórios.</span>
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'cadastro',
      title: '3. Cadastro, Contas e Segurança das Credenciais',
      content: (
        <>
          <p>
            Para usufruir da plataforma, o Contratante deve ser pessoa física plenamente capaz (maior de 18 anos) ou pessoa jurídica legalmente constituída no Brasil, devendo fornecer informações exatas, atuais e completas no ato da inscrição.
          </p>
          <p style={{ marginTop: '12px' }}>
            O acesso é protegido por senha criptografada. O Usuário é inteiramente responsável pela confidencialidade de suas credenciais de login e por todas as operações executadas em sua conta. Notifique imediatamente o suporte do BarberFlow caso identifique qualquer indício de acesso não autorizado.
          </p>
        </>
      ),
    },
    {
      id: 'trial-assinaturas',
      title: '4. Período de Teste Gratuito (Trial) e Assinaturas',
      content: (
        <>
          <p>
            Oferecemos aos novos clientes um <strong>período de teste gratuito de 14 (quatorze) dias</strong> com acesso às funcionalidades operacionais, sem a necessidade de cadastrar dados de cartão de crédito no momento da abertura da conta.
          </p>
          <p style={{ marginTop: '12px' }}>
            Ao término dos 14 dias de teste, caso o Cliente deseje continuar utilizando o sistema, deverá escolher um dos planos mensais disponibilizados na plataforma (Starter, Pro ou Premium) e realizar o pagamento através dos meios autorizados (PIX ou Cartão de Crédito).
          </p>
          <p style={{ marginTop: '12px' }}>
            Caso o pagamento não seja identificado após o término do período de teste ou de vencimento da fatura, o acesso ao painel e a operação do bot de WhatsApp poderão ser suspensos até a devida regularização.
          </p>
        </>
      ),
    },
    {
      id: 'pagamentos',
      title: '5. Preços, Faturamento e Reajustes',
      content: (
        <>
          <p>
            Os valores vigentes dos planos são expressos em Reais (BRL) e podem ser visualizados na página principal e no painel de faturamento. Os pagamentos são processados por instituições e intermediadores financeiros homologados (incluindo Mercado Pago), garantindo total conformidade com os padrões de segurança PCI-DSS.
          </p>
          <p style={{ marginTop: '12px' }}>
            Reservamo-nos o direito de reajustar os preços dos planos mediante aviso prévio de, no mínimo, 30 (trinta) dias encaminhado ao e-mail cadastrado ou exibido no painel de administração.
          </p>
        </>
      ),
    },
    {
      id: 'cancelamento',
      title: '6. Cancelamento e Direito de Arrependimento',
      content: (
        <>
          <p>
            <strong>Cancelamento sem burocracia:</strong> Você pode cancelar sua assinatura a qualquer momento diretamente pelo painel administrativo na aba de Planos & Assinatura. Ao cancelar, o acesso continuará ativo até o encerramento do ciclo mensal já quitado, não havendo novas cobranças posteriores.
          </p>
          <p style={{ marginTop: '12px' }}>
            Em observância ao Artigo 49 do Código de Defesa do Consumidor (CDC), o cliente tem o direito de solicitar o reembolso integral da primeira contratação paga em até 7 (sete) dias corridos após a transação inicial, através de nosso canal de suporte oficial.
          </p>
        </>
      ),
    },
    {
      id: 'whatsapp-meta',
      title: '7. Integração com WhatsApp & Políticas da Meta',
      content: (
        <>
          <p>
            O BarberFlow disponibiliza tecnologia para sincronização com o WhatsApp por meio de leitura de QR Code. O Cliente reconhece e concorda que:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span>O WhatsApp é um serviço de titularidade de terceiros (Meta Platforms Inc.), sujeito a termos, regras e atualizações próprias independentes do BarberFlow.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span>É estritamente proibido o uso da plataforma para envio de SPAM, mensagens em massa abusivas não solicitadas ou qualquer prática contrária às Políticas de Mensagens e Comércio da Meta.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span>O BarberFlow não se responsabiliza por bloqueios, desconexões ou sanções aplicadas pela Meta decorrentes de conduta indevida praticada pelo número do usuário.</span>
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'propriedade',
      title: '8. Propriedade Intelectual',
      content: (
        <>
          <p>
            Todos os direitos relativos ao software BarberFlow, interfaces gráficas, código-fonte, marcas, logotipos, banco de dados e arquitetura técnica são de propriedade exclusiva do BarberFlow. O uso do serviço concede ao Contratante apenas uma licença de uso limitada, não exclusiva, intransferível e revogável durante a vigência do contrato.
          </p>
          <p style={{ marginTop: '12px' }}>
            Todos os dados, fotos, marcas e conteúdos inseridos pela barbearia (fotos do salão, tabela de serviços, cadastro de clientes) permanecem sob titularidade exclusiva da barbearia.
          </p>
        </>
      ),
    },
    {
      id: 'disponibilidade',
      title: '9. Disponibilidade do Sistema (SLA) & Suporte',
      content: (
        <>
          <p>
            Empregamos esforços comercialmente razoáveis para manter a plataforma disponível 24 horas por dia, 7 dias por semana, buscando índice de disponibilidade (uptime) superior a 99,5%.
          </p>
          <p style={{ marginTop: '12px' }}>
            Interrupções eventuais para manutenção programada, melhorias de segurança ou oscilações provocadas por falhas na infraestrutura de telecomunicações de terceiros serão informadas com antecedência e não ensejam direito a indenização.
          </p>
        </>
      ),
    },
    {
      id: 'foro',
      title: '10. Legislação Aplicável e Foro de Eleição',
      content: (
        <>
          <p>
            Estes Termos são regidos e interpretados em conformidade com as leis da República Federativa do Brasil, em especial o Código Civil, o Marco Civil da Internet (Lei nº 12.965/2014) e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>
          <p style={{ marginTop: '12px' }}>
            Fica eleito o Foro da Comarca de São Paulo/SP, com expressa renúncia a qualquer outro, por mais privilegiado que seja, para dirimir eventuais litígios oriundos do presente instrumento.
          </p>
        </>
      ),
    },
  ];

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
            <img
              src="/logo.png"
              alt="BarberFlow"
              style={{ height: '46px', width: 'auto', objectFit: 'contain' }}
            />
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <Link href="/" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={14} /> Voltar ao Início
            </Link>
            <Link href="/privacidade" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Privacidade & LGPD
            </Link>
            <Link href="/contato" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Contato
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

      {/* Conteúdo Principal */}
      <main style={{ flex: 1, maxWidth: '1100px', margin: '0 auto', width: '100%', padding: '50px 24px 80px 24px' }}>
        {/* Banner do Topo */}
        <div
          className="glass-panel"
          style={{
            padding: '40px 36px',
            marginBottom: '40px',
            background: 'linear-gradient(135deg, rgba(229, 179, 56, 0.1) 0%, rgba(18, 24, 38, 0.8) 100%)',
            borderColor: 'rgba(229, 179, 56, 0.25)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(229, 179, 56, 0.15)',
              color: 'var(--primary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '16px',
            }}
          >
            <Scale size={14} />
            <span>Documento Jurídico Oficial</span>
          </div>

          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, marginBottom: '14px', lineHeight: 1.2 }}>
            Termos de Serviço do BarberFlow
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '850px' }}>
            Regulamento oficial de contratação, direitos e responsabilidades para o uso do software como serviço (SaaS) BarberFlow, bot de WhatsApp automatizado e vitrine digital.
          </p>

          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.86rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            <span><strong>Última atualização:</strong> {lastUpdated}</span>
            <span>•</span>
            <span>Versão dos Termos: 2.5 (Vigente em todo o território nacional)</span>
          </div>
        </div>

        {/* Grade com Índice Rápido e Seções */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '32px' }}>
          {sections.map((sec) => (
            <article
              key={sec.id}
              id={sec.id}
              className="glass-panel"
              style={{ padding: '32px 36px', scrollMarginTop: '100px' }}
            >
              <h2
                style={{
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                {sec.title}
              </h2>
              <div
                style={{
                  color: 'var(--text-main)',
                  lineHeight: 1.75,
                  fontSize: '0.96rem',
                }}
              >
                {sec.content}
              </div>
            </article>
          ))}
        </div>

        {/* Card de Dúvidas / Contato Jurídico */}
        <div
          className="glass-card"
          style={{
            marginTop: '48px',
            padding: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
            borderColor: 'rgba(229, 179, 56, 0.3)',
            background: 'rgba(229, 179, 56, 0.05)',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
              Ficou com alguma dúvida jurídica sobre estes Termos?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Nossa equipe de suporte e compliance está à disposição para esclarecer qualquer cláusula.
            </p>
          </div>
          <Link
            href="/contato"
            className="gold-gradient-primary gold-glow"
            style={{
              padding: '12px 24px',
              fontSize: '0.9rem',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>Falar com o Suporte</span>
            <ArrowRight size={15} />
          </Link>
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
          <Link href="/termos" style={{ color: 'var(--primary)', fontWeight: 600 }}>Termos de Serviço</Link>
          <Link href="/privacidade">Privacidade & LGPD</Link>
          <Link href="/contato">Contato</Link>
          <Link href="/login">Área do Cliente</Link>
        </div>
      </footer>
    </div>
  );
}
