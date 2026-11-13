import type { StructuredEvent } from '@gobbit/shared';
import { EVENT_LOCATION_MAX } from '@gobbit/shared/event-constants';

/** Longest JSON-LD script read; bigger ones are skipped (page images and events alike). */
export const STRUCTURED_DATA_MAX_CHARS = 100_000;
/** Longest event name or URL kept from a page. */
const FIELD_MAX = 500;

export type JsonLdNode = Record<string, unknown>;

function flatten(data: unknown): JsonLdNode[] {
  if (Array.isArray(data)) return data.flatMap(flatten);
  if (!data || typeof data !== 'object') return [];
  const node = data as JsonLdNode;
  const graph = Array.isArray(node['@graph']) ? flatten(node['@graph']) : [];
  return [node, ...graph];
}

/**
 * Every schema.org node in the page's `application/ld+json` scripts: arrays and `@graph` are
 * flattened; scripts that are too big or don't parse are skipped.
 */
export function jsonLdNodes(doc: ParentNode): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = script.textContent ?? '';
    if (text.length > STRUCTURED_DATA_MAX_CHARS) continue;
    try {
      nodes.push(...flatten(JSON.parse(text)));
    } catch {
      continue;
    }
  }
  return nodes;
}

function isEventNode(node: JsonLdNode): boolean {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.some((t) => typeof t === 'string' && (t === 'Event' || t.endsWith('Event')));
}

function text(value: unknown, max = FIELD_MAX): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean === '' ? null : Array.from(clean).slice(0, max).join('');
}

function addressText(address: unknown): string[] {
  if (typeof address === 'string') return [address];
  if (!address || typeof address !== 'object') return [];
  const a = address as JsonLdNode;
  return [a.streetAddress, a.addressLocality].flatMap((v) => text(v) ?? []);
}

/** D370: the place name, then street and locality, clipped to the location limit. */
function locationText(location: unknown): string | null {
  const place = Array.isArray(location) ? location[0] : location;
  if (typeof place === 'string') return text(place, EVENT_LOCATION_MAX);
  if (!place || typeof place !== 'object') return null;
  const p = place as JsonLdNode;
  const parts = [text(p.name), ...addressText(p.address)].filter((v): v is string => v !== null);
  const unique = parts.filter((v, i) => parts.indexOf(v) === i);
  return unique.length > 0 ? text(unique.join(', '), EVENT_LOCATION_MAX) : null;
}

function toStructuredEvent(node: JsonLdNode): StructuredEvent | null {
  const startDate = text(node.startDate, 40);
  if (!startDate) return null;
  return {
    name: text(node.name),
    startDate,
    endDate: text(node.endDate, 40),
    location: locationText(node.location),
    url: text(node.url),
  };
}

export interface PageEvents {
  /** The page's one event; absent when it has none or several. */
  structuredEvent?: StructuredEvent;
  /** Distinct events found (same name and start counted once); absent when none. */
  structuredEventCount?: number;
}

/** D370: the schema.org Event(s) among the page's nodes, each distinct one counted once. */
export function structuredEvents(nodes: JsonLdNode[]): PageEvents {
  const byKey = new Map<string, StructuredEvent>();
  for (const node of nodes) {
    if (!isEventNode(node)) continue;
    const event = toStructuredEvent(node);
    if (event) byKey.set(`${event.name ?? ''}\u0000${event.startDate}`, event);
  }
  const events = [...byKey.values()];
  if (events.length === 0) return {};
  if (events.length === 1) return { structuredEvent: events[0], structuredEventCount: 1 };
  return { structuredEventCount: events.length };
}
