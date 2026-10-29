'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  QrCode,
  Smartphone,
  RefreshCw,
  Power,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Star,
  UserCheck,
  Scissors,
  Crown,
  Lock,
  Bot,
  RotateCcw,
  CheckCheck,
  Zap,
  Info,
  Calendar,
  User,
  Check,
  ChevronRight,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { useToast } from '../../components/Toast';

interface WhatsAppStatus {
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED';
  qrCode?: string | null;
  qrDataUrl?: string | null;
  phoneNumber?: string | null;
  lastConnectedAt?: string | null;
  lastDisconnectedAt?: string | null;
  lastError?: string | null;
}

interface WhatsAppConfig {
  botEnabled: boolean;
  welcomeMessage: string;
  confirmationMessage: string;
  reminderMessage: string;
  cancellationMessage: string;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
  attendantSurveyEnabled?: boolean;
  attendantSurveyMessage?: string | null;
  serviceSurveyEnabled?: boolean;
  serviceSurveyMessage?: string | null;
}

interface SimulatedMessage {
  id: string;
  fromMe: boolean;
  senderName?: string;
  body: string;
  createdAt: string;
}

interface SimulatedConversation {
  state: string;
  context?: {
    serviceId?: string;
    serviceName?: string;
    servicePriceCents?: number;
    serviceDuration?: number;
    professionalId?: string | null;
    professionalName?: string;
    date?: string;
    time?: string;
    startAt?: string;
  };
}

