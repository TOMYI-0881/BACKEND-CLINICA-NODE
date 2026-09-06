import nodemailer, { Transporter } from 'nodemailer';
import { EmailService } from '../../../domain/ports/EmailService';

export interface NodemailerConfig {
  /** Si se omite, usa Gmail (`service: 'gmail'`) con `user`/`pass`. */
  host?: string;
  port?: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromName?: string;
}

export class NodemailerEmailService implements EmailService {
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;

  constructor(config: NodemailerConfig) {
    this.fromAddress = config.fromName ? `"${config.fromName}" <${config.user}>` : config.user;

    // Sin credenciales, no-op (mismo patron que DiscordNotificationService con
    // DISCORD_WEBHOOK_URL vacia): no rompe docker-compose up si todavia no se cargaron.
    if (!config.user || !config.pass) {
      this.transporter = null;
      return;
    }

    this.transporter = config.host
      ? nodemailer.createTransport({
          host: config.host,
          port: config.port ?? 587,
          secure: config.secure ?? false,
          auth: { user: config.user, pass: config.pass },
        })
      : nodemailer.createTransport({
          service: 'gmail',
          auth: { user: config.user, pass: config.pass },
        });
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    if (!this.transporter) return;

    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject,
      text: body,
    });
  }
}
