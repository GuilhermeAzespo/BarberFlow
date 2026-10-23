'use client';

import React, { useEffect, useState } from 'react';
import {
  Scissors,
  Plus,
  Edit2,
  Trash2,
  Clock,
  CheckCircle2,
  Flame,
  Send,
  MessageSquare,
  Mail,
  Copy,
  Check,
  Sparkles,
  Tag,
  Users,
  AlertCircle,
  ExternalLink,
  Megaphone,
  Percent,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';

interface Service {
  id: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  promoPriceCents?: number | null;
  promoTitle?: string | null;
  promoActive?: boolean;
  promoExpiresAt?: string | null;
  isPromoExpired?: boolean;
  isActive: boolean;
}

interface PromoAudience {
  totalCustomers: number;
  withPhone: number;
  withEmail: number;
}

interface BroadcastResult {
  success: boolean;
  totalCustomers: number;
  whatsappSent: number;
  whatsappFailed: number;
  emailSent: number;
  emailFailed: number;
  bookingUrl: string;
}

const formatForInput = (isoString?: string | null) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatExpirationDisplay = (isoString?: string | null) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Novo/Editar Serviço
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [priceCents, setPriceCents] = useState(3500);

  // Promoção no Serviço
  const [promoActive, setPromoActive] = useState(false);
  const [promoPriceCents, setPromoPriceCents] = useState<number | null>(null);
  const [promoTitle, setPromoTitle] = useState('');
  const [promoHasExpiration, setPromoHasExpiration] = useState(false);
  const [promoExpiresAt, setPromoExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal de Disparo de Campanha Promocional
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [audience, setAudience] = useState<PromoAudience | null>(null);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [channelWhatsApp, setChannelWhatsApp] = useState(true);
  const [channelEmail, setChannelEmail] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [isCustomizingMessage, setIsCustomizingMessage] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  const loadServices = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ services: Service[] }>('/api/services');
      setServices(res.services);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setDurationMinutes(30);
    setPriceCents(3500);
    setPromoActive(false);
    setPromoPriceCents(null);
    setPromoTitle('');
    setPromoHasExpiration(false);
    setPromoExpiresAt('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (s: Service) => {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description || '');
    setDurationMinutes(s.durationMinutes);
    setPriceCents(s.priceCents);
    setPromoActive(Boolean(s.promoActive));
    setPromoPriceCents(s.promoPriceCents ?? null);
    setPromoTitle(s.promoTitle || '');
    setPromoHasExpiration(Boolean(s.promoExpiresAt));
    setPromoExpiresAt(s.promoExpiresAt ? formatForInput(s.promoExpiresAt) : '');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (promoActive && promoPriceCents !== null && promoPriceCents >= priceCents) {
      setErrorMsg('O preço promocional deve ser menor que o preço original do serviço.');
      return;
    }

    if (promoActive && promoHasExpiration && promoExpiresAt) {
      const expDate = new Date(promoExpiresAt);
      if (isNaN(expDate.getTime()) || expDate <= new Date()) {
        setErrorMsg('A data e horário de término da promoção devem ser futuros.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload = {
        name,
        description: description || null,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
        promoActive: Boolean(promoActive),
        promoPriceCents: promoActive && promoPriceCents ? Number(promoPriceCents) : null,
        promoTitle: promoActive && promoTitle.trim() ? promoTitle.trim() : null,
        promoExpiresAt: promoActive && promoHasExpiration && promoExpiresAt ? new Date(promoExpiresAt).toISOString() : null,
      };

      if (editingId) {
        await api.patch(`/api/services/${editingId}`, payload);
      } else {
        await api.post('/api/services', payload);
      }

      setIsModalOpen(false);
      await loadServices();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao salvar serviço.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover/desativar este serviço?')) return;
    try {
      await api.delete(`/api/services/${id}`);
      await loadServices();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao remover serviço.');
    }
  };

  // Disparo de Promoções
  const openBroadcastModal = async (preselectedService?: Service) => {
    const targetService = preselectedService || services.find((s) => s.promoActive) || services[0];
    if (targetService) {
      setSelectedServiceId(targetService.id);
    }
    setBroadcastResult(null);
    setBroadcastError(null);
    setCustomMessage('');
    setCustomSubject('');
    setIsCustomizingMessage(false);
    setIsBroadcastModalOpen(true);

    // Carregar estatísticas do público (audiência de clientes)
    setLoadingAudience(true);
    try {
      const aud = await api.get<PromoAudience>('/api/services/promo-audience');
      setAudience(aud);
    } catch {
      setAudience({ totalCustomers: 0, withPhone: 0, withEmail: 0 });
    } finally {
      setLoadingAudience(false);
    }
  };

  const selectedService = services.find((s) => s.id === selectedServiceId) || services[0];

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const calculateDiscount = (originalCents: number, promoCents: number | null | undefined) => {
    if (!promoCents || promoCents >= originalCents) return 0;
    return Math.round(((originalCents - promoCents) / originalCents) * 100);
  };

  // Gerador de Mensagem Padrão
  const getStandardMessagePreview = (service?: Service) => {
    if (!service) return '';
    const original = formatBRL(service.priceCents);
    const promo = service.promoPriceCents ? formatBRL(service.promoPriceCents) : original;
    const discount = calculateDiscount(service.priceCents, service.promoPriceCents);
    const expiresFormatted = service.promoExpiresAt ? formatExpirationDisplay(service.promoExpiresAt) : null;

    return [
      `✂️🔥 *SUPER PROMOÇÃO NO SALÃO!* 🔥`,
      ``,
      `Olá, *{NOME}*! 👋`,
      `Preparamos uma oferta especial exclusiva para você:`,
      ``,
      `💈 *Serviço:* ${service.name}`,
      service.promoPriceCents ? `❌ *De:* ~${original}~` : '',
      service.promoPriceCents ? `✅ *Por Apenas:* *${promo}*! (${discount}% OFF)` : `💰 *Valor:* *${original}*`,
      `⏱️ *Duração:* ${service.durationMinutes} minutos`,
      service.promoTitle ? `🏷️ *Oferta:* ${service.promoTitle}` : '',
      expiresFormatted ? `⏳ *Oferta por tempo limitado:* Válida até ${expiresFormatted}` : '',
      ``,
      `📅 *Garanta seu horário com desconto antes que esgote:*`,
      `🔗 *Agende online em segundos:* {LINK_AGENDAMENTO}`,
      ``,
      `Esperamos por você! 💈✂️`,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleBroadcast = async () => {
    if (!selectedService) {
      setBroadcastError('Selecione um serviço para disparar a campanha.');
      return;
    }

    const channels: ('WHATSAPP_BOT' | 'EMAIL')[] = [];
    if (channelWhatsApp) channels.push('WHATSAPP_BOT');
    if (channelEmail) channels.push('EMAIL');

    if (channels.length === 0) {
      setBroadcastError('Selecione ao menos um canal de envio (WhatsApp ou E-mail).');
      return;
    }

    const confirmMsg = `Confirmar disparo da promoção de "${selectedService.name}" para a base de clientes?\nCanais: ${channels.join(' e ')}`;
    if (!confirm(confirmMsg)) return;

    setBroadcasting(true);
    setBroadcastError(null);

    try {
      const res = await api.post<BroadcastResult>(`/api/services/${selectedService.id}/broadcast-promo`, {
        channels,
        customMessage: customMessage.trim() || undefined,
        customSubject: customSubject.trim() || undefined,
      });

      setBroadcastResult(res);
    } catch (err: unknown) {
      setBroadcastError(err instanceof ApiError ? err.message : 'Falha ao disparar promoção para os clientes.');
    } finally {
      setBroadcasting(false);
    }
  };

  const handleCopyPreview = () => {
    const text = (customMessage.trim() || getStandardMessagePreview(selectedService))
      .replace(/\{NOME\}/g, 'Cliente')
      .replace(/\{LINK_AGENDAMENTO\}/g, 'https://barberflow.azespo.com.br');

    navigator.clipboard.writeText(text);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 3000);
  };

  const handleOpenWhatsAppWeb = () => {
    const text = (customMessage.trim() || getStandardMessagePreview(selectedService))
      .replace(/\{NOME\}/g, 'Cliente')
      .replace(/\{LINK_AGENDAMENTO\}/g, 'https://barberflow.azespo.com.br');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const activePromosCount = services.filter((s) => {
    return (
      s.promoActive &&
      s.promoPriceCents &&
      (!s.promoExpiresAt || new Date(s.promoExpiresAt) > new Date())
    );
  }).length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          {/* Top Bar Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h1 style={{ fontSize: '1.85rem', fontWeight: 700 }}>Serviços & Preços</h1>
                {activePromosCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      color: '#F59E0B',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    <Flame size={13} />
                    {activePromosCount} em Promoção
                  </span>
                )}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Defina serviços oferecidos, gerencie promoções com desconto e faça disparos em massa via WhatsApp e E-mail.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Botão de Disparar Campanha Promocional */}
              <button
                type="button"
                onClick={() => openBroadcastModal()}
                disabled={services.length === 0}
                className="glass-card"
                style={{
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#F59E0B',
                  borderColor: 'rgba(245, 158, 11, 0.3)',
                  fontWeight: 600,
                  cursor: services.length === 0 ? 'not-allowed' : 'pointer',
                  background: 'rgba(245, 158, 11, 0.08)',
                }}
              >
                <Megaphone size={16} />
                <span>Disparar Promoção</span>
              </button>

              <button
                type="button"
                onClick={openCreateModal}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Adicionar Serviço</span>
              </button>
            </div>
          </div>

          {/* Lista de Serviços */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando serviços...</p>
            ) : services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Scissors size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhum serviço cadastrado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                {services.map((s) => {
                  const isPromo = Boolean(
                    s.promoActive &&
                    s.promoPriceCents &&
                    s.promoPriceCents < s.priceCents &&
                    (!s.promoExpiresAt || new Date(s.promoExpiresAt) > new Date())
                  );
                  const isExpired = Boolean(
                    s.promoExpiresAt &&
                    new Date(s.promoExpiresAt) <= new Date() &&
                    s.promoPriceCents
                  );
                  const discountPercent = isPromo ? calculateDiscount(s.priceCents, s.promoPriceCents) : 0;
                  const expiresFormatted = s.promoExpiresAt ? formatExpirationDisplay(s.promoExpiresAt) : null;

                  return (
                    <div
                      key={s.id}
                      className="glass-card"
                      style={{
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '16px',
                        opacity: s.isActive ? 1 : 0.6,
                        border: isPromo ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid var(--border-color)',
                        background: isPromo
                          ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.05) 0%, rgba(11, 15, 23, 0.6) 100%)'
                          : undefined,
                      }}
                    >
                      <div>
                        {/* Header do Card com Badges */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                              <h4 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                {s.name}
                              </h4>
                              {isPromo && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    background: 'rgba(245, 158, 11, 0.18)',
                                    color: '#F59E0B',
                                    padding: '2px 7px',
                                    borderRadius: '5px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                  }}
                                >
                                  <Flame size={12} />
                                  PROMOÇÃO
                                </span>
                              )}
                              {isPromo && discountPercent > 0 && (
                                <span
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#34D399',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  -{discountPercent}%
                                </span>
                              )}
                            </div>

                            {isPromo && s.promoTitle && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#F59E0B', marginBottom: '4px' }}>
                                <Tag size={12} />
                                <span>{s.promoTitle}</span>
                              </div>
                            )}

                            {isPromo && expiresFormatted && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#F87171', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '2px 6px', borderRadius: '4px', marginBottom: '6px' }}>
                                <Clock size={11} />
                                <span>Expira em {expiresFormatted}</span>
                              </div>
                            )}

                            {isExpired && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#94A3B8', background: 'rgba(100, 116, 139, 0.15)', padding: '2px 6px', borderRadius: '4px', marginBottom: '6px' }}>
                                <span>⏱️ Expirada em {expiresFormatted}</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => openEditModal(s)}
                              title="Editar Serviço"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '5px',
                                borderRadius: '4px',
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              title="Remover Serviço"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#FB7185',
                                cursor: 'pointer',
                                padding: '5px',
                                borderRadius: '4px',
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {s.description && (
                          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                            {s.description}
                          </p>
                        )}
                      </div>

                      {/* Footer do Card */}
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '12px',
                            borderTop: '1px solid var(--border-color)',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                            <Clock size={15} />
                            <span>{s.durationMinutes} minutos</span>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            {isPromo ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span style={{ fontSize: '0.8rem', color: '#94A3B8', textDecoration: 'line-through' }}>
                                  {formatBRL(s.priceCents)}
                                </span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10B981' }}>
                                  {formatBRL(s.promoPriceCents!)}
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                                {formatBRL(s.priceCents)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botão de Disparo Direto no Card */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => openBroadcastModal(s)}
                            className="glass-card"
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              color: isPromo ? '#F59E0B' : 'var(--text-muted)',
                              borderColor: isPromo ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-color)',
                              background: isPromo ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                              cursor: 'pointer',
                              borderRadius: '7px',
                            }}
                          >
                            <Megaphone size={14} />
                            <span>Disparar Campanha</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Adicionar/Editar Serviço */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Editar Serviço' : 'Novo Serviço'}>
        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#FB7185',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Nome do Serviço *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Barba Terapia & Toalha Quente"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Descrição Breve
            </label>
            <input
              type="text"
              placeholder="Ex: Finalização com óleo essencial e navalha esterilizada"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Duração (minutos) *
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
                Preço Normal (R$) *
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

          {/* Seção de Configuração de Promoção */}
          <div
            style={{
              marginTop: '4px',
              padding: '16px',
              borderRadius: '10px',
              background: promoActive ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
              border: promoActive ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-color)',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: promoActive ? '14px' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={18} color={promoActive ? '#F59E0B' : 'var(--text-dim)'} />
                <div>
                  <h5 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                    Preço Promocional
                  </h5>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                    Destaque este serviço com desconto e dispare para clientes via WhatsApp e E-mail.
                  </p>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={promoActive}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setPromoActive(checked);
                    if (checked && !promoPriceCents) {
                      setPromoPriceCents(Math.round(priceCents * 0.8)); // sugestão de 20% OFF
                    }
                  }}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: '34px',
                    backgroundColor: promoActive ? '#F59E0B' : 'rgba(255, 255, 255, 0.2)',
                    transition: '.2s',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      height: '16px',
                      width: '16px',
                      left: promoActive ? '23px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '.2s',
                    }}
                  />
                </span>
              </label>
            </div>

            {promoActive && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: '#F59E0B', fontWeight: 600, marginBottom: '4px' }}>
                      Preço com Desconto (R$) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      required={promoActive}
                      value={promoPriceCents !== null ? promoPriceCents / 100 : ''}
                      onChange={(e) => setPromoPriceCents(Math.round(Number(e.target.value) * 100))}
                      placeholder="Ex: 29,90"
                      style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      Selo / Título da Promoção
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Quarta Especial / Black Friday"
                      value={promoTitle}
                      onChange={(e) => setPromoTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Resumo do Desconto */}
                {promoPriceCents !== null && (
                  <div>
                    {promoPriceCents < priceCents ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#34D399',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        <CheckCircle2 size={15} />
                        <span>
                          Desconto de {calculateDiscount(priceCents, promoPriceCents)}% ({formatBRL(priceCents - promoPriceCents)} de economia para o cliente!)
                        </span>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(244, 63, 94, 0.12)',
                          color: '#FB7185',
                          fontSize: '0.8rem',
                        }}
                      >
                        <AlertCircle size={15} />
                        <span>O valor promocional deve ser menor que o preço original ({formatBRL(priceCents)}).</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Promoção por Tempo Limitado (com término automático) */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: promoHasExpiration ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: promoHasExpiration ? '#F59E0B' : 'var(--text-main)',
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={promoHasExpiration}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setPromoHasExpiration(checked);
                          if (checked && !promoExpiresAt) {
                            const today = new Date();
                            today.setHours(23, 59, 0, 0);
                            setPromoExpiresAt(formatForInput(today.toISOString()));
                          }
                        }}
                      />
                      <Clock size={15} color={promoHasExpiration ? '#F59E0B' : 'var(--text-dim)'} />
                      <span>Promoção por Tempo Limitado (com término automático)</span>
                    </label>
                  </div>

                  {promoHasExpiration && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                          Válido até a data e horário de término:
                        </label>
                        <input
                          type="datetime-local"
                          required={promoHasExpiration}
                          value={promoExpiresAt}
                          onChange={(e) => setPromoExpiresAt(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            fontSize: '0.82rem',
                            borderColor: 'rgba(245, 158, 11, 0.4)',
                          }}
                        />
                      </div>

                      {/* Chips de Atalho Rápido */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Atalhos:</span>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setHours(23, 59, 0, 0);
                            setPromoExpiresAt(formatForInput(d.toISOString()));
                          }}
                          className="glass-card"
                          style={{ padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '4px' }}
                        >
                          Hoje 23:59
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 1);
                            d.setHours(23, 59, 0, 0);
                            setPromoExpiresAt(formatForInput(d.toISOString()));
                          }}
                          className="glass-card"
                          style={{ padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '4px' }}
                        >
                          Amanhã 23:59
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            const dayOfWeek = d.getDay();
                            const diff = (7 - dayOfWeek) % 7 || 7;
                            d.setDate(d.getDate() + diff);
                            d.setHours(23, 59, 0, 0);
                            setPromoExpiresAt(formatForInput(d.toISOString()));
                          }}
                          className="glass-card"
                          style={{ padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '4px' }}
                        >
                          Domingo 23:59
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + 7);
                            d.setHours(23, 59, 0, 0);
                            setPromoExpiresAt(formatForInput(d.toISOString()));
                          }}
                          className="glass-card"
                          style={{ padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '4px' }}
                        >
                          +7 Dias
                        </button>
                      </div>

                      <p style={{ fontSize: '0.74rem', color: '#94A3B8', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        ⏳ Após esse período, a promoção será desativada e o valor{' '}
                        <strong style={{ color: 'var(--primary)' }}>voltará automaticamente para o preço original de {formatBRL(priceCents)}</strong>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="glass-card"
              style={{ padding: '12px 18px', fontWeight: 600 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="gold-gradient-primary gold-glow"
              style={{ flex: 1, padding: '12px', fontWeight: 600 }}
            >
              {submitting ? 'Salvando...' : 'Salvar Serviço'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Disparar Campanha Promocional */}
      <Modal
        isOpen={isBroadcastModalOpen}
        onClose={() => setIsBroadcastModalOpen(false)}
        title="Disparar Campanha Promocional"
      >
        {broadcastResult ? (
          // Tela de Sucesso após disparo
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                Campanha Disparada com Sucesso!
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                As notificações da promoção foram enviadas para seus clientes cadastrados.
              </p>
            </div>

            {/* Resumo dos disparos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', textAlign: 'left' }}>
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'rgba(37, 211, 102, 0.08)',
                  border: '1px solid rgba(37, 211, 102, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#25D366', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  <MessageSquare size={16} />
                  <span>WhatsApp Bot</span>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {broadcastResult.whatsappSent}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {broadcastResult.whatsappFailed > 0 ? `${broadcastResult.whatsappFailed} sem WhatsApp` : 'Mensagens entregues'}
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38BDF8', fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px' }}>
                  <Mail size={16} />
                  <span>E-mail Marketing</span>
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  {broadcastResult.emailSent}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {broadcastResult.emailFailed > 0 ? `${broadcastResult.emailFailed} sem e-mail` : 'E-mails enviados'}
                </div>
              </div>
            </div>

            {/* Link direto de agendamento */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                🔗 {broadcastResult.bookingUrl}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(broadcastResult.bookingUrl);
                  alert('Link copiado!');
                }}
                className="glass-card"
                style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}
              >
                Copiar Link
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsBroadcastModalOpen(false)}
              className="gold-gradient-primary gold-glow"
              style={{ padding: '12px', fontWeight: 600, borderRadius: '8px' }}
            >
              Concluir
            </button>
          </div>
        ) : (
          // Formulário de Configuração e Disparo da Campanha
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {broadcastError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  color: '#FB7185',
                  fontSize: '0.85rem',
                }}
              >
                {broadcastError}
              </div>
            )}

            {/* 1. Seleção do Serviço Promocional */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Selecione o Serviço em Promoção *
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--card-bg, #111827)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.promoActive && s.promoPriceCents ? `🔥 De ${formatBRL(s.priceCents)} por ${formatBRL(s.promoPriceCents)}` : `${formatBRL(s.priceCents)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Estatísticas do Público */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                padding: '12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Base de Clientes</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {loadingAudience ? '...' : audience?.totalCustomers ?? 0}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#25D366', display: 'block' }}>Com WhatsApp</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#25D366' }}>
                  {loadingAudience ? '...' : audience?.withPhone ?? 0}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#38BDF8', display: 'block' }}>Com E-mail</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38BDF8' }}>
                  {loadingAudience ? '...' : audience?.withEmail ?? 0}
                </span>
              </div>
            </div>

            {/* 3. Seleção dos Canais de Disparo */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Canais de Disparo *
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {/* WhatsApp Bot */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: channelWhatsApp ? 'rgba(37, 211, 102, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: channelWhatsApp ? '1px solid rgba(37, 211, 102, 0.3)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={channelWhatsApp}
                    onChange={(e) => setChannelWhatsApp(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#25D366' }}>
                      <MessageSquare size={15} />
                      <span>WhatsApp Bot</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                      Mensagem direta 1 a 1 do salão
                    </span>
                  </div>
                </label>

                {/* E-mail Marketing */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: channelEmail ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    border: channelEmail ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={channelEmail}
                    onChange={(e) => setChannelEmail(e.target.checked)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#38BDF8' }}>
                      <Mail size={15} />
                      <span>E-mail Marketing</span>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                      Design com botão de agendamento
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* 4. Prévia e Personalização da Mensagem */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                  Prévia da Mensagem Personalizada
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomizingMessage(!isCustomizingMessage)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  {isCustomizingMessage ? 'Usar Mensagem Padrão' : 'Editar Texto da Campanha'}
                </button>
              </div>

              {isCustomizingMessage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <textarea
                    rows={6}
                    value={customMessage || getStandardMessagePreview(selectedService)}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      fontSize: '0.8rem',
                      lineHeight: 1.45,
                      fontFamily: 'monospace',
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    Tags disponíveis: <code>{'{NOME}'}</code>, <code>{'{SERVICO}'}</code>, <code>{'{LINK_AGENDAMENTO}'}</code>
                  </span>
                </div>
              ) : (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    lineHeight: '1.45',
                    whiteSpace: 'pre-line',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  {getStandardMessagePreview(selectedService)}
                </div>
              )}
            </div>

            {/* Ações Rápidas: Copiar e Testar no WhatsApp */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={handleCopyPreview}
                className="glass-card"
                style={{
                  padding: '8px',
                  borderRadius: '7px',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: copiedPreview ? '#10B981' : 'var(--text-main)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copiedPreview ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedPreview ? 'Copiado!' : 'Copiar Texto'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenWhatsAppWeb}
                className="glass-card"
                style={{
                  padding: '8px',
                  borderRadius: '7px',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: '#25D366',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ExternalLink size={14} />
                <span>Testar no WhatsApp</span>
              </button>
            </div>

            {/* Botão de Disparo Principal */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsBroadcastModalOpen(false)}
                className="glass-card"
                style={{ padding: '12px 18px', fontWeight: 600 }}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={broadcasting}
                onClick={handleBroadcast}
                className="gold-gradient-primary gold-glow"
                style={{
                  flex: 1,
                  padding: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: broadcasting ? 'not-allowed' : 'pointer',
                  opacity: broadcasting ? 0.7 : 1,
                }}
              >
                <Send size={16} />
                <span>{broadcasting ? 'Disparando Campanha...' : 'Disparar Campanha para Clientes'}</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
