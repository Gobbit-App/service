export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/** HTML-escapes & < > " ' */
export function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return s.replace(/[&<>"']/g, (char) => map[char] || char);
}

/** Renders the sign-in email: who asked, how long the link lives, and that it works once. */
export function signInEmail(p: { link: string; email: string; ttlMinutes: number }): RenderedMail {
  const intro = `Someone (hopefully you) asked to sign in to Gobbit as ${p.email}.`;
  const rules = `The link works once and expires in ${p.ttlMinutes} minutes. If you didn't request this, you can ignore it.`;
  return {
    subject: 'Your Gobbit sign-in link',
    text: `${intro}\n\n${p.link}\n\n${rules}`,
    html: `<p>${escapeHtml(intro)}</p>\n<p><a href="${escapeHtml(p.link)}">${escapeHtml(p.link)}</a></p>\n<p>${escapeHtml(rules)}</p>`,
  };
}

/** Renders invite email template */
export function inviteEmail(p: {
  link: string;
  deckName: string;
  inviterName: string;
  role: string;
  ttlDays: number;
}): RenderedMail {
  return {
    subject: `${p.inviterName} invited you to ${p.deckName} on Gobbit`,
    text: `${p.inviterName} invited you to the deck "${p.deckName}" on Gobbit with the role "${p.role}". Click the link below to accept. This link expires in ${p.ttlDays} days.\n\n${p.link}`,
    html: `<p><strong>${escapeHtml(p.inviterName)}</strong> invited you to the deck <strong>${escapeHtml(p.deckName)}</strong> on Gobbit with the role <strong>${escapeHtml(p.role)}</strong>.</p>\n<p><a href="${escapeHtml(p.link)}">Accept invitation</a></p>\n<p>This link expires in ${p.ttlDays} days.</p>`,
  };
}

/**
 * D218: the double opt-in mail. Its wording depends on where the address came from: the landing
 * form, or the sign-in gate (029) for someone who isn't on Gobbit yet.
 */
export function waitlistConfirmEmail(p: {
  link: string;
  ttlDays: number;
  source: 'landing' | 'sign_in';
}): RenderedMail {
  const intro =
    p.source === 'sign_in'
      ? "You tried to sign in to Gobbit, but you're not on Gobbit yet. Confirm your address to join the waitlist, and we'll email you when there's a place for you."
      : "Thanks for your interest in Gobbit. Confirm your address to keep your place on the waitlist; we'll email you when there's a place for you.";
  const rules = `The link expires in ${p.ttlDays} days. If you didn't ask for this, ignore this email and we'll forget your address.`;
  return {
    subject:
      p.source === 'sign_in'
        ? 'Join the Gobbit waitlist'
        : 'Confirm your place on the Gobbit waitlist',
    text: `${intro}\n\n${p.link}\n\n${rules}`,
    html: `<p>${escapeHtml(intro)}</p>\n<p><a href="${escapeHtml(p.link)}">Confirm my address</a></p>\n<p>${escapeHtml(rules)}</p>`,
  };
}

/** D218: sent instead of a confirmation when the address already belongs to a user. */
export function waitlistExistingUserEmail(p: { signInUrl: string }): RenderedMail {
  const intro =
    'Someone (hopefully you) asked to join the Gobbit waitlist with this address, but you already have a Gobbit account.';
  const action = 'Sign in instead:';
  return {
    subject: 'You already have a Gobbit account',
    text: `${intro}\n\n${action} ${p.signInUrl}`,
    html: `<p>${escapeHtml(intro)}</p>\n<p>${escapeHtml(action)} <a href="${escapeHtml(p.signInUrl)}">${escapeHtml(p.signInUrl)}</a></p>`,
  };
}

/** 032: an admin invited a confirmed waitlist entry; the link signs them in (and makes their deck). */
export function waitlistInviteEmail(p: { link: string; ttlDays: number }): RenderedMail {
  const intro = "You're in: there's a place for you on Gobbit now.";
  const action = 'Open Gobbit to sign in and start your first deck:';
  const rules = `The link works once and expires in ${p.ttlDays} days. After that, sign in from the Gobbit sign-in screen with this address any time.`;
  return {
    subject: "You're in — welcome to Gobbit",
    text: `${intro}\n\n${action}\n${p.link}\n\n${rules}\n\nGobbit`,
    html: `<p>${escapeHtml(intro)}</p>\n<p>${escapeHtml(action)}</p>\n<p><a href="${escapeHtml(p.link)}">Open Gobbit</a></p>\n<p>${escapeHtml(rules)}</p>\n<p>Gobbit</p>`,
  };
}
