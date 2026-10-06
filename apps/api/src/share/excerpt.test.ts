import { describe, it, expect } from 'vitest';
import {
  stripMarkdown,
  truncateText,
  excerpt,
  OG_DESCRIPTION_MAX,
  OG_IMAGE_EXCERPT_MAX,
} from './excerpt';

describe('excerpt', () => {
  describe('stripMarkdown', () => {
    it('should strip headings', () => {
      expect(stripMarkdown('# Heading')).toBe('Heading');
      expect(stripMarkdown('## Sub Heading')).toBe('Sub Heading');
      expect(stripMarkdown('### Deep')).toBe('Deep');
    });

    it('should strip lists', () => {
      expect(stripMarkdown('- Item')).toBe('Item');
      expect(stripMarkdown('* Item')).toBe('Item');
      expect(stripMarkdown('+ Item')).toBe('Item');
      expect(stripMarkdown('1. Numbered')).toBe('Numbered');
    });

    it('should strip bold', () => {
      expect(stripMarkdown('**bold**')).toBe('bold');
      expect(stripMarkdown('__bold__')).toBe('bold');
    });

    it('should strip links and keep text', () => {
      expect(stripMarkdown('[text](url)')).toBe('text');
      expect(stripMarkdown('[click](https://example.com)')).toBe('click');
    });

    it('should keep snake_case_name intact', () => {
      expect(stripMarkdown('snake_case_name')).toBe('snake_case_name');
      expect(stripMarkdown('Use snake_case_name here')).toBe('Use snake_case_name here');
    });

    it('should strip images and keep alt', () => {
      expect(stripMarkdown('![alt](url)')).toBe('alt');
      expect(stripMarkdown('![alt text](image.jpg)')).toBe('alt text');
    });

    it('should collapse multi-line whitespace', () => {
      expect(stripMarkdown('line1\nline2\nline3')).toBe('line1 line2 line3');
      expect(stripMarkdown('word1  word2')).toBe('word1 word2');
      expect(stripMarkdown('text\n\n\nmore')).toBe('text more');
    });

    it('should strip code fences and keep inner text', () => {
      expect(stripMarkdown('```\ncode\n```')).toBe('code');
      expect(stripMarkdown('```python\ncode\n```')).toBe('code');
    });

    it('should strip inline code', () => {
      expect(stripMarkdown('use `code` here')).toBe('use code here');
    });

    it('should strip strikethrough', () => {
      expect(stripMarkdown('~~strikethrough~~')).toBe('strikethrough');
    });

    it('should strip autolinks', () => {
      expect(stripMarkdown('<https://example.com>')).toBe('https://example.com');
    });

    it('should strip HTML tags', () => {
      expect(stripMarkdown('<b>bold</b>')).toBe('bold');
    });

    it('should remove table pipes', () => {
      expect(stripMarkdown('col1|col2')).toBe('col1 col2');
    });

    it('should remove table separator rows', () => {
      expect(stripMarkdown('|---|---|')).toBe('');
    });

    it('should strip blockquotes', () => {
      expect(stripMarkdown('> Quote')).toBe('Quote');
    });

    it('should remove horizontal rules', () => {
      expect(stripMarkdown('---')).toBe('');
      expect(stripMarkdown('***')).toBe('');
    });
  });

  describe('truncateText', () => {
    it('should return unchanged if text is short enough', () => {
      expect(truncateText('short', 10)).toBe('short');
      expect(truncateText('exactly fits', 12)).toBe('exactly fits');
    });

    it('should truncate long text', () => {
      const result = truncateText('This is a very long text', 10);
      expect(Array.from(result).length).toBeLessThanOrEqual(10);
      expect(result).toContain('…');
    });

    it('should cut at word boundary', () => {
      const result = truncateText('Hello world this is long', 12);
      expect(result).toBe('Hello world…');
      expect(Array.from(result).length).toBeLessThanOrEqual(12);
    });

    it('should handle long Hebrew text within 160 code points', () => {
      const hebrewText = 'שלום עולם '.repeat(60);
      const result = truncateText(hebrewText, 160);
      expect(Array.from(result).length).toBeLessThanOrEqual(160);
      expect(result).toContain('…');
    });

    it('should count emoji as one code point', () => {
      const text = '😀😁😂😃😄 word word word word word';
      const result = truncateText(text, 10);
      expect(Array.from(result).length).toBeLessThanOrEqual(10);
      expect(result).toContain('…');
      // Verify no lone surrogates in output
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  describe('excerpt', () => {
    it('should combine stripMarkdown and truncateText', () => {
      const md = '# Heading\n\n**Bold** text with [link](url)';
      const result = excerpt(md, 50);
      expect(result).not.toContain('#');
      expect(result).not.toContain('**');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });
  });

  describe('constants', () => {
    it('should export OG_DESCRIPTION_MAX as 160', () => {
      expect(OG_DESCRIPTION_MAX).toBe(160);
    });

    it('should export OG_IMAGE_EXCERPT_MAX as 140', () => {
      expect(OG_IMAGE_EXCERPT_MAX).toBe(140);
    });
  });
});
