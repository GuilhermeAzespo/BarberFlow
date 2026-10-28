import type { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma } from '../../lib/prisma.js';
import { formatCurrency, normalizePhone, renderTemplate, WEEKDAY_SHORT } from '../../lib/utils.js';
import {
  changeAppointmentStatus,
  createAppointment,
  getAvailability,
  getAvailableDates,
  professionalsForService,
} from '../appointments/appointments.service.js';
import { logger } from '../../lib/logger.js';
import { findCustomerForContact } from './whatsapp-customer.js';

interface BotContext {
  serviceId?: string;
  serviceName?: string;
  servicePriceCents?: number;
  serviceDuration?: number;
  professionalId?: string | null;
  professionalName?: string;
  date?: string;
  time?: string;
  startAt?: string;
  availableDates?: string[];
  availableSlots?: { time: string; startAt: string }[];
  cancelableAppointments?: { id: string; summary: string }[];
  surveyType?: 'ATTENDANT' | 'SERVICE';
  surveyStartedAt?: number;
  surveyId?: string;
  appointmentId?: string;
  attendantName?: string;
}

export async function handleIncomingMessage(params: {
  tenantId: string;
  senderJid: string;
  /** JID com o telefone real (útil quando senderJid é um @lid). */
  phoneJid?: string;
  senderName?: string;
  text: string;
  reply: (text: string) => Promise<void>;
}): Promise<void> {
  const { tenantId, senderJid, phoneJid, senderName, text, reply: rawReply } = params;

  // Carrega configurações do WhatsApp e dados do salão
  const [tenant, waConfig] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { businessHours: { orderBy: { weekday: 'asc' } } },
    }),
    prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    }),
  ]);

  if (!tenant) return;

  // Identifica ou atualiza cliente cruzando com a base de clientes (/customers)
  const rawPhone = (phoneJid ?? senderJid).replace(/[:@].*$/, '');
  const normalizedPhone = senderJid.endsWith('@lid') && !phoneJid ? null : normalizePhone(rawPhone);

  const matchedCustomer = await findCustomerForContact(tenantId, senderJid, normalizedPhone || rawPhone);
  let customer = matchedCustomer
    ? await prisma.customer.findUnique({ where: { id: matchedCustomer.id } })
    : null;

  const resolvedName = (customer?.name && customer.name.trim() !== 'Cliente' && !/^\d+$/.test(customer.name.trim()))
    ? customer.name
    : (senderName || 'Cliente');

  if (!customer && normalizedPhone) {
    customer = await prisma.customer.create({
      data: {
        tenantId,
        name: resolvedName,
        phone: normalizedPhone,
        whatsappJid: senderJid,
      },
    });
  } else if (customer && !customer.whatsappJid) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { whatsappJid: senderJid },
    });
  }

  const finalCustomerName = resolvedName;

  // Carrega ou inicializa a conversa
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { tenantId_contactJid: { tenantId, contactJid: senderJid } },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        tenantId,
        contactJid: senderJid,
        phone: normalizedPhone,
        contactName: finalCustomerName,
        state: 'MENU',
        isAttendant: false,
        unreadCount: 1,
        lastMessage: text,
        context: {},
      },
    });
  } else {
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        contactName: finalCustomerName,
        phone: normalizedPhone || conversation.phone,
        lastMessage: text,
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
      },
    });
  }

  // Registra a mensagem recebida no histórico do chat
  await prisma.whatsAppMessage.create({
    data: {
      tenantId,
      conversationId: conversation.id,
      contactJid: senderJid,
      fromMe: false,
      senderType: 'CUSTOMER',
      senderName: finalCustomerName,
      body: text,
      status: 'READ',
    },
  });

  // Wrapper de resposta que persiste todas as mensagens do bot no histórico
  const reply = async (replyText: string) => {
    await rawReply(replyText);
    try {
      await prisma.whatsAppMessage.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          contactJid: senderJid,
          fromMe: true,
          senderType: 'BOT',
          senderName: tenant.name,
          body: replyText,
          status: 'SENT',
        },
      });
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: replyText,
          lastMessageAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err, tenantId, senderJid }, 'Erro ao gravar mensagem do bot no histórico');
    }
  };

  const cleanText = text.trim().toLowerCase();
  const rawInput = text.trim();

  // Se a conversa já foi transferida para um atendente humano:
  if (conversation.isAttendant) {
    // Se o cliente quiser voltar ao bot automático
    if (cleanText === 'menu' || cleanText === 'bot' || cleanText === 'voltar') {
      await updateConversation(tenantId, senderJid, 'MENU', {}, false);
      await reply(`🤖 *Atendimento Automático Retomado:*\nOlá, ${finalCustomerName}! O assistente do BarberFlow foi reativado para te atender.`);
      if (waConfig && waConfig.botEnabled) {
        await sendMenu(reply, tenant, waConfig, finalCustomerName);
      }
      return;
    }

    // O bot fica em silêncio absoluto para o atendente humano conversar
    logger.info({ tenantId, senderJid }, 'Mensagem recebida em conversa atribuída a atendente humano (bot em silêncio)');
    return;
  }

  // Se o bot estiver desativado nas configurações do salão
  if (!waConfig || !waConfig.botEnabled) {
    return;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  let state = conversation.state;
  let context = (conversation.context as BotContext) || {};

  // Verifica se está em pesquisa de satisfação e se o tempo limite de 1 hora expirou
  if (state.startsWith('SURVEY_')) {
    const surveyStartedAt = context.surveyStartedAt;
    if (surveyStartedAt && Date.now() - surveyStartedAt > ONE_HOUR_MS) {
      logger.info({ tenantId, senderJid, state }, 'Pesquisa de satisfação expirada por inatividade (>1h). Liberando conversa para o menu inicial.');
      await updateConversation(tenantId, senderJid, 'MENU', {}, false);
      state = 'MENU';
      context = {};
    }
  }

  // Comandos de reinício
  if (state.startsWith('SURVEY_')) {
    if (cleanText === 'menu' || cleanText === 'inicio' || cleanText === 'cancelar' || cleanText === 'voltar') {
      await updateConversation(tenantId, senderJid, 'MENU', {}, false);
      await sendMenu(reply, tenant, waConfig, finalCustomerName);
      return;
    }
  } else if (cleanText === 'menu' || cleanText === 'inicio' || cleanText === 'olá' || cleanText === 'ola' || cleanText === 'oi' || cleanText === 'voltar') {
    await updateConversation(tenantId, senderJid, 'MENU', {});
    await sendMenu(reply, tenant, waConfig, finalCustomerName);
    return;
  }

  // Falar com atendente:
  // - Opção 5 do menu principal (apenas quando state for MENU)
  // - Ou solicitação explícita por palavras-chave ("atendente", "falar com atendente", etc.)
  // IMPORTANTE: Se o cliente estiver respondendo a uma pesquisa (SURVEY_), notas numéricas (1 a 5) JAMAIS acionam o atendente!
  const isMenuOption5 = state === 'MENU' && (rawInput === '5' || cleanText === '5');
  const isExplicitAttendantRequest =
    !state.startsWith('SURVEY_') &&
    (cleanText === 'atendente' ||
      cleanText === 'falar com atendente' ||
      cleanText === 'falar com o atendente' ||
      cleanText === 'falar com um atendente' ||
      cleanText === 'falar com atendente humano' ||
      cleanText === 'humano' ||
      cleanText === 'suporte');

  if (isMenuOption5 || isExplicitAttendantRequest) {
    await updateConversation(tenantId, senderJid, 'HUMAN_ATTENDANT', {}, true);

    // Registra aviso de sistema no histórico da conversa para o painel de atendimento
    await prisma.whatsAppMessage.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        contactJid: senderJid,
        fromMe: true,
        senderType: 'SYSTEM',
        body: `🔔 Cliente solicitou atendimento humano pelo WhatsApp em ${DateTime.now().setZone(tenant.timezone).toFormat('dd/MM/yyyy HH:mm')}. Histórico da data atual disponível.`,
        status: 'SENT',
      },
    });

    await reply(
      `🔔 *Transferido para um Atendente:*\n` +
      `Olá, ${finalCustomerName}! Sua conversa foi encaminhada para nossa equipe de atendimento humano.\n\n` +
      `Um de nossos atendentes responderá em breve por aqui. Se a qualquer momento desejar voltar ao menu do robô, basta digitar *menu*. 😊`
    );
    return;
  }

  switch (state) {
    case 'MENU': {
      if (rawInput === '1') {
        // Iniciar fluxo de agendamento: listar serviços
        const services = await prisma.service.findMany({
          where: { tenantId, isActive: true },
          orderBy: { name: 'asc' },
        });

        if (services.length === 0) {
          await reply(`Desculpe, a *${tenant.name}* ainda não possui serviços disponíveis para agendamento online.`);
          return;
        }

        let msg = `✂️ *Escolha o serviço desejado:*\n\n`;
        services.forEach((s, idx) => {
          msg += `*${idx + 1}* - ${s.name} (${s.durationMinutes} min) - ${formatCurrency(s.priceCents)}\n`;
        });
        msg += `\n_Digite o número do serviço ou *menu* para voltar._`;

        await updateConversation(tenantId, senderJid, 'SELECT_SERVICE', {});
        await reply(msg);
      } else if (rawInput === '2') {
        // Meus agendamentos
        const appointments = await prisma.appointment.findMany({
          where: {
            tenantId,
            customerId: customer?.id,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            startAt: { gte: new Date() },
          },
          include: {
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
          orderBy: { startAt: 'asc' },
        });

        if (appointments.length === 0) {
          await reply(`Você não possui agendamentos futuros na *${tenant.name}*.\n\nEnvie *1* para fazer um novo agendamento!`);
        } else {
          let msg = `📅 *Seus Próximos Agendamentos:*\n\n`;
          appointments.forEach((a, idx) => {
            const dt = DateTime.fromJSDate(a.startAt).setZone(tenant.timezone);
            msg += `*${idx + 1}.* ${a.service.name} com ${a.professional.name}\n` +
                   `🗓️ ${dt.toFormat('dd/LL/yyyy')} às ${dt.toFormat('HH:mm')}\n\n`;
          });
          msg += `_Para cancelar algum horário, digite *3* ou envie *menu*._`;
          await reply(msg);
        }
      } else if (rawInput === '3') {
        // Fluxo de cancelamento
        const appointments = await prisma.appointment.findMany({
          where: {
            tenantId,
            customerId: customer?.id,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
            startAt: { gte: new Date() },
          },
          include: {
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
          orderBy: { startAt: 'asc' },
        });

        if (appointments.length === 0) {
          await reply(`Você não possui nenhum agendamento pendente para cancelar.\n\nDigite *menu* para voltar.`);
          return;
        }

        let msg = `❌ *Qual agendamento você deseja cancelar?*\n\n`;
        const cancelableList: BotContext['cancelableAppointments'] = [];
        appointments.forEach((a, idx) => {
          const dt = DateTime.fromJSDate(a.startAt).setZone(tenant.timezone);
          const summary = `${a.service.name} em ${dt.toFormat('dd/LL')} às ${dt.toFormat('HH:mm')}`;
          cancelableList.push({ id: a.id, summary });
          msg += `*${idx + 1}* - ${summary}\n`;
        });
        msg += `\n_Digite o número do agendamento ou *0* para desistir._`;

        await updateConversation(tenantId, senderJid, 'CANCEL_SELECT', { cancelableAppointments: cancelableList });
        await reply(msg);
      } else if (rawInput === '4') {
        // Informações e Horários
        let msg = `💈 *${tenant.name}*\n\n`;
        if (tenant.address) {
          msg += `📍 *Endereço:* ${tenant.address}\n\n`;
        }
        msg += `⏰ *Horário de Funcionamento:*\n`;
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        for (const bh of tenant.businessHours) {
          if (bh.isOpen) {
            msg += `• *${days[bh.weekday]}:* ${bh.openTime} às ${bh.closeTime}`;
            if (bh.breakStart && bh.breakEnd) {
              msg += ` (Almoço: ${bh.breakStart}-${bh.breakEnd})`;
            }
            msg += `\n`;
          } else {
            msg += `• *${days[bh.weekday]}:* Fechado\n`;
          }
        }
        msg += `\n_Digite *menu* para retornar ao início._`;
        await reply(msg);
      } else if (rawInput === '5' || cleanText.includes('atendente') || cleanText.includes('humano') || cleanText.includes('suporte')) {
        await updateConversation(tenantId, senderJid, 'HUMAN_ATTENDANT', {}, true);
        await reply(
          `🔔 *Transferido para um Atendente:*\nOlá, ${finalCustomerName}! Sua conversa foi encaminhada para nossa equipe de atendimento humano.\n\nUm de nossos atendentes responderá em breve por aqui. Se a qualquer momento desejar voltar ao menu do robô, basta digitar *menu*. 😊`
        );
      } else {
        await sendMenu(reply, tenant, waConfig, finalCustomerName);
      }
      break;
    }

    case 'SELECT_SERVICE': {
      const services = await prisma.service.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });

      const selectedIndex = parseInt(rawInput, 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= services.length) {
        await reply(`⚠️ Opção inválida. Digite o número correspondente ao serviço ou *menu* para voltar.`);
        return;
      }

      const service = services[selectedIndex];
      if (!service) {
        await reply(`⚠️ Opção inválida. Digite o número correspondente ao serviço ou *menu* para voltar.`);
        return;
      }
      const candidates = await professionalsForService(tenantId, service.id);

      if (candidates.length === 0) {
        await reply(`Nenhum profissional disponível no momento para o serviço *${service.name}*. Por favor, escolha outro serviço ou fale conosco no *menu*.`);
        return;
      }

      let msg = `💈 *Com qual profissional você prefere fazer o(a) ${service.name}?*\n\n`;
      msg += `*0* - Qualquer profissional disponível\n`;
      candidates.forEach((p, idx) => {
        msg += `*${idx + 1}* - ${p.name}\n`;
      });
      msg += `\n_Digite o número da opção desejada:_`;

      await updateConversation(tenantId, senderJid, 'SELECT_PROFESSIONAL', {
        serviceId: service.id,
        serviceName: service.name,
        servicePriceCents: service.priceCents,
        serviceDuration: service.durationMinutes,
      });
      await reply(msg);
      break;
    }

    case 'SELECT_PROFESSIONAL': {
      if (!context.serviceId) {
        await updateConversation(tenantId, senderJid, 'MENU', {});
        await sendMenu(reply, tenant, waConfig, finalCustomerName);
        return;
      }

      const candidates = await professionalsForService(tenantId, context.serviceId);
      let selectedProfessionalId: string | null = null;
      let selectedProfessionalName = 'Qualquer profissional';

      if (rawInput === '0') {
        selectedProfessionalId = null;
      } else {
        const selectedIndex = parseInt(rawInput, 10) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= candidates.length) {
          await reply(`⚠️ Opção inválida. Escolha um número da lista ou *0* para qualquer um.`);
          return;
        }
        const candidate = candidates[selectedIndex];
        if (!candidate) {
          await reply(`⚠️ Opção inválida. Escolha um número da lista ou *0* para qualquer um.`);
          return;
        }
        selectedProfessionalId = candidate.id;
        selectedProfessionalName = candidate.name;
      }

      // Buscar próximas datas disponíveis
      const dates = await getAvailableDates({
        tenantId,
        serviceId: context.serviceId,
        professionalId: selectedProfessionalId,
        lookaheadDays: 14,
        limit: 5,
      });

      if (dates.length === 0) {
        await reply(`Não encontramos horários disponíveis nos próximos dias para esta combinação.\n\nEnvie *menu* para tentar outro serviço ou profissional.`);
        await updateConversation(tenantId, senderJid, 'MENU', {});
        return;
      }

      let msg = `📅 *Escolha a data para o agendamento:*\n\n`;
      dates.forEach((dStr, idx) => {
        const dt = DateTime.fromISO(dStr, { zone: tenant.timezone });
        const weekday = WEEKDAY_SHORT[dt.weekday % 7];
        msg += `*${idx + 1}* - ${dt.toFormat('dd/LL/yyyy')} (${weekday})\n`;
      });
      msg += `\n_Digite o número da data desejada:_`;

      await updateConversation(tenantId, senderJid, 'SELECT_DATE', {
        ...context,
        professionalId: selectedProfessionalId,
        professionalName: selectedProfessionalName,
        availableDates: dates,
      });
      await reply(msg);
      break;
    }

    case 'SELECT_DATE': {
      const dates = context.availableDates || [];
      const selectedIndex = parseInt(rawInput, 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dates.length) {
        await reply(`⚠️ Data inválida. Escolha um dos números apresentados ou envie *menu*.`);
        return;
      }

      const chosenDate = dates[selectedIndex];
      if (!chosenDate) {
        await reply(`⚠️ Data inválida. Escolha um dos números apresentados ou envie *menu*.`);
        return;
      }

      // Buscar horários livres nessa data
      const { slots } = await getAvailability({
        tenantId,
        serviceId: context.serviceId!,
        date: chosenDate,
        professionalId: context.professionalId,
      });

      if (slots.length === 0) {
        await reply(`Ops! Os horários deste dia acabaram de ser preenchidos. Por favor, escolha outra data ou digite *menu*.`);
        return;
      }

      const dt = DateTime.fromISO(chosenDate, { zone: tenant.timezone });
      let msg = `⏰ *Horários disponíveis para ${dt.toFormat('dd/LL')} (${WEEKDAY_SHORT[dt.weekday % 7]}):*\n\n`;
      const availableSlots: BotContext['availableSlots'] = [];

      slots.slice(0, 15).forEach((s, idx) => {
        availableSlots.push({ time: s.time, startAt: s.startAt });
        msg += `*${idx + 1}* - ${s.time}\n`;
      });
      msg += `\n_Digite o número do horário desejado:_`;

      await updateConversation(tenantId, senderJid, 'SELECT_TIME', {
        ...context,
        date: chosenDate,
        availableSlots,
      });
      await reply(msg);
      break;
    }

    case 'SELECT_TIME': {
      const slots = context.availableSlots || [];
      const selectedIndex = parseInt(rawInput, 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= slots.length) {
        await reply(`⚠️ Horário inválido. Escolha um dos números da lista ou envie *menu*.`);
        return;
      }

      const chosenSlot = slots[selectedIndex];
      if (!chosenSlot) {
        await reply(`⚠️ Horário inválido. Escolha um dos números da lista ou envie *menu*.`);
        return;
      }
      const dt = DateTime.fromISO(context.date!, { zone: tenant.timezone });

      let msg = `📋 *Confirmação do Agendamento*\n\n` +
                `✂️ *Serviço:* ${context.serviceName}\n` +
                `💈 *Profissional:* ${context.professionalName}\n` +
                `📅 *Data:* ${dt.toFormat('dd/LL/yyyy')}\n` +
                `⏰ *Horário:* ${chosenSlot.time}\n` +
                `💰 *Valor:* ${formatCurrency(context.servicePriceCents || 0)}\n\n` +
                `*1* - ✅ Confirmar Agendamento\n` +
                `*0* - ❌ Cancelar e voltar ao início\n\n` +
                `_Digite 1 para confirmar:_`;

      await updateConversation(tenantId, senderJid, 'CONFIRMATION', {
        ...context,
        time: chosenSlot.time,
        startAt: chosenSlot.startAt,
      });
      await reply(msg);
      break;
    }

    case 'CONFIRMATION': {
      if (rawInput === '1') {
        try {
          const appointment = await createAppointment({
            tenantId,
            serviceId: context.serviceId!,
            professionalId: context.professionalId,
            startAt: new Date(context.startAt!),
            customer: {
              name: finalCustomerName,
              phone: normalizedPhone,
              whatsappJid: senderJid,
            },
            source: 'WHATSAPP',
          });

          const dt = DateTime.fromJSDate(appointment.startAt).setZone(tenant.timezone);

          const confirmText = renderTemplate(waConfig.confirmationMessage, {
            nome: finalCustomerName,
            salao: tenant.name,
            servico: appointment.service.name,
            profissional: appointment.professional.name,
            data: dt.toFormat('dd/LL/yyyy'),
            hora: dt.toFormat('HH:mm'),
            valor: formatCurrency(appointment.priceCents),
          });

          await updateConversation(tenantId, senderJid, 'MENU', {});
          await reply(confirmText);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Horário indisponível.';
          logger.warn({ err, tenantId, senderJid }, 'Falha no agendamento via bot');
          await reply(`⚠️ Não foi possível confirmar: ${errorMessage}\n\nEnvie *menu* para tentar outro horário.`);
          await updateConversation(tenantId, senderJid, 'MENU', {});
        }
      } else {
        await reply(`Agendamento cancelado. Quando quiser, envie *menu* para começar novamente!`);
        await updateConversation(tenantId, senderJid, 'MENU', {});
      }
      break;
    }

    case 'CANCEL_SELECT': {
      if (rawInput === '0') {
        await reply(`Operação cancelada. Digite *menu* para voltar.`);
        await updateConversation(tenantId, senderJid, 'MENU', {});
        return;
      }

      const list = context.cancelableAppointments || [];
      const selectedIndex = parseInt(rawInput, 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= list.length) {
        await reply(`⚠️ Opção inválida. Digite o número correspondente ou *0* para desistir.`);
        return;
      }

      const target = list[selectedIndex];
      if (!target) {
        await reply(`⚠️ Opção inválida. Digite o número correspondente ou *0* para desistir.`);
        return;
      }
      const appointment = await changeAppointmentStatus({
        tenantId,
        id: target.id,
        status: 'CANCELED',
        cancelReason: 'Cancelado pelo cliente via WhatsApp',
      });

      const dt = DateTime.fromJSDate(appointment.startAt).setZone(tenant.timezone);
      const cancelText = renderTemplate(waConfig.cancellationMessage, {
        nome: finalCustomerName,
        salao: tenant.name,
        servico: appointment.service.name,
        data: dt.toFormat('dd/LL/yyyy'),
        hora: dt.toFormat('HH:mm'),
      });

      await updateConversation(tenantId, senderJid, 'MENU', {});
      await reply(cancelText);
      break;
    }

    case 'SURVEY_ATTENDANT_RATING': {
      const rating = parseInt(rawInput, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        await reply(
          `⚠️ Por favor, responda com uma nota de *1 a 5*:\n\n` +
          `*1* - Muito ruim 😡\n` +
          `*2* - Ruim 🙁\n` +
          `*3* - Regular 😐\n` +
          `*4* - Bom 🙂\n` +
          `*5* - Excelente 🤩\n\n` +
          `_Envie o número de 1 a 5 ou digite *menu* para voltar._`
        );
        return;
      }

      // Registra a avaliação (Nível 1) no banco
      const survey = await prisma.satisfactionSurvey.create({
        data: {
          tenantId,
          type: 'ATTENDANT',
          contactJid: senderJid,
          customerPhone: normalizedPhone || conversation.phone,
          customerName: finalCustomerName,
          rating,
          conversationId: conversation.id,
        },
      });

      // Avança para o Nível 2: Detalhes ou sugestão de melhoria (garantindo isAttendant = false)
      await updateConversation(tenantId, senderJid, 'SURVEY_ATTENDANT_FEEDBACK', {
        ...context,
        surveyId: survey.id,
        surveyStartedAt: Date.now(),
      }, false);

      await reply(
        `Obrigado pela sua nota! ⭐\n\n` +
        `Para finalizarmos, gostaria de deixar algum detalhe, elogio ou sugestão de melhoria sobre o atendimento recebido?\n\n` +
        `_(Envie sua mensagem em texto ou responda *não* se preferir não comentar)_`
      );
      break;
    }

    case 'SURVEY_ATTENDANT_FEEDBACK': {
      const lower = rawInput.toLowerCase();
      const isNegative = ['não', 'nao', 'nop', 'nada', 'nenhum', 'não quero', 'nao quero', 'não obrigado', 'nao obrigado', 'ok'].includes(lower);

      if (!isNegative && context.surveyId) {
        await prisma.satisfactionSurvey.update({
          where: { id: context.surveyId },
          data: { feedback: rawInput },
        }).catch((err) => {
          logger.error({ err }, 'Erro ao atualizar feedback da pesquisa de atendimento');
        });
      }

      // Finaliza a pesquisa e libera o chat para o menu inicial
      await updateConversation(tenantId, senderJid, 'MENU', {}, false);
      await reply(
        `🎉 *Agradecemos o seu feedback!*\n` +
        `Sua opinião é fundamental para aprimorarmos continuamente o atendimento da equipe.\n\n` +
        `Sempre que precisar, envie *menu* para ver opções e agendamentos. Tenha um excelente dia! 💈`
      );
      break;
    }

    case 'SURVEY_SERVICE_RATING': {
      const rating = parseInt(rawInput, 10);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        await reply(
          `⚠️ Por favor, responda com uma nota de *1 a 5* sobre o serviço:\n\n` +
          `*1* - Muito ruim 😡\n` +
          `*2* - Ruim 🙁\n` +
          `*3* - Regular 😐\n` +
          `*4* - Bom 🙂\n` +
          `*5* - Excelente 🤩\n\n` +
          `_Envie o número de 1 a 5 ou digite *menu* para voltar._`
        );
        return;
      }

      // Registra a avaliação (Nível 1) no banco
      const survey = await prisma.satisfactionSurvey.create({
        data: {
          tenantId,
          type: 'SERVICE',
          contactJid: senderJid,
          customerPhone: normalizedPhone || conversation.phone,
          customerName: finalCustomerName,
          rating,
          appointmentId: context.appointmentId || null,
          professionalId: context.professionalId || null,
          conversationId: conversation.id,
        },
      });

      // Avança para o Nível 2: Detalhes ou sugestão de melhoria (garantindo isAttendant = false)
      await updateConversation(tenantId, senderJid, 'SURVEY_SERVICE_FEEDBACK', {
        ...context,
        surveyId: survey.id,
        surveyStartedAt: Date.now(),
      }, false);

      await reply(
        `Obrigado pela sua nota! ⭐\n\n` +
        `Gostaria de deixar algum detalhe sobre o corte ou alguma sugestão de melhoria para o profissional/salão?\n\n` +
        `_(Envie sua mensagem em texto ou responda *não* se preferir não comentar)_`
      );
      break;
    }

    case 'SURVEY_SERVICE_FEEDBACK': {
      const lower = rawInput.toLowerCase();
      const isNegative = ['não', 'nao', 'nop', 'nada', 'nenhum', 'não quero', 'nao quero', 'não obrigado', 'nao obrigado', 'ok'].includes(lower);

      if (!isNegative && context.surveyId) {
        await prisma.satisfactionSurvey.update({
          where: { id: context.surveyId },
          data: { feedback: rawInput },
        }).catch((err) => {
          logger.error({ err }, 'Erro ao atualizar feedback da pesquisa de serviço');
        });
      }

      // Finaliza a pesquisa e libera o chat para o menu inicial
      await updateConversation(tenantId, senderJid, 'MENU', {}, false);
      await reply(
        `🎉 *Agradecemos a sua avaliação!*\n` +
        `Seu retorno é muito importante e nos ajuda a manter o padrão de excelência dos nossos serviços.\n\n` +
        `Quando quiser agendar seu próximo horário, basta nos enviar um *olá* ou *menu*! ✂️💈`
      );
      break;
    }

    default: {
      await updateConversation(tenantId, senderJid, 'MENU', {});
      await sendMenu(reply, tenant, waConfig, finalCustomerName);
      break;
    }
  }
}

