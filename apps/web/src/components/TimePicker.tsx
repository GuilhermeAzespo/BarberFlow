'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Check, X } from 'lucide-react';

export interface TimePickerProps {
  value: string; // "HH:MM" format (e.g. "09:00") or ""
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  minuteStep?: number; // default 1 (all 00-59)
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

const MENU_GAP = 6;
const MENU_HEIGHT = 270;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_ALL = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimePicker({
  value,
  onChange,
  placeholder = '--:--',
  disabled = false,
  clearable = false,
  id,
  className,
  style,
  minuteStep = 1,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoursListRef = useRef<HTMLDivElement>(null);
  const minutesListRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const [currentHour, currentMinute] = (value && value.includes(':') ? value.split(':') : ['09', '00']).map((s) =>
    s.padStart(2, '0')
  );

  const minutes = React.useMemo(() => {
    if (minuteStep <= 1) return MINUTES_ALL;
    return MINUTES_ALL.filter((_, idx) => idx % minuteStep === 0);
  }, [minuteStep]);

  // Position calculation with portal
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - 12;
    const spaceAbove = rect.top - MENU_GAP - 12;
    const openUp = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;

    // Default dropdown width: at least trigger width, minimum 210px
    const width = Math.max(rect.width, 210);

    // Ensure it doesn't overflow right edge of window
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

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
  };

  const closePicker = useCallback(() => {
    setOpen(false);
  }, []);

  const togglePicker = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  // Scroll to selected hour and minute when opened
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      // Scroll hour item into view
      const selectedHourEl = hoursListRef.current?.querySelector<HTMLElement>(
        `[data-hour="${currentHour}"]`
      );
      if (selectedHourEl && hoursListRef.current) {
        hoursListRef.current.scrollTop =
          selectedHourEl.offsetTop - hoursListRef.current.offsetTop - 70;
      }

      // Scroll minute item into view
      const selectedMinEl = minutesListRef.current?.querySelector<HTMLElement>(
        `[data-minute="${currentMinute}"]`
      );
      if (selectedMinEl && minutesListRef.current) {
        minutesListRef.current.scrollTop =
          selectedMinEl.offsetTop - minutesListRef.current.offsetTop - 70;
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [open, currentHour, currentMinute]);

  // Keep menu attached to trigger on resize/scroll
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

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closePicker();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, closePicker]);

  const handleSelectHour = (newHour: string) => {
    const min = currentMinute || '00';
    onChange(`${newHour}:${min}`);
  };

  const handleSelectMinute = (newMinute: string) => {
    const hr = currentHour || '09';
    onChange(`${hr}:${newMinute}`);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    closePicker();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePicker();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePicker();
    }
  };

  const { width, minWidth, ...triggerStyle } = style ?? {};

  return (
    <div style={{ position: 'relative', width: width ?? '100%', minWidth }}>
      {/* Box do Horário (Trigger clicável em toda a sua área) */}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={togglePicker}
        onKeyDown={handleKeyDown}
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
          color: value ? '#F3F4F6' : 'var(--text-dim)',
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
            fontSize: '0.96rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: value ? '#F9FAFB' : 'var(--text-dim)',
          }}
        >
          {value || placeholder}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {clearable && value && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              title="Limpar horário"
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
          <Clock
            size={16}
            style={{
              color: open ? 'var(--primary)' : 'var(--text-muted)',
              transition: 'color 0.15s',
              flexShrink: 0,
            }}
          />
        </div>
      </button>

      {/* Dropdown Customizado com Visual Dark & Gold Luxury */}
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
              minWidth: '210px',
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
            {/* Header com preview e títulos das colunas */}
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
                <Clock size={14} color="var(--primary)" />
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Selecionar Horário
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
                {currentHour}:{currentMinute}
              </span>
            </div>

            {/* Cabeçalho das duas colunas */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '6px 10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-dim)',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <span>Hora</span>
              <span>Minuto</span>
            </div>

            {/* Duas colunas com rolagem independente */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                height: '180px',
                background: 'rgba(0, 0, 0, 0.25)',
              }}
            >
              {/* Coluna 1: Horas (00 a 23) */}
              <div
                ref={hoursListRef}
                style={{
                  overflowY: 'auto',
                  borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  scrollbarWidth: 'thin',
                }}
              >
                {HOURS.map((hr) => {
                  const isSelected = hr === currentHour;
                  return (
                    <button
                      key={hr}
                      type="button"
                      data-hour={hr}
                      onClick={() => handleSelectHour(hr)}
                      style={{
                        padding: '6px 0',
                        textAlign: 'center',
                        fontSize: '0.88rem',
                        fontWeight: isSelected ? 700 : 500,
                        fontFamily: 'monospace, monospace',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: isSelected
                          ? 'var(--primary)'
                          : 'transparent',
                        color: isSelected ? '#0B0F17' : '#E5E7EB',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background =
                            'rgba(229, 179, 56, 0.15)';
                          e.currentTarget.style.color = 'var(--primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#E5E7EB';
                        }
                      }}
                    >
                      {hr}
                    </button>
                  );
                })}
              </div>

              {/* Coluna 2: Minutos */}
              <div
                ref={minutesListRef}
                style={{
                  overflowY: 'auto',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  scrollbarWidth: 'thin',
                }}
              >
                {minutes.map((min) => {
                  const isSelected = min === currentMinute;
                  return (
                    <button
                      key={min}
                      type="button"
                      data-minute={min}
                      onClick={() => handleSelectMinute(min)}
                      style={{
                        padding: '6px 0',
                        textAlign: 'center',
                        fontSize: '0.88rem',
                        fontWeight: isSelected ? 700 : 500,
                        fontFamily: 'monospace, monospace',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: isSelected
                          ? 'var(--primary)'
                          : 'transparent',
                        color: isSelected ? '#0B0F17' : '#E5E7EB',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background =
                            'rgba(229, 179, 56, 0.15)';
                          e.currentTarget.style.color = 'var(--primary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#E5E7EB';
                        }
                      }}
                    >
                      {min}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Atalhos Rápidos de Minutos (:00, :15, :30, :45) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                gap: '4px',
              }}
            >
              {['00', '15', '30', '45'].map((quickMin) => (
                <button
                  key={quickMin}
                  type="button"
                  onClick={() => handleSelectMinute(quickMin)}
                  style={{
                    flex: 1,
                    padding: '3px 0',
                    fontSize: '0.72rem',
                    fontWeight: currentMinute === quickMin ? 700 : 600,
                    fontFamily: 'monospace, monospace',
                    background:
                      currentMinute === quickMin
                        ? 'rgba(229, 179, 56, 0.25)'
                        : 'rgba(0, 0, 0, 0.4)',
                    color:
                      currentMinute === quickMin
                        ? 'var(--primary)'
                        : 'var(--text-dim)',
                    border: `1px solid ${
                      currentMinute === quickMin
                        ? 'rgba(229, 179, 56, 0.4)'
                        : 'rgba(255, 255, 255, 0.06)'
                    }`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  :{quickMin}
                </button>
              ))}
            </div>

            {/* Footer com botão Concluir */}
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(0, 0, 0, 0.45)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
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
