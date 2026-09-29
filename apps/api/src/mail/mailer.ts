/** Email message with recipient, subject, and text/html content. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Abstract mailer interface for sending emails. */
export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}
