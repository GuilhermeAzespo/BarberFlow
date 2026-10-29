import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { ToastProvider } from '../components/Toast';
import { WhatsAppNotificationProvider } from '../lib/whatsapp-notifications-context';
import { ImpersonationBanner } from '../components/ImpersonationBanner';

export const metadata: Metadata = {
  title: 'BarberFlow — Gestão Inteligente para Barbearias e Salões',
  description:
    'SaaS multi-tenant moderno com automação 100% via WhatsApp, agendamentos em tempo real e controle de fluxo de caixa.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/logo.png" type="image/png" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <ToastProvider>
          <AuthProvider>
            <WhatsAppNotificationProvider>
              <ImpersonationBanner />
              {children}
            </WhatsAppNotificationProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
