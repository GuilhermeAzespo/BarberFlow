'use client';

import React from 'react';
import Link from 'next/link';
import {
  Shield,
  ShieldCheck,
  Lock,
  Database,
  UserCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Mail,
  FileText,
  Key,
  Server,
  AlertCircle,
  Eye,
} from 'lucide-react';

export default function PrivacidadePage() {
  const lastUpdated = '29 de Outubro de 2026';

  const sections = [
    {
      id: 'compromisso',
      title: '1. Compromisso Institucional & Conformidade com a LGPD',
      content: (
        <>
          <p>
            O <strong>BarberFlow</strong> tem como premissa inegociável a proteção da privacidade, da intimidade, da honra e dos dados pessoais de todos os usuários de seus sistemas, incluindo os gestores das barbearias contratantes e os clientes finais que realizam agendamentos.
          </p>
          <p style={{ marginTop: '12px' }}>
            Nossas políticas, arquitetura de software e rotinas operacionais foram integralmente estruturadas em estrita observância à <strong>Lei Geral de Proteção de Dados Pessoais (Lei Federal nº 13.709/2018 - LGPD)</strong>, ao Marco Civil da Internet (Lei nº 12.965/2014) e às melhores práticas internacionais de segurança da informação (ISO/IEC 27001 e OWASP).
          </p>
        </>
      ),
    },
    {
      id: 'papeis-lgpd',
      title: '2. Agentes de Tratamento: Papéis Definidos pela LGPD',
      content: (
        <>
          <p>
            Para assegurar clareza e transparência no tratamento dos dados, esclarecemos as figuras jurídicas estabelecidas pela LGPD:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div className="glass-card" style={{ padding: '20px', borderColor: 'rgba(229, 179, 56, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--primary)', fontWeight: 700 }}>
                <BuildingIcon />
                <span>A Barbearia Contratante (Controlador)</span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                A barbearia decide quais dados de seus clientes finais (nome, telefone, preferências de corte) são coletados para a prestação do serviço estético, atuando como a <strong>Controladora</strong> nos termos do Art. 5º, VI da LGPD.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '20px', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: '#10B981', fontWeight: 700 }}>
                <Server size={18} />
                <span>O BarberFlow (Operador)</span>
              </div>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                O BarberFlow atua como <strong>Operador</strong> (Art. 5º, VII da LGPD), fornecendo a infraestrutura tecnológica segura, o bot de WhatsApp e a agenda digital para processar os agendamentos estritamente segundo as instruções do Controlador.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'dados-coletados',
      title: '3. Dados Pessoais Tratados e Forma de Coleta',
      content: (
        <>
          <p>Tratamos apenas os dados estritamente necessários para a execução dos serviços de agendamento e gestão:</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Dados dos Gestores e Barbeiros:</strong> Nome completo, e-mail corporativo, número de telefone celular, credenciais criptografadas de acesso e porcentagens contratuais de comissão.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Dados dos Clientes Finais (Consumidores):</strong> Nome, número de WhatsApp/telefone para envio de confirmações e lembretes, histórico de serviços agendados, profissional de preferência e notas de avaliação CSAT/NPS.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <CheckCircle2 size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '3px' }} />
              <span><strong>Logs de Auditoria e Segurança:</strong> Endereço IP de acesso, data/hora da requisição, tipo de navegador e eventos de autenticação, armazenados em conformidade com o Art. 15 do Marco Civil da Internet.</span>
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'bases-legais',
      title: '4. Finalidades e Bases Legais (Art. 7º da LGPD)',
      content: (
        <>
          <p>
            O tratamento de dados no BarberFlow é fundamentado em bases legais expressas e legítimas:
          </p>
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '12px 18px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
              <strong>Execução de Contrato (Art. 7º, V):</strong> Viabilizar o agendamento de horários, emissão de tickets, confirmação pelo WhatsApp e apuração de pagamentos.
            </div>
            <div style={{ padding: '12px 18px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', borderLeft: '3px solid #10B981' }}>
              <strong>Cumprimento de Obrigação Legal (Art. 7º, II):</strong> Guarda de registros de acesso a aplicações de internet e guarda de registros contábeis/fiscais.
            </div>
            <div style={{ padding: '12px 18px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', borderLeft: '3px solid #06B6D4' }}>
              <strong>Legítimo Interesse do Controlador (Art. 7º, IX):</strong> Envio de lembretes pontuais para evitar o esquecimento de compromissos agendados e pesquisas de satisfação do atendimento prestado.
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'seguranca-tecnica',
      title: '5. Práticas Avançadas de Segurança & Isolamento Multi-Tenant',
      content: (
        <>
          <p>
            Empregamos medidas técnicas e organizacionais de padrão bancário para blindar a infraestrutura contra acessos não autorizados, destruição ou vazamento:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <ShieldCheck size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span><strong>Isolamento Lógico Estrito (Multi-Tenant):</strong> Cada barbearia possui uma partição de dados protegida por chave estrangeira <code>tenantId</code> obrigatória e políticas estritas de autorização. Nenhuma barbearia tem visibilidade sobre informações de outra.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Lock size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span><strong>Criptografia em Trânsito e em Repouso:</strong> Todo o tráfego é transmitido sob HTTPS com TLS 1.3 e certificados criptográficos de 256 bits. Senhas de acesso são processadas com algoritmo criptográfico irreversível <code>bcrypt</code>.</span>
            </li>
            <li style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Database size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <span><strong>Backups Automatizados & Redundância:</strong> Cópias de segurança diárias com tolerância a falhas e trilha de auditoria completa em caso de incidentes.</span>
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'whatsapp-seguranca',
      title: '6. Segurança das Sessões e Mensagens do WhatsApp',
      content: (
        <>
          <p>
            A sincronização do bot é estabelecida diretamente entre a instância do WhatsApp do salão e o servidor BarberFlow via conexão segura de sockets autenticados.
          </p>
          <p style={{ marginTop: '12px' }}>
            As chaves de sessão são criptografadas e protegidas contra extração. O bot opera exclusivamente para envio de diálogos autorizados pelo cliente (agendamento, confirmação, cancelamento e lembretes), sem expor números a terceiros.
          </p>
        </>
      ),
    },
    {
      id: 'direitos-titulares',
      title: '7. Direitos dos Titulares de Dados (Art. 18 da LGPD)',
      content: (
        <>
          <p>
            O titular de dados pessoais (gestor, barbeiro ou cliente) possui os seguintes direitos garantidos por lei, que podem ser exercidos a qualquer momento:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '14px' }}>
            <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <strong>1. Confirmação & Acesso:</strong> Saber se tratamos seus dados e solicitar uma cópia dos registros.
            </div>
            <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <strong>2. Correção de Dados:</strong> Retificar dados incompletos, inexatos ou desatualizados.
            </div>
            <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <strong>3. Anonimização ou Bloqueio:</strong> Solicitar o bloqueio de dados desnecessários ou excessivos.
            </div>
            <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px' }}>
              <strong>4. Eliminação Definitiva:</strong> Solicitar a exclusão permanente de seus dados após o término do vínculo.
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'retencao-descarte',
      title: '8. Retenção, Descarte e Exclusão Segura',
      content: (
        <>
          <p>
            Os dados pessoais permanecem armazenados enquanto a conta do cliente estiver ativa e pelo prazo legal necessário para fins fiscais e judiciais.
          </p>
          <p style={{ marginTop: '12px' }}>
            Quando um salão é cancelado ou excluído pelo painel do Super Admin, nosso sistema executa rotina automatizada em cascata (<code>CASCADE DELETE</code>), eliminando instantaneamente do banco de dados todos os profissionais, clientes, mensagens e históricos financeiros vinculados.
          </p>
        </>
      ),
    },
    {
      id: 'dpo-contato',
      title: '9. Encarregado de Proteção de Dados (DPO) & Canal de Atendimento',
      content: (
        <>
          <p>
            Para exercer seus direitos de titular, esclarecer dúvidas sobre esta política ou encaminhar requisições relacionadas à LGPD, entre em contato direto com o nosso <strong>Encarregado pelo Tratamento de Dados Pessoais (DPO)</strong>:
          </p>
          <div className="glass-card" style={{ marginTop: '16px', padding: '20px', borderColor: 'rgba(229, 179, 56, 0.4)' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <Mail size={16} color="var(--primary)" />
              <span><strong>E-mail de Privacidade:</strong> privacidade@barberflow.com.br</span>
            </p>
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={16} color="var(--primary)" />
              <span><strong>Encarregado (DPO):</strong> Equipe de Segurança & Compliance BarberFlow</span>
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              Prazo legal de resposta: até 15 (quinze) dias úteis para requerimentos formais de titulares de dados.
            </p>
          </div>
        </>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      {/* Top Navbar */}
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
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(18, 24, 38, 0.8) 100%)',
            borderColor: 'rgba(16, 185, 129, 0.3)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34D399',
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '16px',
            }}
          >
            <ShieldCheck size={14} />
            <span>Conformidade Estrita com a Lei 13.709/2018 (LGPD)</span>
          </div>

          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, marginBottom: '14px', lineHeight: 1.2 }}>
            Privacidade, Segurança & Proteção de Dados
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: '850px' }}>
            Entenda como o BarberFlow protege as informações da sua barbearia e os dados de agendamento dos seus clientes com isolamento multi-tenant, criptografia de ponta a ponta e total transparência.
          </p>

          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.86rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            <span><strong>Última revisão de compliance:</strong> {lastUpdated}</span>
            <span>•</span>
            <span>Versão LGPD: 2.5</span>
          </div>
        </div>

        {/* Grade de Seções */}
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

        {/* Card Final de Canal com o DPO */}
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
            borderColor: 'rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.05)',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
              Deseja solicitar acesso ou exclusão de dados?
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Nossa equipe de Proteção de Dados responderá sua solicitação em total conformidade com a LGPD.
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
            <span>Falar com o Encarregado (DPO)</span>
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
          <Link href="/termos">Termos de Serviço</Link>
          <Link href="/privacidade" style={{ color: 'var(--primary)', fontWeight: 600 }}>Privacidade & LGPD</Link>
          <Link href="/contato">Contato</Link>
          <Link href="/login">Área do Cliente</Link>
        </div>
      </footer>
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <line x1="9" y1="22" x2="9" y2="22.01" />
      <line x1="15" y1="22" x2="15" y2="22.01" />
      <line x1="8" y1="6" x2="8.01" y2="6" />
      <line x1="16" y1="6" x2="16.01" y2="6" />
      <line x1="12" y1="6" x2="12.01" y2="6" />
      <line x1="12" y1="10" x2="12.01" y2="10" />
      <line x1="12" y1="14" x2="12.01" y2="14" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}
