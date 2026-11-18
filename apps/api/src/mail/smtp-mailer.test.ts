import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, it, expect } from 'vitest';
import { createMailer } from './create-mailer';
import { SmtpMailer } from './smtp-mailer';

/** Minimal in-process SMTP server; records the commands and DATA it received. */
function fakeSmtp() {
  const commands: string[] = [];
  let data = '';
  let inData = false;
  const server = net.createServer((sock) => {
    let buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString();
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 queued\r\n');
          } else data += line + '\n';
          continue;
        }
        commands.push(line);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === 'EHLO' || verb === 'HELO') sock.write('250 fake\r\n');
        else if (verb === 'DATA') {
          inData = true;
          sock.write('354 go\r\n');
        } else if (verb === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 ok\r\n');
      }
    });
  });
  return { server, commands, data: () => data };
}

describe('SmtpMailer', () => {
  it('delivers a sign-in email with the link to an SMTP server', async () => {
    const fake = fakeSmtp();
    await new Promise<void>((r) => fake.server.listen(0, '127.0.0.1', r));
    const port = (fake.server.address() as AddressInfo).port;
    try {
      const mailer = new SmtpMailer({
        url: `smtp://127.0.0.1:${port}`,
        from: 'noreply@gobbit.test',
      });
      const link = 'http://localhost/auth/verify?token=abc123';
      await mailer.send({
        to: 'alice@example.com',
        subject: 'Sign in',
        text: `Sign in: ${link}`,
        html: `<a href="${link}">Sign in</a>`,
      });
      expect(fake.commands.some((c) => /^RCPT TO:\s*<alice@example\.com>/i.test(c))).toBe(true);
      expect(fake.data()).toContain('token=abc123');
    } finally {
      fake.server.close();
    }
  });
});

describe('createMailer smtp', () => {
  it('selects SmtpMailer', () => {
    const m = createMailer({
      MAIL_PROVIDER: 'smtp',
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'a@b.test',
    });
    expect(m).toBeInstanceOf(SmtpMailer);
  });

  it('throws without SMTP_URL', () => {
    expect(() => createMailer({ MAIL_PROVIDER: 'smtp', MAIL_FROM: 'a@b.test' })).toThrow(
      'SMTP_URL is required',
    );
  });
});
