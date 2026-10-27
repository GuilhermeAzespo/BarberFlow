'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from './api';
import { useAuth } from './auth-context';
import { useToast } from '../components/Toast';
import { playNotificationChime } from './notification-sound';

export interface UnreadConversation {
  id: string;
  contactName: string;
  phone?: string | null;
  contactJid: string;
  lastMessage?: string | null;
  lastMessageAt: string;
  unreadCount: number;
  isAttendant: boolean;
  state: string;
  customer?: {
    id: string;
    name: string;
  } | null;
}

interface WhatsAppNotificationsContextType {
  unreadCount: number;
  unreadConversations: UnreadConversation[];
  refreshUnread: () => Promise<void>;
  requestNotificationPermission: () => Promise<void>;
}

const WhatsAppNotificationsContext = createContext<WhatsAppNotificationsContextType>({
  unreadCount: 0,
  unreadConversations: [],
  refreshUnread: async () => {},
  requestNotificationPermission: async () => {},
});

export function WhatsAppNotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, tenant } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();

  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState<UnreadConversation[]>([]);
  const knownMessageTimestamps = useRef<Map<string, string>>(new Map());
  const initialLoadDone = useRef(false);

  // Solicita permissão para notificações nativas do navegador
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // Ignora se não for suportado
      }
    }
  }, []);

  const fetchUnread = useCallback(async () => {
    if (!user || user.role === 'SUPER_ADMIN' || !tenant) {
      setUnreadCount(0);
      setUnreadConversations([]);
      return;
    }

    try {
      const res = await api.get<{
        unreadCount: number;
        unreadConversationsCount: number;
        conversations: UnreadConversation[];
      }>('/api/whatsapp/unread');

      const incomingConversations = res.conversations || [];
      const totalCount = res.unreadCount ?? 0;

      setUnreadCount(totalCount);
      setUnreadConversations(incomingConversations);

      // Se for a primeira carga inicial, apenas armazena os timestamps existentes sem tocar som
      if (!initialLoadDone.current) {
        incomingConversations.forEach((c) => {
          knownMessageTimestamps.current.set(c.id, c.lastMessageAt);
        });
        initialLoadDone.current = true;
        return;
      }

      // Verifica se há novas mensagens que ainda não foram notificadas
      for (const conv of incomingConversations) {
        const lastKnown = knownMessageTimestamps.current.get(conv.id);
        const isNewMessage = !lastKnown || new Date(conv.lastMessageAt) > new Date(lastKnown);

        if (isNewMessage && conv.unreadCount > 0) {
          knownMessageTimestamps.current.set(conv.id, conv.lastMessageAt);

          // Se o usuário NÃO estiver na tela de chat (/chat), dispara a notificação completa!
          const isNotInChat = !pathname?.startsWith('/chat');

          if (isNotInChat) {
            // 1. Toca o chime de áudio
            playNotificationChime();

            // 2. Dispara Toast de alta visibilidade
            const preview = conv.lastMessage ? `"${conv.lastMessage}"` : 'Nova mensagem recebida';
            toast.info(
              `${conv.contactName || 'Cliente'}: ${preview}`,
              {
                title: '💬 Nova Mensagem no WhatsApp',
                duration: 8000,
              }
            );

            // 3. Notificação nativa do sistema/navegador (se tab minimizada ou em background)
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                const notif = new Notification(`BarberFlow • ${conv.contactName || 'Cliente'}`, {
                  body: conv.lastMessage || 'Nova mensagem recebida no WhatsApp',
                  icon: '/logo.png',
                });
                notif.onclick = () => {
                  window.focus();
                  router.push(`/chat?id=${conv.id}`);
                };
              } catch {
                // Silencia se o navegador bloquear
              }
            }
          }
        }
      }
    } catch {
      // Falha silenciosa no polling de fundo
    }
  }, [user, tenant, pathname, router, toast]);

  // Polling a cada 6 segundos
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 6000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Solicita permissão suavemente quando o usuário interage
  useEffect(() => {
    const handleFirstClick = () => {
      requestNotificationPermission();
      window.removeEventListener('click', handleFirstClick);
    };
    window.addEventListener('click', handleFirstClick, { once: true });
    return () => window.removeEventListener('click', handleFirstClick);
  }, [requestNotificationPermission]);

  return (
    <WhatsAppNotificationsContext.Provider
      value={{
        unreadCount,
        unreadConversations,
        refreshUnread: fetchUnread,
        requestNotificationPermission,
      }}
    >
      {children}
    </WhatsAppNotificationsContext.Provider>
  );
}

export function useWhatsAppNotifications() {
  return useContext(WhatsAppNotificationsContext);
}
