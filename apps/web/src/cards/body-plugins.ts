import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import { remarkNormalizeStyles, remarkStylesToHast } from '@gobbit/shared/rich-text';

/** D283/D284: the body grammar shared with the public pages (contracts/body-markdown.md). */
export const BODY_REMARK_PLUGINS = [
  remarkBreaks,
  remarkDirective,
  remarkNormalizeStyles,
  remarkStylesToHast,
];
