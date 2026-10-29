import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  ingestAcceptedSchema,
  ingestJobSchema,
  ingestRequestSchema,
  type IngestRequest,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import type { IngestCaller, IngestFile, IngestSubmission } from '../services/ingest.service';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';
import { HttpError, problemFromZodError, sessionInvalid } from '../errors/http-errors';

const fileSchema = z
  .custom<File>((v) => v instanceof File, 'Expected a file')
  .openapi({ type: 'string', format: 'binary' });

/** Multipart text fields arrive as strings; they're re-validated with `ingestRequestSchema`. */
const ingestMultipartSchema = z
  .object({
    deckId: z.string().optional(),
    text: z.string().optional(),
    url: z.string().optional(),
    title: z.string().optional(),
    channel: z.string().optional(),
    files: z.union([fileSchema, z.array(fileSchema)]).optional(),
  })
  .openapi('IngestMultipart');
type IngestMultipart = z.infer<typeof ingestMultipartSchema>;

/** Shortcut/form posts send empty fields for "nothing"; treat them as absent. */
function dropEmpty(form: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(form).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );
}

async function toIngestFiles(files: File | File[] | undefined): Promise<IngestFile[]> {
  const list = files === undefined ? [] : Array.isArray(files) ? files : [files];
  return Promise.all(
    list.map(async (f) => ({ bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type })),
  );
}

function parseFields(fields: Record<string, unknown>): IngestRequest {
  const parsed = ingestRequestSchema.safeParse(fields);
  if (!parsed.success) {
    const p = problemFromZodError(parsed.error);
    throw new HttpError(p.status, p.type, p.title, undefined, p.errors);
  }
  return parsed.data;
}

/** D99: an `ing_` bearer (parked by sessionAuth) wins; otherwise the session user. */
async function resolveCaller(c: Context<AppEnv>, services: Services): Promise<IngestCaller> {
  const bearer = c.get('ingestBearer');
  if (bearer) {
    const auth = await services.ingestTokens.authenticate(bearer);
    if (!auth) throw sessionInvalid();
    return { user: auth.user, via: 'token', tokenDeckId: auth.deckId };
  }
  return { user: getUser(c), via: 'session' };
}

export function registerIngestRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const submitRoute = createRoute({
    method: 'post',
    path: '/ingest',
    tags: ['ingest'],
    security: AUTH_SECURITY,
    description:
      'Share something into a deck (D93). JSON, or multipart with up to 3 `files`. ' +
      'Also accepts an `ing_` ingest token as the bearer. The job runs in the background.',
    request: {
      body: {
        content: {
          'application/json': { schema: ingestRequestSchema },
          'multipart/form-data': { schema: ingestMultipartSchema },
        },
      },
    },
    responses: {
      202: {
        content: { 'application/json': { schema: ingestAcceptedSchema } },
        description: 'Accepted; poll GET /ingest/{id} or wait for the review queue',
      },
      ...problems(
        'bad-request',
        'unauthorized',
        'forbidden',
        'not-found',
        'rate-limited',
        'unavailable',
      ),
    },
  });

  app.openapi(submitRoute, async (c) => {
    const caller = await resolveCaller(c, services);
    const contentType = c.req.header('content-type') ?? '';
    let submission: IngestSubmission;
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
      // Both media types share one route, so the validated types are unioned; narrow per branch.
      const { files, ...fields } = c.req.valid('form') as IngestMultipart;
      submission = { ...parseFields(dropEmpty(fields)), files: await toIngestFiles(files) };
    } else {
      submission = { ...(c.req.valid('json') as IngestRequest), files: [] };
    }
    const accepted = await services.ingest.submit(caller, submission);
    return c.json(accepted, 202);
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/ingest/{id}',
    tags: ['ingest'],
    security: AUTH_SECURITY,
    description: 'D109: job debug view for the sharer or a deck publisher',
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      200: {
        content: { 'application/json': { schema: ingestJobSchema } },
        description: 'The ingest job',
      },
      ...problems('unauthorized', 'not-found'),
    },
  });

  app.openapi(getRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    return c.json(await services.ingest.get(user, id), 200);
  });
}
