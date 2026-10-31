import { describe, expect, it } from 'vitest';
import { makeDeck } from '../test/fixtures';
import { bindableDecks, ingestEmailAddress, lastUsedLabel, tokenScope } from './ingest-token-view';

describe('ingest-token-view', () => {
  describe('ingestEmailAddress', () => {
    it('strips the ing_ prefix and appends the domain', () => {
      expect(ingestEmailAddress('ing_abc', 'in.example.com')).toBe('abc@in.example.com');
    });

    it('returns null when the domain is null', () => {
      expect(ingestEmailAddress('ing_abc', null)).toBeNull();
    });

    it('returns null when the token lacks the ing_ prefix', () => {
      expect(ingestEmailAddress('abc', 'in.example.com')).toBeNull();
    });
  });

  describe('tokenScope', () => {
    it('describes a token with no bound deck as the personal deck', () => {
      expect(tokenScope({ deckId: null }, [])).toBe('My personal deck (default)');
    });

    it('returns the bound deck name when the deck is known', () => {
      const decks = [makeDeck({ id: 'd1', name: 'Family' })];
      expect(tokenScope({ deckId: 'd1' }, decks)).toBe('Family');
    });

    it('describes an unknown bound deck as one the user left', () => {
      const decks = [makeDeck({ id: 'd1', name: 'Family' })];
      expect(tokenScope({ deckId: 'missing' }, decks)).toBe('A deck you left');
    });
  });

  describe('lastUsedLabel', () => {
    it('returns Never used when there is no last-used timestamp', () => {
      expect(lastUsedLabel(null)).toBe('Never used');
    });

    it('formats the last-used date with the given locale', () => {
      const label = lastUsedLabel('2026-03-04T10:00:00.000Z', 'en-US');
      expect(label.startsWith('Last used ')).toBe(true);
      expect(label).toContain('2026');
    });
  });

  describe('bindableDecks', () => {
    it('keeps only decks whose role can create items, preserving order', () => {
      const decks = [
        makeDeck({ id: 'd1', role: 'owner' }),
        makeDeck({ id: 'd2', role: 'maintainer' }),
        makeDeck({ id: 'd3', role: 'editor' }),
        makeDeck({ id: 'd4', role: 'reader' }),
      ];
      expect(bindableDecks(decks).map((d) => d.id)).toEqual(['d1', 'd2', 'd3']);
    });
  });
});
