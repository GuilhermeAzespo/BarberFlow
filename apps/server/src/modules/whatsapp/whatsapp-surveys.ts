import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { whatsAppService } from './whatsapp.service.js';
import { renderTemplate } from '../../lib/utils.js';
import { DEFAULT_WHATSAPP_MESSAGES } from '../../lib/defaults.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

export interface SurveyContext {
  surveyType: 'ATTENDANT' | 'SERVICE';
  surveyStartedAt: number;
  surveyId?: string;
  surveyStep?: number;
  attendantName?: string;
  appointmentId?: string;
  professionalId?: string;
  serviceName?: string;
  professionalName?: string;
}

/**
 * Dispara a pesquisa de satisfação pós-atendimento/corte para o WhatsApp do cliente.
 * Chamado automaticamente quando um agendamento é marcado como COMPLETED.
 */
export async function triggerAppointmentSurvey(params: {
  tenantId: string;
  appointmentId: string;
}): Promise<boolean> {
  const { tenantId, appointmentId } = params;

  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        customer: true,
        service: true,
        professional: true,
        tenant: { select: { name: true } },
      },
    });

    if (!appointment || !appointment.customer) {
      return false;
    }

    const targetPhone = appointment.customer.whatsappJid || appointment.customer.phone;
    if (!targetPhone) {
      logger.info({ tenantId, appointmentId }, 'Pesquisa pós-corte não enviada: cliente sem WhatsApp/telefone');
      return false;
    }

    // Verifica se o WhatsApp está configurado e conectado para o salão
    const waConfig = await prisma.whatsAppConfig.findUnique({
      where: { tenantId },
      select: {
        botEnabled: true,
        status: true,
        serviceSurveyEnabled: true,
        serviceSurveyMessage: true,
      },
    });
    if (!waConfig || waConfig.status !== 'CONNECTED' || !waConfig.botEnabled) {
      logger.info({ tenantId, appointmentId }, 'Pesquisa pós-corte não enviada: WhatsApp desconectado ou bot desabilitado');
      return false;
    }

    // Se o salão desativou a pesquisa de corte/serviço:
    if (waConfig.serviceSurveyEnabled === false) {
      logger.info({ tenantId, appointmentId }, 'Pesquisa pós-corte não enviada: desativada nas configurações do salão');
      return false;
    }

    const cleanDigits = (appointment.customer.phone || '').replace(/\D/g, '');
    const contactJid = appointment.customer.whatsappJid || (cleanDigits ? `${cleanDigits}@s.whatsapp.net` : null);
    if (!contactJid) {
      return false;
    }

    // Carrega ou busca conversa
    let conversation = await prisma.whatsAppConversation.findUnique({
      where: { tenantId_contactJid: { tenantId, contactJid } },
    });

    // Se o cliente já está em atendimento humano aberto, não interrompe com o robô
    if (conversation && conversation.isAttendant) {
      logger.info({ tenantId, contactJid }, 'Pesquisa pós-corte ignorada: cliente está em conversa com atendente humano');
      return false;
    }

    const customerFirstName = appointment.customer.name.trim().split(/\s+/)[0] || 'Cliente';
    const profName = appointment.professional?.name ? appointment.professional.name.trim().split(/\s+/)[0] : 'nossa equipe';

    // Pergunta de Nível 1: Nota de 1 a 5 (com base no template configurado)
    const rawTemplate = waConfig.serviceSurveyMessage || DEFAULT_WHATSAPP_MESSAGES.serviceSurveyMessage;
    const surveyText = renderTemplate(rawTemplate, {
      nome: customerFirstName,
      profissional: profName,
      servico: appointment.service.name,
      salao: appointment.tenant.name,
    });

    // Envia a mensagem no WhatsApp
    const sent = await whatsAppService.sendMessage(tenantId, targetPhone, surveyText);
    if (!sent) {
      logger.warn({ tenantId, targetPhone }, 'Falha ao enviar mensagem de pesquisa pós-corte no WhatsApp');
      return false;
    }

    const contextData: SurveyContext = {
      surveyType: 'SERVICE',
      surveyStartedAt: Date.now(),
      appointmentId: appointment.id,
      professionalId: appointment.professionalId,
      serviceName: appointment.service.name,
      professionalName: appointment.professional?.name,
    };

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          tenantId,
          contactJid,
          phone: appointment.customer.phone,
          contactName: appointment.customer.name,
          state: 'SURVEY_SERVICE_RATING',
          isAttendant: false,
          unreadCount: 0,
          lastMessage: surveyText,
          lastMessageAt: new Date(),
          context: contextData as any,
        },
      });
    } else {
      conversation = await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          state: 'SURVEY_SERVICE_RATING',
          isAttendant: false,
          lastMessage: surveyText,
          lastMessageAt: new Date(),
          context: contextData as any,
        },
      });
    }

    // Registra a mensagem no histórico do chat
    await prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactJid,
        fromMe: true,
        senderType: 'BOT',
        senderName: appointment.tenant.name,
        body: surveyText,
        status: 'SENT',
      },
    });

    logger.info({ tenantId, appointmentId, contactJid }, 'Pesquisa de satisfação pós-corte enviada com sucesso');
    return true;
  } catch (err) {
    logger.error({ err, tenantId, appointmentId }, 'Erro ao disparar pesquisa de satisfação pós-corte');
    return false;
  }
}

/**
 * Limpa conversas com pesquisas pendentes que ultrapassaram o tempo limite de 1 hora sem resposta,
 * liberando o fluxo de volta para o MENU inicial com os menus e agendamentos.
 */
export async function cleanExpiredSurveys(): Promise<number> {
  try {
    const surveyConversations = await prisma.whatsAppConversation.findMany({
      where: {
        state: {
          in: [
            'SURVEY_ATTENDANT_RATING',
            'SURVEY_ATTENDANT_FEEDBACK',
            'SURVEY_SERVICE_RATING',
            'SURVEY_SERVICE_FEEDBACK',
          ],
        },
      },
    });

    const now = Date.now();
    let cleanedCount = 0;

    for (const conv of surveyConversations) {
      const ctx = (conv.context as unknown as SurveyContext) || {};
      const startedAt = ctx.surveyStartedAt;
      if (startedAt && now - startedAt > ONE_HOUR_MS) {
        await prisma.whatsAppConversation.update({
          where: { id: conv.id },
          data: {
            state: 'MENU',
            context: {},
            isAttendant: false,
          },
        });
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info({ cleanedCount }, 'Pesquisas de satisfação expiradas (>1h) finalizadas e devolvidas ao menu');
    }

    return cleanedCount;
  } catch (err) {
    logger.error({ err }, 'Erro ao limpar pesquisas expiradas');
    return 0;
  }
}
