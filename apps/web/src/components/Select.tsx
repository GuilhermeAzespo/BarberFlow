'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

interface OptionProps {
  value?: string | number;
  disabled?: boolean;
  children?: React.ReactNode;
}

interface SelectOption {
  value: string;
  label: React.ReactNode;
  disabled: boolean;
}

interface MenuPosition {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export interface SelectProps {
  value: string | number;
  /** Mesma forma do <select> nativo: os handlers existentes continuam usando e.target.value. */
  onChange: (e: { target: { value: string } }) => void;
  /** Elementos <option>, iguais aos do <select> nativo. */
  children: React.ReactNode;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Converte os filhos <option> (inclusive os gerados por .map) em uma lista simples. */
function collectOptions(children: React.ReactNode): SelectOption[] {
  const result: SelectOption[] = [];

  const walk = (nodes: React.ReactNode) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement<OptionProps>(child)) return;

      if (child.type === React.Fragment) {
        walk(child.props.children);
        return;
      }

      if (child.type === 'option') {
        const label = child.props.children;
        const value = child.props.value ?? (typeof label === 'string' ? label : '');
        result.push({ value: String(value), label, disabled: Boolean(child.props.disabled) });
      }
    });
  };

  walk(children);
  return result;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;
const OPTION_HEIGHT_ESTIMATE = 42;

export function Select({
  value,
  onChange,
  children,
  required,
  disabled,
  placeholder = 'Selecione...',
  id,
  className,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = collectOptions(children);
  const currentValue = String(value);
  const selectedIndex = options.findIndex((o) => o.value === currentValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const optionsCount = options.length;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const desiredHeight = Math.min(MENU_MAX_HEIGHT, optionsCount * OPTION_HEIGHT_ESTIMATE + 12);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - 12;
    const spaceAbove = rect.top - MENU_GAP - 12;
    const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow));

    setPosition({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + MENU_GAP } : { top: rect.bottom + MENU_GAP }),
    });
  }, [optionsCount]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((o) => !o.disabled));
    setOpen(true);
  };

  const closeMenu = useCallback(() => setOpen(false), []);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange({ target: { value: option.value } });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (optionsCount === 0) return;
    let next = activeIndex;
    for (let i = 0; i < optionsCount; i++) {
      next = (next + direction + optionsCount) % optionsCount;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
  };

  // Posiciona o menu e o mantém colado ao campo durante scroll/resize (inclusive dentro de modais).
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

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, closeMenu]);

  // Mantém a opção ativa visível na navegação por teclado.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex, position]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (open) moveActive(1);
        else openMenu();
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (open) moveActive(-1);
        else openMenu();
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(options.findIndex((o) => !o.disabled));
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          for (let i = optionsCount - 1; i >= 0; i--) {
            if (!options[i]?.disabled) {
              setActiveIndex(i);
              break;
            }
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open) choose(activeIndex);
        else openMenu();
        break;
      case 'Escape':
        if (open) {
          // Impede que o Esc também feche o modal que contém este campo.
          event.stopPropagation();
          closeMenu();
        }
        break;
      case 'Tab':
        closeMenu();
        break;
    }
  };

  const { width, minWidth, ...triggerStyle } = style ?? {};

  return (
    <div style={{ position: 'relative', width: width ?? '100%', minWidth }}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className={`select-trigger${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
        style={triggerStyle}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={`select-trigger-label${selected ? '' : ' is-placeholder'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={18} className="select-trigger-icon" aria-hidden="true" />
      </button>

      {/* Campo invisível apenas para a validação "required" do formulário. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={currentValue}
          onChange={() => undefined}
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: 1,
            padding: 0,
            border: 0,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            className={`select-menu${position.bottom !== undefined ? ' opens-up' : ''}`}
            style={{
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              top: position.top,
              bottom: position.bottom,
            }}
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              const isActive = index === activeIndex;
              return (
                <div
                  key={`${option.value}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  className={`select-option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${option.disabled ? ' is-disabled' : ''}`}
                  // Evita que o campo perca o foco ao clicar na opção.
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => choose(index)}
                >
                  <span className="select-option-label">{option.label}</span>
                  {isSelected && <Check size={16} aria-hidden="true" />}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
