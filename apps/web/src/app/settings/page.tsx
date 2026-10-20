'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Upload,
  Clock,
  Save,
  Building,
  CheckCircle2,
  AlertCircle,
  Globe,
  Copy,
  ExternalLink,
  Check,
  Image as ImageIcon,
  Trash2,
  Instagram as InstagramIcon,
  Scissors,
  Plus,
  Sparkles,
} from 'lucide-react';
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

interface GalleryImage {
  id: string;
  title?: string | null;
  sortOrder: number;
  url: string;
}

const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export default function SettingsPage() {
  const { tenant, refresh } = useAuth();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);

  // Media
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const [origin, setOrigin] = useState('');
  const [copiedHome, setCopiedHome] = useState(false);
  const [copiedBooking, setCopiedBooking] = useState(false);

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
          bio?: string | null;
          instagram?: string | null;
          logoUrl?: string | null;
          coverUrl?: string | null;
          slotIntervalMinutes: number;
        };
        businessHours: BusinessHour[];
      }>('/api/tenant');

      setName(res.tenant.name);
      setSlug(res.tenant.slug || '');
      setPhone(res.tenant.phone || '');
      setAddress(res.tenant.address || '');
      setBio(res.tenant.bio || '');
      setInstagram(res.tenant.instagram || '');
      setSlotIntervalMinutes(res.tenant.slotIntervalMinutes || 30);
      setLogoPreview(res.tenant.logoUrl || null);
      setCoverPreview(res.tenant.coverUrl || null);
      setBusinessHours(res.businessHours);

      // Load gallery
      const galleryRes = await api.get<{ images: GalleryImage[] }>('/api/tenant/gallery');
      setGallery(galleryRes.images || []);
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
  const publicHomeUrl = tenantSlug && origin ? `${origin}/${tenantSlug}` : (tenantSlug ? `/${tenantSlug}` : '');
  const publicBookingUrl = tenantSlug && origin ? `${origin}/${tenantSlug}/agendar` : (tenantSlug ? `/${tenantSlug}/agendar` : '');

  const copyToClipboard = (text: string, type: 'home' | 'booking') => {
    if (!text) return;
    const fullUrl = text.startsWith('http') ? text : `${window.location.origin}${text}`;
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

    if (type === 'home') {
      setCopiedHome(true);
      setTimeout(() => setCopiedHome(false), 2500);
    } else {
      setCopiedBooking(true);
      setTimeout(() => setCopiedBooking(false), 2500);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveCover = async () => {
    setCoverFile(null);
    setCoverPreview(null);
    try {
      await api.delete('/api/tenant/cover');
      await refresh();
      setSuccessMsg('Foto de capa removida com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      // Ignora erro
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingGallery(true);
      setErrorMsg(null);
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post<{ image: GalleryImage }>('/api/tenant/gallery', formData);
      setGallery((prev) => [...prev, res.image]);
      setSuccessMsg('Foto adicionada à galeria com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao enviar foto da galeria.');
    } finally {
      setUploadingGallery(false);
      e.target.value = '';
    }
  };

  const handleDeleteGalleryItem = async (imageId: string) => {
    try {
      await api.delete(`/api/tenant/gallery/${imageId}`);
      setGallery((prev) => prev.filter((img) => img.id !== imageId));
      setSuccessMsg('Foto removida da galeria.');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao remover foto da galeria.');
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
        bio: bio.trim() || null,
        instagram: instagram.trim() || null,
        slotIntervalMinutes: Number(slotIntervalMinutes),
      });

      // Atualiza logo se selecionada
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        await api.post('/api/tenant/logo', formData);
      }

      // Atualiza capa se selecionada
      if (coverFile) {
        const formData = new FormData();
        formData.append('cover', coverFile);
        await api.post('/api/tenant/cover', formData);
      }

      // Atualiza horários de funcionamento
      await api.put('/api/tenant/business-hours', {
        businessHours,
      });

      await refresh();
      setSuccessMsg('Configurações da barbearia atualizadas com sucesso!');
      setTimeout(() => setSuccessMsg(null), 3500);
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
              Personalize a identidade visual, página inicial vitrine, horários e fotos da sua barbearia.
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

          {/* Links Públicos da Barbearia (Home e Agendamento) */}
          <div
            className="glass-panel"
            style={{
              padding: '24px 28px',
              marginBottom: '28px',
              border: '1px solid rgba(212, 175, 55, 0.35)',
              background: 'radial-gradient(ellipse at top left, rgba(212, 175, 55, 0.08) 0%, rgba(18, 18, 20, 0.6) 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
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
                <h3 style={{ fontSize: '1.18rem', fontWeight: 600 }}>Links do Salão na Web</h3>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 700,
                  }}
                >
                  DISPONÍVEL
                </span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                Divulgue a página oficial da sua barbearia para que seus clientes vejam fotos, serviços, horários e façam agendamentos online.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Home Page Link */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Sparkles size={16} color="var(--primary)" />
                    <strong style={{ fontSize: '0.92rem' }}>Página Inicial / Vitrine</strong>
                  </div>
                  <code style={{ fontSize: '0.84rem', color: 'var(--gold-light)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {publicHomeUrl || `.../${tenantSlug}`}
                  </code>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(publicHomeUrl, 'home')}
                    className="glass-card"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: copiedHome ? '#10B981' : 'var(--text-primary)',
                      borderColor: copiedHome ? 'rgba(16, 185, 129, 0.4)' : undefined,
                    }}
                  >
                    {copiedHome ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedHome ? 'Copiado!' : 'Copiar Link'}</span>
                  </button>

                  {publicHomeUrl && (
                    <a
                      href={publicHomeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gold-gradient-primary"
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        fontWeight: 600,
                        borderRadius: '6px',
                      }}
                    >
                      <ExternalLink size={14} />
                      <span>Abrir</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Booking Form Direct Link */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Scissors size={16} color="var(--primary)" />
                    <strong style={{ fontSize: '0.92rem' }}>Formulário Direto de Agendamento</strong>
                  </div>
                  <code style={{ fontSize: '0.84rem', color: 'var(--gold-light)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    {publicBookingUrl || `.../${tenantSlug}/agendar`}
                  </code>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(publicBookingUrl, 'booking')}
                    className="glass-card"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: copiedBooking ? '#10B981' : 'var(--text-primary)',
                      borderColor: copiedBooking ? 'rgba(16, 185, 129, 0.4)' : undefined,
                    }}
                  >
                    {copiedBooking ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedBooking ? 'Copiado!' : 'Copiar Link'}</span>
                  </button>

                  {publicBookingUrl && (
                    <a
                      href={publicBookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gold-gradient-primary"
                      style={{
                        padding: '8px 14px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textDecoration: 'none',
                        fontWeight: 600,
                        borderRadius: '6px',
                      }}
                    >
                      <ExternalLink size={14} />
                      <span>Abrir</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Identidade Visual & Fotos */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ fontSize: '1.18rem', fontWeight: 600, marginBottom: '20px' }}>
                Identidade & Vitrine da Barbearia
              </h3>

              {/* Logo e Capa Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '28px' }}>
                {/* Logo */}
                <div>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                    Logo do Salão
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
                        flexShrink: 0,
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
                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                      </label>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '6px' }}>
                        PNG ou JPG quadrado recomendado (máx. 2MB).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Foto de Capa / Banner */}
                <div>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: '8px' }}>
                    Foto de Capa / Banner da Home
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div
                      style={{
                        width: '100%',
                        height: '96px',
                        borderRadius: '12px',
                        background: coverPreview
                          ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(${coverPreview}) center/cover no-repeat`
                          : 'var(--bg-input)',
                        border: '2px dashed var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {!coverPreview && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.84rem' }}>
                          <ImageIcon size={20} />
                          <span>Nenhuma foto de capa definida</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <label
                        className="glass-card"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 14px',
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        <Upload size={14} />
                        <span>{coverPreview ? 'Trocar Capa' : 'Enviar Foto de Capa'}</span>
                        <input type="file" accept="image/*" onChange={handleCoverUpload} style={{ display: 'none' }} />
                      </label>

                      {coverPreview && (
                        <button
                          type="button"
                          onClick={handleRemoveCover}
                          className="glass-card"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            fontSize: '0.82rem',
                            color: '#FB7185',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                          <span>Remover</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Informações de Contato e Bio */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Nome da Barbearia *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="input-field"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Telefone / WhatsApp de Contato
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="input-field"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Instagram (@ da Barbearia)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="@suabarbearia"
                      className="input-field"
                      style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: '8px' }}
                    />
                    <InstagramIcon
                      size={18}
                      color="var(--text-dim)"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Intervalo dos Agendamentos
                  </label>
                  <Select
                    value={slotIntervalMinutes}
                    onChange={(e) => setSlotIntervalMinutes(Number(e.target.value))}
                  >
                    <option value={15}>15 em 15 minutos</option>
                    <option value={20}>20 em 20 minutos</option>
                    <option value={30}>30 em 30 minutos (Padrão)</option>
                    <option value={45}>45 em 45 minutos</option>
                    <option value={60}>60 em 60 minutos</option>
                  </Select>
                </div>
              </div>

              {/* Endereço */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                  className="input-field"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px' }}
                />
              </div>

              {/* Bio / Slogan */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Apresentação / Bio da Barbearia
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Conte um pouco sobre sua barbearia, estilo, tradição e experiência oferecida aos clientes..."
                  rows={3}
                  className="input-field"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', resize: 'vertical' }}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Esse texto será exibido no destaque da página inicial do seu salão.
                </span>
              </div>
            </div>

            {/* Galeria de Fotos */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '1.18rem', fontWeight: 600, marginBottom: '4px' }}>
                    Galeria de Fotos da Barbearia
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
                    Exiba fotos dos seus melhores cortes, barbas e do ambiente do salão na vitrine pública.
                  </p>
                </div>

                <label
                  className="gold-gradient-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: uploadingGallery ? 'wait' : 'pointer',
                    opacity: uploadingGallery ? 0.7 : 1,
                  }}
                >
                  <Plus size={16} />
                  <span>{uploadingGallery ? 'Enviando Foto...' : 'Adicionar Foto'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    disabled={uploadingGallery}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {gallery.length === 0 ? (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '12px',
                    color: 'var(--text-dim)',
                  }}
                >
                  <ImageIcon size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                  <p style={{ fontSize: '0.9rem', margin: 0 }}>Nenhuma foto adicionada à galeria ainda.</p>
                  <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Clique em "Adicionar Foto" para enriquecer a página inicial.</span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {gallery.map((img) => (
                    <div
                      key={img.id}
                      style={{
                        position: 'relative',
                        aspectRatio: '1/1',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <img
                        src={img.url}
                        alt="Foto da galeria"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteGalleryItem(img.id)}
                        title="Remover foto"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'rgba(0, 0, 0, 0.75)',
                          border: 'none',
                          borderRadius: '6px',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FB7185',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Horários de Funcionamento */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                <Clock size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '1.18rem', fontWeight: 600 }}>Horários de Atendimento Semanal</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {businessHours.map((hour) => (
                  <div
                    key={hour.weekday}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '150px' }}>
                      <input
                        type="checkbox"
                        checked={hour.isOpen}
                        onChange={(e) => handleHourChange(hour.weekday, 'isOpen', e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                      />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: hour.isOpen ? 'inherit' : 'var(--text-dim)' }}>
                        {weekdayNames[hour.weekday]}
                      </span>
                    </div>

                    {hour.isOpen ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>Abertura:</span>
                        <input
                          type="time"
                          value={hour.openTime}
                          onChange={(e) => handleHourChange(hour.weekday, 'openTime', e.target.value)}
                          className="input-field"
                          style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.88rem' }}
                        />
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>até</span>
                        <input
                          type="time"
                          value={hour.closeTime}
                          onChange={(e) => handleHourChange(hour.weekday, 'closeTime', e.target.value)}
                          className="input-field"
                          style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.88rem' }}
                        />
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        Fechado
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Botão de Salvar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                type="submit"
                disabled={saving}
                className="gold-gradient-primary gold-glow"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 28px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <Save size={18} />
                <span>{saving ? 'Salvando Alterações...' : 'Salvar Todas as Configurações'}</span>
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
