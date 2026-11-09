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
  Calendar,
  Info,
  Crown,
  RefreshCw,
  Link as LinkIcon,
  CreditCard,
  ShieldCheck,
  KeyRound,
  Zap,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { Sidebar } from '../../components/Sidebar';
import { Header } from '../../components/Header';
import { Select } from '../../components/Select';
import { AddressAutocomplete } from '../../components/AddressAutocomplete';
import { TimePicker } from '../../components/TimePicker';
import { useToast } from '../../components/Toast';

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

function getHourStats(hour: BusinessHour, slotInterval: number) {
  if (!hour.isOpen) {
    return { formattedHours: '0h', slots: 0, netMinutes: 0 };
  }
  const [openH, openM] = (hour.openTime || '09:00').split(':').map(Number);
  const [closeH, closeM] = (hour.closeTime || '19:00').split(':').map(Number);
  let totalMin = closeH * 60 + closeM - (openH * 60 + openM);
  if (totalMin < 0) totalMin = 0;

  let breakMin = 0;
  if (hour.breakStart && hour.breakEnd) {
    const [bStartH, bStartM] = hour.breakStart.split(':').map(Number);
    const [bEndH, bEndM] = hour.breakEnd.split(':').map(Number);
    breakMin = bEndH * 60 + bEndM - (bStartH * 60 + bStartM);
    if (breakMin < 0) breakMin = 0;
  }

  const netMin = Math.max(0, totalMin - breakMin);
  const h = Math.floor(netMin / 60);
  const m = netMin % 60;
  const formattedHours = m > 0 ? `${h}h ${m}m` : `${h} horas`;
  const slots = slotInterval > 0 ? Math.floor(netMin / slotInterval) : 0;
  return { formattedHours, slots, netMinutes: netMin };
}

