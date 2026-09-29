import { describe, it, expect } from 'vitest';
import { createMailer } from './create-mailer';
import { ResendMailer } from './resend-mailer';
import { ConsoleMailer } from './console-mailer';

describe('createMailer', () => {
  it('returns ConsoleMailer for console provider', () => {
    const mailer = createMailer({ MAIL_PROVIDER: 'console' });
    expect(mailer).toBeInstanceOf(ConsoleMailer);
  });

  it('returns ResendMailer for resend provider', () => {
    const mailer = createMailer({
      MAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'test-key',
      MAIL_FROM: 'noreply@gobbit.dev',
    });
    expect(mailer).toBeInstanceOf(ResendMailer);
  });

  it('throws when resend provider lacks RESEND_API_KEY', () => {
    expect(() =>
      createMailer({
        MAIL_PROVIDER: 'resend',
        MAIL_FROM: 'noreply@gobbit.dev',
      }),
    ).toThrow('RESEND_API_KEY is required when MAIL_PROVIDER=resend');
  });

  it('throws when resend provider lacks MAIL_FROM', () => {
    expect(() =>
      createMailer({
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-key',
      }),
    ).toThrow('MAIL_FROM is required when MAIL_PROVIDER=resend');
  });
});
