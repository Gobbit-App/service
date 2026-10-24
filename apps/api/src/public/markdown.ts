import { micromark } from 'micromark';
import { raw, type Html } from './html';

/**
 * D177: card bodies as CommonMark. Raw HTML is escaped and `javascript:`/`data:` link targets
 * are dropped (micromark's safe defaults, stated explicitly so a refactor can't flip them).
 * The result is the only input public pages pass to `raw()`.
 */
export function renderMarkdown(body: string): Html {
  return raw(micromark(body, { allowDangerousHtml: false, allowDangerousProtocol: false }));
}
