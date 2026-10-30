import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  type WASocket,
  proto,
} from 'baileys';
import QRCode from 'qrcode';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { HttpError } from '../../lib/http-error.js';
import { formatCurrency, normalizePhone, renderTemplate } from '../../lib/utils.js';
import { usePostgresAuthState } from './baileys-session.js';
import { handleIncomingMessage } from './whatsapp-bot.js';

import { cleanExpiredSurveys } from './whatsapp-surveys.js';
import { DEFAULT_WHATSAPP_MESSAGES } from '../../lib/defaults.js';

interface TenantConnection {
  socket: WASocket | null;
  qrCode: string | null;
  qrDataUrl: string | null;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED';
  phoneNumber: string | null;
}

/** Código 440: outra sessão assumiu esta conta (ex.: dois containers durante um deploy). */
const CONNECTION_REPLACED_CODE = 440;

/** Máximo de mensagens enviadas mantidas em memória para reenvio (retry de descriptografia). */
const SENT_MESSAGES_CACHE_LIMIT = 500;

/** Espera antes de reconectar após 440, para não derrubar a outra instância em loop rápido. */
const REPLACED_RECONNECT_DELAY_MS = 20_000;

/** Tentativas seguidas de reconexão após 440 antes de desistir. */
const REPLACED_MAX_ATTEMPTS = 6;

class WhatsAppService {
  private connections = new Map<string, TenantConnection>();
  private replacedAttempts = new Map<string, number>();
  private sentMessages = new Map<string, proto.IMessage>();
  private reminderInterval: NodeJS.Timeout | null = null;

  init() {
    this.restoreSavedSessions().catch((err) => {
      logger.error({ err }, 'Erro ao restaurar sessões do WhatsApp');
    });

    // Atualiza mensagens de boas-vindas legadas no banco para o novo padrão com IA
    prisma.whatsAppConfig.updateMany({
      where: {
        OR: [
          { welcomeMessage: { contains: 'assistente virtual' } },
          { welcomeMessage: 'Olá! Bem-vindo.' },
          { welcomeMessage: 'Olá! Bem-vindo(a).' },
        ],
      },
      data: {
        welcomeMessage: DEFAULT_WHATSAPP_MESSAGES.welcomeMessage,
      },
    }).catch((err) => {
      logger.warn({ err }, 'Aviso ao atualizar mensagens de boas-vindas legadas');
    });

    // Iniciar checagem periódica de lembretes automáticos, expiração de pesquisas e fechamento de conversas inativas a cada 60 segundos
    if (!this.reminderInterval) {
      this.reminderInterval = setInterval(() => {
        this.checkAndSendReminders().catch((err) => {
          logger.error({ err }, 'Erro no worker de lembretes do WhatsApp');
        });
        cleanExpiredSurveys().catch((err) => {
          logger.error({ err }, 'Erro ao limpar pesquisas expiradas do WhatsApp');
        });
        this.checkAndCloseInactiveConversations().catch((err) => {
          logger.error({ err }, 'Erro ao fechar conversas inativas do WhatsApp');
        });
      }, 60 * 1000);
    }
  }

  async restoreSavedSessions() {
    const activeConfigs = await prisma.whatsAppConfig.findMany({
      where: { status: 'CONNECTED' },
      select: { tenantId: true },
    });
    for (const cfg of activeConfigs) {
      logger.info({ tenantId: cfg.tenantId }, 'Restaurando sessão salva do WhatsApp...');
      this.connectTenant(cfg.tenantId).catch((err) => {
        logger.error({ err, tenantId: cfg.tenantId }, 'Falha ao restaurar sessão');
      });
    }
  }

  getConnection(tenantId: string): TenantConnection {
    return (
      this.connections.get(tenantId) || {
        socket: null,
        qrCode: null,
        qrDataUrl: null,
        status: 'DISCONNECTED',
        phoneNumber: null,
      }
    );
  }

