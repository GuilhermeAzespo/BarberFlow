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
import { DEFAULT_WHATSAPP_MESSAGES } from '../../lib/defaults.js';

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
  inactivityClosed?: boolean;
  closedAt?: number;
}

function parseRelativeDate(text: string, zone: string): { dateStr: string; label: string } | null {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const now = DateTime.now().setZone(zone);

  if (/\bhoje\b/.test(clean)) {
    return { dateStr: now.toISODate()!, label: 'Hoje' };
  }
  if (/\bdepois de amanha\b/.test(clean)) {
    const dt = now.plus({ days: 2 });
    return { dateStr: dt.toISODate()!, label: `${dt.toFormat('dd/LL')} (${WEEKDAY_SHORT[dt.weekday % 7]})` };
  }
  if (/\bamanha\b/.test(clean)) {
    const dt = now.plus({ days: 1 });
    return { dateStr: dt.toISODate()!, label: 'Amanhã' };
  }

  const weekdayMap: Record<string, number> = {
    segunda: 1, seg: 1,
    terca: 2, ter: 2,
    quarta: 3, qua: 3,
    quinta: 4, qui: 4,
    sexta: 5, sex: 5,
    sabado: 6, sab: 6,
    domingo: 7, dom: 7,
  };

  for (const [dayName, dayNum] of Object.entries(weekdayMap)) {
    const regex = new RegExp(`\\b${dayName}(?:-feira)?\\b`);
    if (regex.test(clean)) {
      let diff = dayNum - now.weekday;
      if (diff < 0) diff += 7;
      const dt = now.plus({ days: diff });
      const label = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `${dt.toFormat('dd/LL')} (${WEEKDAY_SHORT[dt.weekday % 7]})`;
      return { dateStr: dt.toISODate()!, label };
    }
  }

  const dateMatch = clean.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    let year = dateMatch[3] ? parseInt(dateMatch[3], 10) : now.year;
    if (year < 100) year += 2000;
    const dt = DateTime.fromObject({ year, month, day }, { zone });
    if (dt.isValid) {
      const isToday = dt.hasSame(now, 'day');
      const isTomorrow = dt.hasSame(now.plus({ days: 1 }), 'day');
      const label = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : `${dt.toFormat('dd/LL/yyyy')}`;
      return { dateStr: dt.toISODate()!, label };
    }
  }

  return null;
}

function parseTime(text: string): string | null {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/\bmeio[- ]?dia\b/.test(clean)) {
    return '12:00';
  }

  const hhmm = clean.match(/\b([01]?\d|2[0-3])[:hH]([0-5]\d)\b/);
  if (hhmm) {
    const h = hhmm[1].padStart(2, '0');
    const m = hhmm[2];
    return `${h}:${m}`;
  }

  const hourMatch =
    clean.match(/(?:por volta d[ao]s?|às|as|ás|pras|para as|de|pelas?)\s*([01]?\d|2[0-3])(?:\s*h(?:oras?)?|\b)/i) ||
    clean.match(/\b([01]?\d|2[0-3])\s*h(?:oras?)?\b/i);

  if (hourMatch) {
    let hour = parseInt(hourMatch[1], 10);
    if (hour <= 12 && (clean.includes('tarde') || clean.includes('noite') || clean.includes('pm'))) {
      hour += 12;
    }
    return `${String(hour).padStart(2, '0')}:00`;
  }

  return null;
}

function matchService(
  text: string,
  services: Array<{ id: string; name: string; priceCents: number; durationMinutes: number }>
) {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let bestMatch: { service: (typeof services)[0]; score: number } | null = null;

  for (const s of services) {
    const cleanServiceName = s.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    let score = 0;

    if (clean.includes(cleanServiceName)) {
      score += 100 + cleanServiceName.length;
    } else {
      const tokens = cleanServiceName.split(/[\s+/,-]+/).filter((t) => t.length >= 4);
      for (const token of tokens) {
        if (clean.includes(token)) {
          score += 25;
        }
      }
    }

    if (score > (bestMatch?.score ?? 0)) {
      bestMatch = { service: s, score };
    }
  }

  return bestMatch && bestMatch.score >= 25 ? bestMatch.service : null;
}

