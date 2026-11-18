import { ConsoleMailer } from './console-mailer';
import { ResendMailer } from './resend-mailer';
import { SmtpMailer } from './smtp-mailer';
import { type Mailer } from './mailer';

/** Environment variables for mailer configuration. */
export interface MailEnv {
  MAIL_PROVIDER: 'resend' | 'console' | 'smtp';
  SMTP_URL?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

/** Create a mailer instance based on environment configuration. */
export function createMailer(env: MailEnv): Mailer {
  if (env.MAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required when MAIL_PROVIDER=resend');
    }
    if (!env.MAIL_FROM) {
      throw new Error('MAIL_FROM is required when MAIL_PROVIDER=resend');
    }
    return new ResendMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.MAIL_FROM,
    });
  }
  if (env.MAIL_PROVIDER === 'smtp') {
    if (!env.SMTP_URL) throw new Error('SMTP_URL is required when MAIL_PROVIDER=smtp');
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM is required when MAIL_PROVIDER=smtp');
    return new SmtpMailer({ url: env.SMTP_URL, from: env.MAIL_FROM });
  }
  return new ConsoleMailer();
}
