import { Resend } from 'resend';
import { type Mailer, type MailMessage } from './mailer';

/** Resend API-like interface for sending emails. */
export interface ResendLike {
  emails: {
    send(p: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }): Promise<{ error: { message: string } | null }>;
  };
}

/** Mailer using the Resend email service API. */
export class ResendMailer implements Mailer {
  private client: ResendLike;
  private from: string;

  constructor(opts: { apiKey: string; from: string; client?: ResendLike }) {
    this.from = opts.from;
    this.client = opts.client ?? (new Resend(opts.apiKey) as unknown as ResendLike);
  }

  async send(msg: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });

    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}
