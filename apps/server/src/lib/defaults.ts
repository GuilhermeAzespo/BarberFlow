/** Valores padrão aplicados na criação de cada tenant e no bootstrap do SaaS. */

export const DEFAULT_BUSINESS_HOURS = [
  { weekday: 0, isOpen: false, openTime: '09:00', closeTime: '13:00', breakStart: null, breakEnd: null },
  { weekday: 1, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: null, breakEnd: null },
  { weekday: 2, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: null, breakEnd: null },
  { weekday: 3, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: null, breakEnd: null },
  { weekday: 4, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: null, breakEnd: null },
  { weekday: 5, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: null, breakEnd: null },
  { weekday: 6, isOpen: true, openTime: '09:00', closeTime: '17:00', breakStart: null, breakEnd: null },
];

export const DEFAULT_WHATSAPP_MESSAGES = {
  welcomeMessage:
    'Olá{nome_saudacao}! 👋 Bem-vindo(a) à *{salao}*.\nSou o bot inteligente da *{salao}* com IA para agendamentos. Escolha uma opção do menu ou experimente me enviar:\n_"Boa tarde! Gostaria de agendar um Corte Degradê com o barbeiro Lucas para hoje por volta das 16h30."_',
  confirmationMessage:
    '✅ *Agendamento confirmado!*\n\n✂️ {servico}\n💈 {profissional}\n📅 {data} às {hora}\n💰 {valor}\n\nTe esperamos na *{salao}*! Para cancelar, envie *menu* e escolha a opção 3.',
  reminderMessage:
    '⏰ Olá, {nome}! Passando para lembrar do seu horário na *{salao}*:\n\n✂️ {servico} com {profissional}\n📅 {data} às {hora}\n\nCaso não possa comparecer, envie *menu* para cancelar.',
  cancellationMessage:
    '❌ Seu agendamento de *{servico}* em {data} às {hora} foi cancelado.\nQuando quiser remarcar, é só mandar uma mensagem! 😉',
  attendantSurveyMessage:
    '👋 *Atendimento Encerrado*\nSeu atendimento com *{atendente}* foi finalizado.\n\nPara nos ajudar a manter a qualidade, como você avalia o atendimento recebido hoje?\n\n*1* - Muito ruim 😡\n*2* - Ruim 🙁\n*3* - Regular 😐\n*4* - Bom 🙂\n*5* - Excelente 🤩\n\n_Responda com uma nota de 1 a 5._',
  serviceSurveyMessage:
    '✂️ *Pesquisa de Satisfação*\nOlá, {nome}! Esperamos que tenha gostado do seu atendimento na *{salao}*!\n\nComo você avalia o serviço/corte realizado por *{profissional}* hoje?\n\n*1* - Muito ruim 😡\n*2* - Ruim 🙁\n*3* - Regular 😐\n*4* - Bom 🙂\n*5* - Excelente 🤩\n\n_Responda com um número de 1 a 5._',
};

export const DEFAULT_PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    description: 'Para quem está começando: 1 profissional e bot de WhatsApp.',
    priceCents: 1999, // R$ 19,99/mês
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    isDefault: true,
    sortOrder: 1,
    badge: null,
    isHighlighted: false,
    features: {
      items: [
        '1 Profissional',
        'Até 300 agendamentos/mês',
        'Bot de WhatsApp integrado',
        'Fluxo de caixa básico',
      ],
      permissions: {
        reports: false,
        satisfactionSurveys: false,
        customBotMessages: false,
        financialExport: false,
        customDomain: false,
        commissions: false,
        multiUserRoles: false,
        prioritySupport: false,
      },
    },
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'Equipes de até 5 profissionais com agendamentos ilimitados.',
    priceCents: 3999, // R$ 39,99/mês
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 2,
    badge: 'MAIS POPULAR',
    isHighlighted: true,
    features: {
      items: [
        'Até 5 Profissionais',
        'Agendamentos ilimitados',
        'Bot de WhatsApp personalizado',
        'Lembretes automáticos',
        'Relatórios financeiros completos',
      ],
      permissions: {
        reports: true,
        satisfactionSurveys: true,
        customBotMessages: true,
        financialExport: true,
        customDomain: false,
        commissions: true,
        multiUserRoles: true,
        prioritySupport: true,
      },
    },
  },
  {
    slug: 'premium',
    name: 'Premium',
    description: 'Sem limites para redes e salões de grande porte.',
    priceCents: 6999, // R$ 69,99/mês
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 3,
    badge: null,
    isHighlighted: false,
    features: {
      items: [
        'Profissionais ilimitados',
        'Agendamentos ilimitados',
        'Suporte prioritário',
        'Todas as funcionalidades inclusas',
      ],
      permissions: {
        reports: true,
        satisfactionSurveys: true,
        customBotMessages: true,
        financialExport: true,
        customDomain: true,
        commissions: true,
        multiUserRoles: true,
        prioritySupport: true,
      },
    },
  },
];

export const DEFAULT_EXPENSE_CATEGORIES = ['Aluguel', 'Produtos', 'Comissões', 'Energia', 'Água', 'Internet', 'Marketing', 'Manutenção', 'Impostos', 'Outros'];
export const DEFAULT_INCOME_CATEGORIES = ['Serviços', 'Produtos', 'Pacotes', 'Gorjetas', 'Outros'];