export default function SettingsPage() {
  const { tenant, subscription, user, refresh, hasPlanFeature } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'integrations'>('general');

  // Integração Mercado Pago Direto (Recebimentos Online do Clube VIP)
  const [mpEnabled, setMpEnabled] = useState(false);
  const [mpPixEnabled, setMpPixEnabled] = useState(true);
  const [mpCreditCardEnabled, setMpCreditCardEnabled] = useState(true);
  const [mpRecurringCardEnabled, setMpRecurringCardEnabled] = useState(true);
  const [mpPublicKey, setMpPublicKey] = useState('');
  const [mpAccessToken, setMpAccessToken] = useState('');
  const [mpWebhookSecret, setMpWebhookSecret] = useState('');
  const [mpHasAccessToken, setMpHasAccessToken] = useState(false);
  const [mpAccessTokenPreview, setMpAccessTokenPreview] = useState<string | null>(null);
  const [mpWebhookUrl, setMpWebhookUrl] = useState('');
  const [mpHasAddon, setMpHasAddon] = useState(false);
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{
    success: boolean;
    message: string;
    account?: { id?: number | string; nickname?: string; email?: string };
  } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const { toast, confirm } = useToast();

  const isPremium =
    subscription?.plan?.slug === 'premium' ||
    subscription?.plan?.slug === 'master' ||
    user?.role === 'SUPER_ADMIN';

  // Domínio Próprio & DNS Personalizado
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [currentCustomDomain, setCurrentCustomDomain] = useState<string | null>(null);
  const [dnsStatus, setDnsStatus] = useState<{ verified: boolean; dnsVerified?: boolean; sslVerified?: boolean; sslStatus?: string; message: string } | null>(null);
  const [dnsInstructions, setDnsInstructions] = useState<{ type: string; name: string; target: string }>({
    type: 'CNAME',
    name: 'agendar',
    target: 'barberflow.azespo.com.br',
  });
  const [loadingDns, setLoadingDns] = useState(false);
  const [savingDns, setSavingDns] = useState(false);
  const [copiedDnsTarget, setCopiedDnsTarget] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);

  // Configuração inteligente de horários (estilo Definições de Data & Tempo)
  const [scheduleMode, setScheduleMode] = useState<'grouped' | 'detailed'>('grouped');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Estatísticas e Métricas da Grade Semanal
  const openDaysCount = businessHours.filter((h) => h.isOpen).length;
  const totalWeeklyMinutes = businessHours.reduce((acc, h) => acc + getHourStats(h, slotIntervalMinutes).netMinutes, 0);
  const totalWeeklyHoursFormatted = `${Math.floor(totalWeeklyMinutes / 60)}h${totalWeeklyMinutes % 60 > 0 ? ` ${totalWeeklyMinutes % 60}m` : ''}`;
  const totalWeeklySlots = businessHours.reduce((acc, h) => acc + getHourStats(h, slotIntervalMinutes).slots, 0);

  const [groupOpenTime, setGroupOpenTime] = useState('09:00');
  const [groupCloseTime, setGroupCloseTime] = useState('19:00');
  const [hasBreak, setHasBreak] = useState(false);
  const [groupBreakStart, setGroupBreakStart] = useState('12:00');
  const [groupBreakEnd, setGroupBreakEnd] = useState('13:00');
  const [scheduleAppliedMsg, setScheduleAppliedMsg] = useState<string | null>(null);
  const [applyingSchedule, setApplyingSchedule] = useState(false);
  const [togglingWeekday, setTogglingWeekday] = useState<number | null>(null);

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

  const loadPaymentConfig = async () => {
    try {
      const res = await api.get<{
        hasOnlinePaymentsAddon: boolean;
        webhookUrl: string;
        config: {
          enabled: boolean;
          pixEnabled: boolean;
          creditCardEnabled: boolean;
          recurringCardEnabled: boolean;
          mpPublicKey: string;
          hasAccessToken: boolean;
          mpAccessTokenPreview: string | null;
          mpWebhookSecret: string;
        };
      }>('/api/tenant/payment-config');
      setMpHasAddon(Boolean(res.hasOnlinePaymentsAddon));
      setMpWebhookUrl(res.webhookUrl || '');
      if (res.config) {
        setMpEnabled(Boolean(res.config.enabled));
        setMpPixEnabled(res.config.pixEnabled !== false);
        setMpCreditCardEnabled(res.config.creditCardEnabled !== false);
        setMpRecurringCardEnabled(res.config.recurringCardEnabled !== false);
        setMpPublicKey(res.config.mpPublicKey || '');
        setMpHasAccessToken(Boolean(res.config.hasAccessToken));
        setMpAccessTokenPreview(res.config.mpAccessTokenPreview || null);
        setMpWebhookSecret(res.config.mpWebhookSecret || '');
      }
    } catch {
      // Silencioso no load inicial
    }
  };

  const handleSavePaymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMp(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.put<{
        message: string;
        config: {
          enabled: boolean;
          pixEnabled: boolean;
          creditCardEnabled: boolean;
          recurringCardEnabled: boolean;
          mpPublicKey: string;
          hasAccessToken: boolean;
          mpAccessTokenPreview: string | null;
          mpWebhookSecret: string;
        };
      }>('/api/tenant/payment-config', {
        enabled: mpEnabled,
        pixEnabled: mpPixEnabled,
        creditCardEnabled: mpCreditCardEnabled,
        recurringCardEnabled: mpRecurringCardEnabled,
        mpPublicKey: mpPublicKey.trim(),
        ...(mpAccessToken.trim() ? { mpAccessToken: mpAccessToken.trim() } : {}),
        mpWebhookSecret: mpWebhookSecret.trim(),
      });
      setMpHasAccessToken(Boolean(res.config.hasAccessToken));
      setMpAccessTokenPreview(res.config.mpAccessTokenPreview || null);
      setMpAccessToken('');
      toast.success(res.message || 'Configurações de recebimento online salvas!');
      setSuccessMsg(res.message || 'Configurações de recebimento online salvas!');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Erro ao salvar configurações do Mercado Pago.';
      toast.error(msg);
      setErrorMsg(msg);
    } finally {
      setSavingMp(false);
    }
  };

  const handleTestPaymentConfig = async () => {
    setTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        account?: { id?: number | string; nickname?: string; email?: string };
      }>('/api/tenant/payment-config/test', {
        ...(mpAccessToken.trim() ? { mpAccessToken: mpAccessToken.trim() } : {}),
      });
      setMpTestResult(res);
      toast.success(res.message || 'Conexão validada com sucesso!');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Falha ao conectar com o Mercado Pago. Verifique seu Access Token.';
      setMpTestResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setTestingMp(false);
    }
  };

  const copyWebhookUrl = () => {
    if (!mpWebhookUrl) return;
    navigator.clipboard.writeText(mpWebhookUrl);
    setCopiedWebhook(true);
    toast.success('URL do Webhook copiada para a área de transferência!');
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const loadCustomDomain = async () => {
    try {
      setLoadingDns(true);
      const res = await api.get<{
        customDomain: string | null;
        isPremium: boolean;
        dnsInstructions: { type: string; name: string; target: string };
        dnsStatus: { verified: boolean; message: string };
      }>('/api/tenant/custom-domain');
      setCurrentCustomDomain(res.customDomain);
      setCustomDomainInput(res.customDomain || '');
      setDnsStatus(res.dnsStatus);
      if (res.dnsInstructions) setDnsInstructions(res.dnsInstructions);
    } catch {
      // Silencioso se não for premium
    } finally {
      setLoadingDns(false);
    }
  };

  const handleSaveCustomDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDomainInput.trim()) {
      return toast.warning('Informe o domínio desejado (ex: agendar.minhabarbearia.com.br).');
    }
    setSavingDns(true);
    try {
      const res = await api.patch<{ customDomain: string; dnsStatus: { verified: boolean; message: string } }>(
        '/api/tenant/custom-domain',
        { customDomain: customDomainInput.trim() },
      );
      setCurrentCustomDomain(res.customDomain);
      setDnsStatus(res.dnsStatus);
      toast.success('Domínio próprio salvo! Crie o apontamento CNAME em sua zona DNS.');
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao salvar domínio personalizado.');
    } finally {
      setSavingDns(false);
    }
  };

  const handleRemoveCustomDomain = async () => {
    const ok = await confirm({
      title: 'Desvincular Domínio Próprio',
      message: 'Deseja realmente remover seu domínio próprio? Sua vitrine continuará acessível pelo link padrão do BarberFlow.',
      confirmText: 'Desvincular Domínio',
      danger: true,
      icon: 'trash',
    });
    if (!ok) return;

    setSavingDns(true);
    try {
      await api.delete('/api/tenant/custom-domain');
      setCurrentCustomDomain(null);
      setCustomDomainInput('');
      setDnsStatus(null);
      toast.success('Domínio próprio desvinculado com sucesso.');
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao desvincular domínio.');
    } finally {
      setSavingDns(false);
    }
  };

  const handleCheckDns = async () => {
    await loadCustomDomain();
    toast.info('Verificação de apontamento DNS atualizada.');
  };

  const copyDnsTarget = (target: string) => {
    navigator.clipboard.writeText(target);
    setCopiedDnsTarget(true);
    toast.success('Valor CNAME copiado para a área de transferência!');
    setTimeout(() => setCopiedDnsTarget(false), 2500);
  };

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
      // Garante os 7 dias completos da semana (0 = Domingo a 6 = Sábado)
      const fullWeek: BusinessHour[] = [0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
        const found = (res.businessHours || []).find((h) => h.weekday === dayIdx);
        if (found) {
          const bs = found.breakStart === '12:00' && found.breakEnd === '13:00' ? null : found.breakStart;
          const be = found.breakStart === '12:00' && found.breakEnd === '13:00' ? null : found.breakEnd;
          return {
            ...found,
            openTime: found.openTime || '09:00',
            closeTime: found.closeTime || (dayIdx === 6 ? '17:00' : '19:00'),
            breakStart: bs || null,
            breakEnd: be || null,
          };
        }
        return {
          weekday: dayIdx,
          isOpen: dayIdx >= 1 && dayIdx <= 6,
          openTime: '09:00',
          closeTime: dayIdx === 6 ? '17:00' : '19:00',
          breakStart: null,
          breakEnd: null,
        };
      });
      setBusinessHours(fullWeek);

      // Sincroniza os dias selecionados no grupo com os dias que realmente estão abertos no banco
      const openWeekdays = fullWeek.filter((h) => h.isOpen).map((h) => h.weekday);
      setSelectedDays(openWeekdays.length > 0 ? openWeekdays : [1, 2, 3, 4, 5]);

      // Sincroniza os horários de início e fim padrão a partir dos dias abertos
      const firstOpen = fullWeek.find((h) => h.isOpen);
      if (firstOpen) {
        if (firstOpen.openTime) setGroupOpenTime(firstOpen.openTime);
        if (firstOpen.closeTime) setGroupCloseTime(firstOpen.closeTime);
      }

      // Sincroniza se existe algum intervalo ativo configurado
      const anyDayHasBreak = fullWeek.some((h) => h.isOpen && h.breakStart && h.breakEnd);
      setHasBreak(anyDayHasBreak);
      if (anyDayHasBreak) {
        const firstWithBreak = fullWeek.find((h) => h.isOpen && h.breakStart && h.breakEnd);
        if (firstWithBreak?.breakStart && firstWithBreak?.breakEnd) {
          setGroupBreakStart(firstWithBreak.breakStart);
          setGroupBreakEnd(firstWithBreak.breakEnd);
        }
      }

      // Load gallery
      const galleryRes = await api.get<{ images: GalleryImage[] }>('/api/tenant/gallery');
      setGallery(galleryRes.images || []);
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    loadSettings();
    loadCustomDomain();
    loadPaymentConfig();
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
      if (
        window.location.hash === '#integracoes' ||
        window.location.search.includes('tab=integracoes')
      ) {
        setActiveTab('integrations');
      }
    }
    loadCustomDomain();
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const tenantSlug = slug || tenant?.slug || '';
  const activeCustomDomain = isPremium && currentCustomDomain && (dnsStatus ? dnsStatus.verified : true) ? currentCustomDomain.trim() : null;
  const publicHomeUrl = activeCustomDomain ? `https://${activeCustomDomain}` : (tenantSlug && origin ? `${origin}/${tenantSlug}` : (tenantSlug ? `/${tenantSlug}` : ''));
  const publicBookingUrl = activeCustomDomain ? `https://${activeCustomDomain}/agendar` : (tenantSlug && origin ? `${origin}/${tenantSlug}/agendar` : (tenantSlug ? `/${tenantSlug}/agendar` : ''));

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
    setBusinessHours((prev) => {
      const next = prev.map((h) => (h.weekday === weekday ? { ...h, [field]: value } : h));
      if (field === 'isOpen') {
        if (value) {
          setSelectedDays((sd) => (sd.includes(weekday) ? sd : [...sd, weekday].sort((a, b) => a - b)));
        } else {
          setSelectedDays((sd) => sd.filter((d) => d !== weekday));
        }
      }
      return next;
    });
  };

  const handleToggleDayStatus = async (weekday: number) => {
    const target = businessHours.find((h) => h.weekday === weekday);
    if (!target) return;
    const newIsOpen = !target.isOpen;

    const nextHours = businessHours.map((h) =>
      h.weekday === weekday ? { ...h, isOpen: newIsOpen } : h,
    );
    setBusinessHours(nextHours);

    if (newIsOpen) {
      setSelectedDays((prev) => (prev.includes(weekday) ? prev : [...prev, weekday].sort((a, b) => a - b)));
    } else {
      setSelectedDays((prev) => prev.filter((d) => d !== weekday));
    }

    setTogglingWeekday(weekday);
    try {
      await api.put('/api/tenant/business-hours', {
        businessHours: nextHours.map((h) => ({
          weekday: h.weekday,
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          breakStart: h.isOpen && h.breakStart ? h.breakStart : null,
          breakEnd: h.isOpen && h.breakEnd ? h.breakEnd : null,
        })),
      });
      toast.success(`${weekdayNames[weekday]} agora está ${newIsOpen ? 'ABERTO' : 'FECHADO'}!`);
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar status do dia.');
    } finally {
      setTogglingWeekday(null);
    }
  };

  const handleToggleAllDays = (checked: boolean) => {
    if (checked) {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    } else {
      setSelectedDays([]);
    }
  };

  const handleToggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const handleApplyGroupSchedule = async () => {
    if (selectedDays.length === 0) {
      toast.warning('Selecione ao menos um dia da semana para aplicar os horários.');
      setErrorMsg('Selecione ao menos um dia da semana para aplicar os horários.');
      setTimeout(() => setErrorMsg(null), 3500);
      return;
    }

    setApplyingSchedule(true);
    setErrorMsg(null);

    try {
      const updatedHours = businessHours.map((h) => {
        if (selectedDays.includes(h.weekday)) {
          return {
            ...h,
            isOpen: true,
            openTime: groupOpenTime,
            closeTime: groupCloseTime,
            breakStart: hasBreak ? groupBreakStart : null,
            breakEnd: hasBreak ? groupBreakEnd : null,
          };
        }
        // Dias que não foram selecionados no grupo passam para FECHADO
        return {
          ...h,
          isOpen: false,
          openTime: h.openTime || '09:00',
          closeTime: h.closeTime || '19:00',
          breakStart: null,
          breakEnd: null,
        };
      });

      // Salva imediatamente no banco de dados para garantir persistência mesmo após refresh
      const res = await api.put<{ businessHours: BusinessHour[] }>('/api/tenant/business-hours', {
        businessHours: updatedHours.map((h) => ({
          weekday: h.weekday,
          isOpen: h.isOpen,
          openTime: h.openTime || '09:00',
          closeTime: h.closeTime || '19:00',
          breakStart: h.isOpen && h.breakStart ? h.breakStart : null,
          breakEnd: h.isOpen && h.breakEnd ? h.breakEnd : null,
        })),
      });

      const savedHours = (res.businessHours || updatedHours).map((h) => {
        if (h.breakStart === '12:00' && h.breakEnd === '13:00') {
          return { ...h, breakStart: null, breakEnd: null };
        }
        return h;
      });

      setBusinessHours(savedHours);

      // Sincroniza dias selecionados com os dias que ficaram abertos
      const openDays = savedHours.filter((h) => h.isOpen).map((h) => h.weekday);
      setSelectedDays(openDays);

      const dayNamesList = selectedDays.map((d) => weekdayNames[d]).join(', ');
      toast.success(`Horários salvos e aplicados com sucesso para ${selectedDays.length} dia(s)!`);
      setScheduleAppliedMsg(`Horários salvos e aplicados com sucesso para ${selectedDays.length} dia(s)!`);
      setTimeout(() => setScheduleAppliedMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Falha ao salvar horários de atendimento.';
      toast.error(msg);
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4000);
    } finally {
      setApplyingSchedule(false);
    }
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
        businessHours: businessHours.map((h) => ({
          weekday: h.weekday,
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          breakStart: h.isOpen && h.breakStart ? h.breakStart : null,
          breakEnd: h.isOpen && h.breakEnd ? h.breakEnd : null,
        })),
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
              Personalize a identidade visual, página inicial vitrine, horários, fotos e recebimentos online da sua barbearia.
            </p>
          </div>

          {/* Navegação por Abas */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '26px',
              padding: '6px',
              borderRadius: '14px',
              background: 'rgba(18, 18, 22, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              width: 'fit-content',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '9px',
                padding: '11px 20px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                border:
                  activeTab === 'general'
                    ? '1px solid rgba(212, 175, 55, 0.5)'
                    : '1px solid transparent',
                background:
                  activeTab === 'general'
                    ? 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)'
                    : 'transparent',
                color: activeTab === 'general' ? '#09090B' : '#D4D4D8',
                boxShadow:
                  activeTab === 'general'
                    ? '0 6px 18px rgba(212, 175, 55, 0.25)'
                    : 'none',
              }}
            >
              <Building size={17} />
              <span>Dados, Vitrine & Horários</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('integrations')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '9px',
                padding: '11px 20px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                border:
                  activeTab === 'integrations'
                    ? '1px solid rgba(212, 175, 55, 0.5)'
                    : '1px solid transparent',
                background:
                  activeTab === 'integrations'
                    ? 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)'
                    : 'transparent',
                color: activeTab === 'integrations' ? '#09090B' : '#D4D4D8',
                boxShadow:
                  activeTab === 'integrations'
                    ? '0 6px 18px rgba(212, 175, 55, 0.25)'
                    : 'none',
              }}
            >
              <CreditCard size={17} />
              <span>Recebimentos Online & Integrações</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background:
                    activeTab === 'integrations'
                      ? 'rgba(9, 9, 11, 0.2)'
                      : 'rgba(16, 185, 129, 0.16)',
                  color: activeTab === 'integrations' ? '#09090B' : '#34D399',
                  border:
                    activeTab === 'integrations'
                      ? '1px solid rgba(9, 9, 11, 0.25)'
                      : '1px solid rgba(16, 185, 129, 0.35)',
                }}
              >
                Clube VIP
              </span>
            </button>
          </div>
          <div style={{ display: 'none' }}><p>
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

          {activeTab === 'integrations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Card Principal / Hero da Integração */}
              <div
                className="glass-panel"
                style={{
                  padding: '26px 28px',
                  border: '1px solid rgba(212, 175, 55, 0.35)',
                  background:
                    'radial-gradient(ellipse at top left, rgba(212, 175, 55, 0.1) 0%, rgba(18, 18, 22, 0.92) 70%)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '16px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', maxWidth: '760px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        background: 'rgba(212, 175, 55, 0.16)',
                        border: '1px solid rgba(212, 175, 55, 0.38)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--gold-primary)',
                        flexShrink: 0,
                      }}
                    >
                      <CreditCard size={24} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <h2 style={{ fontSize: '1.22rem', fontWeight: 800, color: '#FAFAFA', margin: 0 }}>
                          Recebimentos Online do Clube VIP (Direto na Sua Conta)
                        </h2>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 10px',
                            borderRadius: '999px',
                            background:
                              mpHasAddon || hasPlanFeature('onlinePayments') || user?.role === 'SUPER_ADMIN'
                                ? 'rgba(16, 185, 129, 0.16)'
                                : 'rgba(245, 158, 11, 0.16)',
                            color:
                              mpHasAddon || hasPlanFeature('onlinePayments') || user?.role === 'SUPER_ADMIN'
                                ? '#34D399'
                                : '#FBBF24',
                            border:
                              mpHasAddon || hasPlanFeature('onlinePayments') || user?.role === 'SUPER_ADMIN'
                                ? '1px solid rgba(16, 185, 129, 0.35)'
                                : '1px solid rgba(245, 158, 11, 0.35)',
                          }}
                        >
                          {mpHasAddon || hasPlanFeature('onlinePayments') || user?.role === 'SUPER_ADMIN'
                            ? '✓ Add-on Liberado no Salão'
                            : '⚡ Add-on Opcional'}
                        </span>
                      </div>
                      <p style={{ color: '#A1A1AA', fontSize: '0.88rem', lineHeight: 1.55, margin: 0 }}>
                        Conecte a conta do <strong>Mercado Pago da sua barbearia</strong> para permitir que seus clientes contratem e renovem planos mensais do <strong>Clube de Assinatura VIP</strong> diretamente pela sua Vitrine ou pelo Link enviado pelo Bot do WhatsApp.{' '}
                        <strong style={{ color: '#F5D061' }}>
                          100% do valor pago cai direto na sua conta Mercado Pago
                        </strong>
                        , a assinatura VIP do cliente é liberada na mesma hora e a receita entra sozinha no seu Financeiro.
                      </p>
                    </div>
                  </div>

                  {!(mpHasAddon || hasPlanFeature('onlinePayments') || user?.role === 'SUPER_ADMIN') && (
                    <Link
                      href="/planos"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '11px 18px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                        color: '#09090B',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        textDecoration: 'none',
                        boxShadow: '0 6px 18px rgba(212, 175, 55, 0.25)',
                      }}
                    >
                      <Zap size={16} />
                      <span>Ativar Add-on em Planos</span>
                    </Link>
                  )}
                </div>

                {/* Destaques de Funcionamento */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    marginTop: '4px',
                  }}
                >
                  <div
                    style={{
                      padding: '13px 15px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#F5D061', marginBottom: '4px' }}>
                      💳 Cartão Recorrente ou Manual
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#A1A1AA', lineHeight: 1.45 }}>
                      O cliente escolhe na hora de assinar se quer <strong>Renovação Automática Mensal</strong> no cartão ou renovação manual.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '13px 15px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#34D399', marginBottom: '4px' }}>
                      💠 PIX com Liberação Instantânea
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#A1A1AA', lineHeight: 1.45 }}>
                      Gera QR Code e Copia e Cola em segundos. Assim que o cliente paga, o plano VIP dele fica ativo sozinho.
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '13px 15px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#60A5FA', marginBottom: '4px' }}>
                      🤖 Integrado ao Bot WhatsApp
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#A1A1AA', lineHeight: 1.45 }}>
                      Quando o cliente pede os planos mensais no WhatsApp, o Bot envia o link direto para ele assinar e pagar online.
                    </div>
                  </div>
                </div>
              </div>

              {/* PASSO A PASSO DE CONFIGURAÇÃO */}
              <div
                className="glass-panel"
                style={{
                  padding: '26px 28px',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                  background: 'rgba(18, 18, 22, 0.88)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.12rem', fontWeight: 800, color: '#FAFAFA', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={18} style={{ color: 'var(--gold-primary)' }} />
                      <span>Passo a Passo: Como Configurar seu Mercado Pago (Leva 3 Minutos)</span>
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: '#A1A1AA', margin: 0 }}>
                      Siga as 4 etapas simples abaixo para conectar a conta do Mercado Pago da sua barbearia:
                    </p>
                  </div>
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '9px 15px',
                      borderRadius: '10px',
                      background: 'rgba(59, 130, 246, 0.14)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      color: '#60A5FA',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <span>Abrir Painel Mercado Pago Developers</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {/* Passo 1 */}
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                          color: '#09090B',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        1
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FAFAFA' }}>
                        Crie sua Aplicação no Mercado Pago
                      </span>
                    </div>
                    <p style={{ fontSize: '0.81rem', color: '#A1A1AA', lineHeight: 1.55, margin: 0 }}>
                      Acesse o botão azul acima (<strong>Mercado Pago Developers</strong>) com a conta da sua barbearia. Clique em{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Criar aplicação"</strong>, digite o nome{' '}
                      <strong style={{ color: '#F5D061' }}>BarberFlow Clube VIP</strong>, selecione{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Pagamentos online"</strong> e marque{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Checkout Transparente"</strong>.
                    </p>
                  </div>

                  {/* Passo 2 */}
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                          color: '#09090B',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        2
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FAFAFA' }}>
                        Copie as Credenciais de Produção
                      </span>
                    </div>
                    <p style={{ fontSize: '0.81rem', color: '#A1A1AA', lineHeight: 1.55, margin: 0 }}>
                      No menu lateral esquerdo do Mercado Pago, clique em{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Credenciais de produção"</strong>. Escolha o setor da sua empresa, ative as credenciais e copie a{' '}
                      <strong style={{ color: '#F5D061' }}>Public Key</strong> e o{' '}
                      <strong style={{ color: '#F5D061' }}>Access Token</strong> (ambos começam com <code>APP_USR-...</code>). Cole nos campos abaixo.
                    </p>
                  </div>

                  {/* Passo 3 */}
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                          color: '#09090B',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        3
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FAFAFA' }}>
                        Configure o Webhook Automático
                      </span>
                    </div>
                    <p style={{ fontSize: '0.81rem', color: '#A1A1AA', lineHeight: 1.55, margin: 0 }}>
                      No menu lateral do Mercado Pago, clique em <strong style={{ color: '#E4E4E7' }}>"Webhooks"</strong> →{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Modo de produção"</strong>. Cole a URL exclusiva do seu salão abaixo e marque o evento{' '}
                      <strong style={{ color: '#34D399' }}>"Pagamentos (Payments)"</strong>:
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid rgba(212, 175, 55, 0.28)',
                      }}
                    >
                      <code
                        style={{
                          fontSize: '0.72rem',
                          color: '#F5D061',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={mpWebhookUrl}
                      >
                        {mpWebhookUrl || 'Carregando URL do salão...'}
                      </code>
                      <button
                        type="button"
                        onClick={copyWebhookUrl}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(212, 175, 55, 0.4)',
                          background: 'rgba(212, 175, 55, 0.16)',
                          color: '#F5D061',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          flexShrink: 0,
                        }}
                      >
                        {copiedWebhook ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedWebhook ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Passo 4 */}
                  <div
                    style={{
                      padding: '18px',
                      borderRadius: '14px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                          color: '#09090B',
                          fontWeight: 900,
                          fontSize: '0.85rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        4
                      </span>
                      <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FAFAFA' }}>
                        Teste a Conexão e Ative!
                      </span>
                    </div>
                    <p style={{ fontSize: '0.81rem', color: '#A1A1AA', lineHeight: 1.55, margin: 0 }}>
                      Após colar suas chaves abaixo, clique em{' '}
                      <strong style={{ color: '#E4E4E7' }}>"Testar Conexão com Mercado Pago"</strong> para confirmar se sua conta foi reconhecida, marque a opção{' '}
                      <strong style={{ color: '#34D399' }}>"Habilitar Recebimentos Online"</strong> e salve!
                    </p>
                  </div>
                </div>
              </div>

              {/* FORMULÁRIO DE CREDENCIAIS E MÉTODOS DE PAGAMENTO */}
              <form
                onSubmit={handleSavePaymentConfig}
                className="glass-panel"
                style={{
                  padding: '26px 28px',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                  background: 'rgba(18, 18, 22, 0.9)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '22px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <KeyRound size={20} style={{ color: 'var(--gold-primary)' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FAFAFA', margin: 0 }}>
                      Credenciais do Mercado Pago & Métodos Aceitos
                    </h3>
                  </div>
                  {mpHasAccessToken && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        padding: '4px 12px',
                        borderRadius: '999px',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#34D399',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      <ShieldCheck size={14} />
                      <span>Access Token Configurado ({mpAccessTokenPreview})</span>
                    </span>
                  )}
                </div>

                {/* Chave Geral de Ativação */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: mpEnabled ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: mpEnabled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FAFAFA', marginBottom: '3px' }}>
                      Habilitar Recebimentos Online do Clube VIP na Vitrine e no Bot WhatsApp
                    </div>
                    <div style={{ fontSize: '0.81rem', color: '#A1A1AA' }}>
                      Quando ativado, o botão <strong>"Assinar Online (Cartão ou PIX)"</strong> aparecerá nos planos do Clube VIP da sua vitrine pública.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={mpEnabled}
                    onChange={(e) => setMpEnabled(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: '#10B981', cursor: 'pointer' }}
                  />
                </label>

                {/* Opções de Métodos */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '14px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: mpCreditCardEnabled ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mpCreditCardEnabled}
                      onChange={(e) => setMpCreditCardEnabled(e.target.checked)}
                      style={{ marginTop: '3px', width: '17px', height: '17px', accentColor: '#D4AF37' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FAFAFA' }}>
                        💳 Aceitar Cartão de Crédito
                      </div>
                      <div style={{ fontSize: '0.77rem', color: '#A1A1AA', marginTop: '2px' }}>
                        Pagamento transparente com aprovação na hora.
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: mpRecurringCardEnabled ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mpRecurringCardEnabled}
                      onChange={(e) => setMpRecurringCardEnabled(e.target.checked)}
                      style={{ marginTop: '3px', width: '17px', height: '17px', accentColor: '#D4AF37' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FAFAFA' }}>
                        🔄 Permitir Assinatura Recorrente (Auto-Renew)
                      </div>
                      <div style={{ fontSize: '0.77rem', color: '#A1A1AA', marginTop: '2px' }}>
                        Cliente escolhe entre renovação automática mensal no cartão ou manual.
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: mpPixEnabled ? '1px solid rgba(212, 175, 55, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mpPixEnabled}
                      onChange={(e) => setMpPixEnabled(e.target.checked)}
                      style={{ marginTop: '3px', width: '17px', height: '17px', accentColor: '#D4AF37' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FAFAFA' }}>
                        💠 Aceitar PIX Instantâneo
                      </div>
                      <div style={{ fontSize: '0.77rem', color: '#A1A1AA', marginTop: '2px' }}>
                        QR Code e Copia e Cola com ativação automática via Webhook.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Inputs das Chaves */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '16px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#E4E4E7', marginBottom: '6px' }}>
                      Public Key de Produção (Mercado Pago) *
                    </label>
                    <input
                      type="text"
                      value={mpPublicKey}
                      onChange={(e) => setMpPublicKey(e.target.value)}
                      placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#FAFAFA',
                        fontSize: '0.88rem',
                      }}
                    />
                    <span style={{ display: 'block', fontSize: '0.74rem', color: '#71717A', marginTop: '4px' }}>
                      Usada para criptografar os dados do cartão do cliente na sua vitrine.
                    </span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#E4E4E7', marginBottom: '6px' }}>
                      Access Token de Produção (Mercado Pago) {mpHasAccessToken ? '(Já salvo — preencha apenas para trocar)' : '*'}
                    </label>
                    <input
                      type="password"
                      value={mpAccessToken}
                      onChange={(e) => setMpAccessToken(e.target.value)}
                      placeholder={
                        mpHasAccessToken
                          ? `Token atual salvo (${mpAccessTokenPreview}) — digite para substituir`
                          : 'APP_USR-0000000000000000-000000-xxxxxxxxxxxxxxxx-000000000'
                      }
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#FAFAFA',
                        fontSize: '0.88rem',
                      }}
                    />
                    <span style={{ display: 'block', fontSize: '0.74rem', color: '#71717A', marginTop: '4px' }}>
                      Chave privada que processa as cobranças diretamente para a sua conta.
                    </span>
                  </div>
                </div>

                {/* Resultado do Teste de Conexão */}
                {mpTestResult && (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '10px',
                      background: mpTestResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                      border: mpTestResult.success
                        ? '1px solid rgba(16, 185, 129, 0.35)'
                        : '1px solid rgba(244, 63, 94, 0.35)',
                      color: mpTestResult.success ? '#34D399' : '#FB7185',
                      fontSize: '0.86rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    {mpTestResult.success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    <div>
                      <div style={{ fontWeight: 700 }}>{mpTestResult.message}</div>
                      {mpTestResult.account && (
                        <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: '2px' }}>
                          Conta Mercado Pago ID: <strong>{mpTestResult.account.id}</strong> • Usuário:{' '}
                          <strong>{mpTestResult.account.nickname}</strong> ({mpTestResult.account.email})
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Botões de Ação */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', paddingTop: '6px' }}>
                  <button
                    type="button"
                    onClick={handleTestPaymentConfig}
                    disabled={testingMp}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '11px 20px',
                      borderRadius: '10px',
                      border: '1px solid rgba(212, 175, 55, 0.45)',
                      background: 'rgba(212, 175, 55, 0.12)',
                      color: '#F5D061',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      cursor: testingMp ? 'wait' : 'pointer',
                    }}
                  >
                    <RefreshCw size={16} />
                    <span>{testingMp ? 'Testando Conexão...' : 'Testar Conexão com Mercado Pago'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={savingMp}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 26px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #F5D061 0%, #D4AF37 100%)',
                      color: '#09090B',
                      fontWeight: 800,
                      fontSize: '0.92rem',
                      cursor: savingMp ? 'wait' : 'pointer',
                      boxShadow: '0 6px 18px rgba(212, 175, 55, 0.25)',
                    }}
                  >
                    <Save size={17} />
                    <span>{savingMp ? 'Salvando Integração...' : 'Salvar Configurações de Recebimento'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'general' && (
            <>
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
                  {activeCustomDomain ? 'DOMÍNIO PRÓPRIO ATIVO' : 'DISPONÍVEL'}
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

          {/* Domínio Próprio & DNS Personalizado (Exclusivo Plano Premium) */}
          <div
            className="glass-panel"
            style={{
              padding: '26px 28px',
              marginBottom: '28px',
              border: isPremium ? '1px solid rgba(229, 179, 56, 0.4)' : '1px solid rgba(139, 92, 246, 0.35)',
              background: isPremium
                ? 'radial-gradient(ellipse at top left, rgba(229, 179, 56, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)'
                : 'radial-gradient(ellipse at top left, rgba(139, 92, 246, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: isPremium ? 'rgba(229, 179, 56, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                    border: isPremium ? '1px solid rgba(229, 179, 56, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPremium ? 'var(--primary)' : '#A78BFA',
                  }}
                >
                  <Crown size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.18rem', fontWeight: 600 }}>Domínio Próprio & DNS</h3>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: isPremium ? 'rgba(229, 179, 56, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                        color: isPremium ? 'var(--primary)' : '#C4B5FD',
                        border: isPremium ? '1px solid rgba(229, 179, 56, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
                        fontWeight: 700,
                      }}
                    >
                      {isPremium ? '💎 PLANO PREMIUM' : 'EXCLUSIVO PREMIUM'}
                    </span>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', marginTop: '2px' }}>
                    Conecte o endereço da sua própria barbearia (ex: <code>agendar.minhabarbearia.com.br</code>) diretamente à sua vitrine oficial.
                  </p>
                </div>
              </div>

              {isPremium && currentCustomDomain && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleCheckDns}
                    disabled={loadingDns}
                    className="glass-card"
                    style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Consultar servidores DNS para verificar propagação"
                  >
                    <RefreshCw size={13} className={loadingDns ? 'animate-spin' : undefined} />
                    <span>{loadingDns ? 'Checando...' : 'Verificar DNS'}</span>
                  </button>
                </div>
              )}
            </div>

            {!isPremium ? (
              /* Banner de Bloqueio para Planos Não-Premium com Benefícios e Botão de Upgrade */
              <div
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: '14px',
                  padding: '22px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(229, 179, 56, 0.12)',
                      border: '1px solid rgba(229, 179, 56, 0.25)',
                      color: 'var(--primary)',
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={24} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '6px' }}>
                      Tenha seu próprio link profissional sem menção a barberflow na URL
                    </h4>
                    <p style={{ fontSize: '0.86rem', color: '#94A3B8', lineHeight: '1.5', maxWidth: '780px' }}>
                      O recurso de Domínio Próprio e Apontamento DNS permite que seus clientes acessem seu catálogo, serviços e agendamentos diretamente em <strong>agendar.suabarbearia.com.br</strong> ou no seu próprio domínio, transmitindo o mais alto nível de sofisticação, autoridade e confiança.
                    </p>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '12px',
                        marginTop: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#E2E8F0' }}>
                        <CheckCircle2 size={16} color="#10B981" />
                        <span>Domínio 100% exclusivo do seu salão</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#E2E8F0' }}>
                        <CheckCircle2 size={16} color="#10B981" />
                        <span>Certificado SSL (HTTPS) incluso</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#E2E8F0' }}>
                        <CheckCircle2 size={16} color="#10B981" />
                        <span>Mais autoridade no Google e Instagram</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#E2E8F0' }}>
                        <CheckCircle2 size={16} color="#10B981" />
                        <span>Suporte prioritário na configuração</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    Seu plano atual: <strong style={{ color: '#FFFFFF' }}>{subscription?.plan?.name || 'Starter'}</strong>
                  </span>
                  <a
                    href="/planos"
                    className="gold-gradient-primary gold-glow"
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      textDecoration: 'none',
                    }}
                  >
                    <Crown size={16} />
                    <span>Fazer Upgrade para o Plano Premium</span>
                  </a>
                </div>
              </div>
            ) : (
              /* Painel de Configuração DNS do Salão Premium */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {currentCustomDomain ? (
                  <div
                    style={{
                      backgroundColor: dnsStatus?.verified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: dnsStatus?.verified ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {dnsStatus?.verified ? (
                          <CheckCircle2 size={18} color="#10B981" />
                        ) : (
                          <Clock size={18} color="#F59E0B" />
                        )}
                        <strong style={{ fontSize: '0.98rem', color: dnsStatus?.verified ? '#34D399' : '#FBBF24' }}>
                          {dnsStatus?.verified ? 'Domínio Ativo & Certificado SSL Validado' : dnsStatus?.dnsVerified ? 'DNS Detectado • Provisionando Certificado SSL (HTTPS)' : 'Aguardando Propagação DNS'}
                        </strong>
                      </div>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        {dnsStatus?.message || 'Apontamento CNAME registrado.'}
                      </p>
                      <div style={{ marginTop: '8px' }}>
                        <a
                          href={`https://${currentCustomDomain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            color: 'var(--primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            textDecoration: 'underline',
                          }}
                        >
                          <Globe size={14} />
                          <span>https://{currentCustomDomain}</span>
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoveCustomDomain}
                      disabled={savingDns}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid rgba(244, 63, 94, 0.4)',
                        backgroundColor: 'rgba(244, 63, 94, 0.1)',
                        color: '#FB7185',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {savingDns ? 'Removendo...' : 'Desvincular Domínio'}
                    </button>
                  </div>
                ) : null}

                {/* Tabela de Instruções de Apontamento DNS */}
                <div
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '18px 20px',
                  }}
                >
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '8px', color: '#FFFFFF' }}>
                    Instruções para Apontamento DNS (no seu Registro.br, Cloudflare ou Provedor)
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.4' }}>
                    Acesse a zona DNS do seu domínio e adicione o seguinte registro <strong>CNAME</strong> apontando para o BarberFlow:
                  </p>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-dim)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 10px' }}>Tipo</th>
                          <th style={{ padding: '8px 10px' }}>Nome / Host</th>
                          <th style={{ padding: '8px 10px' }}>Destino / Aponta Para</th>
                          <th style={{ padding: '8px 10px' }}>TTL</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '10px', fontWeight: 600, color: 'var(--primary)' }}>
                            {dnsInstructions.type || 'CNAME'}
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', color: '#E2E8F0' }}>
                            {currentCustomDomain && currentCustomDomain.includes('.')
                              ? currentCustomDomain.split('.')[0]
                              : dnsInstructions.name || 'agendar'}
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'monospace', color: '#38BDF8' }}>
                            {dnsInstructions.target || 'barberflow.azespo.com.br'}
                          </td>
                          <td style={{ padding: '10px', color: 'var(--text-muted)' }}>Auto / 3600</td>
                          <td style={{ padding: '10px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => copyDnsTarget(dnsInstructions.target || 'barberflow.azespo.com.br')}
                              className="glass-card"
                              style={{
                                padding: '4px 10px',
                                fontSize: '0.75rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: copiedDnsTarget ? '#10B981' : 'var(--text-main)',
                              }}
                            >
                              {copiedDnsTarget ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedDnsTarget ? 'Copiado!' : 'Copiar Destino'}</span>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Formulário para definir/alterar domínio */}
                <form
                  onSubmit={handleSaveCustomDomain}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {currentCustomDomain ? 'Alterar Domínio Cadastrado' : 'Cadastrar Domínio Próprio'}
                  </label>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '260px' }}>
                      <input
                        type="text"
                        placeholder="Ex: agendar.minhabarbearia.com.br"
                        value={customDomainInput}
                        onChange={(e) => setCustomDomainInput(e.target.value.toLowerCase())}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={savingDns}
                      className="gold-gradient-primary gold-glow"
                      style={{ padding: '10px 22px', fontSize: '0.88rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Save size={16} />
                      <span>{savingDns ? 'Salvando...' : currentCustomDomain ? 'Atualizar Domínio' : 'Salvar Domínio'}</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Recomendamos usar um subdomínio como <code>agendar.seusite.com.br</code> ou <code>marcar.seusite.com.br</code> para não conflitar com seu site institucional.
                  </span>
                </form>
              </div>
            )}
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

              {/* Endereço com busca e mapa */}
              <div style={{ marginBottom: '24px' }}>
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  placeholder="Ex: Rua Marta da Silva Pereira, 80 ou digite o CEP"
                  showMapPreview
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

            {/* Horários de Funcionamento — Redesenhado estilo Definições de Data & Tempo */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(229, 179, 56, 0.15)',
                      border: '1px solid rgba(229, 179, 56, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                    }}
                  >
                    <Clock size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Horários de Atendimento Semanal</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.86rem', margin: '3px 0 0 0' }}>
                      Defina os dias de abertura, expediente e horário de almoço/intervalo da sua barbearia.
                    </p>
                  </div>
                </div>

                {/* Seleção do Modo de Configuração (Image 3) */}
                <div
                  style={{
                    display: 'inline-flex',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '4px',
                    gap: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setScheduleMode('grouped')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '7px',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: scheduleMode === 'grouped' ? 'var(--primary)' : 'transparent',
                      color: scheduleMode === 'grouped' ? '#0B0F17' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>Configurar por Grupo de Dias</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleMode('detailed')}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '7px',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: scheduleMode === 'detailed' ? 'var(--primary)' : 'transparent',
                      color: scheduleMode === 'detailed' ? '#0B0F17' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <span>Ajuste Individual por Dia</span>
                  </button>
                </div>
              </div>

              {scheduleMode === 'grouped' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                  {/* 1. Definições de Data (Image 3) */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '20px 22px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={18} color="var(--primary)" />
                        <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>
                          Definições de Data / Dias da Semana
                        </h4>
                      </div>

                      {/* Quick Presets */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                          className="glass-card"
                          style={{ padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '6px', fontWeight: 600 }}
                        >
                          Seg a Sex
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6])}
                          className="glass-card"
                          style={{ padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '6px', fontWeight: 600 }}
                        >
                          Seg a Sáb
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                          className="glass-card"
                          style={{ padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '6px', fontWeight: 600 }}
                        >
                          Todos os Dias
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([])}
                          className="glass-card"
                          style={{ padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '6px', color: 'var(--text-dim)' }}
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {/* Checkbox "Todas" + Lista de Dias (Image 3) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.86rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: selectedDays.length === 7 ? 'rgba(229, 179, 56, 0.2)' : 'rgba(0, 0, 0, 0.35)',
                          border: `1px solid ${selectedDays.length === 7 ? 'var(--primary)' : 'var(--border-color)'}`,
                          color: selectedDays.length === 7 ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedDays.length === 7}
                          onChange={(e) => handleToggleAllDays(e.target.checked)}
                          style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                        />
                        <span>Todas</span>
                      </label>

                      {weekdayNames.map((dayName, idx) => {
                        const isSelected = selectedDays.includes(idx);
                        return (
                          <label
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '0.86rem',
                              cursor: 'pointer',
                              padding: '8px 14px',
                              borderRadius: '8px',
                              background: isSelected ? 'rgba(229, 179, 56, 0.12)' : 'rgba(0, 0, 0, 0.3)',
                              border: `1px solid ${isSelected ? 'rgba(229, 179, 56, 0.45)' : 'var(--border-color)'}`,
                              color: isSelected ? '#F3F4F6' : 'var(--text-dim)',
                              fontWeight: isSelected ? 600 : 500,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleDay(idx)}
                              style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                            <span>{dayName}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Definições de Tempo (Image 2) */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      padding: '20px 22px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
                      <Clock size={18} color="var(--primary)" />
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0 }}>
                        Definições de Horário
                      </h4>
                    </div>

                    {/* Horário de Trabalho (Tabela estilo Image 2) */}
                    <div style={{ marginBottom: '20px' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                        Horário Trabalho
                      </span>

                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.35)',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            padding: '10px 16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            borderBottom: '1px solid var(--border-color)',
                            fontSize: '0.82rem',
                            color: 'var(--text-dim)',
                            fontWeight: 600,
                          }}
                        >
                          <span>Início</span>
                          <span>Final</span>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            padding: '12px 16px',
                            gap: '16px',
                            alignItems: 'center',
                          }}
                        >
                          <TimePicker
                            value={groupOpenTime}
                            onChange={setGroupOpenTime}
                            placeholder="09:00"
                          />

                          <TimePicker
                            value={groupCloseTime}
                            onChange={setGroupCloseTime}
                            placeholder="19:00"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Horário de Intervalo / Almoço (Tabela estilo Image 2) */}
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Horário Intervalo / Almoço
                        </span>

                        {!hasBreak && (
                          <button
                            type="button"
                            onClick={() => setHasBreak(true)}
                            className="glass-card"
                            style={{
                              padding: '5px 12px',
                              fontSize: '0.8rem',
                              color: 'var(--primary)',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer',
                              borderRadius: '6px',
                            }}
                          >
                            <Plus size={14} />
                            <span>Adicionar Intervalo</span>
                          </button>
                        )}
                      </div>

                      {hasBreak ? (
                        <div
                          style={{
                            background: 'rgba(0, 0, 0, 0.35)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 60px',
                              padding: '10px 16px',
                              background: 'rgba(255, 255, 255, 0.02)',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: '0.82rem',
                              color: 'var(--text-dim)',
                              fontWeight: 600,
                            }}
                          >
                            <span>Início</span>
                            <span>Final</span>
                            <span style={{ textAlign: 'center' }}>Operações</span>
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr 60px',
                              padding: '12px 16px',
                              gap: '16px',
                              alignItems: 'center',
                            }}
                          >
                            <TimePicker
                              value={groupBreakStart}
                              onChange={setGroupBreakStart}
                              placeholder="12:00"
                            />

                            <TimePicker
                              value={groupBreakEnd}
                              onChange={setGroupBreakEnd}
                              placeholder="13:00"
                            />

                            <div style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setHasBreak(false)}
                                title="Remover intervalo"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#EF4444',
                                  cursor: 'pointer',
                                  padding: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>

                          {/* Faixa azul explicativa idêntica à Image 2 */}
                          <div
                            style={{
                              background: 'rgba(59, 130, 246, 0.1)',
                              borderTop: '1px solid rgba(59, 130, 246, 0.25)',
                              padding: '10px 16px',
                              fontSize: '0.82rem',
                              color: '#93C5FD',
                              lineHeight: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <Info size={16} style={{ flexShrink: 0 }} />
                            <span>
                              O horário de intervalo bloqueia agendamentos durante esse período para que os barbeiros possam almoçar ou descansar.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          style={{
                            padding: '18px',
                            background: 'rgba(0, 0, 0, 0.25)',
                            borderRadius: '8px',
                            border: '1px dashed var(--border-color)',
                            textAlign: 'center',
                            color: 'var(--text-dim)',
                            fontSize: '0.85rem',
                          }}
                        >
                          Expediente contínuo sem pausas. Clique em "Adicionar Intervalo" acima para definir intervalo de almoço.
                        </div>
                      )}
                    </div>

                    {/* Botão de Aplicar Horários */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <button
                        type="button"
                        disabled={applyingSchedule}
                        onClick={handleApplyGroupSchedule}
                        className="gold-gradient-primary gold-glow"
                        style={{
                          padding: '11px 24px',
                          borderRadius: '8px',
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          cursor: applyingSchedule ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          opacity: applyingSchedule ? 0.7 : 1,
                        }}
                      >
                        <Check size={18} />
                        <span>
                          {applyingSchedule
                            ? 'Salvando e aplicando horários...'
                            : `Aplicar aos ${selectedDays.length} dias selecionados`}
                        </span>
                      </button>

                      {scheduleAppliedMsg && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#10B981',
                            fontSize: '0.88rem',
                            fontWeight: 600,
                          }}
                        >
                          <CheckCircle2 size={16} />
                          <span>{scheduleAppliedMsg}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Tabela Resumo dos 7 Dias da Semana (Layout Executivo de Largura Total) */}
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header com Resumo Semanal e Métricas */}
                    <div
                      style={{
                        padding: '16px 20px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#F3F4F6', margin: 0 }}>
                          Grade Semanal Configurada
                        </h4>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '3px 0 0 0' }}>
                          Visão geral executiva de horários, expediente e capacidade da barbearia
                        </p>
                      </div>

                      {/* Métricas Semanais */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.76rem',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            color: '#10B981',
                            fontWeight: 600,
                          }}
                        >
                          {openDaysCount} dias de funcionamento
                        </span>

                        <span
                          style={{
                            fontSize: '0.76rem',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: 'rgba(229, 179, 56, 0.12)',
                            border: '1px solid rgba(229, 179, 56, 0.25)',
                            color: 'var(--primary)',
                            fontWeight: 600,
                          }}
                        >
                          {totalWeeklyHoursFormatted} semanais
                        </span>

                        <span
                          style={{
                            fontSize: '0.76rem',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: 'rgba(56, 189, 248, 0.1)',
                            border: '1px solid rgba(56, 189, 248, 0.25)',
                            color: '#38BDF8',
                            fontWeight: 600,
                          }}
                        >
                          ~{totalWeeklySlots} vagas / semana
                        </span>
                      </div>
                    </div>

                    {/* Tabela de 6 Colunas Balanceadas que Preenche Todo o Espaço */}
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ minWidth: '860px' }}>
                        {/* Cabeçalho de Colunas */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '100px 170px 220px 210px 140px 1fr',
                            alignItems: 'center',
                            padding: '10px 20px',
                            background: 'rgba(0, 0, 0, 0.35)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            color: 'var(--text-dim)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          <span>Status</span>
                          <span>Dia da Semana</span>
                          <span>Expediente</span>
                          <span>Intervalo / Almoço</span>
                          <span>Carga Horária</span>
                          <span>Capacidade Estimada</span>
                        </div>

                        {/* Linhas da Tabela */}
                        {businessHours.map((hour) => {
                          const isToday = new Date().getDay() === hour.weekday;
                          const hasBreakConfigured = Boolean(hour.isOpen && hour.breakStart && hour.breakEnd);
                          const stats = getHourStats(hour, slotIntervalMinutes);

                          return (
                            <div
                              key={hour.weekday}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '100px 170px 220px 210px 140px 1fr',
                                alignItems: 'center',
                                padding: '12px 20px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                background: isToday ? 'rgba(229, 179, 56, 0.07)' : 'transparent',
                                transition: 'background 0.15s ease',
                              }}
                            >
                              {/* Coluna 1: Status Toggle */}
                              <div>
                                <button
                                  type="button"
                                  disabled={togglingWeekday === hour.weekday}
                                  onClick={() => handleToggleDayStatus(hour.weekday)}
                                  title="Clique para alternar Aberto/Fechado e salvar"
                                  style={{
                                    width: '80px',
                                    padding: '4px 0',
                                    textAlign: 'center',
                                    borderRadius: '6px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: togglingWeekday === hour.weekday ? 'wait' : 'pointer',
                                    background: hour.isOpen ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.15)',
                                    color: hour.isOpen ? '#10B981' : '#FB7185',
                                    border: `1px solid ${hour.isOpen ? 'rgba(16, 185, 129, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`,
                                    transition: 'all 0.15s ease',
                                    opacity: togglingWeekday === hour.weekday ? 0.6 : 1,
                                  }}
                                >
                                  {togglingWeekday === hour.weekday ? '...' : hour.isOpen ? 'ABERTO' : 'FECHADO'}
                                </button>
                              </div>

                              {/* Coluna 2: Dia da Semana + Badge Hoje */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    fontWeight: isToday ? 700 : 600,
                                    fontSize: '0.92rem',
                                    color: isToday ? 'var(--primary)' : '#F3F4F6',
                                  }}
                                >
                                  {weekdayNames[hour.weekday]}
                                </span>
                                {isToday && (
                                  <span
                                    style={{
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      color: 'var(--primary)',
                                      background: 'rgba(229, 179, 56, 0.18)',
                                      border: '1px solid rgba(229, 179, 56, 0.35)',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    Hoje
                                  </span>
                                )}
                              </div>

                              {/* Coluna 3: Expediente */}
                              <div>
                                {hour.isOpen ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
                                    <Clock size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-muted)' }}>Expediente:</span>
                                    <strong style={{ color: '#F3F4F6', fontFamily: 'monospace, monospace', letterSpacing: '0.02em' }}>
                                      {hour.openTime} às {hour.closeTime}
                                    </strong>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.86rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                    Barbearia fechada
                                  </span>
                                )}
                              </div>

                              {/* Coluna 4: Intervalo / Almoço */}
                              <div>
                                {hour.isOpen ? (
                                  hasBreakConfigured ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: 'var(--primary)',
                                        fontWeight: 600,
                                        fontSize: '0.82rem',
                                        fontFamily: 'monospace, monospace',
                                        background: 'rgba(229, 179, 56, 0.12)',
                                        border: '1px solid rgba(229, 179, 56, 0.28)',
                                        padding: '2px 8px',
                                        borderRadius: '5px',
                                      }}
                                    >
                                      ☕ {hour.breakStart} às {hour.breakEnd}
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 8px',
                                        borderRadius: '5px',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        color: 'var(--text-muted)',
                                        fontSize: '0.78rem',
                                      }}
                                    >
                                      ⚡ Expediente contínuo
                                    </span>
                                  )
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>—</span>
                                )}
                              </div>

                              {/* Coluna 5: Carga Horária */}
                              <div>
                                {hour.isOpen ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem' }}>
                                    <span style={{ fontWeight: 600, color: '#E2E8F0' }}>
                                      {stats.formattedHours}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>—</span>
                                )}
                              </div>

                              {/* Coluna 6: Capacidade Estimada */}
                              <div>
                                {hour.isOpen ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem' }}>
                                    <span
                                      style={{
                                        color: '#38BDF8',
                                        background: 'rgba(56, 189, 248, 0.1)',
                                        border: '1px solid rgba(56, 189, 248, 0.25)',
                                        padding: '2px 8px',
                                        borderRadius: '5px',
                                        fontWeight: 600,
                                        fontFamily: 'monospace, monospace',
                                        fontSize: '0.8rem',
                                      }}
                                    >
                                      {stats.slots} vagas
                                    </span>
                                    <span style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>
                                      (~{slotIntervalMinutes}m)
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-dim)', fontSize: '0.82rem', fontStyle: 'italic' }}>
                                    Sem vagas
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Modo Ajuste Individual por Dia */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {businessHours.map((hour) => (
                    <div
                      key={hour.weekday}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '160px' }}>
                        <input
                          type="checkbox"
                          checked={hour.isOpen}
                          onChange={(e) => handleHourChange(hour.weekday, 'isOpen', e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.94rem', color: hour.isOpen ? '#F3F4F6' : 'var(--text-dim)' }}>
                          {weekdayNames[hour.weekday]}
                        </span>
                      </div>

                      {hour.isOpen ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                          {/* Expediente */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', minWidth: '70px' }}>Expediente:</span>
                            <TimePicker
                              value={hour.openTime}
                              onChange={(val) => handleHourChange(hour.weekday, 'openTime', val)}
                              style={{ width: '120px' }}
                            />
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>até</span>
                            <TimePicker
                              value={hour.closeTime}
                              onChange={(val) => handleHourChange(hour.weekday, 'closeTime', val)}
                              style={{ width: '120px' }}
                            />
                          </div>

                          {/* Intervalo */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', minWidth: '55px' }}>Almoço:</span>
                            <TimePicker
                              value={hour.breakStart || ''}
                              onChange={(val) => handleHourChange(hour.weekday, 'breakStart', val || null)}
                              placeholder="--:--"
                              clearable
                              style={{ width: '120px' }}
                            />
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>até</span>
                            <TimePicker
                              value={hour.breakEnd || ''}
                              onChange={(val) => handleHourChange(hour.weekday, 'breakEnd', val || null)}
                              placeholder="--:--"
                              clearable
                              style={{ width: '120px' }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          Fechado
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
