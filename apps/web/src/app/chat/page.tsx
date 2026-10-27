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
              width: '380px',
              borderRight: '1px solid var(--border-color)',
              background: 'rgba(11, 15, 23, 0.98)',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
            }}
          >
            {/* Header da Coluna */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(37, 211, 102, 0.15)',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#25D366',
                    }}
                  >
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: 0, lineHeight: 1.2 }}>
                      Atendimento / Chat
                    </h2>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
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
                    padding: '6px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {/* Barra de Pesquisa */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              >
                <Search size={15} color="var(--text-dim)" />
                <input
                  type="text"
                  placeholder="Buscar por cliente, telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-main)',
                    fontSize: '0.84rem',
                    width: '100%',
                  }}
                />
              </div>

              {/* Filtros em Grid 2x2 - Totalmente responsivo e sem scrollbar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setFilterMode('ALL')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'ALL' ? '1px solid var(--primary)' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'ALL' ? 'rgba(229, 179, 56, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'ALL' ? 'var(--primary)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>💬 Todas ({conversations.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('UNREAD')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'UNREAD' ? '1px solid #EF4444' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'UNREAD' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'UNREAD' ? '#EF4444' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Clock size={12} />
                  <span>Não Lidas ({conversations.filter((c) => c.unreadCount > 0).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('ATTENDANT')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'ATTENDANT' ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'ATTENDANT' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'ATTENDANT' ? '#FBBF24' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <User size={12} />
                  <span>Atendente ({conversations.filter((c) => c.isAttendant).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('BOT')}
                  style={{
                    padding: '7px 8px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: filterMode === 'BOT' ? '1px solid #10B981' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: filterMode === 'BOT' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    color: filterMode === 'BOT' ? '#34D399' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Bot size={12} />
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
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        borderLeft: isSelected ? '4px solid var(--primary)' : '4px solid transparent',
                        background: isSelected ? 'rgba(229, 179, 56, 0.08)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        gap: '12px',
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
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: conv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          border: `1px solid ${conv.isAttendant ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: conv.isAttendant ? '#FBBF24' : '#34D399',
                          flexShrink: 0,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                        }}
                      >
                        {conv.contactName ? conv.contactName.slice(0, 2).toUpperCase() : <User size={18} />}
                      </div>

                      {/* Informações da conversa */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontSize: '0.88rem',
                              fontWeight: isSelected ? 800 : 700,
                              color: isSelected ? '#FFFFFF' : 'var(--text-main)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {conv.contactName || (conv.phone ? formatPhoneDisplay(conv.phone) : 'Cliente')}
                          </span>
                          <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '6px' }}>
                            {timeFormatted}
                          </span>
                        </div>

                        {/* Prévia da última mensagem */}
                        <p
                          style={{
                            fontSize: '0.78rem',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: conv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                              color: conv.isAttendant ? '#FBBF24' : '#34D399',
                              border: `1px solid ${conv.isAttendant ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            {conv.isAttendant ? '👤 Atendente' : '🤖 Bot'}
                          </span>

                          {conv.customer && (
                            <span
                              style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(229, 179, 56, 0.15)',
                                color: '#E5B338',
                                border: '1px solid rgba(229, 179, 56, 0.3)',
                              }}
                            >
                              Cliente
                            </span>
                          )}

                          {conv.phone && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
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
                                padding: '1px 6px',
                                fontSize: '0.66rem',
                                fontWeight: 800,
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
                    padding: '14px 24px',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'rgba(15, 21, 32, 0.85)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    zIndex: 20,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                        border: `2px solid ${selectedConv.isAttendant ? '#F59E0B' : '#10B981'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: selectedConv.isAttendant ? '#FBBF24' : '#34D399',
                        fontSize: '1rem',
                        fontWeight: 800,
                      }}
                    >
                      {selectedConv.contactName ? selectedConv.contactName.slice(0, 2).toUpperCase() : <User size={20} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                          {selectedConv.contactName || (selectedConv.phone ? formatPhoneDisplay(selectedConv.phone) : 'Cliente')}
                        </h3>
                        {selectedConv.phone && (
                          <span style={{ fontSize: '0.80rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                            {formatPhoneDisplay(selectedConv.phone)}
                          </span>
                        )}
                        {selectedConv.customer && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(229, 179, 56, 0.15)',
                              color: '#E5B338',
                              border: '1px solid rgba(229, 179, 56, 0.35)',
                            }}
                          >
                            Cliente Cadastrado
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '4px',
                            background: selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: selectedConv.isAttendant ? '#FBBF24' : '#34D399',
                            border: `1px solid ${selectedConv.isAttendant ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                          }}
                        >
                          {selectedConv.isAttendant ? '👤 Atendimento Humano Ativo' : '🤖 Robô do WhatsApp Ativo'}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {selectedConv.isAttendant
                            ? 'O bot está pausado para permitir conversa humana.'
                            : 'O robô está respondendo o menu automaticamente.'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações da Conversa */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Botão de Transferência (Atendente <-> Robô) */}
                    <button
                      type="button"
                      onClick={handleToggleTransfer}
                      disabled={transferring}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: transferring ? 'not-allowed' : 'pointer',
                        border: selectedConv.isAttendant ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                        background: selectedConv.isAttendant ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: selectedConv.isAttendant ? '#34D399' : '#FBBF24',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {selectedConv.isAttendant ? (
                        <>
                          <Bot size={15} />
                          <span>Devolver para o Robô</span>
                        </>
                      ) : (
                        <>
                          <Headphones size={15} />
                          <span>Assumir / Transferir para Atendente</span>
                        </>
                      )}
                    </button>

                    <Link
                      href="/calendar"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-main)',
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Calendar size={15} color="var(--primary)" />
                      <span>Ver Agenda</span>
                    </Link>
                  </div>
                </div>

                {/* Área de Histórico de Mensagens */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {loadingMessages ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                      Carregando histórico do chat...
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.92rem', fontWeight: 600 }}>Nenhuma mensagem registrada nesta conversa ainda.</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
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
                            maxWidth: '75%',
                            alignSelf: isOutbound ? 'flex-end' : 'flex-start',
                          }}
                        >
                          {/* Nome / Tipo do Remetente */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', padding: '0 4px' }}>
                            <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)', fontWeight: 600 }}>
                              {isOutbound
                                ? m.senderType === 'BOT'
                                  ? '🤖 Robô BarberFlow'
                                  : m.senderType === 'SYSTEM'
                                  ? '⚙️ Sistema'
                                  : `👤 ${m.senderName || attendantShortName}`
                                : m.senderName || selectedConv.contactName || 'Cliente'}
                            </span>
                            <span style={{ fontSize: '0.66rem', color: 'rgba(255, 255, 255, 0.35)' }}>• {time}</span>
                          </div>

                          {/* Balão de Mensagem */}
                          <div
                            style={{
                              padding: '10px 14px',
                              borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
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
                              fontSize: '0.88rem',
                              lineHeight: 1.45,
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
                                    <div style={{ fontWeight: 800, color: '#FBBF24', marginBottom: '4px', fontSize: '0.82rem' }}>
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
                    padding: '8px 24px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    background: 'rgba(15, 21, 32, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflowX: 'auto',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 700, flexShrink: 0, marginRight: '4px' }}>
                    Respostas rápidas:
                  </span>
                  {QUICK_REPLIES.map((reply, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInputText(reply)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '16px',
                        fontSize: '0.74rem',
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
                    padding: '12px 24px 16px 24px',
                    borderTop: '1px solid var(--border-color)',
                    background: 'rgba(11, 15, 23, 0.95)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {/* Identificação do Atendente Ativo */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#FBBF24',
                          boxShadow: '0 0 6px rgba(251, 191, 36, 0.6)',
                        }}
                      />
                      <span style={{ fontSize: '0.74rem', color: '#FBBF24', fontWeight: 600 }}>
                        Enviando no WhatsApp como: <strong>{attendantShortName}</strong>
                      </span>
                    </div>
                    <span style={{ fontSize: '0.70rem', color: 'var(--text-dim)' }}>
                      O nome do atendente é incluído automaticamente na mensagem
                    </span>
                  </div>

                  <form
                    onSubmit={handleSendMessage}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    <input
                      type="text"
                      required
                      placeholder={
                        selectedConv.isAttendant
                          ? `Digite sua mensagem... (será enviada como "${attendantShortName}: <sua mensagem>")`
                          : 'Digite uma mensagem (ao enviar, a conversa será assumida por você)...'
                      }
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '0.90rem',
                        outline: 'none',
                      }}
                    />

                    <button
                      type="submit"
                      disabled={sending || !inputText.trim()}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: sending || !inputText.trim() ? 'not-allowed' : 'pointer',
                        background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                        color: '#0B0F17',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 12px rgba(37, 211, 102, 0.35)',
                        transition: 'transform 0.1s ease',
                      }}
                    >
                      <span>{sending ? 'Enviando...' : 'Enviar no WhatsApp'}</span>
                      <Send size={15} />
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
