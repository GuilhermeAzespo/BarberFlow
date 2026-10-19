'use client';

import React, { useEffect, useState } from 'react';
import { Scissors, Plus, Edit2, Trash2, Clock, DollarSign, CheckCircle2 } from 'lucide-react';
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
  isActive: boolean;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [priceCents, setPriceCents] = useState(3500);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (s: Service) => {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description || '');
    setDurationMinutes(s.durationMinutes);
    setPriceCents(s.priceCents);
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        name,
        description: description || null,
        durationMinutes: Number(durationMinutes),
        priceCents: Number(priceCents),
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

  const formatBRL = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Serviços & Preços</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Defina os serviços oferecidos, tempo de execução e valores que serão exibidos no WhatsApp.
              </p>
            </div>

            <button
              onClick={openCreateModal}
              className="gold-gradient-primary gold-glow"
              style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} />
              <span>Adicionar Serviço</span>
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando serviços...</p>
            ) : services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Scissors size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhum serviço cadastrado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {services.map((s) => (
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
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--text-main)' }}>{s.name}</h4>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => openEditModal(s)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#FB7185',
                              cursor: 'pointer',
                              padding: '4px',
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

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '12px',
                        borderTop: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                        <Clock size={15} />
                        <span>{s.durationMinutes} minutos</span>
                      </div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {formatBRL(s.priceCents)}
                      </span>
                    </div>
                  </div>
                ))}
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
                Preço (R$) *
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
    </div>
  );
}