  async connectTenant(tenantId: string): Promise<TenantConnection> {
    const existing = this.connections.get(tenantId);
    if (existing?.socket && existing.status === 'CONNECTED') {
      return existing;
    }

    if (existing?.socket) {
      try {
        existing.socket.ev.removeAllListeners('connection.update');
        existing.socket.ev.removeAllListeners('creds.update');
        existing.socket.ev.removeAllListeners('messages.upsert');
        existing.socket.end(undefined);
      } catch {
        // Ignora
      }
    }

    const { state, saveCreds, clearSession } = await usePostgresAuthState(tenantId);

    const conn: TenantConnection = {
      socket: null,
      qrCode: null,
      qrDataUrl: null,
      status: 'CONNECTING',
      phoneNumber: null,
    };
    this.connections.set(tenantId, conn);

    await prisma.whatsAppConfig.upsert({
      where: { tenantId },
      update: { status: 'CONNECTING' },
      create: {
        tenantId,
        status: 'CONNECTING',
        welcomeMessage: DEFAULT_WHATSAPP_MESSAGES.welcomeMessage,
        confirmationMessage: DEFAULT_WHATSAPP_MESSAGES.confirmationMessage,
        reminderMessage: DEFAULT_WHATSAPP_MESSAGES.reminderMessage,
        cancellationMessage: DEFAULT_WHATSAPP_MESSAGES.cancellationMessage,
      },
    });

    const baileysLogger = logger.child({ class: 'baileys', tenantId });
    baileysLogger.level = 'warn';

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      logger: baileysLogger,
      printQRInTerminal: false,
      browser: ['BarberFlow', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async (key) => (key.id ? this.sentMessages.get(key.id) : undefined),
    });

