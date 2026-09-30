import { type Mailer, type MailMessage } from './mailer';

/** In-memory mailer for testing, storing all sent messages. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
  }

  /** Clear all sent messages. */
  clear(): void {
    this.sent.length = 0;
  }

  /** Get the last sent message, or undefined if none sent. */
  last(): MailMessage | undefined {
    return this.sent[this.sent.length - 1];
  }
}
