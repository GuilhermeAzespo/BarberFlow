import { prisma } from '../../lib/prisma.js';

/**
 * Gera variações de números de telefone comuns no Brasil (com e sem DDI 55, com e sem 9º dígito).
 */
export function getPhoneVariations(rawInput?: string | null): string[] {
  if (!rawInput) return [];
  const digits = rawInput.replace(/\D/g, '');
  if (!digits) return [];

  const set = new Set<string>();
  set.add(digits);

  // Se tem DDI 55
  if (digits.startsWith('55') && digits.length >= 12) {
    const national = digits.slice(2); // ex: 19982131483 ou 1982131483
    set.add(national);
    const ddd = national.slice(0, 2);
    const num = national.slice(2);
    if (num.length === 9 && num.startsWith('9')) {
      const without9 = `${ddd}${num.slice(1)}`;
      set.add(without9);
      set.add(`55${without9}`);
    } else if (num.length === 8) {
      const with9 = `${ddd}9${num}`;
      set.add(with9);
      set.add(`55${with9}`);
    }
  } else if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    set.add(`55${digits}`);
    const ddd = digits.slice(0, 2);
    const num = digits.slice(2);
    if (num.length === 9 && num.startsWith('9')) {
      const without9 = `${ddd}${num.slice(1)}`;
      set.add(without9);
      set.add(`55${without9}`);
    } else if (num.length === 8) {
      const with9 = `${ddd}9${num}`;
      set.add(with9);
      set.add(`55${with9}`);
    }
  }

  // Últimos 8 dígitos para casar variações
  if (digits.length >= 8) {
    set.add(digits.slice(-8));
  }
  if (digits.length >= 9) {
    set.add(digits.slice(-9));
  }

  return Array.from(set);
}

/**
 * Localiza cliente na base cadastrada (/customers) cruzando telefone, WhatsApp JID e variações de dígitos.
 */
export async function findCustomerForContact(
  tenantId: string,
  contactJid: string,
  phone?: string | null
): Promise<{ id: string; name: string; phone?: string | null; email?: string | null } | null> {
  // 1. Busca direta por whatsappJid
  const directMatch = await prisma.customer.findFirst({
    where: {
      tenantId,
      OR: [
        { whatsappJid: contactJid },
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { id: true, name: true, phone: true, email: true },
  });

  if (directMatch && directMatch.name && directMatch.name.trim() !== 'Cliente' && !/^\d+$/.test(directMatch.name.trim())) {
    return directMatch;
  }

  // 2. Extrai dígitos e variações de telefone
  const rawDigits = (phone || contactJid).replace(/[:@].*$/, '').replace(/\D/g, '');
  if (!rawDigits) return directMatch;

  const variations = getPhoneVariations(rawDigits);
  if (phone) {
    getPhoneVariations(phone).forEach((v) => variations.push(v));
  }

  const matches = await prisma.customer.findMany({
    where: {
      tenantId,
      OR: [
        { whatsappJid: contactJid },
        { phone: { in: variations } },
      ],
    },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { updatedAt: 'desc' },
  });

  const valid = matches.find(
    (c) => c.name && c.name.trim() !== 'Cliente' && !/^\d+$/.test(c.name.trim())
  );
  if (valid) return valid;

  // 3. Busca parcial pelos últimos 8 dígitos (ex: '982131483' ou '82131483')
  const last8 = rawDigits.slice(-8);
  if (last8.length === 8) {
    const partialMatch = await prisma.customer.findFirst({
      where: {
        tenantId,
        phone: { contains: last8 },
      },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (partialMatch && partialMatch.name && partialMatch.name.trim() !== 'Cliente' && !/^\d+$/.test(partialMatch.name.trim())) {
      return partialMatch;
    }
  }

  return directMatch || null;
}

/**
 * Retorna o nome amigável do atendente (ex: Guilherme Jorge Azevedo Andrade -> Guilherme Jorge).
 */
export function formatAttendantShortName(fullName?: string | null): string {
  if (!fullName) return 'Atendente';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.trim();
  return `${parts[0]} ${parts[1]}`;
}
