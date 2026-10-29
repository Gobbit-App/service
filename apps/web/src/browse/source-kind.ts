import type { Item } from '@gobbit/shared';

type SourceKind = Item['sourceKind'];

/** Data-model §5: how a card got into the deck, in the Source pane's words. */
const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  manual: 'Added by hand',
  link: 'Saved from a link',
  share: 'Shared from another app',
  email: 'Sent by email',
  telegram: 'Sent from Telegram',
  import: 'Imported',
  mcp: 'Added by an assistant',
};

export function sourceKindLabel(kind: SourceKind): string {
  return SOURCE_KIND_LABELS[kind];
}

const TYPE_LABELS: Record<Item['type'], string> = {
  text: 'Text',
  link: 'Link',
  image: 'Image',
  table: 'Table',
  calc: 'Calculator',
};

export function itemTypeLabel(type: Item['type']): string {
  return TYPE_LABELS[type];
}
