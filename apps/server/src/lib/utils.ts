import { DateTime } from 'luxon';

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Normaliza telefone para dígitos com DDI. Números BR sem DDI (10/11 dígitos) recebem 55. */
export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Domingo = 0 ... Sábado = 6 (Luxon usa 1 = segunda ... 7 = domingo). */
export function weekdayOf(date: DateTime): number {
  return date.weekday % 7;
}

export function dayBounds(date: DateTime) {
  return { start: date.startOf('day'), end: date.endOf('day') };
}

export function formatCurrency(cents: number, currency = 'BRL'): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
}

/** Substitui {variavel} por valores; variáveis ausentes ficam vazias. */
export function renderTemplate(template: string, vars: Record<string, string | number | undefined | null>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
