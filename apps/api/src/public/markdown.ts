import { renderBodyHtml } from '../rich-text/render';
import { raw, type Html } from './html';

/**
 * D177/D285: card bodies through the shared rich-text grammar (breaks, style directives). Raw
 * HTML is dropped and unsafe link targets are removed by the sanitizer.
 * The result is the only input public pages pass to `raw()`.
 */
export function renderMarkdown(body: string): Html {
  return raw(renderBodyHtml(body));
}
