/** Valores padrão aplicados na criação de cada tenant e no bootstrap do SaaS. */

export const DEFAULT_BUSINESS_HOURS = [
  { weekday: 0, isOpen: false, openTime: '09:00', closeTime: '13:00', breakStart: null, breakEnd: null },
  { weekday: 1, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
  { weekday: 2, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
  { weekday: 3, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
  { weekday: 4, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
  { weekday: 5, isOpen: true, openTime: '09:00', closeTime: '19:00', breakStart: '12:00', breakEnd: '13:00' },
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
};

export const DEFAULT_PLANS = [
  {
    slug: 'starter',
    name: 'Starter',
    description: 'Para quem está começando: 1 profissional e bot de WhatsApp.',
    priceCents: 4990,
    maxProfessionals: 1,
    maxAppointmentsPerMonth: 300,
    whatsappEnabled: true,
    isDefault: true,
    sortOrder: 1,
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'Equipes de até 5 profissionais com agendamentos ilimitados.',
    priceCents: 9990,
    maxProfessionals: 5,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 2,
  },
  {
    slug: 'premium',
    name: 'Premium',
    description: 'Sem limites para redes e salões de grande porte.',
    priceCents: 19990,
    maxProfessionals: null,
    maxAppointmentsPerMonth: null,
    whatsappEnabled: true,
    isDefault: false,
    sortOrder: 3,
  },
];

export const DEFAULT_EXPENSE_CATEGORIES = ['Aluguel', 'Produtos', 'Comissões', 'Energia', 'Água', 'Internet', 'Marketing', 'Manutenção', 'Impostos', 'Outros'];
export const DEFAULT_INCOME_CATEGORIES = ['Serviços', 'Produtos', 'Pacotes', 'Gorjetas', 'Outros'];
