import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { env } from '../config/env.js';

interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
}

interface SendMailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Obtém as configurações ativas de SMTP (Banco ou Fallback de Env) */
export async function getActiveSmtpConfig(): Promise<SmtpOptions | null> {
  const setting = await prisma.systemSetting.findUnique({
    where: { id: 'global' },
  });

  const host = setting?.smtpHost || process.env.SMTP_HOST;
  const port = setting?.smtpPort || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
  const user = setting?.smtpUser || process.env.SMTP_USER;
  const pass = setting?.smtpPass || process.env.SMTP_PASS;
  const from = setting?.smtpFrom || process.env.SMTP_FROM || 'BarberFlow <notificacoes@barberflow.com.br>';
  const secure = setting?.smtpSecure ?? (port === 465);

  if (!host) {
    return null;
  }

  return {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    from,
  };
}

/** Cria um transporter do Nodemailer a partir das opções */
export function createTransporter(options: SmtpOptions): Transporter {
  return nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth: options.auth,
    tls: {
      rejectUnauthorized: false, // Compatível com servidores com certificados autoassinados/proxy
    },
  });
}

/** Valida a conexão com o servidor SMTP */
export async function testSmtpConnection(options: SmtpOptions): Promise<{ success: boolean; message: string }> {
  try {
    const transporter = createTransporter(options);
    await transporter.verify();
    return { success: true, message: 'Conexão com o servidor SMTP estabelecida com sucesso!' };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Falha desconhecida na conexão SMTP';
    logger.warn({ err }, 'Falha no teste de conexão SMTP');
    return { success: false, message: errorMessage };
  }
}

/** Envia um e-mail formatado */
export async function sendEmail(params: SendMailParams): Promise<boolean> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { id: 'global' } });
    if (setting && setting.emailNotificationsEnabled === false) {
      logger.info('Notificações por e-mail estão desativadas globalmente.');
      return false;
    }

    const config = await getActiveSmtpConfig();
    if (!config) {
      logger.warn('Nenhum servidor SMTP configurado. E-mail não enviado.');
      return false;
    }

    const transporter = createTransporter(config);
    const to = Array.isArray(params.to) ? params.to.join(', ') : params.to;

    await transporter.sendMail({
      from: config.from,
      to,
      subject: params.subject,
      text: params.text || params.html.replace(/<[^>]*>?/gm, ''),
      html: params.html,
    });

    logger.info({ to, subject: params.subject }, 'E-mail enviado com sucesso via SMTP');
    return true;
  } catch (err) {
    logger.error({ err, to: params.to, subject: params.subject }, 'Erro ao enviar e-mail via SMTP');
    return false;
  }
}

/** Layout HTML padrão BarberFlow Dark & Gold */
export function buildBarberFlowEmailHtml(options: {
  title: string;
  preheader?: string;
  contentHtml: string;
  actionButton?: { text: string; url: string };
}): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0B0F17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #F8FAFC;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0B0F17; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #121826; border: 1px solid rgba(229, 179, 56, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px 40px; background: linear-gradient(180deg, rgba(229, 179, 56, 0.1) 0%, rgba(18, 24, 38, 0) 100%); border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #E5B338; letter-spacing: -0.5px;">
                ✂️ Barber<span style="color: #F8FAFC;">Flow</span>
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #94A3B8;">Plataforma de Gestão Inteligente para Barbearias</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 35px 40px;">
              <h2 style="margin: 0 0 18px 0; font-size: 20px; font-weight: 700; color: #F8FAFC;">
                ${options.title}
              </h2>
              <div style="font-size: 15px; line-height: 1.6; color: #CBD5E1;">
                ${options.contentHtml}
              </div>
              ${
                options.actionButton
                  ? `
                <div style="margin-top: 30px; text-align: center;">
                  <a href="${options.actionButton.url}" target="_blank" style="display: inline-block; padding: 13px 32px; background: linear-gradient(135deg, #E5B338 0%, #C99520 100%); color: #0B0F17; text-decoration: none; font-weight: 700; font-size: 15px; border-radius: 10px; box-shadow: 0 4px 15px rgba(229, 179, 56, 0.35);">
                    ${options.actionButton.text}
                  </a>
                </div>
              `
                  : ''
              }
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #0D121D; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #64748B;">
              <p style="margin: 0 0 6px 0;">Este é um e-mail automático do sistema BarberFlow.</p>
              <p style="margin: 0;">© ${new Date().getFullYear()} BarberFlow SaaS. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
