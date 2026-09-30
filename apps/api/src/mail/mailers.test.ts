import { describe, it, expect, vi } from 'vitest';
import { MemoryMailer } from './memory-mailer';
import { ConsoleMailer } from './console-mailer';
import { ResendMailer, type ResendLike } from './resend-mailer';

const testMsg = {
  to: 'test@example.com',
  subject: 'Test Subject',
  text: 'Click here: http://localhost:3000/verify?token=abc123',
  html: '<p>Click <a href="http://localhost:3000/verify?token=abc123">here</a></p>',
};

describe('MemoryMailer', () => {
  it('records sent messages in order', async () => {
    const mailer = new MemoryMailer();
    expect(mailer.sent).toHaveLength(0);

    await mailer.send(testMsg);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toEqual(testMsg);

    await mailer.send({ ...testMsg, to: 'another@example.com' });
    expect(mailer.sent).toHaveLength(2);
  });

  it('last() returns the most recent message', async () => {
    const mailer = new MemoryMailer();
    expect(mailer.last()).toBeUndefined();

    await mailer.send(testMsg);
    expect(mailer.last()).toEqual(testMsg);

    const second = { ...testMsg, to: 'second@example.com' };
    await mailer.send(second);
    expect(mailer.last()).toEqual(second);
  });

  it('clear() empties the sent array', async () => {
    const mailer = new MemoryMailer();
    await mailer.send(testMsg);
    expect(mailer.sent).toHaveLength(1);

    mailer.clear();
    expect(mailer.sent).toHaveLength(0);
    expect(mailer.last()).toBeUndefined();
  });
});

describe('ConsoleMailer', () => {
  it('logs recipient and subject header, then text body', async () => {
    const logged: string[] = [];
    const mailer = new ConsoleMailer((line) => logged.push(line));

    await mailer.send(testMsg);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toBe('[mail] to=test@example.com subject=Test Subject');
    expect(logged[1]).toBe(testMsg.text);
  });

  it('uses console.log by default', async () => {
    const originalLog = console.log;
    const logged: string[] = [];
    console.log = (line: string) => logged.push(line);

    try {
      const mailer = new ConsoleMailer();
      await mailer.send(testMsg);
      expect(logged).toHaveLength(2);
    } finally {
      console.log = originalLog;
    }
  });
});

describe('ResendMailer', () => {
  it('forwards from, to, subject, text, html to client', async () => {
    const sendFn = vi.fn().mockResolvedValue({ error: null });
    const fakeClient: ResendLike = { emails: { send: sendFn } };

    const mailer = new ResendMailer({
      apiKey: 'dummy',
      from: 'noreply@gobbit.dev',
      client: fakeClient,
    });

    await mailer.send(testMsg);
    expect(sendFn).toHaveBeenCalledWith({
      from: 'noreply@gobbit.dev',
      to: testMsg.to,
      subject: testMsg.subject,
      text: testMsg.text,
      html: testMsg.html,
    });
  });

  it('throws when resend client returns an error', async () => {
    const sendFn = vi.fn().mockResolvedValue({ error: { message: 'bad' } });
    const fakeClient: ResendLike = { emails: { send: sendFn } };

    const mailer = new ResendMailer({
      apiKey: 'dummy',
      from: 'noreply@gobbit.dev',
      client: fakeClient,
    });

    await expect(mailer.send(testMsg)).rejects.toThrow('Resend send failed: bad');
  });
});