export default function WhatsAppHubPage() {
  const { toast, confirm } = useToast();
  const { tenant, hasPlanFeature } = useAuth();
  const canCustomBot = hasPlanFeature('customBotMessages');
  const canSurveys = hasPlanFeature('satisfactionSurveys');

  // Aba ativa: 'simulator' (Simulador de Atendimento) | 'connection' (Conexão & Configurações)
  const [activeTab, setActiveTab] = useState<'simulator' | 'connection'>('simulator');

  const [statusData, setStatusData] = useState<WhatsAppStatus | null>(null);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Mensagem de teste via WhatsApp real
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste do BarberFlow.');
  const [sendingTest, setSendingTest] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Salvando config
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Estado do Simulador de Atendimento
  const [simMessages, setSimMessages] = useState<SimulatedMessage[]>([]);
  const [simInput, setSimInput] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const [simTyping, setSimTyping] = useState(false);
  const [simConversation, setSimConversation] = useState<SimulatedConversation | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const salonDisplayName = tenant?.name || 'Barbearia BarberFlow';

  const loadStatus = async () => {
    try {
      const res = await api.get<WhatsAppStatus>('/api/whatsapp/status');
      setStatusData(res);
    } catch {
      // Ignora erro
    }
  };

  const loadConfig = async () => {
    try {
      const res = await api.get<{ config: WhatsAppConfig }>('/api/whatsapp/config');
      setConfig(res.config);
    } catch {
      // Ignora erro
    }
  };

  const loadSimHistory = async () => {
    try {
      const res = await api.get<{ messages: SimulatedMessage[]; conversation: SimulatedConversation | null }>(
        '/api/whatsapp/simulate/history'
      );
      if (res.messages && res.messages.length > 0) {
        setSimMessages(res.messages);
        setSimConversation(res.conversation);
      } else {
        setSimMessages([
          {
            id: 'init-1',
            fromMe: true,
            senderName: salonDisplayName,
            body: `Olá! 👋 Bem-vindo à *${salonDisplayName}*.\n\nSou o bot inteligente do BarberFlow com IA para agendamentos. Experimente me enviar:\n_"Boa tarde! Gostaria de agendar um Corte Degradê com o barbeiro Lucas para hoje por volta das 16h30."_`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setSimConversation({ state: 'MENU' });
      }
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    Promise.all([loadStatus(), loadConfig(), loadSimHistory()]).finally(() => setLoading(false));

    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'simulator') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [simMessages, simTyping, activeTab]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await api.post<WhatsAppStatus>('/api/whatsapp/connect');
      setStatusData(res);
      toast.info('Solicitação enviada. Escaneie o QR Code para conectar.');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao solicitar conexão.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Desconectar WhatsApp',
      message: 'Deseja realmente desconectar este WhatsApp? O bot automático e os avisos de agendamento deixarão de responder.',
      confirmText: 'Desconectar',
      danger: true,
      icon: 'trash',
    });
    if (!ok) return;

    try {
      await api.post('/api/whatsapp/disconnect');
      await loadStatus();
      toast.success('WhatsApp desconectado com sucesso.');
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao desconectar.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    setSaveSuccess(false);

    try {
      await api.patch('/api/whatsapp/config', config);
      setSaveSuccess(true);
      toast.success('Configurações do WhatsApp salvas com sucesso!');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestSuccess(null);
    setTestError(null);
    setSendingTest(true);

    try {
      await api.post('/api/whatsapp/send-test', {
        phone: testPhone,
        message: testMessage,
      });
      setTestSuccess('Mensagem enviada com sucesso no WhatsApp!');
    } catch (err: unknown) {
      setTestError(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  // Funções do Simulador
  const handleSendSimMessage = async (customText?: string) => {
    const text = (customText ?? simInput).trim();
    if (!text || simLoading) return;

    const tempCustomerMsg: SimulatedMessage = {
      id: `client-${Date.now()}`,
      fromMe: false,
      senderName: 'Bruno',
      body: text,
      createdAt: new Date().toISOString(),
    };

    setSimMessages((prev) => [...prev, tempCustomerMsg]);
    setSimInput('');
    setSimLoading(true);
    setSimTyping(true);

    try {
      const res = await api.post<{
        replies: string[];
        messages: SimulatedMessage[];
        conversation: SimulatedConversation;
      }>('/api/whatsapp/simulate', {
        message: text,
        customerName: 'Bruno',
      });

      setTimeout(() => {
        setSimTyping(false);
        if (res.messages && res.messages.length > 0) {
          setSimMessages(res.messages);
        } else if (res.replies && res.replies.length > 0) {
          const newReplies: SimulatedMessage[] = res.replies.map((body, i) => ({
            id: `bot-reply-${Date.now()}-${i}`,
            fromMe: true,
            senderName: salonDisplayName,
            body,
            createdAt: new Date().toISOString(),
          }));
          setSimMessages((prev) => [...prev, ...newReplies]);
        }
        setSimConversation(res.conversation);
        setSimLoading(false);
      }, 500);
    } catch (err: unknown) {
      setSimTyping(false);
      setSimLoading(false);
      toast.error(err instanceof ApiError ? err.message : 'Erro ao processar mensagem no simulador.');
    }
  };

  const handleResetSim = async () => {
    const ok = await confirm({
      title: 'Reiniciar Simulação',
      message: 'Deseja reiniciar a conversa do simulador? Todo o histórico de teste será limpo.',
      confirmText: 'Reiniciar',
      icon: 'info',
    });
    if (!ok) return;

    try {
      await api.post('/api/whatsapp/simulate/reset');
      setSimMessages([
        {
          id: `init-${Date.now()}`,
          fromMe: true,
          senderName: salonDisplayName,
          body: `Conversa reiniciada com sucesso! 🔄\n\nExperimente enviar:\n_"Boa tarde! Gostaria de agendar um Corte Degradê com o barbeiro Lucas para hoje por volta das 16h30."_`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setSimConversation({ state: 'MENU' });
      toast.success('Simulador reiniciado.');
    } catch {
      toast.error('Erro ao reiniciar simulador.');
    }
  };

  const formatWhatsAppBody = (text: string) => {
    const lines = text.split('\n');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {lines.map((line, lineIdx) => {
          // Destacar selo de agendamento confirmado
          if (line.includes('Agendamento Confirmado!') || line.includes('Agendamento confirmado!')) {
            return (
              <div
                key={lineIdx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.22)',
                  border: '1px solid rgba(16, 185, 129, 0.45)',
                  color: '#34D399',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  fontWeight: 700,
                  fontSize: '0.86rem',
                  margin: '6px 0',
                  alignSelf: 'flex-start',
                }}
              >
                <Check size={16} strokeWidth={3} />
                <span>Agendamento Confirmado!</span>
              </div>
            );
          }

          // Destacar selo de lembrete programado
          if (line.includes('Lembrete programado')) {
            return (
              <div
                key={lineIdx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.18)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  color: '#FBBF24',
                  borderRadius: '20px',
                  padding: '5px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  margin: '4px 0 8px',
                  alignSelf: 'flex-start',
                }}
              >
                <span>🔔</span>
                <span>{line.replace(/[*_]/g, '').trim()}</span>
              </div>
            );
          }

          // Processar negrito (*texto*) e itálico (_texto_)
          const segments = line.split(/(\*[^*]+\*|_[^_]+_)/g);

          return (
            <div key={lineIdx} style={{ minHeight: line.trim() ? 'auto' : '8px' }}>
              {segments.map((seg, sIdx) => {
                if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
                  return (
                    <strong key={sIdx} style={{ fontWeight: 700, color: '#FFFFFF' }}>
                      {seg.slice(1, -1)}
                    </strong>
                  );
                }
                if (seg.startsWith('_') && seg.endsWith('_') && seg.length > 2) {
                  return (
                    <em key={sIdx} style={{ fontStyle: 'italic', opacity: 0.85 }}>
                      {seg.slice(1, -1)}
                    </em>
                  );
                }
                return seg;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const isConnected = statusData?.status === 'CONNECTED';
  const isQrPending = statusData?.status === 'QR_PENDING';

  const quickChips = [
    {
      label: 'Agendar Corte Degradê com Lucas (NLP)',
      text: 'Boa tarde! Gostaria de agendar um Corte Degradê com o barbeiro Lucas para hoje por volta das 16h30.',
    },
    {
      label: 'Cortar cabelo amanhã às 15:00',
      text: 'Quero cortar o cabelo amanhã às 15:00',
    },
    {
      label: 'Horário para barba hoje',
      text: 'Tem horário para fazer barba hoje?',
    },
    {
      label: '1 (Confirmar)',
      text: '1',
    },
    {
      label: 'Menu',
      text: 'menu',
    },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1440px', width: '100%', margin: '0 auto' }}>
          {/* Header Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>
                  Central do WhatsApp & Bot Inteligente
                </h1>
                <span
                  className="badge badge-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', fontSize: '0.72rem' }}
                >
                  <Sparkles size={12} /> NOVO FLUXO IA
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Atendimento automático por linguagem natural (NLP), verificação em tempo real e pareamento oficial.
              </p>
            </div>
          </div>

          {/* Abas Superiores */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              paddingBottom: '14px',
              marginBottom: '28px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('simulator')}
              style={{
                padding: '11px 20px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                background: activeTab === 'simulator' ? 'rgba(217, 119, 6, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                color: activeTab === 'simulator' ? 'var(--primary)' : 'var(--text-muted)',
                border: activeTab === 'simulator' ? '1px solid rgba(217, 119, 6, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Bot size={18} />
              <span>Simulador de Atendimento (Fluxo Inteligente)</span>
              <span
                style={{
                  background: '#10B981',
                  color: '#FFFFFF',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: '10px',
                  letterSpacing: '0.04em',
                }}
              >
                INTERATIVO
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              style={{
                padding: '11px 20px',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                background: activeTab === 'connection' ? 'rgba(217, 119, 6, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                color: activeTab === 'connection' ? 'var(--primary)' : 'var(--text-muted)',
                border: activeTab === 'connection' ? '1px solid rgba(217, 119, 6, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Smartphone size={18} />
              <span>Conexão & Configurações de Mensagens</span>
              <span
                className={`badge ${isConnected ? 'badge-success' : 'badge-danger'}`}
                style={{ fontSize: '0.68rem', padding: '2px 8px' }}
              >
                {isConnected ? 'WhatsApp Conectado' : 'Desconectado'}
              </span>
            </button>
          </div>

          {/* CONTEÚDO DA ABA 1: SIMULADOR DE ATENDIMENTO */}
          {activeTab === 'simulator' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: '32px', alignItems: 'start' }}>
              {/* Celular Virtual WhatsApp */}
              <div
                style={{
                  background: '#0b141a',
                  borderRadius: '32px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), 0 0 25px rgba(16, 185, 129, 0.06)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  height: '760px',
                  position: 'relative',
                }}
              >
                {/* Barra Superior do Smartphone */}
                <div
                  style={{
                    background: '#1f2c34',
                    padding: '8px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: '#8696a0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span>09:41</span>
                  <div style={{ width: '80px', height: '14px', background: '#0b141a', borderRadius: '10px' }} />
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span>5G</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Cabeçalho do Chat WhatsApp */}
                <div
                  style={{
                    background: '#202c33',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #059669, #10B981)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.25rem',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      💈
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#e9edef', margin: 0 }}>
                          {salonDisplayName}
                        </h4>
                        <CheckCircle2 size={15} color="#34D399" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#34D399' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34D399', display: 'inline-block' }} />
                        <span>Bot Ativo 24h (IA Online)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetSim}
                    title="Reiniciar Conversa de Teste"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#e9edef',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Reiniciar</span>
                  </button>
                </div>

                {/* Área de Mensagens com visual autêntico do WhatsApp */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
                    backgroundSize: '16px 16px',
                  }}
                >
                  <div style={{ textAlign: 'center', margin: '4px 0 10px' }}>
                    <span
                      style={{
                        background: '#182229',
                        color: '#8696a0',
                        fontSize: '0.72rem',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      HOJE
                    </span>
                  </div>

                  {simMessages.map((msg) => {
                    const isClient = !msg.fromMe;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isClient ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '85%',
                            padding: '10px 14px',
                            borderRadius: isClient ? '12px 0 12px 12px' : '0 12px 12px 12px',
                            background: isClient ? '#005c4b' : '#202c33',
                            color: isClient ? '#e9edef' : '#d1d7db',
                            fontSize: '0.88rem',
                            lineHeight: 1.45,
                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                            position: 'relative',
                            wordBreak: 'break-word',
                          }}
                        >
                          {formatWhatsAppBody(msg.body)}

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '4px',
                              marginTop: '4px',
                              fontSize: '0.68rem',
                              color: isClient ? '#8696a0' : '#8696a0',
                            }}
                          >
                            <span>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isClient && <CheckCheck size={14} color="#53bdeb" />}
                          </div>
                        </div>

                        {/* Botões interativos de resposta rápida se o bot estiver em confirmação */}
                        {!isClient && msg.body.includes('Confirmar Agendamento') && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => handleSendSimMessage('1')}
                              style={{
                                background: '#10B981',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '16px',
                                padding: '6px 14px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                boxShadow: '0 3px 8px rgba(16, 185, 129, 0.35)',
                              }}
                            >
                              <Check size={14} />
                              <span>Confirmar (1)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendSimMessage('2')}
                              style={{
                                background: '#202c33',
                                color: '#e9edef',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                borderRadius: '16px',
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                            >
                              <Clock size={13} />
                              <span>Outros Horários (2)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendSimMessage('0')}
                              style={{
                                background: 'transparent',
                                color: '#FB7185',
                                border: '1px solid rgba(244, 63, 94, 0.25)',
                                borderRadius: '16px',
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Cancelar (0)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Indicador de Digitando... */}
                  {simTyping && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start' }}>
                      <div
                        style={{
                          background: '#202c33',
                          padding: '8px 14px',
                          borderRadius: '0 12px 12px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#8696a0',
                          fontSize: '0.78rem',
                        }}
                      >
                        <span className="animate-pulse">●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                        <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                        <span style={{ marginLeft: '4px' }}>Digitando resposta...</span>
                      </div>
                    </div>
                  )}

                  <div ref={chatBottomRef} />
                </div>

                {/* Chips de teste rápido */}
                <div
                  style={{
                    background: '#182229',
                    padding: '8px 12px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#8696a0', alignSelf: 'center', paddingRight: '4px' }}>
                    Sugestões:
                  </span>
                  {quickChips.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendSimMessage(chip.text)}
                      disabled={simLoading}
                      style={{
                        background: '#202c33',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#d1d7db',
                        padding: '4px 10px',
                        borderRadius: '14px',
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#10B981';
                        e.currentTarget.style.color = '#34D399';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.color = '#d1d7db';
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* Input do WhatsApp */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendSimMessage();
                  }}
                  style={{
                    background: '#202c33',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  }}
                >
                  <input
                    type="text"
                    value={simInput}
                    onChange={(e) => setSimInput(e.target.value)}
                    placeholder="Digite como cliente (ex: 'Quero agendar corte hoje 16:30')..."
                    disabled={simLoading}
                    style={{
                      flex: 1,
                      background: '#2a3942',
                      border: 'none',
                      borderRadius: '20px',
                      padding: '10px 16px',
                      color: '#e9edef',
                      fontSize: '0.88rem',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!simInput.trim() || simLoading}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: simInput.trim() && !simLoading ? '#00a884' : '#2a3942',
                      color: '#FFFFFF',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: simInput.trim() && !simLoading ? 'pointer' : 'default',
                      transition: 'background 0.2s',
                    }}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>

              {/* Coluna Direita: Informações & Monitoramento do Flow IA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Card Explicativo */}
                <div className="glass-panel" style={{ padding: '26px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(217, 119, 6, 0.15)',
                        border: '1px solid rgba(217, 119, 6, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                      }}
                    >
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Fluxo Inteligente Integrado</h3>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        Como o bot interpreta e confirma agendamentos no sistema
                      </p>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6, marginBottom: '20px' }}>
                    O mesmo fluxo visualizado na página inicial agora está <strong>100% integrado ao backend do BarberFlow</strong>! 
                    O cliente não fica preso a menus numéricos rígidos: ele pode enviar mensagens em linguagem natural brasileira e o bot entende tudo.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34D399',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        1
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                          Identificação de Serviço & Barbeiro
                        </strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Detecta automaticamente termos como <em>"corte degradê"</em>, <em>"barba"</em> e o nome do profissional (ex: <em>"Lucas"</em>).
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34D399',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        2
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                          Interpretação de Datas e Horários
                        </strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Compreende expressões relativas: <em>"hoje"</em>, <em>"amanhã"</em>, <em>"quinta"</em>, <em>"às 16h30"</em> ou <em>"por volta das 4 da tarde"</em>.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34D399',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        3
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                          Verificação em Tempo Real & Sugestão
                        </strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          Valida se o slot está vago na agenda. Se estiver livre, gera o card de confirmação com valor e duração. Se ocupado, lista horários próximos.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34D399',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                      >
                        4
                      </div>
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                          Confirmação e Lembrete Automático
                        </strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                          O cliente pode confirmar respondendo <em>"1"</em>, <em>"sim"</em>, <em>"confirmar"</em> ou <em>"ok"</em>. O sistema grava o agendamento e agenda o lembrete.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inspetor de Estado em Tempo Real (Debug) */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Info size={18} color="var(--primary)" />
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 600 }}>Diagnóstico da Conversa (IA)</h4>
                    </div>
                    <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                      ESTADO: {simConversation?.state || 'MENU'}
                    </span>
                  </div>

                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      borderRadius: '10px',
                      padding: '14px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Serviço Detectado:</span>
                      <strong style={{ color: 'var(--text-main)' }}>{simConversation?.context?.serviceName || 'Nenhum'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Profissional:</span>
                      <strong style={{ color: 'var(--text-main)' }}>{simConversation?.context?.professionalName || 'Qualquer disponível'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Data:</span>
                      <strong style={{ color: 'var(--text-main)' }}>{simConversation?.context?.date || 'Não selecionada'}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Horário:</span>
                      <strong style={{ color: '#34D399' }}>{simConversation?.context?.time || 'Aguardando escolha'}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('connection')}
                    style={{
                      width: '100%',
                      marginTop: '16px',
                      padding: '11px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-main)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Configurar Textos e Conectar WhatsApp Real</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CONTEÚDO DA ABA 2: CONEXÃO REAL & CONFIGURAÇÕES */}
          {activeTab === 'connection' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '28px' }}>
              {/* Coluna 1: Status & Pareamento via QR Code */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Smartphone size={22} color="var(--primary)" />
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Status do WhatsApp Real</h3>
                    </div>

                    <span
                      className={`badge ${
                        isConnected ? 'badge-success' : isQrPending ? 'badge-warning' : 'badge-danger'
                      }`}
                    >
                      {isConnected ? 'Conectado' : isQrPending ? 'Aguardando Leitura' : 'Desconectado'}
                    </span>
                  </div>

                  {/* QR Code Container */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '24px',
                      borderRadius: '14px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      minHeight: '300px',
                      marginBottom: '20px',
                      textAlign: 'center',
                    }}
                  >
                    {isConnected ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(16, 185, 129, 0.15)',
                            border: '2px solid rgba(16, 185, 129, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#34D399',
                          }}
                        >
                          <CheckCircle2 size={36} />
                        </div>
                        <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34D399' }}>WhatsApp Conectado!</h4>
                        <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                          O bot e o fluxo inteligente estão respondendo aos clientes no número:
                        </p>
                        <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                          +{statusData?.phoneNumber}
                        </strong>
                      </div>
                    ) : isQrPending && statusData?.qrDataUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                        <div
                          style={{
                            padding: '12px',
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                          }}
                        >
                          <img
                            src={statusData.qrDataUrl}
                            alt="QR Code WhatsApp"
                            style={{ width: '220px', height: '220px', display: 'block' }}
                          />
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                          Abra o WhatsApp no celular, vá em <strong>Aparelhos Conectados &gt; Conectar um aparelho</strong> e aponte para a tela.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                        <QrCode size={56} color="var(--text-dim)" />
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                          Nenhum WhatsApp conectado. Clique no botão abaixo para gerar o QR Code de pareamento.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {!isConnected ? (
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="gold-gradient-primary gold-glow"
                        style={{
                          flex: 1,
                          padding: '12px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                        }}
                      >
                        <RefreshCw size={16} className={connecting ? 'animate-spin' : ''} />
                        <span>{connecting ? 'Gerando QR Code...' : 'Gerar QR Code para Conectar'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleDisconnect}
                        className="glass-card"
                        style={{
                          flex: 1,
                          padding: '12px',
                          color: '#FB7185',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          borderColor: 'rgba(244, 63, 94, 0.3)',
                        }}
                      >
                        <Power size={16} />
                        <span>Desconectar Aparelho</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Card de Teste de Envio no WhatsApp Real */}
                {isConnected && (
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                      <Send size={18} color="var(--primary)" />
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Testar Disparo no Celular Real</h3>
                    </div>

                    {testSuccess && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#34D399',
                          fontSize: '0.85rem',
                          marginBottom: '12px',
                        }}
                      >
                        {testSuccess}
                      </div>
                    )}
                    {testError && (
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(244, 63, 94, 0.12)',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          color: '#FB7185',
                          fontSize: '0.85rem',
                          marginBottom: '12px',
                        }}
                      >
                        {testError}
                      </div>
                    )}

                    <form onSubmit={handleSendTest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Número com DDD (Ex: 11999998888)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="5511999998888"
                          value={testPhone}
                          onChange={(e) => setTestPhone(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Mensagem de Teste
                        </label>
                        <textarea
                          rows={2}
                          value={testMessage}
                          onChange={(e) => setTestMessage(e.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={sendingTest}
                        className="glass-card"
                        style={{ padding: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      >
                        <Send size={15} />
                        <span>{sendingTest ? 'Enviando...' : 'Enviar Mensagem de Teste'}</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Coluna 2: Configuração das Mensagens do Bot */}
              {config && (
                <div className="glass-panel" style={{ padding: '28px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <MessageSquare size={22} color="var(--primary)" />
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Respostas Automáticas do Bot</h3>
                      {!canCustomBot && (
                        <span
                          className="badge badge-warning"
                          style={{ fontSize: '0.68rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Personalização de mensagens disponível nos planos Pro e Premium"
                        >
                          <Crown size={12} /> PRO & PREMIUM
                        </span>
                      )}
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={config.botEnabled}
                        onChange={(e) => setConfig({ ...config, botEnabled: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <span>Bot Ativo</span>
                    </label>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                    Você pode usar tags como <code>&#123;nome&#125;</code>, <code>&#123;servico&#125;</code>, <code>&#123;profissional&#125;</code>, <code>&#123;data&#125;</code>, <code>&#123;hora&#125;</code>, <code>&#123;salao&#125;</code> para preenchimento dinâmico.
                  </p>

                  {saveSuccess && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34D399',
                        fontSize: '0.85rem',
                        marginBottom: '16px',
                      }}
                    >
                      Configurações salvas com sucesso!
                    </div>
                  )}

                  <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        Mensagem de Boas-Vindas & Menu
                      </label>
                      <textarea
                        rows={3}
                        value={config.welcomeMessage}
                        onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        Confirmação de Agendamento
                      </label>
                      <textarea
                        rows={4}
                        value={config.confirmationMessage}
                        onChange={(e) => setConfig({ ...config, confirmationMessage: e.target.value })}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        Lembrete de Agendamento
                      </label>
                      <textarea
                        rows={4}
                        value={config.reminderMessage}
                        onChange={(e) => setConfig({ ...config, reminderMessage: e.target.value })}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={config.reminderEnabled}
                          onChange={(e) => setConfig({ ...config, reminderEnabled: e.target.checked })}
                          style={{ width: '16px', height: '16px' }}
                        />
                        <span>Enviar lembrete antecipado</span>
                      </label>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <span>Enviar</span>
                        <input
                          type="number"
                          min={1}
                          max={48}
                          value={config.reminderHoursBefore}
                          onChange={(e) => setConfig({ ...config, reminderHoursBefore: Number(e.target.value) })}
                          style={{ width: '64px', padding: '6px 8px' }}
                        />
                        <span>hora(s) antes</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        Mensagem de Cancelamento
                      </label>
                      <textarea
                        rows={3}
                        value={config.cancellationMessage}
                        onChange={(e) => setConfig({ ...config, cancellationMessage: e.target.value })}
                      />
                    </div>

                    {/* Divisor Visual de Pesquisas de Satisfação */}
                    <div
                      style={{
                        margin: '12px 0 4px',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <Star size={18} color="var(--primary)" />
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)' }}>
                        Pesquisas de Satisfação Automáticas (NPS)
                      </span>
                      {!canSurveys && (
                        <span
                          className="badge badge-warning"
                          style={{ fontSize: '0.68rem', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Pesquisas automatizadas de satisfação disponíveis nos planos Pro e Premium"
                        >
                          <Crown size={12} /> PRO & PREMIUM
                        </span>
                      )}
                    </div>

                    {/* 1. Pesquisa de Satisfação: Atendimento Humano */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UserCheck size={18} color="var(--primary)" />
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              Pesquisa • Atendimento Humano
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Disparada automaticamente no WhatsApp ao encerrar o chat com o atendente
                            </div>
                          </div>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={config.attendantSurveyEnabled ?? true}
                            onChange={(e) => setConfig({ ...config, attendantSurveyEnabled: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span style={{ color: (config.attendantSurveyEnabled ?? true) ? '#34D399' : 'var(--text-muted)' }}>
                            {(config.attendantSurveyEnabled ?? true) ? 'Pesquisa Ativa' : 'Pesquisa Desativada'}
                          </span>
                        </label>
                      </div>

                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                        Tags suportadas: <code>&#123;nome&#125;</code>, <code>&#123;atendente&#125;</code>, <code>&#123;salao&#125;</code>
                      </p>

                      <div style={{ opacity: (config.attendantSurveyEnabled ?? true) ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500, marginBottom: '6px' }}>
                          Mensagem da Avaliação de Atendimento:
                        </label>
                        <textarea
                          rows={5}
                          value={config.attendantSurveyMessage ?? ''}
                          onChange={(e) => setConfig({ ...config, attendantSurveyMessage: e.target.value })}
                          placeholder="Mensagem da pesquisa enviada ao encerrar atendimento..."
                        />
                      </div>
                    </div>

                    {/* 2. Pesquisa de Satisfação: Barbeiro / Cabeleireiro (Pós-Corte) */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Scissors size={18} color="var(--primary)" />
                          <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                              Pesquisa • Pós-Serviço (Barbeiro / Cabeleireiro)
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Disparada automaticamente no WhatsApp quando o agendamento é marcado como concluído
                            </div>
                          </div>
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={config.serviceSurveyEnabled ?? true}
                            onChange={(e) => setConfig({ ...config, serviceSurveyEnabled: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <span style={{ color: (config.serviceSurveyEnabled ?? true) ? '#34D399' : 'var(--text-muted)' }}>
                            {(config.serviceSurveyEnabled ?? true) ? 'Pesquisa Ativa' : 'Pesquisa Desativada'}
                          </span>
                        </label>
                      </div>

                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                        Tags suportadas: <code>&#123;nome&#125;</code>, <code>&#123;profissional&#125;</code>, <code>&#123;servico&#125;</code>, <code>&#123;salao&#125;</code>
                      </p>

                      <div style={{ opacity: (config.serviceSurveyEnabled ?? true) ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500, marginBottom: '6px' }}>
                          Mensagem da Avaliação do Barbeiro / Serviço:
                        </label>
                        <textarea
                          rows={5}
                          value={config.serviceSurveyMessage ?? ''}
                          onChange={(e) => setConfig({ ...config, serviceSurveyMessage: e.target.value })}
                          placeholder="Mensagem da pesquisa enviada após o corte..."
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingConfig}
                      className="gold-gradient-primary gold-glow"
                      style={{ padding: '14px', fontWeight: 600, marginTop: '8px' }}
                    >
                      {savingConfig ? 'Salvando...' : 'Salvar Alterações de Mensagens'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
