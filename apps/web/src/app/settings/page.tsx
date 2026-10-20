'use client';

import React, { useEffect, useState } from 'react';
import { Settings, Upload, Clock, Save, Building, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSettings = async () => {
    try {
      const res = await api.get<{
        tenant: {
          name: string;
          phone?: string | null;
          address?: string | null;
          logoUrl?: string | null;
          slotIntervalMinutes: number;
        };
        businessHours: BusinessHour[];
      }>('/api/tenant');

      setName(res.tenant.name);
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
  }, []);

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
