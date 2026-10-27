import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { normalizePhone } from '../../lib/utils.js';
import { whatsAppService } from './whatsapp.service.js';
import { requireRole } from '../../middlewares/auth.js';

export const whatsAppRouter = Router();

const updateConfigSchema = z.object({
  botEnabled: z.boolean().optional(),
  welcomeMessage: z.string().trim().min(5).optional(),
  confirmationMessage: z.string().trim().min(5).optional(),
  reminderMessage: z.string().trim().min(5).optional(),
  cancellationMessage: z.string().trim().min(5).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(48).optional(),
});

const sendTestSchema = z.object({
  phone: z.string().trim().min(8, 'Informe o número de telefone'),
  message: z.string().trim().min(1, 'Mensagem não pode ser vazia'),
});

// Status da conexão e QR code
whatsAppRouter.get('/status', async (req, res) => {
  const tenantId = req.tenantId!;
  const conn = whatsAppService.getConnection(tenantId);
  const config = await prisma.whatsAppConfig.findUnique({ where: { tenantId } });

  res.json({
    status: conn.status !== 'DISCONNECTED' ? conn.status : (config?.status ?? 'DISCONNECTED'),
    qrCode: conn.qrCode,
    qrDataUrl: conn.qrDataUrl,
    phoneNumber: conn.phoneNumber || config?.phoneNumber,
    lastConnectedAt: config?.lastConnectedAt,
    lastDisconnectedAt: config?.lastDisconnectedAt,
    lastError: config?.lastError,
  });
});

// Solicitar conexão / geração de QR Code
whatsAppRouter.post('/connect', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  const conn = await whatsAppService.connectTenant(tenantId);

  res.json({
    status: conn.status,
    qrDataUrl: conn.qrDataUrl,
    phoneNumber: conn.phoneNumber,
  });
});

// Desconectar / Deslogar número
whatsAppRouter.post('/disconnect', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const tenantId = req.tenantId!;
  await whatsAppService.disconnectTenant(tenantId);
  res.json({ success: true, status: 'DISCONNECTED' });
});

// Buscar configurações de mensagens automáticas
whatsAppRouter.get('/config', async (req, res) => {
  const tenantId = req.tenantId!;
  const config = await prisma.whatsAppConfig.findUnique({
    where: { tenantId },
  });
  if (!config) throw HttpError.notFound('Configuração do WhatsApp não encontrada');
  res.json({ config });
});

// Atualizar mensagens e regras do bot
whatsAppRouter.patch('/config', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const data = updateConfigSchema.parse(req.body);
  const tenantId = req.tenantId!;

  const config = await prisma.whatsAppConfig.update({
    where: { tenantId },
    data,
  });

  res.json({ config });
});

// Envio de mensagem de teste
whatsAppRouter.post('/send-test', requireRole('OWNER', 'MANAGER'), async (req, res) => {
  const { phone, message } = sendTestSchema.parse(req.body);
  const tenantId = req.tenantId!;

  const normalized = normalizePhone(phone);
  if (!normalized) throw HttpError.badRequest('Número de telefone inválido');

  const sent = await whatsAppService.sendMessage(tenantId, normalized, message);
  if (!sent) {
    throw HttpError.badRequest('Não foi possível enviar a mensagem. Verifique se o WhatsApp está conectado.');
  }

  res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
});

// ───────────────────────────── Chat / Atendimento Humano ─────────────────────────────

// Listar conversas ativas do WhatsApp
whatsAppRouter.get('/conversations', async (req, res) => {
  const tenantId = req.tenantId!;
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { tenantId },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });

  return res.json({ conversations });
});

// Buscar histórico de mensagens de uma conversa específica
whatsAppRouter.get('/conversations/:id/messages', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id, tenantId },
  });
  if (!conversation) throw HttpError.notFound('Conversa não encontrada');

  if (conversation.unreadCount > 0) {
    await prisma.whatsAppConversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
  }

  const messages = await prisma.whatsAppMessage.findMany({
    where: { conversationId: id, tenantId },
    orderBy: { createdAt: 'asc' },
    take: 120,
  });

  return res.json({ conversation, messages });
});

const sendChatMessageSchema = z.object({
  text: z.string().trim().min(1, 'A mensagem não pode ser vazia'),
});

// Atendente envia mensagem no WhatsApp para o cliente
whatsAppRouter.post('/conversations/:id/messages', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;
  const { text } = sendChatMessageSchema.parse(req.body);

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id, tenantId },
  });
  if (!conversation) throw HttpError.notFound('Conversa não encontrada');

  const target = conversation.contactJid || conversation.phone;
  if (!target) throw HttpError.badRequest('Contato não possui identificador do WhatsApp válido');

  const sent = await whatsAppService.sendMessage(tenantId, target, text);
  if (!sent) {
    throw HttpError.badRequest('Falha ao enviar mensagem. Certifique-se de que o WhatsApp do salão está conectado em /whatsapp.');
  }

  let senderName = 'Atendente';
  if (req.auth?.userId) {
    const u = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { name: true },
    });
    if (u?.name) senderName = u.name;
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      tenantId,
      conversationId: id,
      contactJid: conversation.contactJid,
      fromMe: true,
      senderType: 'ATTENDANT',
      senderName,
      body: text,
      status: 'SENT',
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id },
    data: {
      lastMessage: text,
      lastMessageAt: new Date(),
      isAttendant: true,
      state: 'HUMAN_ATTENDANT',
    },
  });

  return res.json({ success: true, message });
});

const transferConversationSchema = z.object({
  toAttendant: z.boolean(),
});

// Transferir conversa para atendente ou devolver para o robô
whatsAppRouter.patch('/conversations/:id/transfer', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;
  const { toAttendant } = transferConversationSchema.parse(req.body);

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id, tenantId },
  });
  if (!conversation) throw HttpError.notFound('Conversa não encontrada');

  const target = conversation.contactJid || conversation.phone;

  if (toAttendant) {
    const notifyText = '🔔 *Atendimento Humano:* Olá! Um atendente da equipe assumiu esta conversa e está pronto para te ajudar.';
    if (target) {
      await whatsAppService.sendMessage(tenantId, target, notifyText).catch(() => null);
      await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: id,
          contactJid: conversation.contactJid,
          fromMe: true,
          senderType: 'SYSTEM',
          body: notifyText,
          status: 'SENT',
        },
      });
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: {
        isAttendant: true,
        state: 'HUMAN_ATTENDANT',
        lastMessage: notifyText,
        lastMessageAt: new Date(),
      },
    });

    return res.json({ success: true, conversation: updated });
  } else {
    const notifyText = '🤖 *Atendimento Automático Retomado:* O assistente virtual do BarberFlow foi reativado. Digite *menu* para ver os horários e serviços.';
    if (target) {
      await whatsAppService.sendMessage(tenantId, target, notifyText).catch(() => null);
      await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: id,
          contactJid: conversation.contactJid,
          fromMe: true,
          senderType: 'SYSTEM',
          body: notifyText,
          status: 'SENT',
        },
      });
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: {
        isAttendant: false,
        state: 'MENU',
        context: {},
        lastMessage: notifyText,
        lastMessageAt: new Date(),
      },
    });

    return res.json({ success: true, conversation: updated });
  }
});
