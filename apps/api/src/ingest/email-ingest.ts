import { z } from 'zod';
import { INGEST_TOKEN_PREFIX, ingestRequestSchema } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import type { IngestService } from '../services/ingest.service';
import type { IngestTokensService } from '../services/ingest-tokens.service';
import { mapInboundEmail, tokenLocalPart } from './email-mapping';
import { isIngestToken } from './ingest-token';
import type { ResendInbound } from './resend-inbound';
import { lineSink } from '../lib/logger';

/** What happened to one webhook event; logged, never echoed to the sender (no token oracle). */
export type EmailIngestOutcome = 'ignored' | 'unknown-token' | 'rejected' | 'accepted';

/** The part of Resend's `email.received` event we use; the body is fetched separately. */
const receivedEventSchema = z.object({
  type: z.string(),
  data: z
    .object({
      email_id: z.string().min(1),
      to: z.array(z.string()).nullish(),
      received_for: z.array(z.string()).nullish(),
    })
    .passthrough(),
});

const urlSchema = ingestRequestSchema.shape.url;

/**
 * D104: turns a verified Resend inbound event into an ingest job. The recipient's local part
 * is the ingest token without `ing_`. Unknown tokens and rejected shares are dropped (200);
 * Resend/DB failures throw so the webhook answers 5xx and Resend retries.
 */
export function createEmailIngest(deps: {
  domain: string;
  inbound: ResendInbound;
  tokens: Pick<IngestTokensService, 'authenticate'>;
  ingest: Pick<IngestService, 'submit'>;
  log?: (line: string) => void;
}) {
  const { domain, inbound, tokens, ingest, log = lineSink('email-in', 'info') } = deps;

  return {
    async handle(event: unknown): Promise<EmailIngestOutcome> {
      const parsed = receivedEventSchema.safeParse(event);
      if (!parsed.success || parsed.data.type !== 'email.received') {
        return 'ignored';
      }
      const { email_id: emailId, to, received_for: receivedFor } = parsed.data.data;
      const done = (outcome: EmailIngestOutcome, detail?: string): EmailIngestOutcome => {
        log(`[email-in] ${emailId}: ${outcome}${detail ? ` (${detail})` : ''}`);
        return outcome;
      };

      const local = tokenLocalPart([...(receivedFor ?? []), ...(to ?? [])], domain);
      const token = local === null ? null : INGEST_TOKEN_PREFIX + local;
      const auth = token && isIngestToken(token) ? await tokens.authenticate(token) : null;
      if (!auth) {
        return done('unknown-token');
      }

      const email = await inbound.getEmail(emailId);
      const mapped = mapInboundEmail(email);
      const files = await inbound.downloadAttachments(emailId, mapped.attachmentIds);
      const url = mapped.url && urlSchema.safeParse(mapped.url).success ? mapped.url : undefined;

      try {
        const accepted = await ingest.submit(
          { user: auth.user, via: 'email', tokenDeckId: auth.deckId },
          { title: mapped.title, text: mapped.text, url, files },
        );
        return done('accepted', `job ${accepted.id}`);
      } catch (err) {
        // Validation, access, cap and disabled errors are the sender's problem, not a retry.
        if (err instanceof HttpError) {
          return done('rejected', `${err.status} ${err.detail ?? err.title}`);
        }
        throw err;
      }
    },
  };
}

export type EmailIngest = ReturnType<typeof createEmailIngest>;
