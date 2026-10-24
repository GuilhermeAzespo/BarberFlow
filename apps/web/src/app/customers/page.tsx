'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, Search, Plus, MessageCircle, Calendar, DollarSign, Clock } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { DateTime } from 'luxon';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
  _count?: { appointments: number };
}

interface CustomerDetails {
  customer: Customer & {
    appointments: Array<{
      id: string;
      startAt: string;
      status: string;
      priceCents: number;
      service: { name: string };
      professional: { name: string };
    }>;
  };
  stats: {
    totalAppointments: number;
    completed: number;
    totalSpentCents: number;
    lastVisit?: string | null;
  };
}

export default function CustomersPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal Novo Cliente
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal Detalhes do Cliente
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetails | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ customers: Customer[] }>(
        `/api/customers?search=${encodeURIComponent(search)}`,
      );
      setCustomers(res.customers);
    } catch {
      // Ignora erro
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openCustomerDetails = async (id: string) => {
    try {
      const res = await api.get<CustomerDetails>(`/api/customers/${id}`);
      setSelectedCustomer(res);
      setIsDetailsModalOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao buscar detalhes do cliente.');
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      await api.post('/api/customers', {
        name: newName,
        phone: newPhone || null,
        email: newEmail || null,
        notes: newNotes || null,
      });

      setIsNewModalOpen(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
      setNewNotes('');
      await loadCustomers();
      toast.success('Cliente cadastrado com sucesso!');
    } catch (err: unknown) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Falha ao cadastrar cliente.');
      toast.error(err instanceof ApiError ? err.message : 'Falha ao cadastrar cliente.');
    } finally {
      setSubmitting(false);
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
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>Base de Clientes</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Clientes cadastrados automaticamente pelo bot do WhatsApp ou adicionados manualmente.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                />
                <Search
                  size={16}
                  color="var(--text-dim)"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>

              <button
                onClick={() => setIsNewModalOpen(true)}
                className="gold-gradient-primary gold-glow"
                style={{ padding: '10px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={16} />
                <span>Novo Cliente</span>
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '24px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '30px' }}>Carregando clientes...</p>
            ) : customers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <UserCheck size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <p>Nenhum cliente encontrado.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Nome</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>WhatsApp</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>E-mail</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Agendamentos</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-main)' }}>
                          <span
                            onClick={() => openCustomerDetails(c.id)}
                            style={{ cursor: 'pointer', color: 'var(--primary)' }}
                          >
                            {c.name}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {c.phone ? (
                            <a
                              href={`https://wa.me/${c.phone}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#34D399' }}
                            >
                              <MessageCircle size={15} />
                              <span>{c.phone}</span>
                            </a>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {c.email || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span className="badge badge-neutral">
                            {c._count?.appointments || 0} visitas
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => openCustomerDetails(c.id)}
                            className="glass-card"
                            style={{ padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            Ver Histórico
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Modal: Novo Cliente */}
      <Modal isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} title="Cadastrar Cliente">
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

        <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Nome Completo *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: João Souza"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Telefone / WhatsApp
            </label>
            <input
              type="text"
              placeholder="(11) 99999-8888"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              E-mail
            </label>
            <input
              type="email"
              placeholder="joao@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Observações / Preferências
            </label>
            <input
              type="text"
              placeholder="Ex: Alérgico a lâmina convencional, prefere máquina zero"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsNewModalOpen(false)}
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
              {submitting ? 'Cadastrando...' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Histórico & Métricas do Cliente */}
      <Modal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} title="Perfil do Cliente">
        {selectedCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-card" style={{ padding: '18px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '4px' }}>
                {selectedCustomer.customer.name}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {selectedCustomer.customer.phone || 'Sem telefone'} • {selectedCustomer.customer.email || 'Sem e-mail'}
              </p>
              {selectedCustomer.customer.notes && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '8px', fontStyle: 'italic' }}>
                  Nota: &quot;{selectedCustomer.customer.notes}&quot;
                </p>
              )}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="glass-card" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                  Total Gasto
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34D399' }}>
                  {formatBRL(selectedCustomer.stats.totalSpentCents)}
                </span>
              </div>

              <div className="glass-card" style={{ padding: '14px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                  Atendimentos Concluídos
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {selectedCustomer.stats.completed}
                </span>
              </div>
            </div>

            {/* Past appointments */}
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '10px' }}>Histórico Recente</h4>
              {selectedCustomer.customer.appointments.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Nenhum atendimento registrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                  {selectedCustomer.customer.appointments.map((a) => (
                    <div
                      key={a.id}
                      className="glass-card"
                      style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{a.service.name}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block' }}>
                          Com {a.professional.name} • {DateTime.fromISO(a.startAt).toFormat('dd/LL/yyyy HH:mm')}
                        </span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{formatBRL(a.priceCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
