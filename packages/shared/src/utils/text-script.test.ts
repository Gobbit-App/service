import { describe, it, expect } from 'vitest';
import { dominantScript, textDirection, ogLocale, htmlLang } from './text-script';

describe('text-script', () => {
  describe('dominantScript', () => {
    it('detects Hebrew text', () => {
      expect(dominantScript('שלום עולם')).toBe('hebrew');
    });

    it('detects Greek text', () => {
      expect(dominantScript('Καλημέρα')).toBe('greek');
    });

    it('detects Latin text', () => {
      expect(dominantScript('Hello')).toBe('latin');
    });

    it('returns latin for empty string', () => {
      expect(dominantScript('')).toBe('latin');
    });

    it('returns latin for numbers and symbols', () => {
      expect(dominantScript('123 !!')).toBe('latin');
    });

    it('returns hebrew for mixed Hebrew and Latin', () => {
      expect(dominantScript('Rimon רימון בית ספר')).toBe('hebrew');
    });

    it('returns greek for mixed Greek and Latin', () => {
      expect(dominantScript('Παπα ok')).toBe('greek');
    });
  });

  describe('textDirection', () => {
    it('returns rtl for Hebrew', () => {
      expect(textDirection('שלום עולם')).toBe('rtl');
    });

    it('returns ltr for Greek', () => {
      expect(textDirection('Καλημέρα')).toBe('ltr');
    });

    it('returns ltr for Latin', () => {
      expect(textDirection('Hello')).toBe('ltr');
    });
  });

  describe('ogLocale', () => {
    it('returns he_IL for Hebrew', () => {
      expect(ogLocale('שלום עולם')).toBe('he_IL');
    });

    it('returns el_GR for Greek', () => {
      expect(ogLocale('Καλημέρα')).toBe('el_GR');
    });

    it('returns en_US for Latin', () => {
      expect(ogLocale('Hello')).toBe('en_US');
    });
  });

  describe('htmlLang', () => {
    it('returns he for Hebrew', () => {
      expect(htmlLang('שלום עולם')).toBe('he');
    });

    it('returns el for Greek', () => {
      expect(htmlLang('Καλημέρα')).toBe('el');
    });

    it('returns en for Latin', () => {
      expect(htmlLang('Hello')).toBe('en');
    });
  });
});
