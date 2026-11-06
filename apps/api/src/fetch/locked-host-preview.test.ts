import { describe, expect, it } from 'vitest';
import { lockedHostOf } from '@gobbit/shared/links';
import {
  isGenericLockedPreview,
  isGenericLockedTitle,
  lockedPreviewVerdict,
} from './locked-host-preview';

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

describe('lockedPreviewVerdict (D347)', () => {
  it.each([
    [undefined, 'generic'],
    ['Instagram', 'generic'],
    ['instagram.com', 'generic'],
    ['Log in • Instagram', 'login_wall'],
    ['Instagram - Sign up', 'login_wall'],
    ['Page not found • Instagram', 'unavailable'],
    ["Sorry, this page isn't available. | Instagram", 'unavailable'],
    ['Instagram — Post isn’t available', 'unavailable'],
    ['Dan the Plumber on Instagram: "Fixed it"', 'real'],
  ] as const)('%j is %s', (title, verdict) => {
    expect(lockedPreviewVerdict(title, instagram)).toBe(verdict);
  });

  it('applies the same rules to Facebook', () => {
    expect(lockedPreviewVerdict('Facebook - log in or sign up', facebook)).toBe('login_wall');
    expect(lockedPreviewVerdict('Content unavailable | Facebook', facebook)).toBe('unavailable');
    expect(lockedPreviewVerdict('Grandma’s soup recipe | Facebook', facebook)).toBe('real');
  });
});

describe('isGenericLockedPreview (D347, revises D168)', () => {
  it('is generic when missing or only naming the site', () => {
    expect(isGenericLockedPreview(null, instagram)).toBe(true);
    expect(isGenericLockedPreview({ title: 'Instagram' }, instagram)).toBe(true);
  });

  it('discards a generic title whole, its description and image included', () => {
    expect(isGenericLockedPreview({ title: 'Instagram', description: 'Fixed it' }, instagram)).toBe(
      true,
    );
    expect(
      isGenericLockedPreview(
        { title: 'Log in • Instagram', image: 'https://x.test/logo.png' },
        instagram,
      ),
    ).toBe(true);
  });

  it('keeps a preview with a real title', () => {
    expect(isGenericLockedPreview({ title: 'Dan the Plumber' }, instagram)).toBe(false);
  });
});
