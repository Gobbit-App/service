import { type Mailer, type MailMessage } from './mailer';
import { lineSink } from '../lib/logger';

/** Console-based mailer for local development, logging emails to stdout. */
export class ConsoleMailer implements Mailer {
  constructor(private log: (line: string) => void = lineSink('mail', 'info')) {}

  async send(msg: MailMessage): Promise<void> {
    this.log(`[mail] to=${msg.to} subject=${msg.subject}`);
    this.log(msg.text);
  }
}
