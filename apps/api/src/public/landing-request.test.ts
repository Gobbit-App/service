import { describe, expect, it } from 'vitest';
import {
  landingStateFromQuery,
  landingVia,
  renderStateName,
  retryMinutes,
} from './landing-request';

describe('landingStateFromQuery', () => {
  it('maps the confirm redirect targets and ignores anything else', () => {
    expect(landingStateFromQuery({ confirmed: '1' })).toBe('confirmed');
    expect(landingStateFromQuery({ confirm: 'invalid' })).toBe('confirm-invalid');
    expect(landingStateFromQuery({ confirmed: 'yes' })).toBe('default');
    expect(landingStateFromQuery({ confirm: 'other' })).toBe('default');
    expect(landingStateFromQuery({})).toBe('default');
  });
});

describe('landingVia (D242)', () => {
  it('root from Caddy, app from the SPA redirect, else direct', () => {
    expect(landingVia('root', undefined)).toBe('root');
    expect(landingVia('root', 'app')).toBe('root');
    expect(landingVia(undefined, 'app')).toBe('app');
    expect(landingVia('other', undefined)).toBe('direct');
    expect(landingVia(undefined, 'elsewhere')).toBe('direct');
  });
});

describe('renderStateName', () => {
  it('uses snake_case event values', () => {
    expect(renderStateName('default')).toBe('default');
    expect(renderStateName('joined')).toBe('joined');
    expect(renderStateName('confirm-invalid')).toBe('confirm_invalid');
    expect(renderStateName('signed-in')).toBe('signed_in');
  });

  it('refuses the POST-only state', () => {
    expect(() => renderStateName('invalid')).toThrow();
  });
});

describe('retryMinutes', () => {
  it('rounds up to whole minutes, at least one', () => {
    expect(retryMinutes(0)).toBe(1);
    expect(retryMinutes(59)).toBe(1);
    expect(retryMinutes(61)).toBe(2);
    expect(retryMinutes(3600)).toBe(60);
  });
});
