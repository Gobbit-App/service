import { TIMEOUTS } from './stack-config';

export interface MailAddress {
  Address: string;
}
export interface MailSummary {
  ID: string;
  To: MailAddress[];
  Created?: string;
}
export interface MailMessage {
  ID: string;
  To: MailAddress[];
  Text: string;
  HTML: string;
}

/** Messages addressed to `address` (case-insensitive), newest first (FR-010). */
export function forRecipient<T extends { To: MailAddress[]; Created?: string }>(
  messages: T[],
  address: string,
): T[] {
  const want = address.trim().toLowerCase();
  return messages
    .filter((m) => m.To?.some((t) => t.Address.toLowerCase() === want))
    .sort((a, b) => (Date.parse(b.Created ?? '') || 0) - (Date.parse(a.Created ?? '') || 0));
}

/** First `/auth/callback?token=…` URL in a message body, or null. */
export function extractCallbackLink(text: string): string | null {
  const m = /https?:\/\/[^\s<>"')\]]+\/auth\/callback\?[^\s<>"')\]]*token=[^\s<>"')\]]+/.exec(text);
  return m ? m[0].replace(/&amp;/g, '&') : null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mailbox ${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Newest message to `address`, or null if none has arrived. */
export async function latestMessage(baseUrl: string, address: string): Promise<MailMessage | null> {
  const found = await getJson<{ messages?: MailSummary[] }>(
    `${baseUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
  );
  const newest = forRecipient(found.messages ?? [], address)[0];
  return newest ? getJson<MailMessage>(`${baseUrl}/api/v1/message/${newest.ID}`) : null;
}

/**
 * Polls until a message for `address` carrying a callback link arrives; returns the link.
 * `skip` ignores links already seen (a second mail to the same address).
 */
export async function waitForCallbackLink(
  baseUrl: string,
  address: string,
  opts: { timeoutMs?: number; skip?: string[] } = {},
): Promise<string> {
  const deadline = Date.now() + (opts.timeoutMs ?? TIMEOUTS.mailSeconds * 1000);
  for (;;) {
    const msg = await latestMessage(baseUrl, address);
    const link = msg && (extractCallbackLink(msg.Text) ?? extractCallbackLink(msg.HTML));
    if (link && !opts.skip?.includes(link)) return link;
    if (Date.now() > deadline) throw new Error(`no sign-in mail for ${address} in time`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
