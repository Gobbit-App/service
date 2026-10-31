import { describe, expect, it } from 'vitest';
import { lockedHostOf } from '@gobbit/shared/links';
import { isGenericLockedPreview, isGenericLockedTitle } from './locked-host-preview';

const instagram = lockedHostOf('https://www.instagram.com/p/abc/')!;
const facebook = lockedHostOf('https://www.facebook.com/x')!;

describe('isGenericLockedTitle (D167)', () => {
  it.each([undefined, '', 'Instagram', 'instagram.com', 'Log in • Instagram', 'Login | Instagram'])(
    'treats %j as generic',
    (title) => {
      expect(isGenericLockedTitle(title, instagram)).toBe(true);
    },
  );

  it.each(['Facebook - log in or sign up', 'Welcome to Facebook', 'facebook.com'])(
    'treats %j as generic for Facebook',
    (title) => {
      expect(isGenericLockedTitle(title, facebook)).toBe(true);
    },
  );

  it.each(['Dan the Plumber on Instagram: "Fixed it"', 'Dan the Plumber', 'שרברב דן • Instagram'])(
    'keeps %j',
    (title) => {
      expect(isGenericLockedTitle(title, instagram)).toBe(false);
    },
  );
});

describe('isGenericLockedPreview (D168)', () => {
  it('is generic when missing or only naming the site', () => {
    expect(isGenericLockedPreview(null, instagram)).toBe(true);
    expect(isGenericLockedPreview({ title: 'Instagram' }, instagram)).toBe(true);
  });

  it('is not generic with a description or an image', () => {
    expect(isGenericLockedPreview({ title: 'Instagram', description: 'Fixed it' }, instagram)).toBe(
      false,
    );
    expect(
      isGenericLockedPreview({ title: 'Instagram', image: 'https://x.test/og.jpg' }, instagram),
    ).toBe(false);
    expect(isGenericLockedPreview({ title: 'Dan the Plumber' }, instagram)).toBe(false);
  });
});
