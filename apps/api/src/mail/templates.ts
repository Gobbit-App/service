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
