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
    'Olá{nome_saudacao}! 👋 Bem-vindo(a) à *{salao}*.\nSou o assistente virtual e posso te ajudar a agendar seu horário em poucos segundos.',
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
    description: 'Ideal para barbeiros autônomos que desejam automatizar o WhatsApp.',
    priceCents: 4990,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    isDefault: true,
    sortOrder: 1,
    badge: null,
    isHighlighted: false,
    features: [
      '1 Profissional',
      'Até 300 agendamentos/mês',
      'Bot de WhatsApp integrado',
      'Fluxo de caixa básico',
    ],
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'Perfeito para equipes com múltiplos barbeiros e alta demanda.',
    priceCents: 9990,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 2,
    badge: 'MAIS POPULAR',
    isHighlighted: true,
    features: [
      'Até 5 Profissionais',
      'Agendamentos ilimitados',
      'Bot de WhatsApp personalizado',
      'Lembretes automáticos',
      'Relatórios financeiros completos',
    ],
  },
  {
    slug: 'premium',
    name: 'Premium',
    description: 'Para salões de grande porte e redes que necessitam de capacidade total.',
    priceCents: 19990,
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 3,
    badge: null,
    isHighlighted: false,
    features: [
      'Profissionais ilimitados',
      'Agendamentos ilimitados',
      'Suporte prioritário',
      'Todas as funcionalidades inclusas',
    ],
  },
];

export const DEFAULT_EXPENSE_CATEGORIES = ['Aluguel', 'Produtos', 'Comissões', 'Energia', 'Água', 'Internet', 'Marketing', 'Manutenção', 'Impostos', 'Outros'];
export const DEFAULT_INCOME_CATEGORIES = ['Serviços', 'Produtos', 'Pacotes', 'Gorjetas', 'Outros'];
