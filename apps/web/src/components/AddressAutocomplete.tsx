'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2, X, Check, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';

interface AddressResult {
  displayName: string;
  fullDisplayName?: string;
  lat?: string;
  lon?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  showMapPreview?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = 'Ex: Rua Marta da Silva Pereira, 80 ou digite o CEP',
  label = 'Endereço Completo',
  showMapPreview = true,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value || '');
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = async (term: string) => {
    const cleanTerm = term.trim();
    if (!cleanTerm || cleanTerm.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await api.get<{ results: AddressResult[] }>(
        `/api/public/address-search?q=${encodeURIComponent(cleanTerm)}`,
      );
      setSuggestions(res.results || []);
      setIsOpen(Boolean(res.results && res.results.length > 0));
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val);
    setIsTyping(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      handleSearch(val);
    }, 380);
  };

  const handleSelectSuggestion = (item: AddressResult) => {
    setInputValue(item.displayName);
    onChange(item.displayName);
    setIsOpen(false);
    setSuggestions([]);
    setIsTyping(false);
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      {label && (
        <label
          style={{
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginBottom: '6px',
            color: 'inherit',
          }}
        >
          {label}
        </label>
      )}

      {/* Input com ícones */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <MapPin
          size={18}
          color="var(--primary)"
          style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
        />

        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="input-field"
          style={{
            width: '100%',
            padding: '10px 40px 10px 38px',
            borderRadius: '8px',
            fontSize: '0.9rem',
          }}
        />

        <div style={{ position: 'absolute', right: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {loading && (
            <Loader2
              size={16}
              color="var(--primary)"
              style={{ animation: 'spin 1s linear infinite' }}
            />
          )}

          {inputValue && !loading && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
              title="Limpar endereço"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <span
        style={{
          fontSize: '0.76rem',
          color: 'var(--text-dim)',
          display: 'block',
          marginTop: '4px',
        }}
      >
        💡 Digite o nome da rua ou o CEP para buscar e autocompletar o endereço exato.
      </span>

      {/* Dropdown de sugestões */}
      {isOpen && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% - 10px)',
            left: 0,
            right: 0,
            zIndex: 60,
            background: '#121826',
            border: '1px solid rgba(229, 179, 56, 0.3)',
            borderRadius: '10px',
            boxShadow: '0 12px 30px rgba(0, 0, 0, 0.65)',
            maxHeight: '260px',
            overflowY: 'auto',
            padding: '6px',
            marginTop: '4px',
          }}
        >
          {suggestions.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleSelectSuggestion(item)}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(229, 179, 56, 0.12)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <MapPin size={16} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#F3F4F6' }}>
                  {item.displayName}
                </p>
                {item.fullDisplayName && item.fullDisplayName !== item.displayName && (
                  <span
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--text-muted)',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.fullDisplayName}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Map Preview Interativo */}
      {showMapPreview && inputValue && inputValue.trim().length >= 5 && (
        <div
          style={{
            marginTop: '12px',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid rgba(229, 179, 56, 0.25)',
            background: '#0B0F17',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(229, 179, 56, 0.08)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>
              <MapPin size={14} />
              <span>Localização confirmada no mapa</span>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(inputValue)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-muted)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>Abrir no Google Maps</span>
              <ExternalLink size={12} />
            </a>
          </div>

          <div style={{ width: '100%', height: '170px', position: 'relative' }}>
            <iframe
              title="Pré-visualização do mapa"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(inputValue)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
