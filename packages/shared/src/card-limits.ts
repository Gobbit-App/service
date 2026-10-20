/**
 * Zod-free card limits for the web editor (R6). Value imports from the web go through the
 * `@pb/shared/card-limits` subpath so neither zod nor mathjs reaches the editor chunk.
 */
export {
  CARD_TITLE_MAX,
  CARD_BODY_MAX,
  PAYLOAD_MAX_BYTES,
  TABLE_MAX_ROWS,
  TABLE_MAX_COLUMNS,
  CALC_MAX_FIELDS,
  NAME_MAX,
} from './limits';
export { codePointLength, utf8Bytes } from './utils/utf8-bytes';