async function updateConversation(tenantId: string, contactJid: string, state: string, context: BotContext, isAttendant?: boolean) {
  await prisma.whatsAppConversation.upsert({
    where: { tenantId_contactJid: { tenantId, contactJid } },
    update: {
      state,
      context: context as Prisma.InputJsonValue,
      lastMessageAt: new Date(),
      ...(isAttendant !== undefined ? { isAttendant } : {}),
    },
    create: {
      tenantId,
      contactJid,
      state,
      context: context as Prisma.InputJsonValue,
      lastMessageAt: new Date(),
      ...(isAttendant !== undefined ? { isAttendant } : {}),
    },
  });
}

async function sendMenu(
  reply: (text: string) => Promise<void>,
  tenant: { name: string },
  waConfig: { welcomeMessage: string },
  customerName: string,
) {
  const greeting = renderTemplate(waConfig.welcomeMessage, {
    salao: tenant.name,
    nome: customerName,
    nome_saudacao: customerName ? `, ${customerName}` : '',
  });

  const menuText =
    `${greeting}\n\n` +
    `Como posso ajudar você hoje?\n\n` +
    `*1* - ✂️ Agendar um horário\n` +
    `*2* - 📅 Meus agendamentos\n` +
    `*3* - ❌ Cancelar agendamento\n` +
    `*4* - 💈 Horários e Localização\n` +
    `*5* - 👤 Falar com um atendente\n\n` +
    `_Responda com o número da opção desejada._`;

  await reply(menuText);
}
