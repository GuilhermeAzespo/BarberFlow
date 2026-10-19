'use client';

import React, { useEffect, useState } from 'react';
import { Users, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Phone, Percent } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';

interface Professional {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  color: string;
  commissionPercent: number;
  isActive: boolean;
  serviceIds: string[];
}

interface Service {
  id: string;
  name: string;
}

export default function ProfessionalsPage() {
  const { subscription } = useAuth();
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [color, setColor] = useState('#E5B338');
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        api.get<{ professionals: Professional[] }>('/api/professionals'),
        api.get<{ services: Service[] }>('/api/services?active=true'),
      ]);
      setProfessionals(pRes.professionals);
      setServices(sRes.services);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setColor('#E5B338');
    setCommissionPercent(0);
    setSelectedServices(services.map((s) => s.id));
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Professional) => {
    setEditingId(p.id);
    setName(p.name);
    setPhone(p.phone || '');
    setColor(p.color || '#E5B338');
    setCommissionPercent(p.commissionPercent || 0);
    setSelectedServices(p.serviceIds || []);
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
        phone: phone || null,
        color,
        commissionPercent: Number(commissionPercent),
        serviceIds: selectedServices,
      };

      if (editingId) {
        await api.patch(`/api/professionals/${editingId}`, payload);
      } else {
        await api.post('/api/professionals', payload);
      }

      setIsModalOpen(false);
      await loadData();
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao salvar profissional.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover/desativar este profissional?')) return;
    try {
      await api.delete(`/api/professionals/${id}`);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao remover profissional.');
    }
  };

  const maxProfs = subscription?.limits.maxProfessionals;
  const activeCount = professionals.filter((p) => p.isActive).length;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Profissionais da Equipe</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Gerencie barbeiros, comissões individuais e serviços atendidos por cada profissional.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {maxProfs !== null && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Limite do plano: <strong style={{ color: 'var(--text-main)' }}>{activeCount} / {maxProfs}</strong>
                </div>
              )}

              <button
                onClick={openCreateModal}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Adicionar Profissional</span>
              </button>
            </div>
          </div>

          {/* List of Professionals */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando profissionais...</p>
            ) : professionals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <Users size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhum profissional cadastrado.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {professionals.map((p) => (
                  <div
                    key={p.id}
                    className="glass-card"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      opacity: p.isActive ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '10px',
                            background: p.color || '#E5B338',
                            color: '#0B0F17',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '1.2rem',
                          }}
                        >
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>{p.name}</h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                            {p.isActive ? 'Ativo na agenda' : 'Desativado'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => openEditModal(p)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#FB7185',
                            cursor: 'pointer',
                            padding: '6px',
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {p.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Phone size={14} />
                          <span>{p.phone}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Percent size={14} />
                        <span>Comissão: <strong>{p.commissionPercent}%</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Adicionar/Editar Profissional */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? 'Editar Profissional' : 'Novo Profissional'}>
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
              Nome do Profissional *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Oliveira"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              WhatsApp / Telefone
            </label>
            <input
              type="text"
              placeholder="(11) 98888-7777"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Cor no Calendário
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '44px', height: '38px', padding: 0, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>{color}</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Comissão (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(Number(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Serviços que este profissional atende:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {services.map((s) => {
                const checked = selectedServices.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (checked) {
                        setSelectedServices(selectedServices.filter((id) => id !== s.id));
                      } else {
                        setSelectedServices([...selectedServices, s.id]);
                      }
                    }}
                    className="glass-card"
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      color: checked ? '#0B0F17' : 'var(--text-muted)',
                      background: checked ? 'var(--primary)' : 'var(--bg-input)',
                      border: checked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
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
              {submitting ? 'Salvando...' : 'Salvar Profissional'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
