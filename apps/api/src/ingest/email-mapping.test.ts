import { describe, expect, it } from 'vitest';
import {
  firstUrl,
  mapInboundEmail,
  stripHtml,
  tokenLocalPart,
  trimQuotedReply,
  type InboundEmail,
} from './email-mapping';

describe('email-mapping', () => {
  describe('tokenLocalPart', () => {
    it('returns the local part as written from a named address on the domain', () => {
      expect(tokenLocalPart(['Someone <AbC_1@In.Gobbit.test>'], 'in.gobbit.test')).toBe('AbC_1');
    });

    it('ignores addresses on other domains', () => {
      expect(tokenLocalPart(['x@other.test', 'y@in.gobbit.test'], 'in.gobbit.test')).toBe('y');
    });

    it('returns null when no address matches the domain', () => {
      expect(tokenLocalPart(['x@other.test'], 'in.gobbit.test')).toBeNull();
    });
  });

  describe('trimQuotedReply', () => {
    it('cuts at an "On ... wrote:" attribution line', () => {
      expect(trimQuotedReply('Look at this\n\nOn Mon, Oct 5, 2026 Dana wrote:\n> old')).toBe(
        'Look at this',
      );
    });

    it('cuts at quoted lines starting with ">"', () => {
      expect(trimQuotedReply('Hello\n> quoted line')).toBe('Hello');
    });

    it('cuts at an Original Message separator', () => {
      expect(trimQuotedReply('Hi\n-----Original Message-----\nold text')).toBe('Hi');
    });

    it('drops a trailing signature after a "-- " line', () => {
      expect(trimQuotedReply('Thanks\n-- \nYoav')).toBe('Thanks');
    });

    it('keeps forwarded message content', () => {
      const out = trimQuotedReply('---------- Forwarded message ---------\nFrom: a\nbody');
      expect(out).toContain('body');
    });
  });

  describe('firstUrl', () => {
    it('returns the first http(s) URL with trailing punctuation stripped', () => {
      expect(firstUrl('see https://e.com/a). ok')).toBe('https://e.com/a');
    });

    it('returns null when there is no URL', () => {
      expect(firstUrl('no link here')).toBeNull();
    });
  });

  describe('stripHtml', () => {
    it('drops script blocks, strips tags and decodes entities', () => {
      expect(stripHtml('<p>a &amp; b</p><script>x()</script>')).toBe('a & b');
    });
  });

  describe('mapInboundEmail', () => {
    const base: InboundEmail = {
      to: ['someone@in.gobbit.test'],
      attachments: [],
    };

    it('strips repeated Fwd:/Re: prefixes from the subject into the title', () => {
      const mapped = mapInboundEmail({ ...base, subject: 'Fwd: Re: Plumber', text: 'Call them' });
      expect(mapped.title).toBe('Plumber');
    });

    it('extracts the first URL from the text body', () => {
      const mapped = mapInboundEmail({
        ...base,
        subject: 'Check',
        text: 'Their site https://plumber.example/x is great',
      });
      expect(mapped.url).toBe('https://plumber.example/x');
    });

    it('uses the html body when the text body is null', () => {
      const mapped = mapInboundEmail({
        ...base,
        subject: 'Html only',
        text: null,
        html: '<p>Hello <b>there</b></p>',
      });
      expect(mapped.text).toBe('Hello there');
    });

    it('selects the first three image attachments with params stripped and pdf excluded', () => {
      const mapped = mapInboundEmail({
        ...base,
        subject: 'Photos',
        text: 'Pics',
        attachments: [
          { id: 'a1', contentType: 'image/jpeg', size: 1 },
          { id: 'a2', contentType: 'application/pdf', size: 1 },
          { id: 'a3', contentType: 'image/png; charset=binary', size: 1 },
          { id: 'a4', contentType: 'image/webp', size: 1 },
          { id: 'a5', contentType: 'image/heic', size: 1 },
        ],
      });
      expect(mapped.attachmentIds).toEqual(['a1', 'a3', 'a4']);
    });

    it('omits title and text keys when subject and body are empty', () => {
      const mapped = mapInboundEmail({ ...base, subject: '', text: '', html: null });
      expect(mapped).not.toHaveProperty('title');
      expect(mapped).not.toHaveProperty('text');
      expect(mapped).toEqual({ attachmentIds: [] });
    });
  });
});
