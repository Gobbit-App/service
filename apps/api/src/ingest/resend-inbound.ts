import { INGEST_IMAGE_MAX_BYTES } from '@pb/shared';
import type { IngestFile } from '../services/ingest.service';
import type { InboundEmail } from './email-mapping';

const RESEND_API = 'https://api.resend.com';

/** Reads received emails and their attachments from Resend (D104). */
export interface ResendInbound {
  getEmail(emailId: string): Promise<InboundEmail>;
  /** Downloads the listed attachments; ones over the image size cap are skipped. */
  downloadAttachments(emailId: string, attachmentIds: readonly string[]): Promise<IngestFile[]>;
}

interface ReceivedEmailResponse {
  to?: string[] | null;
  received_for?: string[] | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: { id: string; filename?: string | null; content_type: string; size?: number }[];
}

interface ListedAttachment {
  id: string;
  content_type: string;
  size: number;
  download_url: string;
}

interface AttachmentListResponse {
  data: ListedAttachment[];
}

/** Thrown for any non-2xx answer from Resend or the attachment download. */
export class ResendInboundError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ResendInboundError';
  }
}

export function createResendInbound(deps: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}): ResendInbound {
  const { apiKey, fetch = globalThis.fetch } = deps;

  async function api<T>(path: string): Promise<T> {
    const res = await fetch(`${RESEND_API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new ResendInboundError(`Resend GET ${path} failed with ${res.status}`, res.status);
    }
    return (await res.json()) as T;
  }

  return {
    async getEmail(emailId) {
      const email = await api<ReceivedEmailResponse>(
        `/emails/receiving/${encodeURIComponent(emailId)}`,
      );
      return {
        // `received_for` is the envelope recipient (covers Bcc); `to` is the header.
        to: [...(email.received_for ?? []), ...(email.to ?? [])],
        subject: email.subject ?? null,
        text: email.text ?? null,
        html: email.html ?? null,
        attachments: (email.attachments ?? []).map((a) => ({
          id: a.id,
          filename: a.filename ?? null,
          contentType: a.content_type,
          size: a.size ?? 0,
        })),
      };
    },

    async downloadAttachments(emailId, attachmentIds) {
      if (attachmentIds.length === 0) return [];
      const list = await api<AttachmentListResponse>(
        `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
      );
      const wanted = attachmentIds
        .map((id) => list.data.find((a) => a.id === id))
        .filter((a): a is ListedAttachment => a !== undefined && a.size <= INGEST_IMAGE_MAX_BYTES);

      return Promise.all(
        wanted.map(async (a) => {
          // Signed URL: never send the API key to it.
          const res = await fetch(a.download_url);
          if (!res.ok) {
            throw new ResendInboundError(
              `Attachment download failed with ${res.status}`,
              res.status,
            );
          }
          return {
            bytes: new Uint8Array(await res.arrayBuffer()),
            mime: (a.content_type.split(';')[0] ?? '').trim().toLowerCase(),
          };
        }),
      );
    },
  };
}
