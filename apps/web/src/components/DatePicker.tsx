'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';

export interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  minDate?: string; // "YYYY-MM-DD"
  maxDate?: string; // "YYYY-MM-DD"
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

const MENU_GAP = 6;
const MENU_HEIGHT = 330;
const DROPDOWN_WIDTH = 290;

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function parseYMD(str?: string | null): Date | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m, d);
}

function formatYMD(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatBR(str?: string | null): string {
  if (!str) return '';
  const d = parseYMD(str);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  disabled = false,
  clearable = false,
  minDate,
  maxDate,
  id,
  className,
  style,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const parsedValue = useMemo(() => parseYMD(value), [value]);

  // Visualização atual no calendário (mês e ano)
  const [viewYear, setViewYear] = useState<number>(() => {
    return parsedValue ? parsedValue.getFullYear() : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    return parsedValue ? parsedValue.getMonth() : new Date().getMonth();
  });

  // Atualiza visualização quando o valor externo mudar
  useEffect(() => {
    if (parsedValue) {
      setViewYear(parsedValue.getFullYear());
      setViewMonth(parsedValue.getMonth());
    }
  }, [parsedValue]);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Posicionamento do Portal
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - 12;
    const spaceAbove = rect.top - MENU_GAP - 12;
    const openUp = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;

    const width = Math.max(rect.width, DROPDOWN_WIDTH);
    let left = rect.left;
    if (left + width > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - width - 12);
    }

    setPosition({
      left,
      width,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    });
  }, []);

  const togglePicker = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const closePicker = useCallback(() => {
    setOpen(false);
  }, []);

  // Mantém menu posicionado ao rolar/redimensionar
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closePicker]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const selected = new Date(viewYear, viewMonth, day);
    onChange(formatYMD(selected));
  };

  const handleSelectToday = () => {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(formatYMD(today));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Cálculo dos dias do mês na grade (grid)
  const calendarGrid = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Domingo
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: { day: number; isCurrentMonth: boolean; ymd: string }[] = [];

    // Dias do mês anterior
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        day: d,
        isCurrentMonth: false,
        ymd: formatYMD(new Date(prevY, prevM, d)),
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        ymd: formatYMD(new Date(viewYear, viewMonth, d)),
      });
    }

    // Dias do próximo mês para completar semanas
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        day: d,
        isCurrentMonth: false,
        ymd: formatYMD(new Date(nextY, nextM, d)),
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const todayStr = useMemo(() => formatYMD(new Date()), []);
  const displayValue = formatBR(value);

  const { width, minWidth, ...triggerStyle } = style ?? {};

  return (
    <div style={{ position: 'relative', width: width ?? '100%', minWidth }}>
      {/* Trigger Button com visual idêntico ao TimePicker */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={togglePicker}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '8px 14px',
          background: open ? 'rgba(229, 179, 56, 0.08)' : 'rgba(0, 0, 0, 0.45)',
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border-color)'}`,
          borderRadius: '8px',
          color: displayValue ? '#F3F4F6' : 'var(--text-dim)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: open ? '0 0 0 2px rgba(229, 179, 56, 0.25)' : 'none',
          transition: 'all 0.15s ease-in-out',
          textAlign: 'left',
          outline: 'none',
          userSelect: 'none',
          opacity: disabled ? 0.6 : 1,
          ...triggerStyle,
        }}
      >
        <span
          style={{
            fontFamily: 'monospace, monospace',
            fontSize: '0.94rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: displayValue ? '#F9FAFB' : 'var(--text-dim)',
          }}
        >
          {displayValue || placeholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              title="Limpar data"
              style={{
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '2px',
                borderRadius: '4px',
              }}
            >
              <X size={14} />
            </span>
          )}
          <CalendarIcon
            size={16}
            style={{
              color: open ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'color 0.15s',
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {/* Popover Customizado Dark & Gold Luxury */}
      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              left: position.left,
              top: position.top,
              bottom: position.bottom,
              width: position.width,
              minWidth: `${DROPDOWN_WIDTH}px`,
              background: '#0F1219',
              border: '1px solid rgba(229, 179, 56, 0.35)',
              borderRadius: '12px',
              boxShadow:
                '0 14px 38px rgba(0, 0, 0, 0.8), 0 0 16px rgba(229, 179, 56, 0.15)',
              zIndex: 99999,
              overflow: 'hidden',
              animation: 'timepicker-fade-in 0.12s ease-out',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header Dark Gold com Título e Data Selecionada */}
            <div
              style={{
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarIcon size={14} color="var(--primary)" />
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Selecionar Data
                </span>
              </div>
              <span
                style={{
                  fontFamily: 'monospace, monospace',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  letterSpacing: '0.04em',
                }}
              >
                {displayValue || '--/--/----'}
              </span>
            </div>

            {/* Barra de Navegação Mês / Ano */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.2)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <button
                type="button"
                onClick={handlePrevMonth}
                title="Mês Anterior"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <ChevronLeft size={16} />
              </button>

              <span
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  color: '#F9FAFB',
                  letterSpacing: '0.02em',
                }}
              >
                {MONTH_NAMES_PT[viewMonth]} de {viewYear}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                title="Próximo Mês"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Cabeçalho dos Dias da Semana */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                padding: '6px 8px 4px 8px',
                textAlign: 'center',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-dim)',
              }}
            >
              {WEEKDAYS_SHORT.map((wd, i) => (
                <span key={i} style={{ color: i === 0 || i === 6 ? '#F59E0B' : 'var(--text-dim)' }}>
                  {wd}
                </span>
              ))}
            </div>

            {/* Grid dos Dias */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '2px',
                padding: '4px 8px 10px 8px',
              }}
            >
              {calendarGrid.map((item, idx) => {
                const isSelected = item.ymd === value;
                const isToday = item.ymd === todayStr;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onChange(item.ymd);
                      if (!item.isCurrentMonth) {
                        const parsed = parseYMD(item.ymd);
                        if (parsed) {
                          setViewYear(parsed.getFullYear());
                          setViewMonth(parsed.getMonth());
                        }
                      }
                    }}
                    style={{
                      aspectRatio: '1 / 1',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.82rem',
                      fontWeight: isSelected ? 800 : isToday ? 700 : 500,
                      border: isSelected
                        ? '1px solid #E5B338'
                        : isToday
                        ? '1px solid rgba(229, 179, 56, 0.5)'
                        : 'none',
                      borderRadius: '7px',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'var(--primary)'
                        : isToday
                        ? 'rgba(229, 179, 56, 0.12)'
                        : 'transparent',
                      color: isSelected
                        ? '#0B0F17'
                        : !item.isCurrentMonth
                        ? 'rgba(255, 255, 255, 0.2)'
                        : '#F3F4F6',
                      boxShadow: isSelected ? '0 0 10px rgba(229, 179, 56, 0.35)' : 'none',
                      transition: 'all 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'rgba(229, 179, 56, 0.15)';
                        e.currentTarget.style.color = 'var(--primary)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = isToday
                          ? 'rgba(229, 179, 56, 0.12)'
                          : 'transparent';
                        e.currentTarget.style.color = !item.isCurrentMonth
                          ? 'rgba(255, 255, 255, 0.2)'
                          : '#F3F4F6';
                      }
                    }}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>

            {/* Footer com Botão Hoje e Confirmar */}
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.45)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <button
                type="button"
                onClick={handleSelectToday}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                Hoje
              </button>

              <button
                type="button"
                onClick={closePicker}
                className="gold-gradient-primary"
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Check size={13} />
                <span>Confirmar</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
