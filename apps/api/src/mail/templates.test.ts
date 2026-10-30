import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  signInEmail,
  inviteEmail,
  waitlistConfirmEmail,
  waitlistExistingUserEmail,
  waitlistInviteEmail,
} from './templates';

describe('waitlistInviteEmail (032)', () => {
  const link = 'https://api.example.test/auth/callback?token=abc&x=<y>';

  it('says you are in, with the link, its lifetime and the sign-in fallback', () => {
    const mail = waitlistInviteEmail({ link, ttlDays: 5 });
    expect(mail.subject).toBe("You're in — welcome to Gobbit");
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('expires in 5 days');
    expect(mail.text).toContain('sign-in screen');
    expect(mail.text.trimEnd().endsWith('Gobbit')).toBe(true);
  });

  it('escapes the link in html', () => {
    const mail = waitlistInviteEmail({ link, ttlDays: 7 });
    expect(mail.html).toContain('token=abc&amp;x=&lt;y&gt;');
    expect(mail.html).not.toContain('<y>');
  });
});

describe('waitlistConfirmEmail (D218)', () => {
  const link = 'https://api.example.test/waitlist/confirm?token=abc&x=<y>';

  it('words the landing mail as keeping a place on the waitlist', () => {
    const mail = waitlistConfirmEmail({ link, ttlDays: 7, source: 'landing' });
    expect(mail.subject).toBe('Confirm your place on the Gobbit waitlist');
    expect(mail.text).toContain('keep your place on the waitlist');
  });

  it("words the sign-in mail as 'not on Gobbit yet'", () => {
    const mail = waitlistConfirmEmail({ link, ttlDays: 7, source: 'sign_in' });
    expect(mail.subject).toBe('Join the Gobbit waitlist');
    expect(mail.text).toContain("you're not on Gobbit yet");
  });

  it('carries the link and the TTL, escaped in HTML', () => {
    const mail = waitlistConfirmEmail({ link, ttlDays: 7, source: 'landing' });
    expect(mail.text).toContain(link);
    expect(mail.text).toContain('7 days');
    expect(mail.html).toContain('7 days');
    expect(mail.html).toContain('&lt;y&gt;');
    expect(mail.html).not.toContain('<y>');
  });
});

describe('waitlistExistingUserEmail (D218)', () => {
  it('links the sign-in page', () => {
    const mail = waitlistExistingUserEmail({ signInUrl: 'https://app.example.test/sign-in' });
    expect(mail.text).toContain('https://app.example.test/sign-in');
    expect(mail.html).toContain('href="https://app.example.test/sign-in"');
    expect(mail.text).toContain('already have a Gobbit account');
  });
});

describe('escapeHtml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("'")).toBe('&#39;');
  });
});

describe('signInEmail', () => {
  it('includes link verbatim in text', () => {
    const link = 'https://example.com/signin?token=abc123';
    const result = signInEmail({ link, email: 'a@example.test', ttlMinutes: 15 });
    expect(result.text).toContain(link);
  });

  it('includes escaped link in html', () => {
    const link = 'https://example.com/?q=<test>';
    const result = signInEmail({ link, email: 'a@example.test', ttlMinutes: 15 });
    expect(result.html).toContain('&lt;test&gt;');
    expect(result.html).not.toContain('<test>');
  });

  it('includes ttl minutes in text and html', () => {
    const result = signInEmail({
      link: 'https://example.com',
      email: 'a@example.test',
      ttlMinutes: 15,
    });
    expect(result.text).toContain('15');
    expect(result.html).toContain('15');
  });
});

describe('signInEmail content', () => {
  it('names the requesting address, escaped in html', () => {
    const result = signInEmail({
      link: 'https://x.test',
      email: '<b>@example.test',
      ttlMinutes: 15,
    });
    expect(result.text).toContain('<b>@example.test');
    expect(result.html).toContain('&lt;b&gt;@example.test');
    expect(result.html).not.toContain('<b>@');
  });

  it('says the link works once', () => {
    const result = signInEmail({ link: 'https://x.test', email: 'a@example.test', ttlMinutes: 15 });
    expect(result.text).toMatch(/works once/);
  });
});

describe('inviteEmail', () => {
  it('includes link verbatim in text', () => {
    const link = 'https://example.com/invite?token=xyz';
    const result = inviteEmail({
      link,
      deckName: 'My Deck',
      inviterName: 'Alice',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.text).toContain(link);
  });

  it('includes escaped link in html', () => {
    const link = 'https://example.com/?q=<test>';
    const result = inviteEmail({
      link,
      deckName: 'My Deck',
      inviterName: 'Alice',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.html).toContain('&lt;test&gt;');
    expect(result.html).not.toContain('<test>');
  });

  it('includes ttl days in text and html', () => {
    const result = inviteEmail({
      link: 'https://example.com',
      deckName: 'My Deck',
      inviterName: 'Alice',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.text).toContain('7');
    expect(result.html).toContain('7');
  });

  it('names the role in text and html', () => {
    const result = inviteEmail({
      link: 'https://example.com',
      deckName: 'My Deck',
      inviterName: 'Alice',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.text).toContain('editor');
    expect(result.html).toContain('editor');
  });

  it('escapes script tag in deckName for html but not text', () => {
    const result = inviteEmail({
      link: 'https://example.com',
      deckName: '<script>alert(1)</script>',
      inviterName: 'Alice',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.text).toContain('<script>alert(1)</script>');
  });

  it('escapes script tag in inviterName for html but not text', () => {
    const result = inviteEmail({
      link: 'https://example.com',
      deckName: 'My Deck',
      inviterName: '<script>alert(1)</script>',
      role: 'editor',
      ttlDays: 7,
    });
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
    expect(result.text).toContain('<script>alert(1)</script>');
  });
});