function matchProfessional(
  text: string,
  professionals: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  for (const p of professionals) {
    const cleanProfName = p.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const firstName = cleanProfName.split(/[\s()]+/)[0];

    const fullNameRegex = new RegExp(`\\b${cleanProfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const firstNameRegex = new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);

    if (fullNameRegex.test(clean) || (firstName && firstName.length >= 3 && firstNameRegex.test(clean))) {
      return p;
    }
  }

  return null;
}

function isAskingForServices(clean: string): boolean {
  return (
    clean.includes('quais os servicos') ||
    clean.includes('quais servicos') ||
    clean.includes('servicos disponiveis') ||
    clean.includes('servico disponivel') ||
    clean.includes('verificar os servicos') ||
    clean.includes('verificar servicos') ||
    clean.includes('quais cortes') ||
    clean.includes('quais os cortes') ||
    clean.includes('ver servicos') ||
    clean.includes('lista de servicos') ||
    clean.includes('tabela de precos') ||
    clean.includes('tabela de preco') ||
    clean.includes('tabela de valor') ||
    clean.includes('tabela de valores') ||
    clean.includes('valores dos servicos') ||
    clean.includes('valor dos servicos') ||
    clean.includes('precos dos servicos') ||
    clean.includes('preco dos servicos') ||
    clean.includes('quanto custa') ||
    clean.includes('qual o valor') ||
    clean.includes('qual o preco') ||
    clean.includes('quais os precos') ||
    clean.includes('quais os valores') ||
    clean.includes('o que voces fazem') ||
    clean.includes('tipos de corte') ||
    clean.includes('catalogo') ||
    clean.includes('cardapio') ||
    clean.includes('opcoes de servico') ||
    clean.includes('opcoes de servicos') ||
    (clean.includes('servicos') && (clean.includes('quais') || clean.includes('tem') || clean.includes('saber') || clean.includes('ver')))
  );
}

function isAskingForBusinessHoursOrLocation(clean: string): boolean {
  return (
    clean.includes('horario de funcionamento') ||
    clean.includes('horarios de funcionamento') ||
    clean.includes('horario de atendimento') ||
    clean.includes('horarios de atendimento') ||
    clean.includes('que horas abre') ||
    clean.includes('que horas fecha') ||
    clean.includes('que horas voces abrem') ||
    clean.includes('que horas voces fecham') ||
    clean.includes('onde fica') ||
    clean.includes('qual o endereco') ||
    clean.includes('onde voces ficam') ||
    clean.includes('localizacao') ||
    clean.includes('onde e o salao') ||
    clean.includes('onde e a barbearia') ||
    clean.includes('como chegar') ||
    (clean.includes('endereco') && !clean.includes('email'))
  );
}

function isAskingForMyAppointments(clean: string): boolean {
  return (
    clean.includes('meus agendamentos') ||
    clean.includes('meu agendamento') ||
    clean.includes('ver meu agendamento') ||
    clean.includes('consultar agendamento') ||
    clean.includes('meus horarios') ||
    clean.includes('meu horario') ||
    clean.includes('que horas e meu agendamento') ||
    clean.includes('que horas e meu corte') ||
    clean.includes('tenho agendamento')
  );
}

function isAskingToCancel(clean: string): boolean {
  return (
    clean.includes('cancelar agendamento') ||
    clean.includes('desmarcar agendamento') ||
    clean.includes('cancelar horario') ||
    clean.includes('desmarcar horario') ||
    clean.includes('cancelar meu corte') ||
    clean.includes('desmarcar meu corte') ||
    clean.includes('cancelar o corte') ||
    clean.includes('desmarcar o corte') ||
    clean.includes('nao vou poder ir') ||
    clean.includes('nao poderei ir')
  );
}

function isNaturalLanguageBookingIntent(text: string, hasServiceKeywords: boolean, hasProfKeywords: boolean): boolean {
  const clean = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (/^[0-9]+$/.test(clean)) return false;
  if (['oi', 'ola', 'menu', 'inicio', 'voltar', 'bot', 'ajuda'].includes(clean)) return false;

  const bookingKeywords = [
    'agendar',
    'agendamento',
    'marcar',
    'reservar',
    'vaga',
    'vagas',
    'cortar',
    'barba',
    'cabelo',
    'gostaria de agendar',
    'gostaria de marcar',
    'queria agendar',
    'queria marcar',
    'quero agendar',
    'quero marcar',
    'tem horario',
    'tem horarios',
    'quais horarios',
    'qual horario',
    'horarios disponiv',
    'horario disponiv',
    'horarios disponv',
    'horario disponv',
    'horarios livres',
    'horario livre',
    'horarios vagos',
    'horario vago',
    'tem vaga',
    'tem vagas',
    'algum horario',
    'ver horarios',
  ];

  const hasBookingKeyword = bookingKeywords.some((kw) => clean.includes(kw));

  // Qualquer consulta sobre horário ou vaga combinada com data ("amanhã", "hoje", etc.) ou intenção ("tem", "quais", "para")
  const hasTimeOrDateQuery =
    (clean.includes('horario') || clean.includes('horarios') || clean.includes('vaga') || clean.includes('vagas')) &&
    (clean.includes('amanha') || clean.includes('hoje') || clean.includes('dispon') || clean.includes('tem') || clean.includes('para') || clean.includes('quais'));

  return (
    hasBookingKeyword ||
    hasTimeOrDateQuery ||
    (hasServiceKeywords && (clean.includes('tem') || clean.includes('quero') || clean.includes('horario') || clean.includes('hoje') || clean.includes('amanha'))) ||
    (hasProfKeywords && hasServiceKeywords)
  );
}

async function trySmartNaturalLanguageBooking(params: {
  tenantId: string;
  senderJid: string;
  text: string;
  finalCustomerName: string;
  tenant: { id: string; name: string; timezone: string; address?: string | null; businessHours?: any[] };
  waConfig: { confirmationMessage: string; reminderHoursBefore?: number };
  customer?: { id: string; name?: string } | null;
  reply: (text: string) => Promise<void>;
}): Promise<boolean> {
  const { tenantId, senderJid, text, finalCustomerName, tenant, customer, reply } = params;
  const clean = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // 1. O cliente está perguntando quais serviços tem / tabela de preços / catálogo?
  if (isAskingForServices(clean)) {
    const services = await prisma.service.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    if (services.length === 0) {
      await reply(`Desculpe, a *${tenant.name}* ainda não possui serviços disponíveis para agendamento online.`);
      return true;
    }

    let msg = `✂️ *Serviços Disponíveis na ${tenant.name}:*\n\n`;
    services.forEach((s, idx) => {
      msg += `*${idx + 1}* - ${s.name} (${s.durationMinutes} min) - ${formatCurrency(s.priceCents)}\n`;
    });
    msg += `\n_Para agendar, digite o número do serviço ou escreva diretamente como preferir (ex: "Gostaria de agendar o ${services[0]?.name || 'Corte'} hoje às 16h30")!_`;

    await updateConversation(tenantId, senderJid, 'SELECT_SERVICE', {});
    await reply(msg);
    return true;
  }

  // 2. O cliente está perguntando horários de funcionamento ou localização/endereço?
  if (isAskingForBusinessHoursOrLocation(clean)) {
    let msg = `💈 *${tenant.name}*\n\n`;
    if (tenant.address) {
      msg += `📍 *Endereço:* ${tenant.address}\n\n`;
    }
    msg += `⏰ *Horário de Funcionamento:*\n`;
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const businessHours = tenant.businessHours || [];
    for (const bh of businessHours) {
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
    msg += `\n_Digite *1* para agendar um horário ou *menu* para outras opções._`;
    await reply(msg);
    return true;
  }

  // 3. O cliente quer ver os agendamentos dele?
  if (isAskingForMyAppointments(clean)) {
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
    return true;
  }

  // 4. O cliente quer cancelar agendamento?
  if (isAskingToCancel(clean)) {
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
      return true;
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
    return true;
  }

  // 5. Agendamento inteligente (Fast Track NLP)
  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    }),
    prisma.professional.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (services.length === 0) return false;

  const matchedSvc = matchService(text, services);
  const matchedProf = matchProfessional(text, professionals);
  const hasIntent = isNaturalLanguageBookingIntent(text, Boolean(matchedSvc), Boolean(matchedProf));

  if (!hasIntent) {
    return false;
  }

  const customerFirstName =
    finalCustomerName && finalCustomerName !== 'Cliente' && !/^\d+$/.test(finalCustomerName)
      ? finalCustomerName.split(' ')[0]
      : 'Cliente';

  // Se o cliente tem intenção de agendar, mas não citou o serviço:
  // NÃO assume services[0]! Pergunta com clareza ao cliente qual serviço deseja!
  if (!matchedSvc) {
    const parsedDate = parseRelativeDate(text, tenant.timezone);
    const parsedTime = parseTime(text);
    const dateLabel = parsedDate ? ` para *${parsedDate.label}*` : '';

    let msg = `Fala, ${customerFirstName}! 💈 Para verificar os horários${dateLabel}, qual serviço você gostaria de agendar${matchedProf ? ` com o *${matchedProf.name}*` : ''}?\n\n`;
    services.forEach((s, idx) => {
      msg += `*${idx + 1}* - ${s.name} (${s.durationMinutes} min) - ${formatCurrency(s.priceCents)}\n`;
    });
    msg += `\n_Digite o número do serviço ou *menu* para voltar:_`;

    await updateConversation(tenantId, senderJid, 'SELECT_SERVICE', {
      professionalId: matchedProf ? matchedProf.id : null,
      professionalName: matchedProf ? matchedProf.name : undefined,
      date: parsedDate ? parsedDate.dateStr : undefined,
      time: parsedTime || undefined,
    });
    await reply(msg);
    return true;
  }

  const selectedService = matchedSvc;
  const candidates = await professionalsForService(tenantId, selectedService.id);
  const matchedCandidate = matchedProf && candidates.some((c) => c.id === matchedProf.id)
    ? matchedProf
    : null;

  const chosenProfessionalId = matchedCandidate ? matchedCandidate.id : (candidates[0]?.id || null);
  const chosenProfessionalName = matchedCandidate
    ? matchedCandidate.name
    : (candidates[0]?.name || 'Qualquer profissional disponível');

  const parsedDate = parseRelativeDate(text, tenant.timezone);
  const now = DateTime.now().setZone(tenant.timezone);
  const parsedTime = parseTime(text);

  let targetDateStr = parsedDate ? parsedDate.dateStr : now.toISODate()!;
  let friendlyDateLabel = parsedDate ? parsedDate.label : 'Hoje';

  if (!parsedDate && parsedTime) {
    const [h, m] = parsedTime.split(':').map(Number);
    const timeToday = now.set({ hour: h, minute: m, second: 0, millisecond: 0 });
    if (now > timeToday) {
      const tomorrow = now.plus({ days: 1 });
      targetDateStr = tomorrow.toISODate()!;
      friendlyDateLabel = 'Amanhã';
    }
  }

  const { slots } = await getAvailability({
    tenantId,
    serviceId: selectedService.id,
    date: targetDateStr,
    professionalId: chosenProfessionalId,
  });

  // Cenário 1: Horário solicitado disponível na agenda
  if (parsedTime) {
    const exactSlot = slots.find((s) => s.time === parsedTime);
    if (exactSlot) {
      const confirmationMsg =
        `Fala, ${customerFirstName}! 💈 Verifiquei a agenda do *${chosenProfessionalName}* em tempo real:\n\n` +
        `✂️ *Serviço:* ${selectedService.name}\n` +
        `👤 *Profissional:* ${chosenProfessionalName}\n` +
        `🕒 *Horário:* ${friendlyDateLabel} às ${exactSlot.time}\n` +
        `💵 *Valor:* ${formatCurrency(selectedService.priceCents)} (${selectedService.durationMinutes} min)\n\n` +
        `*1* - ✅ Confirmar Agendamento\n` +
        `*2* - ⏰ Ver outros horários disponíveis\n` +
        `*0* - ❌ Cancelar\n\n` +
        `_Responda *1* (ou *sim*) para confirmar!_`;

      await updateConversation(tenantId, senderJid, 'CONFIRMATION', {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        servicePriceCents: selectedService.priceCents,
        serviceDuration: selectedService.durationMinutes,
        professionalId: chosenProfessionalId,
        professionalName: chosenProfessionalName,
        date: targetDateStr,
        time: exactSlot.time,
        startAt: exactSlot.startAt,
      });

      await reply(confirmationMsg);
      return true;
    }
  }

  // Cenário 2: Horário pedido ocupado, ou cliente não indicou horário, mas há vagas
  if (slots.length > 0) {
    const availableSlots: BotContext['availableSlots'] = [];
    let msg = parsedTime
      ? `Fala, ${customerFirstName}! 💈 O horário das *${parsedTime}* já foi preenchido na agenda do *${chosenProfessionalName}*.\n\n` +
        `Mas encontrei estes outros horários livres para *${friendlyDateLabel}*:\n\n`
      : `Fala, ${customerFirstName}! 💈 Verifiquei os horários disponíveis para *${selectedService.name}* com *${chosenProfessionalName}* em *${friendlyDateLabel}*:\n\n`;

    slots.slice(0, 10).forEach((s, idx) => {
      availableSlots.push({ time: s.time, startAt: s.startAt });
      msg += `*${idx + 1}* - ${s.time}\n`;
    });
    msg += `\n_Digite o número do horário desejado ou *menu* para outras opções:_`;

    await updateConversation(tenantId, senderJid, 'SELECT_TIME', {
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      servicePriceCents: selectedService.priceCents,
      serviceDuration: selectedService.durationMinutes,
      professionalId: chosenProfessionalId,
      professionalName: chosenProfessionalName,
      date: targetDateStr,
      availableSlots,
    });

    await reply(msg);
    return true;
  }

  // Cenário 3: O dia está lotado, sugere próximas datas
  const dates = await getAvailableDates({
    tenantId,
    serviceId: selectedService.id,
    professionalId: chosenProfessionalId,
    lookaheadDays: 14,
    limit: 5,
  });

  if (dates.length > 0) {
    let msg = `Fala, ${customerFirstName}! 💈 Para *${friendlyDateLabel}*, não temos mais horários livres para *${selectedService.name}*.\n\n` +
              `📅 Encontrei vagas nas seguintes próximas datas:\n\n`;
    dates.forEach((dStr, idx) => {
      const dt = DateTime.fromISO(dStr, { zone: tenant.timezone });
      const weekday = WEEKDAY_SHORT[dt.weekday % 7];
      msg += `*${idx + 1}* - ${dt.toFormat('dd/LL/yyyy')} (${weekday})\n`;
    });
    msg += `\n_Digite o número da data desejada ou *menu* para voltar:_`;

    await updateConversation(tenantId, senderJid, 'SELECT_DATE', {
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      servicePriceCents: selectedService.priceCents,
      serviceDuration: selectedService.durationMinutes,
      professionalId: chosenProfessionalId,
      professionalName: chosenProfessionalName,
      availableDates: dates,
    });

    await reply(msg);
    return true;
  }

  return false;
}

export async function handleIncomingMessage(params: {
  tenantId: string;
  senderJid: string;
  /** JID com o telefone real (útil quando senderJid é um @lid). */
  phoneJid?: string;
  senderName?: string;
  text: string;
  reply: (text: string) => Promise<void>;
  isSimulation?: boolean;
}): Promise<void> {
  const { tenantId, senderJid, phoneJid, senderName, text, reply: rawReply, isSimulation } = params;

  // Carrega configurações do WhatsApp e dados do salão
  const [tenant, rawWaConfig] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { businessHours: { orderBy: { weekday: 'asc' } } },
    }),
    prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    }),
  ]);

  if (!tenant) return;

  const waConfig = rawWaConfig || {
    id: 'default',
    tenantId,
    botEnabled: true,
    status: 'DISCONNECTED',
    welcomeMessage: DEFAULT_WHATSAPP_MESSAGES.welcomeMessage,
    confirmationMessage: DEFAULT_WHATSAPP_MESSAGES.confirmationMessage,
    reminderMessage: DEFAULT_WHATSAPP_MESSAGES.reminderMessage,
    cancellationMessage: DEFAULT_WHATSAPP_MESSAGES.cancellationMessage,
    reminderEnabled: true,
    reminderHoursBefore: 2,
    attendantSurveyEnabled: true,
    attendantSurveyMessage: DEFAULT_WHATSAPP_MESSAGES.attendantSurveyMessage,
    serviceSurveyEnabled: true,
    serviceSurveyMessage: DEFAULT_WHATSAPP_MESSAGES.serviceSurveyMessage,
    createdAt: new Date(),
    updatedAt: new Date(),
    phoneNumber: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastError: null,
  };

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
  const customerFirstName =
    finalCustomerName && finalCustomerName !== 'Cliente' && !/^\d+$/.test(finalCustomerName)
      ? finalCustomerName.split(' ')[0]
      : 'Cliente';

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
  if (!isSimulation && (!rawWaConfig || !rawWaConfig.botEnabled)) {
    return;
  }

  const ONE_HOUR_MS = 60 * 60 * 1000;
  let state = conversation.state;
  let context = (conversation.context as BotContext) || {};

  // Se a conversa havia sido encerrada automaticamente por inatividade (1h sem resposta):
  if (context.inactivityClosed) {
    logger.info({ tenantId, senderJid }, 'Cliente enviou mensagem após encerramento por inatividade. Reiniciando atendimento.');
    await updateConversation(tenantId, senderJid, 'MENU', {}, false);
    state = 'MENU';
    context = {};
  }

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
      cleanText === 'falar com a atendente' ||
      cleanText === 'falar com o atendente' ||
      cleanText === 'falar com um atendente' ||
      cleanText === 'falar com uma atendente' ||
      cleanText === 'falar com atendente humano' ||
      cleanText.includes('falar com atendente') ||
      cleanText.includes('falar com a atendente') ||
      cleanText.includes('falar com o atendente') ||
      cleanText.includes('falar com um atendente') ||
      cleanText.includes('falar com uma atendente') ||
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
      // Tenta fluxo inteligente de agendamento por linguagem natural (ex: "gostaria de agendar um corte degradê com o Lucas hoje às 16h30")
      const handledSmart = await trySmartNaturalLanguageBooking({
        tenantId,
        senderJid,
        text: rawInput,
        finalCustomerName,
        tenant,
        waConfig,
        customer,
        reply,
      });

      if (handledSmart) {
        break;
      }

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
        const handledSmart = await trySmartNaturalLanguageBooking({
          tenantId,
          senderJid,
          text: rawInput,
          finalCustomerName,
          tenant,
          waConfig,
          customer,
          reply,
        });
        if (handledSmart) break;

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

      // Se a data já foi capturada na mensagem anterior (ex: "quais horarios vc tem disponvel para amanhã?")
      const chosenProfId = context.professionalId || (candidates.length === 1 ? candidates[0].id : null);
      const chosenProfName = context.professionalName || (candidates.length === 1 ? candidates[0].name : 'Qualquer profissional disponível');

      if (context.date && (chosenProfId !== null || candidates.length === 1)) {
        const { slots } = await getAvailability({
          tenantId,
          serviceId: service.id,
          date: context.date,
          professionalId: chosenProfId,
        });

        const dt = DateTime.fromISO(context.date, { zone: tenant.timezone });
        const now = DateTime.now().setZone(tenant.timezone);
        const dateLabel = dt.hasSame(now, 'day') ? 'Hoje' : dt.hasSame(now.plus({ days: 1 }), 'day') ? 'Amanhã' : dt.toFormat('dd/LL/yyyy');

        if (slots.length > 0) {
          const availableSlots: BotContext['availableSlots'] = [];
          let msg = `Fala, ${customerFirstName}! 💈 Encontrei estes horários livres para *${service.name}* em *${dateLabel}*:\n\n`;
          slots.slice(0, 10).forEach((s, idx) => {
            availableSlots.push({ time: s.time, startAt: s.startAt });
            msg += `*${idx + 1}* - ${s.time}\n`;
          });
          msg += `\n_Digite o número do horário desejado ou *menu* para voltar:_`;

          await updateConversation(tenantId, senderJid, 'SELECT_TIME', {
            ...context,
            serviceId: service.id,
            serviceName: service.name,
            servicePriceCents: service.priceCents,
            serviceDuration: service.durationMinutes,
            professionalId: chosenProfId,
            professionalName: chosenProfName,
            availableSlots,
          });
          await reply(msg);
          break;
        }
      }

      let msg = `💈 *Com qual profissional você prefere fazer o(a) ${service.name}?*\n\n`;
      msg += `*0* - Qualquer profissional disponível\n`;
      candidates.forEach((p, idx) => {
        msg += `*${idx + 1}* - ${p.name}\n`;
      });
      msg += `\n_Digite o número da opção desejada:_`;

      await updateConversation(tenantId, senderJid, 'SELECT_PROFESSIONAL', {
        ...context,
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

      // Se a data já havia sido indicada pelo cliente (ex: "quais horarios para amanha"):
      if (context.date && context.serviceId) {
        const { slots } = await getAvailability({
          tenantId,
          serviceId: context.serviceId,
          date: context.date,
          professionalId: selectedProfessionalId,
        });

        const dt = DateTime.fromISO(context.date, { zone: tenant.timezone });
        const now = DateTime.now().setZone(tenant.timezone);
        const dateLabel = dt.hasSame(now, 'day') ? 'Hoje' : dt.hasSame(now.plus({ days: 1 }), 'day') ? 'Amanhã' : dt.toFormat('dd/LL/yyyy');

        if (slots.length > 0) {
          const availableSlots: BotContext['availableSlots'] = [];
          let msg = `Fala, ${customerFirstName}! 💈 Encontrei estes horários livres para *${context.serviceName}* com *${selectedProfessionalName}* em *${dateLabel}*:\n\n`;
          slots.slice(0, 10).forEach((s, idx) => {
            availableSlots.push({ time: s.time, startAt: s.startAt });
            msg += `*${idx + 1}* - ${s.time}\n`;
          });
          msg += `\n_Digite o número do horário desejado ou *menu* para voltar:_`;

          await updateConversation(tenantId, senderJid, 'SELECT_TIME', {
            ...context,
            professionalId: selectedProfessionalId,
            professionalName: selectedProfessionalName,
            availableSlots,
          });
          await reply(msg);
          break;
        }
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
      const isConfirm = [
        '1',
        'sim',
        'confirmar',
        'confirma',
        'confirmado',
        'ok',
        'pode ser',
        'beleza',
        'combinado',
        'fechado',
        'positivo',
        'claro',
        'isso',
        'show',
      ].includes(cleanText) || cleanText.startsWith('sim') || cleanText.startsWith('confirma');

      const isAnotherTime = [
        '2',
        'outro',
        'outros',
        'outro horario',
        'outro horário',
        'outros horarios',
        'outros horários',
        'trocar',
        'mudar',
      ].includes(cleanText);

      if (isConfirm) {
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
          const now = DateTime.now().setZone(tenant.timezone);
          const isToday = dt.hasSame(now, 'day');
          const isTomorrow = dt.hasSame(now.plus({ days: 1 }), 'day');
          const dateDisplay = isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : dt.toFormat('dd/LL/yyyy');

          // Calcula horário do lembrete programado (conforme configurações do salão)
          const hoursBefore = waConfig?.reminderHoursBefore || 2;
          const reminderDt = dt.minus({ hours: hoursBefore });
          const reminderTimeStr = reminderDt.toFormat('HH:mm');

          const confirmedCard =
            `✓ *Agendamento Confirmado!* 💈\n\n` +
            `✂️ *Serviço:* ${appointment.service.name}\n` +
            `👤 *Profissional:* ${appointment.professional.name}\n` +
            `🕒 *Horário:* ${dateDisplay} às ${dt.toFormat('HH:mm')}\n` +
            `💵 *Valor:* ${formatCurrency(appointment.priceCents)}\n\n` +
            `🔔 *Lembrete programado (${reminderTimeStr})*\n\n` +
            `Te esperamos lá! Se precisar remarcar ou cancelar, basta digitar *menu*. 😊`;

          await updateConversation(tenantId, senderJid, 'MENU', {});
          await reply(confirmedCard);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Horário indisponível.';
          logger.warn({ err, tenantId, senderJid }, 'Falha no agendamento via bot');
          await reply(`⚠️ Não foi possível confirmar: ${errorMessage}\n\nEnvie *menu* para tentar outro horário.`);
          await updateConversation(tenantId, senderJid, 'MENU', {});
        }
      } else if (isAnotherTime && context.serviceId) {
        const targetDate = context.date || DateTime.now().setZone(tenant.timezone).toISODate()!;
        const { slots } = await getAvailability({
          tenantId,
          serviceId: context.serviceId,
          date: targetDate,
          professionalId: context.professionalId,
        });

        if (slots.length > 0) {
          const availableSlots: BotContext['availableSlots'] = [];
          let msg = `⏰ *Escolha outro horário disponível:*\n\n`;
          slots.slice(0, 12).forEach((s, idx) => {
            availableSlots.push({ time: s.time, startAt: s.startAt });
            msg += `*${idx + 1}* - ${s.time}\n`;
          });
          msg += `\n_Digite o número do horário desejado:_`;

          await updateConversation(tenantId, senderJid, 'SELECT_TIME', {
            ...context,
            availableSlots,
          });
          await reply(msg);
        } else {
          await updateConversation(tenantId, senderJid, 'MENU', {});
          await reply(`Não há outros horários nesta data. Digite *1* no menu para escolher outra data!`);
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
  const isDefaultOrEmpty =
    !waConfig.welcomeMessage ||
    waConfig.welcomeMessage.trim() === 'Olá! Bem-vindo.' ||
    waConfig.welcomeMessage.trim() === 'Olá! Bem-vindo(a).' ||
    waConfig.welcomeMessage.includes('assistente virtual') ||
    !waConfig.welcomeMessage.includes('IA') ||
    waConfig.welcomeMessage.trim().length < 25;

  const rawWelcome = isDefaultOrEmpty
    ? DEFAULT_WHATSAPP_MESSAGES.welcomeMessage
    : waConfig.welcomeMessage;

  const resolvedCustomerName =
    customerName && customerName !== 'Cliente' && !/^\d+$/.test(customerName.trim())
      ? customerName.trim()
      : '';

  const greeting = renderTemplate(rawWelcome, {
    salao: tenant.name,
    nome: resolvedCustomerName || 'Cliente',
    nome_saudacao: resolvedCustomerName ? `, ${resolvedCustomerName}` : '',
  });

  const menuOptions =
    `*1* - ✂️ Agendar um horário\n` +
    `*2* - 📅 Meus agendamentos\n` +
    `*3* - ❌ Cancelar agendamento\n` +
    `*4* - 💈 Horários e Localização\n` +
    `*5* - 👤 Falar com um atendente\n\n` +
    `_Responda com o número da opção desejada._`;

  const menuText = greeting.includes('1 -') || greeting.includes('*1*')
    ? greeting
    : `${greeting}\n\n${menuOptions}`;

  await reply(menuText);
}
