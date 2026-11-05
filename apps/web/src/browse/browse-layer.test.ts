import { describe, expect, it } from 'vitest';
import { browseLayerFromState, withLayer, withoutLayer } from './browse-layer';

describe('browse layers (D332)', () => {
  it('reads the open layer leniently', () => {
    expect(browseLayerFromState({ browseLayer: 'categories' })).toBe('categories');
    expect(browseLayerFromState({ browseLayer: 'full', fromList: true })).toBe('full');
    expect(browseLayerFromState({ browseLayer: 'menu' })).toBeNull();
    expect(browseLayerFromState({})).toBeNull();
    expect(browseLayerFromState(null)).toBeNull();
    expect(browseLayerFromState('full')).toBeNull();
  });

  it('adds and removes a layer, keeping the rest of the state', () => {
    const prev = { fromList: true, listC: 'food' };
    expect(withLayer(prev, 'full')).toEqual({ ...prev, browseLayer: 'full' });
    expect(withLayer(undefined, 'categories')).toEqual({ browseLayer: 'categories' });
    expect(withoutLayer({ ...prev, browseLayer: 'full' })).toEqual(prev);
    expect(withoutLayer(undefined)).toEqual({});
  });
});
