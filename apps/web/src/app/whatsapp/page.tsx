'use client';

import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  QrCode,
  Smartphone,
  RefreshCw,
  Power,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';

interface WhatsAppStatus {
  status: 'DISCONNECTED' | 'CONNECTING' | 'QR_PENDING' | 'CONNECTED';
  qrCode?: string | null;
  qrDataUrl?: string | null;
  phoneNumber?: string | null;
  lastConnectedAt?: string | null;
  lastDisconnectedAt?: string | null;
  lastError?: string | null;
}

interface WhatsAppConfig {
  botEnabled: boolean;
  welcomeMessage: string;
  confirmationMessage: string;
  reminderMessage: string;
  cancellationMessage: string;
  reminderEnabled: boolean;
  reminderHoursBefore: number;
}

export default function WhatsAppHubPage() {
  const [statusData, setStatusData] = useState<WhatsAppStatus | null>(null);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Mensagem de teste
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste do BarberFlow.');
  const [sendingTest, setSendingTest] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Salvando config
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await api.get<WhatsAppStatus>('/api/whatsapp/status');
      setStatusData(res);
    } catch {
      // Ignora erro
    }
  };

  const loadConfig = async () => {
    try {
      const res = await api.get<{ config: WhatsAppConfig }>('/api/whatsapp/config');
      setConfig(res.config);
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    Promise.all([loadStatus(), loadConfig()]).finally(() => setLoading(false));

    // Polling contínuo do status a cada 3 segundos enquanto estiver aguardando QR Code ou conectando
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await api.post<WhatsAppStatus>('/api/whatsapp/connect');
      setStatusData(res);
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao solicitar conexão.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar este WhatsApp? O bot deixará de responder.')) return;
    try {
      await api.post('/api/whatsapp/disconnect');
      await loadStatus();
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao desconectar.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    setSaveSuccess(false);

    try {
      await api.patch('/api/whatsapp/config', config);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      alert(err instanceof ApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestSuccess(null);
    setTestError(null);
    setSendingTest(true);

    try {
      await api.post('/api/whatsapp/send-test', {
        phone: testPhone,
        message: testMessage,
      });
      setTestSuccess('Mensagem enviada com sucesso no WhatsApp!');
    } catch (err: unknown) {
      setTestError(err instanceof ApiError ? err.message : 'Falha ao enviar mensagem de teste.');
    } finally {
      setSendingTest(false);
    }
  };

  const isConnected = statusData?.status === 'CONNECTED';
  const isQrPending = statusData?.status === 'QR_PENDING';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header />

        <main style={{ padding: '32px', flex: 1, maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, marginBottom: '4px' }}>
                Central de Automação do WhatsApp
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Conecte seu WhatsApp com QR Code e configure as mensagens automáticas do bot.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '28px' }}>
            {/* Coluna 1: Status & Pareamento via QR Code */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Smartphone size={22} color="var(--primary)" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Status do WhatsApp</h3>
                  </div>

                  <span
                    className={`badge ${
                      isConnected ? 'badge-success' : isQrPending ? 'badge-warning' : 'badge-danger'
                    }`}
                  >
                    {isConnected ? 'Conectado' : isQrPending ? 'Aguardando Leitura' : 'Desconectado'}
                  </span>
                </div>

                {/* QR Code Container */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    borderRadius: '14px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-color)',
                    minHeight: '300px',
                    marginBottom: '20px',
                    textAlign: 'center',
                  }}
                >
                  {isConnected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: '50%',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '2px solid rgba(16, 185, 129, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#34D399',
                        }}
                      >
                        <CheckCircle2 size={36} />
                      </div>
                      <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#34D399' }}>WhatsApp Conectado!</h4>
                      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                        O bot está respondendo normalmente às mensagens no número:
                      </p>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--text-main)', letterSpacing: '0.04em' }}>
                        +{statusData?.phoneNumber}
                      </strong>
                    </div>
                  ) : isQrPending && statusData?.qrDataUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          padding: '12px',
                          background: '#FFFFFF',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                        }}
                      >
                        <img
                          src={statusData.qrDataUrl}
                          alt="QR Code WhatsApp"
                          style={{ width: '220px', height: '220px', display: 'block' }}
                        />
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '280px' }}>
                        Abra o WhatsApp no celular, vá em <strong>Aparelhos Conectados &gt; Conectar um aparelho</strong> e aponte para a tela.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                      <QrCode size={56} color="var(--text-dim)" />
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '300px' }}>
                        Nenhum WhatsApp conectado. Clique no botão abaixo para gerar o QR Code de pareamento.
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  {!isConnected ? (
                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      className="gold-gradient-primary gold-glow"
                      style={{
                        flex: 1,
                        padding: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <RefreshCw size={16} className={connecting ? 'animate-spin' : ''} />
                      <span>{connecting ? 'Gerando QR Code...' : 'Gerar QR Code para Conectar'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnect}
                      className="glass-card"
                      style={{
                        flex: 1,
                        padding: '12px',
                        color: '#FB7185',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        borderColor: 'rgba(244, 63, 94, 0.3)',
                      }}
                    >
                      <Power size={16} />
                      <span>Desconectar Aparelho</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Card de Teste de Envio */}
              {isConnected && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <Send size={18} color="var(--primary)" />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Testar Disparo de Mensagem</h3>
                  </div>

                  {testSuccess && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34D399',
                        fontSize: '0.85rem',
                        marginBottom: '12px',
                      }}
                    >
                      {testSuccess}
                    </div>
                  )}
                  {testError && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: 'rgba(244, 63, 94, 0.12)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: '#FB7185',
                        fontSize: '0.85rem',
                        marginBottom: '12px',
                      }}
                    >
                      {testError}
                    </div>
                  )}

                  <form onSubmit={handleSendTest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Número com DDD (Ex: 11999998888)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="5511999998888"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Mensagem de Teste
                      </label>
                      <textarea
                        rows={2}
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingTest}
                      className="glass-card"
                      style={{ padding: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <Send size={15} />
                      <span>{sendingTest ? 'Enviando...' : 'Enviar Mensagem de Teste'}</span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Coluna 2: Configuração das Mensagens do Bot */}
            {config && (
              <div className="glass-panel" style={{ padding: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MessageSquare size={22} color="var(--primary)" />
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Respostas Automáticas do Bot</h3>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={config.botEnabled}
                      onChange={(e) => setConfig({ ...config, botEnabled: e.target.checked })}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>Bot Ativo</span>
                  </label>
                </div>

                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Você pode usar tags como <code>&#123;nome&#125;</code>, <code>&#123;servico&#125;</code>, <code>&#123;profissional&#125;</code>, <code>&#123;data&#125;</code>, <code>&#123;hora&#125;</code>, <code>&#123;salao&#125;</code> para preenchimento dinâmico.
                </p>

                {saveSuccess && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34D399',
                      fontSize: '0.85rem',
                      marginBottom: '16px',
                    }}
                  >
                    Configurações salvas com sucesso!
                  </div>
                )}

                <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                      Mensagem de Boas-Vindas & Menu
                    </label>
                    <textarea
                      rows={3}
                      value={config.welcomeMessage}
                      onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                      Confirmação de Agendamento
                    </label>
                    <textarea
                      rows={4}
                      value={config.confirmationMessage}
                      onChange={(e) => setConfig({ ...config, confirmationMessage: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                      Lembrete de Agendamento
                    </label>
                    <textarea
                      rows={4}
                      value={config.reminderMessage}
                      onChange={(e) => setConfig({ ...config, reminderMessage: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={config.reminderEnabled}
                        onChange={(e) => setConfig({ ...config, reminderEnabled: e.target.checked })}
                        style={{ width: '16px', height: '16px' }}
                      />
                      <span>Enviar lembrete antecipado</span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <span>Enviar</span>
                      <input
                        type="number"
                        min={1}
                        max={48}
                        value={config.reminderHoursBefore}
                        onChange={(e) => setConfig({ ...config, reminderHoursBefore: Number(e.target.value) })}
                        style={{ width: '64px', padding: '6px 8px' }}
                      />
                      <span>hora(s) antes</span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                      Mensagem de Cancelamento
                    </label>
                    <textarea
                      rows={3}
                      value={config.cancellationMessage}
                      onChange={(e) => setConfig({ ...config, cancellationMessage: e.target.value })}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingConfig}
                    className="gold-gradient-primary gold-glow"
                    style={{ padding: '14px', fontWeight: 600, marginTop: '8px' }}
                  >
                    {savingConfig ? 'Salvando...' : 'Salvar Alterações de Mensagens'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
