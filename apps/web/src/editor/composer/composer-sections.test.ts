import { describe, expect, it } from 'vitest';
import { sectionPlacement, SECTION_TITLES } from './composer-sections';

describe('composer sections (D306)', () => {
  it('leads with the media for link and media cards', () => {
    expect(sectionPlacement('link')).toBe('leading');
    expect(sectionPlacement('media')).toBe('leading');
  });

  it('puts the other types after the body and gives Text no section', () => {
    expect(sectionPlacement('table')).toBe('trailing');
    expect(sectionPlacement('calc')).toBe('trailing');
    expect(sectionPlacement('reminder')).toBe('trailing');
    expect(sectionPlacement('text')).toBeNull();
  });

  it('titles the sections as the contract names them', () => {
    expect(SECTION_TITLES).toEqual({
      text: null,
      link: 'Link',
      media: 'Photo',
      table: 'Table',
      calc: 'Calculator',
      reminder: 'Reminder',
      event: 'Event',
    });
  });
});
