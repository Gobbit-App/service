import nodemailer from 'nodemailer';
import { type Mailer, type MailMessage } from './mailer';

/** Minimal nodemailer transport surface (injectable for tests). */
export interface SmtpTransportLike {
  sendMail(p: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/** Mailer over plain SMTP (e2e: Mailpit, no auth/TLS). */
export class SmtpMailer implements Mailer {
  private transport: SmtpTransportLike;
  private from: string;

  constructor(opts: { url: string; from: string; transport?: SmtpTransportLike }) {
    this.from = opts.from;
    this.transport = opts.transport ?? nodemailer.createTransport(opts.url);
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  }
}
