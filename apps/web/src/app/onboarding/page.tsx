'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Check,
  Upload,
  Clock,
  Scissors,
  Users,
  ArrowRight,
  AlertCircle,
  Building,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';

export default function OnboardingPage() {
  const { tenant, refresh } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [salonName, setSalonName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Primeiro serviço
  const [serviceName, setServiceName] = useState('Corte Clássico');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [priceCents, setPriceCents] = useState(4000);

  // Primeiro profissional
  const [profName, setProfName] = useState('Barbeiro Principal');
  const [profPhone, setProfPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setSalonName(tenant.name || '');
      setPhone(tenant.phone || '');
      setAddress(tenant.address || '');
    }
  }, [tenant]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.patch('/api/tenant', {
        name: salonName,
        phone,
        address,
      });

      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await api.post('/api/tenant/logo', formData);
      }

      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Falha ao salvar dados do salão.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Cria primeiro serviço
      const serviceRes = await api.post<{ service: { id: string } }>('/api/services', {
        name: serviceName,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
      });

      // Cria primeiro profissional vinculado a esse serviço
      await api.post('/api/professionals', {
        name: profName,
        phone: profPhone || null,
        serviceIds: [serviceRes.service.id],
      });

      // Conclui onboarding
      await api.post('/api/tenant/onboarding/complete');
      await refresh();
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Falha ao finalizar setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'radial-gradient(circle at top center, rgba(229, 179, 56, 0.08) 0%, transparent 60%)',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '560px',
          padding: '40px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Wizard Progress */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step >= 1 ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                color: '#0B0F17',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.9rem',
              }}
            >
              1
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: step >= 1 ? 'var(--text-main)' : 'var(--text-dim)' }}>
              Identidade
            </span>
          </div>

          <div style={{ flex: 1, height: '2px', background: step >= 2 ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)', margin: '0 16px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step >= 2 ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                color: '#0B0F17',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.9rem',
              }}
            >
              2
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: step >= 2 ? 'var(--text-main)' : 'var(--text-dim)' }}>
              Equipe & Serviços
            </span>
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#FB7185',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>Personalize seu Salão</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Estes dados serão apresentados aos seus clientes no WhatsApp e comprovantes.
              </p>
            </div>

            {/* Logo Upload Box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '16px',
                  background: 'var(--bg-input)',
                  border: '2px dashed var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Building size={32} color="var(--text-dim)" />
                )}
              </div>
              <div style={{ flex: 1 }}>
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
                  <span>Escolher Logo (PNG, JPG)</span>
                  <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleLogoChange} style={{ display: 'none' }} />
                </label>
                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                  Máximo 2MB. Dimensões recomendadas 250x250px.
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Nome do Salão
              </label>
              <input
                type="text"
                required
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                placeholder="Nome da sua barbearia"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Telefone de Contato
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: (11) 99999-8888"
              />
            </div>

            <div>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="Ex: Rua Marta da Silva Pereira, 80 ou digite o CEP"
                showMapPreview
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="gold-gradient-primary gold-glow"
              style={{
                padding: '14px',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '10px',
              }}
            >
              <span>Avançar para Equipe & Serviços</span>
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '6px' }}>Primeiro Serviço & Profissional</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Cadastre seu serviço principal e o primeiro profissional para ativar o bot de WhatsApp.
              </p>
            </div>

            <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                <Scissors size={18} />
                <span>Serviço Principal</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Nome do Serviço
                </label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Ex: Corte Degradê"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Duração (minutos)
                  </label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Preço (R$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    required
                    value={priceCents / 100}
                    onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))}
                  />
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                <Users size={18} />
                <span>Profissional</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Nome do Profissional / Barbeiro
                </label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  placeholder="Ex: Carlos (Barbeiro)"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="glass-card"
                style={{ padding: '14px 20px', fontWeight: 600, fontSize: '0.95rem' }}
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="gold-gradient-primary gold-glow"
                style={{
                  flex: 1,
                  padding: '14px',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>{loading ? 'Finalizando...' : 'Concluir Setup e Ir ao Painel'}</span>
                {!loading && <Check size={18} />}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
