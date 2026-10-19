import makeWASocket, {
  DisconnectReason,
  type WASocket,
  proto,
} from 'baileys';
import QRCode from 'qrcode';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { formatCurrency, normalizePhone, renderTemplate } from '../../lib/utils.js';
import { usePostgresAuthState } from './baileys-session.js';
import { handleIncomingMessage } from './whatsapp-bot.js';

interface TenantConnection {
  socket: WASocket | null;
  qrCode: string | null;
  qrDataUrl: string | null;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED';
  phoneNumber: string | null;
}

class WhatsAppService {
  private connections = new Map<string, TenantConnection>();
  private reminderInterval: NodeJS.Timeout | null = null;

  init() {
    this.restoreSavedSessions().catch((err) => {
      logger.error({ err }, 'Erro ao restaurar sessões do WhatsApp');
    });

    // Iniciar checagem periódica de lembretes automáticos a cada 60 segundos
    if (!this.reminderInterval) {
      this.reminderInterval = setInterval(() => {
        this.checkAndSendReminders().catch((err) => {
          logger.error({ err }, 'Erro no worker de lembretes do WhatsApp');
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
        welcomeMessage: 'Olá! Bem-vindo.',
        confirmationMessage: 'Agendamento confirmado.',
        reminderMessage: 'Lembrete de agendamento.',
        cancellationMessage: 'Agendamento cancelado.',
      },
    });

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['BarberFlow', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
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
        const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
        const shouldReconnect = !isLoggedOut;

        logger.warn({ tenantId, statusCode, isRestartRequired, shouldReconnect }, 'WhatsApp conexão fechada');

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

    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const senderJid = msg.key.remoteJid;
        if (!senderJid || senderJid.endsWith('@g.us')) continue; // Ignora grupos

        // Extrai texto da mensagem
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        if (!text) continue;

        const senderName = msg.pushName || undefined;

        try {
          await handleIncomingMessage({
            tenantId,
            senderJid,
            senderName,
            text,
            reply: async (replyText: string) => {
              await socket.sendMessage(senderJid, { text: replyText });
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

  async sendMessage(tenantId: string, phone: string, text: string): Promise<boolean> {
    const conn = this.connections.get(tenantId);
    if (!conn?.socket || conn.status !== 'CONNECTED') {
      return false;
    }

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) return false;

    const jid = `${cleanPhone}@s.whatsapp.net`;
    await conn.socket.sendMessage(jid, { text });
    return true;
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
}

export const whatsAppService = new WhatsAppService();
