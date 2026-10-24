import { describe, expect, it } from 'vitest';
import { categoryVisibilities, memberRoles } from '../enums';
import { ROLE_LABELS, VISIBILITY_LABELS } from './labels';

describe('ROLE_LABELS / VISIBILITY_LABELS (D184, D185)', () => {
  it('labels every role; owner reads Co-owner', () => {
    for (const role of memberRoles) expect(ROLE_LABELS[role].label).toBeTruthy();
    expect(ROLE_LABELS.owner.label).toBe('Co-owner');
  });

  it('labels every visibility', () => {
    for (const v of categoryVisibilities) expect(VISIBILITY_LABELS[v].label).toBeTruthy();
    expect(VISIBILITY_LABELS.private.label).toBe('Admins only');
    expect(VISIBILITY_LABELS.shared.label).toBe('Members');
    expect(VISIBILITY_LABELS.public.label).toBe('Everyone');
  });
});
