/** Email message with recipient, subject, and text/html content. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** D295: the provider drops a second send with the same key (a retried delivery). */
  idempotencyKey?: string;
}

/** Abstract mailer interface for sending emails. */
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}
