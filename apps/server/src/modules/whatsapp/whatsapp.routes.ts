import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { normalizePhone, renderTemplate } from '../../lib/utils.js';
import { whatsAppService } from './whatsapp.service.js';
import { requireRole } from '../../middlewares/auth.js';
import { findCustomerForContact, formatAttendantShortName } from './whatsapp-customer.js';
import { DEFAULT_WHATSAPP_MESSAGES } from '../../lib/defaults.js';

export const whatsAppRouter = Router();

const updateConfigSchema = z.object({
  botEnabled: z.boolean().optional(),
  welcomeMessage: z.string().trim().min(5).optional(),
  confirmationMessage: z.string().trim().min(5).optional(),
  reminderMessage: z.string().trim().min(5).optional(),
  cancellationMessage: z.string().trim().min(5).optional(),
  reminderEnabled: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(48).optional(),
  attendantSurveyEnabled: z.boolean().optional(),
  attendantSurveyMessage: z.string().trim().min(5).optional(),
  serviceSurveyEnabled: z.boolean().optional(),
  serviceSurveyMessage: z.string().trim().min(5).optional(),
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
  res.json({
    config: {
      ...config,
      attendantSurveyMessage: config.attendantSurveyMessage || DEFAULT_WHATSAPP_MESSAGES.attendantSurveyMessage,
      serviceSurveyMessage: config.serviceSurveyMessage || DEFAULT_WHATSAPP_MESSAGES.serviceSurveyMessage,
    },
  });
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

// Listar conversas ativas do WhatsApp com cruzamento de dados de Clientes
whatsAppRouter.get('/conversations', async (req, res) => {
  const tenantId = req.tenantId!;
  const rawConversations = await prisma.whatsAppConversation.findMany({
    where: { tenantId },
    orderBy: { lastMessageAt: 'desc' },
    take: 60,
  });

  // Cruzamento dinâmico com a base cadastral de Clientes (/customers)
  const conversations = await Promise.all(
    rawConversations.map(async (conv) => {
      const customer = await findCustomerForContact(tenantId, conv.contactJid, conv.phone);
      if (customer && customer.name && customer.name.trim() !== 'Cliente' && !/^\d+$/.test(customer.name.trim())) {
        // Se a conversa ainda estiver salva com número ou genérico, atualiza em background
        if (conv.contactName !== customer.name) {
          prisma.whatsAppConversation
            .update({
              where: { id: conv.id },
              data: { contactName: customer.name },
            })
            .catch(() => {});
        }
        return {
          ...conv,
          contactName: customer.name,
          customer: {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
          },
        };
      }
      return conv;
    })
  );

  return res.json({ conversations });
});

// Obter total de mensagens não lidas e conversas pendentes (para notificações globais)
whatsAppRouter.get('/unread', async (req, res) => {
  const tenantId = req.tenantId!;

  const unreadConversations = await prisma.whatsAppConversation.findMany({
    where: {
      tenantId,
      unreadCount: { gt: 0 },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 10,
    select: {
      id: true,
      contactName: true,
      phone: true,
      contactJid: true,
      lastMessage: true,
      lastMessageAt: true,
      unreadCount: true,
      isAttendant: true,
      state: true,
    },
  });

  const totalUnreadMessages = unreadConversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Cruzamento com Customer para enriquecer o nome caso contactName seja genérico
  const enriched = await Promise.all(
    unreadConversations.map(async (conv) => {
      const customer = await findCustomerForContact(tenantId, conv.contactJid, conv.phone);
      const name =
        customer && customer.name && customer.name.trim() !== 'Cliente' && !/^\d+$/.test(customer.name.trim())
          ? customer.name
          : conv.contactName || conv.phone || 'Cliente';

      return {
        ...conv,
        contactName: name,
        customer: customer ? { id: customer.id, name: customer.name } : null,
      };
    })
  );

  return res.json({
    unreadCount: totalUnreadMessages,
    unreadConversationsCount: unreadConversations.length,
    conversations: enriched,
  });
});

// Buscar histórico de mensagens de uma conversa específica com cruzamento de dados do cliente
// e trazendo prioritariamente o histórico de atendimento da data atual (hoje)
whatsAppRouter.get('/conversations/:id/messages', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;
  const loadAll = req.query.all === 'true';

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

  // Cruzamento com cliente
  const customer = await findCustomerForContact(tenantId, conversation.contactJid, conversation.phone);
  let resolvedContactName = conversation.contactName;
  if (customer && customer.name && customer.name.trim() !== 'Cliente' && !/^\d+$/.test(customer.name.trim())) {
    resolvedContactName = customer.name;
    if (conversation.contactName !== customer.name) {
      prisma.whatsAppConversation
        .update({
          where: { id: conversation.id },
          data: { contactName: customer.name },
        })
        .catch(() => {});
    }
  }

  // Define o início do dia atual com base no fuso horário do salão
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const tz = tenant?.timezone || 'America/Sao_Paulo';
  const startOfToday = DateTime.now().setZone(tz).startOf('day').toJSDate();

  const totalMessagesCount = await prisma.whatsAppMessage.count({
    where: { conversationId: id, tenantId },
  });

  const todayMessagesCount = await prisma.whatsAppMessage.count({
    where: { conversationId: id, tenantId, createdAt: { gte: startOfToday } },
  });

  let messages;
  let hasOlderMessages = false;

  if (loadAll) {
    messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id, tenantId },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    hasOlderMessages = false;
  } else if (todayMessagesCount > 0) {
    // Traz o histórico do atendimento da data atual
    messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id, tenantId, createdAt: { gte: startOfToday } },
      orderBy: { createdAt: 'asc' },
    });
    hasOlderMessages = totalMessagesCount > todayMessagesCount;
  } else {
    // Se hoje não houver mensagens ainda, traz as últimas mensagens anteriores
    messages = await prisma.whatsAppMessage.findMany({
      where: { conversationId: id, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    messages.reverse();
    hasOlderMessages = totalMessagesCount > messages.length;
  }

  return res.json({
    conversation: {
      ...conversation,
      contactName: resolvedContactName,
      customer: customer || null,
    },
    messages,
    hasOlderMessages,
    totalMessagesCount,
    todayMessagesCount,
  });
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

  // Identifica o nome do atendente logado no sistema
  let rawSenderName = 'Atendente';
  if (req.auth?.userId) {
    const u = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { name: true },
    });
    if (u?.name) rawSenderName = u.name;
  }

  // Formata o nome para exibição (ex: Guilherme Jorge Azevedo Andrade -> Guilherme Jorge)
  const attendantShortName = formatAttendantShortName(rawSenderName);

  // Formata a mensagem com o nome do atendente antes de enviar ao WhatsApp:
  // EX:
  // *Guilherme Jorge:*
  // opa
  const cleanInput = text.trim();
  const escapedName = attendantShortName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alreadyPrefixed = new RegExp(`^(\\*?${escapedName}:?\\*?)\\s*`, 'i').test(cleanInput);

  const outboundText = alreadyPrefixed ? cleanInput : `*${attendantShortName}:*\n${cleanInput}`;

  const sent = await whatsAppService.sendMessage(tenantId, target, outboundText);
  if (!sent) {
    throw HttpError.badRequest('Falha ao enviar mensagem. Certifique-se de que o WhatsApp do salão está conectado em /whatsapp.');
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      tenantId,
      conversationId: id,
      contactJid: conversation.contactJid,
      fromMe: true,
      senderType: 'ATTENDANT',
      senderName: attendantShortName,
      body: outboundText,
      status: 'SENT',
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id },
    data: {
      lastMessage: `${attendantShortName}: ${cleanInput}`,
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

// Fechar chat do atendente, devolver ao bot e disparar pesquisa de satisfação referente ao atendimento (2 Níveis)
whatsAppRouter.post('/conversations/:id/close', async (req, res) => {
  const tenantId = req.tenantId!;
  const { id } = req.params;

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id, tenantId },
  });
  if (!conversation) throw HttpError.notFound('Conversa não encontrada');

  const target = conversation.contactJid || conversation.phone;
  if (!target) throw HttpError.badRequest('Contato não possui identificador do WhatsApp válido');

  // Identifica o atendente logado no sistema
  let rawSenderName = 'Atendente';
  if (req.auth?.userId) {
    const u = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { name: true },
    });
    if (u?.name) rawSenderName = u.name;
  }
  const attendantShortName = formatAttendantShortName(rawSenderName);

  const [waConfig, tenant] = await Promise.all([
    prisma.whatsAppConfig.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  // Se a pesquisa de atendimento estiver DESATIVADA nas configurações do salão:
  if (waConfig?.attendantSurveyEnabled === false) {
    const exitNotice = `👋 *Atendimento Encerrado*\nSeu atendimento com *${attendantShortName}* foi finalizado. O assistente virtual da *${tenant?.name || 'BarberFlow'}* foi reativado.\n\nEnvie *menu* quando desejar ver opções e horários! 💈`;
    await whatsAppService.sendMessage(tenantId, target, exitNotice).catch(() => null);

    await prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId: id,
        contactJid: conversation.contactJid,
        fromMe: true,
        senderType: 'SYSTEM',
        body: `Atendimento humano encerrado por ${attendantShortName}. Conversa devolvida ao robô.`,
        status: 'SENT',
      },
    });

    await prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId: id,
        contactJid: conversation.contactJid,
        fromMe: true,
        senderType: 'BOT',
        body: exitNotice,
        status: 'SENT',
      },
    });

    const updated = await prisma.whatsAppConversation.update({
      where: { id },
      data: {
        isAttendant: false,
        state: 'MENU',
        context: {},
        lastMessage: exitNotice,
        lastMessageAt: new Date(),
      },
    });

    return res.json({ success: true, conversation: updated, surveySent: false });
  }

  // Pesquisa de Satisfação ativada: renderiza com o template configurado
  const rawTemplate = waConfig?.attendantSurveyMessage || DEFAULT_WHATSAPP_MESSAGES.attendantSurveyMessage;
  const surveyMessage = renderTemplate(rawTemplate, {
    atendente: attendantShortName,
    nome: conversation.contactName || 'Cliente',
    salao: tenant?.name || 'nosso salão',
  });

  // Envia no WhatsApp se conectado
  await whatsAppService.sendMessage(tenantId, target, surveyMessage).catch(() => null);

  // Registra avisos no histórico
  const systemNotice = `Atendimento humano encerrado por ${attendantShortName}. Pesquisa de satisfação enviada ao cliente.`;
  await prisma.whatsAppMessage.create({
    data: {
      tenantId,
      conversationId: id,
      contactJid: conversation.contactJid,
      fromMe: true,
      senderType: 'SYSTEM',
      body: systemNotice,
      status: 'SENT',
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      tenantId,
      conversationId: id,
      contactJid: conversation.contactJid,
      fromMe: true,
      senderType: 'BOT',
      body: surveyMessage,
      status: 'SENT',
    },
  });

  // Atualiza conversa para liberar para o bot em modo de pesquisa de satisfação do atendimento
  const updated = await prisma.whatsAppConversation.update({
    where: { id },
    data: {
      isAttendant: false,
      state: 'SURVEY_ATTENDANT_RATING',
      context: {
        surveyType: 'ATTENDANT',
        surveyStartedAt: Date.now(),
        attendantName: attendantShortName,
      },
      lastMessage: surveyMessage,
      lastMessageAt: new Date(),
    },
  });

  return res.json({ success: true, conversation: updated, surveySent: true });
});

// Listar pesquisas de satisfação do salão
whatsAppRouter.get('/surveys', async (req, res) => {
  const tenantId = req.tenantId!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      professional: { select: { id: true, name: true } },
      appointment: { select: { id: true, startAt: true, service: { select: { name: true } } } },
    },
  });

  const total = await prisma.satisfactionSurvey.count({ where: { tenantId } });
  const avg = await prisma.satisfactionSurvey.aggregate({
    where: { tenantId },
    _avg: { rating: true },
  });

  return res.json({
    surveys,
    total,
    averageRating: avg._avg.rating ? Number(avg._avg.rating.toFixed(2)) : null,
  });
});
