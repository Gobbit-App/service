import { describe, expect, it } from 'vitest';
import { changesLabel } from './event-copy';

describe('event-copy field labels', () => {
  it('labels the cover field as "image" (D390)', () => {
    expect(changesLabel(['cover'])).toBe('image');
  });

  it('renders an activity line listing cover as "image"', () => {
    expect(changesLabel(['title', 'cover'])).toBe('title, image');
  });
});