    conn.socket = socket;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        conn.qrCode = qr;
        conn.qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
        conn.status = 'QR_PENDING';
        await prisma.whatsAppConfig.update({
          where: { tenantId },
          data: { status: 'QR_PENDING' },
        });
        logger.info({ tenantId }, 'QR Code do WhatsApp gerado para salão');
      }

      if (connection === 'open') {
        this.replacedAttempts.delete(tenantId);
        conn.status = 'CONNECTED';
        conn.qrCode = null;
        conn.qrDataUrl = null;

        const rawPhone = socket.user?.id?.replace(/[:@].*$/, '') || null;
        conn.phoneNumber = rawPhone ? normalizePhone(rawPhone) : null;

        await prisma.whatsAppConfig.update({
          where: { tenantId },
          data: {
            status: 'CONNECTED',
            phoneNumber: conn.phoneNumber,
            lastConnectedAt: new Date(),
            lastError: null,
          },
        });

        logger.info({ tenantId, phone: conn.phoneNumber }, 'WhatsApp conectado com sucesso');
      }

      if (connection === 'close') {
        const error = lastDisconnect?.error as { output?: { statusCode?: number }; message?: string } | undefined;
        const statusCode = error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === CONNECTION_REPLACED_CODE;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
        const shouldReconnect = !isLoggedOut && !isReplaced;

        logger.warn({ tenantId, statusCode, isRestartRequired, isReplaced, shouldReconnect }, 'WhatsApp conexão fechada');

        if (isReplaced) {
          // Outra instância assumiu a sessão (comum durante deploy com dois containers).
          // Reconecta com espera maior: se a outra instância for encerrada, esta volta a operar;
          // se ela continuar viva, o limite de tentativas evita o loop infinito.
          const attempts = (this.replacedAttempts.get(tenantId) ?? 0) + 1;
          this.replacedAttempts.set(tenantId, attempts);
          conn.socket = null;

          if (attempts > REPLACED_MAX_ATTEMPTS) {
            logger.error({ tenantId, attempts }, 'Sessão do WhatsApp continua em uso por outra instância; desistindo');
            this.replacedAttempts.delete(tenantId);
            conn.status = 'DISCONNECTED';
            await prisma.whatsAppConfig.update({
              where: { tenantId },
              data: {
                status: 'DISCONNECTED',
                lastDisconnectedAt: new Date(),
                lastError: 'Sessão em uso por outra instância. Reconecte o aparelho.',
              },
            });
            return;
          }

          logger.warn({ tenantId, attempts }, 'Sessão substituída por outra instância; tentando reconectar em instantes');
          conn.status = 'CONNECTING';
          setTimeout(() => {
            this.connectTenant(tenantId).catch((err) => {
              logger.error({ err, tenantId }, 'Erro ao reconectar WhatsApp após sessão substituída');
            });
          }, REPLACED_RECONNECT_DELAY_MS);
          return;
        }

        if (isLoggedOut) {
          conn.status = 'DISCONNECTED';
          conn.socket = null;
          conn.qrCode = null;
          conn.qrDataUrl = null;
          conn.phoneNumber = null;
          await clearSession();
          await prisma.whatsAppConfig.update({
            where: { tenantId },
            data: {
              status: 'DISCONNECTED',
              phoneNumber: null,
              lastDisconnectedAt: new Date(),
              lastError: 'Desconectado pelo usuário no WhatsApp',
            },
          });
        } else if (shouldReconnect) {
          conn.status = 'CONNECTING';
          await prisma.whatsAppConfig.update({
            where: { tenantId },
            data: {
              status: 'CONNECTING',
              lastError: isRestartRequired ? null : (error?.message || 'Reconectando...'),
            },
          });

          // Reconexão automática usando credenciais salvas no Postgres (crítico para código 515 pós-pareamento de QR)
          const delayMs = isRestartRequired ? 1000 : 3000;
          setTimeout(() => {
            this.connectTenant(tenantId).catch((err) => {
              logger.error({ err, tenantId }, 'Erro ao reconectar WhatsApp após fechamento');
            });
          }, delayMs);
        } else {
          conn.status = 'DISCONNECTED';
          await prisma.whatsAppConfig.update({
            where: { tenantId },
            data: {
              status: 'DISCONNECTED',
              lastDisconnectedAt: new Date(),
              lastError: error?.message || 'Conexão interrompida',
            },
          });
        }
      }
    });

    socket.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates) {
        if (!key.fromMe || update.status === undefined || update.status === null) continue;
        // 1=PENDING, 2=SERVER_ACK, 3=DELIVERY_ACK, 4=READ
        logger.info({ tenantId, to: key.remoteJid, messageId: key.id, status: update.status }, 'Status de mensagem enviada atualizado');
      }
    });

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      logger.info({ tenantId, type, count: messages.length }, 'WhatsApp messages.upsert recebido');
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const senderJid = msg.key.remoteJid;

        if (!msg.message) {
          // Mensagem recebida mas não decifrada (stub CIPHERTEXT): sessão Signal dessincronizada.
          logger.warn(
            { tenantId, senderJid, stubType: msg.messageStubType, stubParams: msg.messageStubParameters },
            'Mensagem recebida sem conteúdo (falha de descriptografia)',
          );
          continue;
        }

        if (!senderJid || senderJid.endsWith('@g.us')) continue; // Ignora grupos

        // Extrai texto da mensagem
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        if (!text) {
          logger.info({ tenantId, senderJid }, 'Mensagem sem texto ignorada pelo bot');
          continue;
        }

        const senderName = msg.pushName || undefined;
        // Contatos em @lid não expõem o telefone no JID; o Baileys fornece o número em remoteJidAlt.
        const phoneJid = senderJid.endsWith('@lid') ? msg.key.remoteJidAlt || undefined : senderJid;

        logger.info({ tenantId, senderJid, phoneJid }, 'Mensagem de texto recebida pelo bot');

        try {
          await handleIncomingMessage({
            tenantId,
            senderJid,
            phoneJid,
            senderName,
            text,
            reply: async (replyText: string) => {
              const sent = await socket.sendMessage(senderJid, { text: replyText });
              this.rememberSent(sent);
            },
          });
        } catch (err) {
          logger.error({ err, tenantId, senderJid }, 'Erro ao processar mensagem do WhatsApp');
        }
      }
    });

    return conn;
  }

  async disconnectTenant(tenantId: string): Promise<void> {
    const conn = this.connections.get(tenantId);
    if (conn?.socket) {
      try {
        await conn.socket.logout();
      } catch {
        // Ignora erro no logout se socket já estiver fechado
      }
    }
    const { clearSession } = await usePostgresAuthState(tenantId);
    await clearSession();

    this.connections.delete(tenantId);

    await prisma.whatsAppConfig.update({
      where: { tenantId },
      data: {
        status: 'DISCONNECTED',
        phoneNumber: null,
        lastDisconnectedAt: new Date(),
      },
    });
  }

  async sendMessage(tenantId: string, phoneOrJid: string, text: string): Promise<boolean> {
    const conn = this.connections.get(tenantId);
    if (!conn?.socket || conn.status !== 'CONNECTED') {
      logger.warn({ tenantId, memoryStatus: conn?.status ?? 'SEM_CONEXAO', hasSocket: Boolean(conn?.socket) }, 'Envio ignorado: WhatsApp não está conectado neste servidor');
      return false;
    }

    let jid = phoneOrJid;
    if (!phoneOrJid.includes('@')) {
      const cleanPhone = normalizePhone(phoneOrJid);
      if (!cleanPhone) return false;

      // Confirma que o número existe no WhatsApp e usa o JID oficial retornado (ex.: ajusta o 9º dígito).
      jid = `${cleanPhone}@s.whatsapp.net`;
      try {
        const [lookup] = (await conn.socket.onWhatsApp(jid)) ?? [];
        if (lookup && !lookup.exists) {
          logger.warn({ tenantId, phone: cleanPhone }, 'Número não encontrado no WhatsApp');
          throw HttpError.badRequest('Este número não foi encontrado no WhatsApp. Confira o DDD e o número.');
        }
        if (lookup?.jid) jid = lookup.jid;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        logger.warn({ err, tenantId, phone: cleanPhone }, 'Falha ao validar número com onWhatsApp; usando JID padrão');
      }
    }

    const sent = await conn.socket.sendMessage(jid, { text });
    this.rememberSent(sent);
    logger.info({ tenantId, to: jid, messageId: sent?.key?.id }, 'Mensagem enviada ao servidor do WhatsApp');
    return true;
  }

  /**
   * Guarda as mensagens enviadas: o Baileys precisa delas (getMessage) para reenviar quando o
   * destinatário não consegue decifrar ("Aguardando mensagem").
   */
  private rememberSent(sent: proto.IWebMessageInfo | undefined) {
    const id = sent?.key?.id;
    if (!id || !sent?.message) return;
    this.sentMessages.set(id, sent.message);
    if (this.sentMessages.size > SENT_MESSAGES_CACHE_LIMIT) {
      const oldest = this.sentMessages.keys().next().value;
      if (oldest) this.sentMessages.delete(oldest);
    }
  }

  /** Checa e envia lembretes automáticos antes dos atendimentos */
  async checkAndSendReminders(): Promise<void> {
    const configs = await prisma.whatsAppConfig.findMany({
      where: {
        status: 'CONNECTED',
        reminderEnabled: true,
      },
      include: {
        tenant: true,
      },
    });

    for (const cfg of configs) {
      const conn = this.connections.get(cfg.tenantId);
      if (!conn?.socket || conn.status !== 'CONNECTED') continue;

      const hoursBefore = cfg.reminderHoursBefore || 2;
      const targetTimeStart = DateTime.now().plus({ hours: hoursBefore }).minus({ minutes: 5 }).toJSDate();
      const targetTimeEnd = DateTime.now().plus({ hours: hoursBefore }).plus({ minutes: 5 }).toJSDate();

      const upcoming = await prisma.appointment.findMany({
        where: {
          tenantId: cfg.tenantId,
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          reminderSentAt: null,
          startAt: {
            gte: targetTimeStart,
            lte: targetTimeEnd,
          },
          customer: {
            phone: { not: null },
          },
        },
        include: {
          customer: true,
          service: true,
          professional: true,
        },
      });

      for (const app of upcoming) {
        if (!app.customer.phone) continue;

        const dt = DateTime.fromJSDate(app.startAt).setZone(cfg.tenant.timezone);
        const reminderText = renderTemplate(cfg.reminderMessage, {
          nome: app.customer.name,
          salao: cfg.tenant.name,
          servico: app.service.name,
          profissional: app.professional.name,
          data: dt.toFormat('dd/LL/yyyy'),
          hora: dt.toFormat('HH:mm'),
          valor: formatCurrency(app.priceCents),
        });

        try {
          const sent = await this.sendMessage(cfg.tenantId, app.customer.phone, reminderText);
          if (sent) {
            await prisma.appointment.update({
              where: { id: app.id },
              data: { reminderSentAt: new Date() },
            });
            logger.info({ tenantId: cfg.tenantId, appointmentId: app.id }, 'Lembrete de WhatsApp enviado');
          }
        } catch (err) {
          logger.error({ err, tenantId: cfg.tenantId, appointmentId: app.id }, 'Falha ao enviar lembrete');
        }
      }
    }
  }

  /**
   * Encerra conversas inativas há mais de 1 hora sem resposta do cliente,
   * enviando a mensagem amigável de encerramento e liberando a conversa para um novo contato.
   */
  async checkAndCloseInactiveConversations(): Promise<number> {
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const oneHourAgo = new Date(now - ONE_HOUR_MS);
    const twentyFourHoursAgo = new Date(now - TWENTY_FOUR_HOURS_MS);

    try {
      const candidates = await prisma.whatsAppConversation.findMany({
        where: {
          lastMessageAt: {
            gte: twentyFourHoursAgo,
            lte: oneHourAgo,
          },
        },
        include: {
          tenant: { select: { id: true, name: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      let closedCount = 0;

      for (const conv of candidates) {
        const ctx = (conv.context as Record<string, any>) || {};
        if (ctx.inactivityClosed) continue;
        if (conv.state.startsWith('SURVEY_')) continue;

        const lastMsg = conv.messages[0];
        // Encerra apenas se a última mensagem enviada foi nossa (fromMe = true)
        // ou seja: o bot ou atendente enviou mensagem e o cliente não respondeu mais após 1 hora
        if (lastMsg && lastMsg.fromMe) {
          const rawTemplate = DEFAULT_WHATSAPP_MESSAGES.inactivityMessage;
          const text = renderTemplate(rawTemplate, {
            salao: conv.tenant.name,
          });

          const sent = await this.sendMessage(conv.tenantId, conv.contactJid, text).catch((err) => {
            logger.warn({ err, tenantId: conv.tenantId, contactJid: conv.contactJid }, 'Erro ao enviar mensagem de inatividade');
            return false;
          });

          if (sent) {
            await prisma.whatsAppMessage.create({
              data: {
                tenantId: conv.tenantId,
                conversationId: conv.id,
                contactJid: conv.contactJid,
                fromMe: true,
                senderType: 'BOT',
                senderName: conv.tenant.name,
                body: text,
                status: 'SENT',
              },
            });

            if (conv.isAttendant) {
              await prisma.whatsAppMessage.create({
                data: {
                  tenantId: conv.tenantId,
                  conversationId: conv.id,
                  contactJid: conv.contactJid,
                  fromMe: true,
                  senderType: 'SYSTEM',
                  body: `🔔 Atendimento encerrado automaticamente por inatividade (1 hora sem resposta do cliente).`,
                  status: 'SENT',
                },
              });
            }

            await prisma.whatsAppConversation.update({
              where: { id: conv.id },
              data: {
                state: 'MENU',
                isAttendant: false,
                lastMessage: text,
                lastMessageAt: new Date(),
                context: {
                  ...ctx,
                  inactivityClosed: true,
                  closedAt: now,
                },
              },
            });

            closedCount++;
          }
        }
      }

      if (closedCount > 0) {
        logger.info({ closedCount }, 'Conversas encerradas por inatividade (1 hora sem resposta)');
      }

      return closedCount;
    } catch (err) {
      logger.error({ err }, 'Erro ao processar encerramento de conversas inativas');
      return 0;
    }
  }
}

export const whatsAppService = new WhatsAppService();
