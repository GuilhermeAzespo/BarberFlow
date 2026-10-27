'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  MessageSquare,
  MessageCircle,
  Search,
  Send,
  User,
  Bot,
  UserCheck,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Phone,
  AlertCircle,
  CheckCheck,
  Check,
  CornerDownLeft,
  ChevronRight,
  Headphones,
  Shield,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { useToast } from '../../components/Toast';
import { useWhatsAppNotifications } from '../../lib/whatsapp-notifications-context';

interface ConversationItem {
  id: string;
  tenantId: string;
  contactJid: string;
  phone?: string | null;
  contactName?: string | null;
  customer?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  state: string;
  isAttendant: boolean;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt: string;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  fromMe: boolean;
  senderType: 'CUSTOMER' | 'BOT' | 'ATTENDANT' | 'SYSTEM' | string;
  senderName?: string | null;
  body: string;
  status: string;
  createdAt: string;
}

function getAttendantShortName(fullName?: string | null): string {
  if (!fullName) return 'Atendente';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[1]}`;
}

function formatPhoneDisplay(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const num = digits.slice(2);
    return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    const num = digits.slice(2);
    return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  return raw;
}

const QUICK_REPLIES = [
  'Olá! Como posso te ajudar hoje? 😊',
  'Seu agendamento está confirmado! Te esperamos aqui. 💈',
  'Você já está a caminho do salão?',
  'Qualquer imprevisto ou dúvida, estamos à disposição!',
  'Vou verificar para você e já te respondo, só um momento.',
];

function ChatPageContent() {
  const { user, tenant, canAccessMenu, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUnread } = useWhatsAppNotifications();

  const attendantShortName = useMemo(() => getAttendantShortName(user?.name), [user?.name]);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));

  useEffect(() => {
    const paramId = searchParams.get('id');
    if (paramId && paramId !== selectedId) {
      setSelectedId(paramId);
    }
  }, [searchParams, selectedId]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'ATTENDANT' | 'BOT' | 'UNREAD'>('ALL');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Redireciona se não tiver permissão
  useEffect(() => {
    if (!authLoading && !canAccessMenu('chat') && !canAccessMenu('whatsapp')) {
      router.replace('/dashboard');
    }
  }, [authLoading, canAccessMenu, router]);

  // Carrega lista de conversas
  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const res = await api.get<{ conversations: ConversationItem[] }>('/api/whatsapp/conversations');
      setConversations(res.conversations || []);
    } catch {
      // Ignora erro em polling silencioso
    } finally {
      if (!silent) setLoadingList(false);
    }
  };

  // Carrega mensagens da conversa selecionada
  const loadMessages = async (convId: string, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await api.get<{ conversation: ConversationItem; messages: ChatMessage[] }>(
        `/api/whatsapp/conversations/${convId}/messages`
      );
      setMessages(res.messages || []);
      // Atualiza a conversa na lista local para refletir unreadCount = 0
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, ...res.conversation, unreadCount: 0 } : c))
      );
      // Notifica o contexto global para atualizar badges do sidebar e header
      refreshUnread();
    } catch (err: unknown) {
      if (!silent) {
        toast.error(err instanceof ApiError ? err.message : 'Falha ao carregar mensagens.');
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // Polling inicial e recorrente (a cada 4s) para novas mensagens
  useEffect(() => {
    loadConversations();
    const interval = setInterval(() => {
      loadConversations(true);
      if (selectedId) {
        loadMessages(selectedId, true);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedId]);

  // Ao selecionar uma conversa
  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const selectedConv = useMemo(
    () => conversations.find((c) => c.id === selectedId),
    [conversations, selectedId]
  );

  // Enviar mensagem como atendente
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedId || !inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const res = await api.post<{ success: boolean; message: ChatMessage }>(
        `/api/whatsapp/conversations/${selectedId}/messages`,
        { text }
      );
      setMessages((prev) => [...prev, res.message]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString(), isAttendant: true }
            : c
        )
      );
      toast.success('Mensagem enviada com sucesso no WhatsApp!');
    } catch (err: unknown) {
      setInputText(text); // Restaura texto se falhar
      toast.error(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem.');
    } finally {
      setSending(false);
    }
  };

  // Alternar entre Atendente Humano e Robô
  const handleToggleTransfer = async () => {
    if (!selectedConv || transferring) return;
    const targetStatus = !selectedConv.isAttendant;
    setTransferring(true);

    try {
      const res = await api.patch<{ success: boolean; conversation: ConversationItem }>(
        `/api/whatsapp/conversations/${selectedConv.id}/transfer`,
        { toAttendant: targetStatus }
      );

      setConversations((prev) =>
        prev.map((c) => (c.id === selectedConv.id ? { ...c, ...res.conversation } : c))
      );
      await loadMessages(selectedConv.id, true);

      if (targetStatus) {
        toast.success('Conversa transferida para Atendente Humano. O bot foi pausado para este cliente.');
      } else {
        toast.success('Conversa devolvida para o Bot Automático do WhatsApp.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao transferir atendimento.');
    } finally {
      setTransferring(false);
    }
  };

  // Filtragem da lista
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Filtro de texto
      const search = searchTerm.toLowerCase();
      const matchName = c.contactName?.toLowerCase().includes(search) || false;
      const matchPhone = c.phone?.toLowerCase().includes(search) || false;
      const matchMsg = c.lastMessage?.toLowerCase().includes(search) || false;
      const matchesSearch = !searchTerm || matchName || matchPhone || matchMsg;

      if (!matchesSearch) return false;

      // Filtro de aba
      if (filterMode === 'ATTENDANT') return c.isAttendant;
      if (filterMode === 'BOT') return !c.isAttendant;
      if (filterMode === 'UNREAD') return c.unreadCount > 0;
      return true;
    });
  }, [conversations, searchTerm, filterMode]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-main)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        <Header />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 74px)' }}>
          {/* ──────────────── PAINEL ESQUERDO: LISTA DE CONVERSAS ──────────────── */}
          <aside
            style={{
              width: 'var(--chat-sidebar-width, 320px)',
              borderRight: '1px solid var(--border-color)',
              background: 'rgba(11, 15, 23, 0.98)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              transition: 'width 0.2s ease',
            }}
          >
            {/* Header da Coluna */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'rgba(37, 211, 102, 0.15)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#25D366',
                      flexShrink: 0,
                    }}
                  >
                    <MessageCircle size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h2 className="text-nowrap-ellipsis" style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, lineHeight: 1.2 }}>
                      Atendimento / Chat
                    </h2>
                    <span className="text-nowrap-ellipsis hide-on-compact" style={{ fontSize: '0.70rem', color: 'var(--text-muted)', display: 'block' }}>
                      Conversas ao vivo do WhatsApp
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadConversations()}
                  title="Atualizar lista de conversas"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '5px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={13} />
                </button>
              </div>

              {/* Barra de Pesquisa */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '6px 10px',
                }}
              >
                <Search size={14} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Buscar conversa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main)',
                    fontSize: '0.80rem',
                    width: '100%',
                    padding: 0,
                  }}
                />
              </div>

              {/* Filtros em Grid 2x2 - Totalmente responsivo e sem scrollbar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setFilterMode('ALL')}
                  title="Todas as conversas"
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'ALL' ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'ALL' ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'ALL' ? 'var(--primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>💬 Todas ({conversations.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('UNREAD')}
                  title="Apenas não lidas"
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'UNREAD' ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'UNREAD' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'UNREAD' ? '#EF4444' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Clock size={11} style={{ flexShrink: 0 }} />
                  <span>Não Lidas ({conversations.filter((c) => c.unreadCount > 0).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('ATTENDANT')}
                  title="Com atendente humano"
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'ATTENDANT' ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'ATTENDANT' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'ATTENDANT' ? '#FBBF24' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <User size={11} style={{ flexShrink: 0 }} />
                  <span>Atendente ({conversations.filter((c) => c.isAttendant).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('BOT')}
                  title="Com robô"
                  style={{
                    padding: '6px 4px',
                    borderRadius: '6px',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'BOT' ? '1px solid #10B981' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'BOT' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'BOT' ? '#34D399' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Bot size={11} style={{ flexShrink: 0 }} />
                  <span>Robô ({conversations.filter((c) => !c.isAttendant).length})</span>
                </button>
              </div>
            </div>

            {/* Lista com Rolagem */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {loadingList && conversations.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  Carregando conversas do WhatsApp...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <MessageSquare size={32} color="var(--text-dim)" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                  Nenhuma conversa encontrada neste filtro.
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const isSelected = conv.id === selectedId;
                  const date = new Date(conv.lastMessageAt);
                  const timeFormatted = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedId(conv.id)}
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        borderLeft: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                        background: isSelected ? 'rgba(229, 179, 56, 0.08)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        transition: 'background 0.15s ease',
                        borderRight: 'none',
                        borderTop: 'none',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Avatar */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: conv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          border: `1px solid ${conv.isAttendant ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: conv.isAttendant ? '#FBBF24' : '#34D399',
                          flexShrink: 0,
                          fontSize: '0.80rem',
                          fontWeight: 700,
                        }}
                      >
                        {conv.contactName ? conv.contactName.slice(0, 2).toUpperCase() : <User size={16} />}
                      </div>

                      {/* Informações da conversa */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: isSelected ? 800 : 700,
                              color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {conv.contactName || (conv.phone ? formatPhoneDisplay(conv.phone) : 'Cliente')}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '6px' }}>
                            {timeFormatted}
                          </span>
                        </div>

                        {/* Prévia da última mensagem */}
                        <p
                          style={{
                            fontSize: '0.75rem',
                            color: conv.unreadCount > 0 ? '#FFFFFF' : 'var(--text-muted)',
                            fontWeight: conv.unreadCount > 0 ? 600 : 400,
                            margin: 0,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {conv.lastMessage || 'Conversa iniciada'}
                        </p>

                        {/* Badges de Status (Atendente vs Bot e Não Lidas) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', overflow: 'hidden' }}>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: conv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: conv.isAttendant ? '#FBBF24' : '#34D399',
                              border: `1px solid ${conv.isAttendant ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            {conv.isAttendant ? '👤 Atendente' : '🤖 Bot'}
                          </span>

                          {conv.customer && (
                            <span
                              style={{
                                fontSize: '0.60rem',
                                fontWeight: 700,
                                padding: '1px 4px',
                                borderRadius: '4px',
                                background: 'rgba(229, 179, 56, 0.15)',
                                color: '#E5B338',
                                border: '1px solid rgba(229, 179, 56, 0.3)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              Cliente
                            </span>
                          )}

                          {conv.phone && (
                            <span
                              className="text-nowrap-ellipsis"
                              style={{ fontSize: '0.66rem', color: 'var(--text-dim)', minWidth: 0, flex: 1 }}
                            >
                              {formatPhoneDisplay(conv.phone)}
                            </span>
                          )}

                          {conv.unreadCount > 0 && (
                            <span
                              style={{
                                marginLeft: 'auto',
                                background: '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '10px',
                                padding: '1px 5px',
                                fontSize: '0.64rem',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* ──────────────── PAINEL DIREITO: ÁREA DE CHAT & ATENDIMENTO ──────────────── */}
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              background: 'radial-gradient(circle at center top, rgba(229, 179, 56, 0.02) 0%, rgba(11, 15, 23, 1) 100%)',
              minWidth: 0,
              height: '100%',
              position: 'relative',
            }}
          >
            {selectedConv ? (
              <>
                {/* Header da Conversa Ativa */}
                <div
                  style={{
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'rgba(15, 21, 32, 0.85)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    zIndex: 20,
                    minHeight: '62px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flexShrink: 1 }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                        border: `2px solid ${selectedConv.isAttendant ? '#F59E0B' : '#10B981'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: selectedConv.isAttendant ? '#FBBF24' : '#34D399',
                        fontSize: '0.92rem',
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {selectedConv.contactName ? selectedConv.contactName.slice(0, 2).toUpperCase() : <User size={18} />}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <h3
                          className="text-nowrap-ellipsis"
                          style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, maxWidth: '220px' }}
                        >
                          {selectedConv.contactName || (selectedConv.phone ? formatPhoneDisplay(selectedConv.phone) : 'Cliente')}
                        </h3>
                        {selectedConv.phone && (
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {formatPhoneDisplay(selectedConv.phone)}
                          </span>
                        )}
                        {selectedConv.customer && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'rgba(229, 179, 56, 0.15)',
                              color: '#E5B338',
                              border: '1px solid rgba(229, 179, 56, 0.35)',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                          >
                            Cliente Cadastrado
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: selectedConv.isAttendant ? '#FBBF24' : '#34D399',
                            border: `1px solid ${selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {selectedConv.isAttendant ? '👤 Atendimento Humano' : '🤖 Robô do WhatsApp'}
                        </span>
                        <span
                          className="hide-on-compact text-nowrap-ellipsis"
                          style={{ fontSize: '0.70rem', color: 'var(--text-muted)', maxWidth: '240px' }}
                        >
                          {selectedConv.isAttendant
                            ? 'O bot está pausado para permitir conversa humana.'
                            : 'O robô está respondendo o menu automaticamente.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações da Conversa */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {/* Botão de Transferência (Atendente <-> Robô) */}
                    <button
                      type="button"
                      onClick={handleToggleTransfer}
                      disabled={transferring}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: transferring ? 'not-allowed' : 'pointer',
                        border: selectedConv.isAttendant ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                        background: selectedConv.isAttendant ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: selectedConv.isAttendant ? '#34D399' : '#FBBF24',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {selectedConv.isAttendant ? (
                        <>
                          <Bot size={14} />
                          <span>Devolver para o Robô</span>
                        </>
                      ) : (
                        <>
                          <Headphones size={14} />
                          <span>Assumir Atendimento</span>
                        </>
                      )}
                    </button>

                    <Link
                      href="/calendar"
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Calendar size={14} color="var(--primary)" />
                      <span>Ver Agenda</span>
                    </Link>
                  </div>
                </div>

                {/* Área de Histórico de Mensagens */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {loadingMessages ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                      Carregando histórico do chat...
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.90rem', fontWeight: 600 }}>Nenhuma mensagem registrada nesta conversa ainda.</p>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        Envie uma mensagem abaixo para falar com o cliente no WhatsApp.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isOutbound = m.fromMe;
                      const time = new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isOutbound ? 'flex-end' : 'flex-start',
                            maxWidth: '82%',
                            alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                          }}
                        >
                          {/* Nome / Tipo do Remetente */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px', padding: '0 4px' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {isOutbound
                                ? m.senderType === 'BOT'
                                  ? '🤖 Robô'
                                  : m.senderType === 'SYSTEM'
                                  ? '⚙️ Sistema'
                                  : `👤 ${attendantShortName}`
                                : m.senderName || selectedConv.contactName || 'Cliente'}
                            </span>
                            <span style={{ fontSize: '0.64rem', color: 'rgba(255, 255, 255, 0.35)', whiteSpace: 'nowrap' }}>• {time}</span>
                          </div>

                          {/* Balão de Mensagem */}
                          <div
                            style={{
                              padding: '8px 12px',
                              borderRadius: isOutbound ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                              background: isOutbound
                                ? m.senderType === 'BOT'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'linear-gradient(135deg, rgba(229, 179, 56, 0.22) 0%, rgba(180, 83, 9, 0.25) 100%)'
                                : 'rgba(255, 255, 255, 0.07)',
                              border: isOutbound
                                ? m.senderType === 'BOT'
                                  ? '1px solid rgba(16, 185, 129, 0.35)'
                                  : '1px solid rgba(229, 179, 56, 0.45)'
                                : '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#F3F4F6',
                              fontSize: '0.86rem',
                              lineHeight: 1.4,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
                            }}
                          >
                            {(() => {
                              // Se a mensagem começa com *Nome:* ou Nome:
                              const match = m.body.match(/^(\*[^*]+:\*|[A-Za-zÀ-ÿ\s]+:)\s*\n([\s\S]*)$/);
                              if (match) {
                                const header = match[1].replace(/\*/g, '');
                                const content = match[2];
                                return (
                                  <div>
                                    <div style={{ fontWeight: 800, color: '#FBBF24', marginBottom: '3px', fontSize: '0.80rem' }}>
                                      {header}
                                    </div>
                                    <div>{content}</div>
                                  </div>
                                );
                              }
                              return m.body;
                            })()}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Respostas Rápidas (Chips de Sugestão) */}
                <div
                  style={{
                    padding: '6px 18px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'rgba(15, 21, 32, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflowX: 'auto',
                  }}
                >
                  <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 700, flexShrink: 0, marginRight: '4px' }}>
                    Respostas rápidas:
                  </span>
                  {QUICK_REPLIES.map((reply, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInputText(reply)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '14px',
                        fontSize: '0.70rem',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#FFFFFF';
                        e.currentTarget.style.borderColor = 'rgba(229, 179, 56, 0.35)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }}
                    >
                      {reply}
                    </button>
                  ))}
                </div>

                {/* Barra de Digitação e Envio */}
                <div
                  style={{
                    padding: '10px 18px 12px 18px',
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(11, 15, 23, 0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {/* Identificação do Atendente Ativo */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: '#FBBF24',
                          boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)',
                          flexShrink: 0,
                        }}
                      />
                      <span className="text-nowrap-ellipsis" style={{ fontSize: '0.72rem', color: '#FBBF24', fontWeight: 600 }}>
                        Enviando como: <strong>{attendantShortName}</strong>
                      </span>
                    </div>
                    <span className="hide-on-compact" style={{ fontSize: '0.68rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                      O nome do atendente é incluído automaticamente
                    </span>
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <input
                      type="text"
                      required
                      placeholder={
                        selectedConv.isAttendant
                          ? `Digite sua mensagem... (enviada como "${attendantShortName}: <mensagem>")`
                          : 'Digite uma mensagem (ao enviar, o atendimento será assumido)...'
                      }
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.86rem',
                        outline: 'none',
                      }}
                    />

                    <button
                      type="submit"
                      disabled={sending || !inputText.trim()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        cursor: sending || !inputText.trim() ? 'not-allowed' : 'pointer',
                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                        color: '#0B0F17',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 12px rgba(37, 211, 102, 0.35)',
                        transition: 'transform 0.1s ease',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span>{sending ? 'Enviando...' : 'Enviar'}</span>
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              /* Nenhum chat selecionado */
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  textAlign: 'center',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '20px',
                    background: 'rgba(37, 211, 102, 0.1)',
                    border: '1px solid rgba(37, 211, 102, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#25D366',
                    boxShadow: '0 0 30px rgba(37, 211, 102, 0.15)',
                  }}
                >
                  <MessageCircle size={36} />
                </div>

                <div style={{ maxWidth: '440px' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                    Central de Atendimento ao Vivo
                  </h3>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Selecione uma conversa na coluna à esquerda para visualizar o histórico de mensagens, responder
                    diretamente aos clientes no WhatsApp ou alternar o atendimento entre o robô e sua equipe.
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    marginTop: '10px',
                    fontSize: '0.80rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bot size={15} color="#10B981" />
                    <span>Robô Automático 24/7</span>
                  </div>
                  <span>•</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Headphones size={15} color="#F59E0B" />
                    <span>Transfira para Atendente Humano</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <React.Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          Carregando atendimento...
        </div>
      }
    >
      <ChatPageContent />
    </React.Suspense>
  );
}
