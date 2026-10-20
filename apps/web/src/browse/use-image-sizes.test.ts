import { describe, expect, it } from 'vitest';
import { imageSizesFor } from './use-image-sizes';

describe('imageSizesFor', () => {
  it('is the viewport minus the column padding on phones', () => {
    expect(imageSizesFor(360)).toBe('328px');
    expect(imageSizesFor(412)).toBe('380px');
  });

  it('stops at the column width on wide screens', () => {
    expect(imageSizesFor(1440)).toBe('608px');
  });

  it('never goes below 1px', () => {
    expect(imageSizesFor(10)).toBe('1px');
  });
});
