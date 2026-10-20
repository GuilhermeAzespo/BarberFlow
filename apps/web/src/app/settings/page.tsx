'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Upload, Clock, Save, Building, CheckCircle2, AlertCircle, Globe, Copy, ExternalLink, Check } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Select } from '../../components/Select';

interface BusinessHour {
  weekday: number;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}

const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export default function SettingsPage() {
  const { tenant, refresh } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const res = await api.get<{
        tenant: {
          name: string;
          slug?: string;
          phone?: string | null;
          address?: string | null;
          logoUrl?: string | null;
          slotIntervalMinutes: number;
        };
        businessHours: BusinessHour[];
      }>('/api/tenant');

      setName(res.tenant.name);
      setSlug(res.tenant.slug || '');
      setPhone(res.tenant.phone || '');
      setAddress(res.tenant.address || '');
      setSlotIntervalMinutes(res.tenant.slotIntervalMinutes || 30);
      setLogoPreview(res.tenant.logoUrl || null);
      setBusinessHours(res.businessHours);
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    loadSettings();
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const tenantSlug = slug || tenant?.slug || '';
  const publicBookingUrl = tenantSlug && origin ? `${origin}/${tenantSlug}` : (tenantSlug ? `/${tenantSlug}` : '');

  const handleCopyLink = () => {
    if (!publicBookingUrl) return;
    const fullUrl = publicBookingUrl.startsWith('http') ? publicBookingUrl : `${window.location.origin}${publicBookingUrl}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(fullUrl);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleHourChange = (weekday: number, field: keyof BusinessHour, value: unknown) => {
    setBusinessHours((prev) =>
      prev.map((h) => (h.weekday === weekday ? { ...h, [field]: value } : h)),
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Atualiza dados cadastrais
      await api.patch('/api/tenant', {
        name,
        phone,
        address,
        slotIntervalMinutes: Number(slotIntervalMinutes),
      });

      // Atualiza logo se selecionada
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await api.post('/api/tenant/logo', formData);
      }

      // Atualiza horários de funcionamento
      await api.put('/api/tenant/business-hours', {
        businessHours,
      });

      await refresh();
      setSuccessMsg('Configurações do salão atualizadas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Configurações do Salão</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Personalize sua identidade visual, horários de expediente e intervalos de agendamento.
            </p>
          </div>

          {successMsg && (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34D399',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '24px',
              }}
            >
              <CheckCircle2 size={18} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div
              style={{
                padding: '12px 18px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#FB7185',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '24px',
              }}
            >
              <AlertCircle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Link Personalizado de Agendamento Online */}
          <div
            className="glass-panel"
            style={{
              padding: '24px 28px',
              marginBottom: '28px',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              background: 'radial-gradient(ellipse at top left, rgba(212, 175, 55, 0.08) 0%, rgba(18, 18, 20, 0.6) 100%)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(212, 175, 55, 0.15)',
                      border: '1px solid rgba(212, 175, 55, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--gold-primary)',
                    }}
                  >
                    <Globe size={18} />
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Link de Agendamento Online</h3>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10B981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      fontWeight: 600,
                    }}
                  >
                    DISPONÍVEL
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '16px', lineHeight: 1.5 }}>
                  Compartilhe este link na bio do Instagram, no WhatsApp ou envie diretamente para seus clientes agendarem horários em poucos segundos.
                </p>

                {/* URL display box */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    maxWidth: '560px',
                  }}
                >
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', userSelect: 'none' }}>Página:</span>
                  <code
                    style={{
                      flex: 1,
                      color: 'var(--gold-light)',
                      fontSize: '0.88rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace',
                    }}
                  >
                    {publicBookingUrl || `.../${tenantSlug || 'seu-salao'}`}
                  </code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="glass-card"
                  style={{
                    padding: '10px 18px',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    color: copied ? '#10B981' : 'var(--text-primary)',
                    borderColor: copied ? 'rgba(16, 185, 129, 0.4)' : undefined,
                    background: copied ? 'rgba(16, 185, 129, 0.1)' : undefined,
                    transition: 'all 0.2s',
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Link Copiado!' : 'Copiar Link'}</span>
                </button>

                {publicBookingUrl && (
                  <a
                    href={publicBookingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gold-gradient-primary gold-glow"
                    style={{
                      padding: '10px 18px',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={16} />
                    <span>Abrir Página</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Identidade Visual */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '20px' }}>Identidade & Dados</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
                <div
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '16px',
                    background: 'var(--bg-input)',
                    border: '2px dashed var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {logoPreview ? (
                    <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Building size={34} color="var(--text-dim)" />
                  )}
                </div>

                <div>
                  <label
                    className="glass-card"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    <Upload size={16} />
                    <span>Substituir Logo</span>
                    <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                    A logo é exibida na área de agendamento e cabeçalhos.
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Nome do Salão
                  </label>
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Telefone de Atendimento
                  </label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Endereço
                  </label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Intervalo dos Horários na Grade
                  </label>
                  <Select
                    value={slotIntervalMinutes}
                    onChange={(e) => setSlotIntervalMinutes(Number(e.target.value))}
                  >
                    <option value={15}>15 minutos</option>
                    <option value={20}>20 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>60 minutos (1 hora)</option>
                  </Select>
                </div>
              </div>
            </div>

            {/* Horários de Funcionamento */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <Clock size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Horários de Funcionamento da Semana</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {businessHours.map((bh) => (
                  <div
                    key={bh.weekday}
                    className="glass-card"
                    style={{
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px',
                      opacity: bh.isOpen ? 1 : 0.5,
                    }}
                  >
                    <div style={{ width: '150px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={bh.isOpen}
                        onChange={(e) => handleHourChange(bh.weekday, 'isOpen', e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{weekdayNames[bh.weekday]}</span>
                    </div>

                    {bh.isOpen ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                          <span>Abertura:</span>
                          <input
                            type="time"
                            value={bh.openTime}
                            onChange={(e) => handleHourChange(bh.weekday, 'openTime', e.target.value)}
                            style={{ width: '100px', padding: '6px 8px' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                          <span>Fechamento:</span>
                          <input
                            type="time"
                            value={bh.closeTime}
                            onChange={(e) => handleHourChange(bh.weekday, 'closeTime', e.target.value)}
                            style={{ width: '100px', padding: '6px 8px' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                          <span>Almoço:</span>
                          <input
                            type="time"
                            value={bh.breakStart || ''}
                            onChange={(e) => handleHourChange(bh.weekday, 'breakStart', e.target.value || null)}
                            style={{ width: '90px', padding: '6px 8px' }}
                          />
                          <span>às</span>
                          <input
                            type="time"
                            value={bh.breakEnd || ''}
                            onChange={(e) => handleHourChange(bh.weekday, 'breakEnd', e.target.value || null)}
                            style={{ width: '90px', padding: '6px 8px' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.88rem', fontStyle: 'italic' }}>
                        Salão fechado
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={saving}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '14px 32px', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Save size={18} />
                <span>{saving ? 'Salvando...' : 'Salvar Todas as Configurações'}</span>
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
