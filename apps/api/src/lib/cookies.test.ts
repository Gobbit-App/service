import { describe, it, expect } from 'vitest';
import { sessionCookie, clearSessionCookie } from './cookies';

describe('cookies', () => {
  describe('sessionCookie', () => {
    it('creates secure cookie without domain', () => {
      const header = sessionCookie('test-token', {
        secure: true,
        maxAgeSeconds: 7776000,
      });

      const parts = header.split('; ');
      expect(parts[0]).toBe('gobbit_session=test-token');
      expect(parts).toContain('HttpOnly');
      expect(parts).toContain('SameSite=Lax');
      expect(parts).toContain('Path=/');
      expect(parts).toContain('Secure');
      expect(parts).toContain('Max-Age=7776000');
      expect(parts.some((p) => p.startsWith('Domain='))).toBe(false);
    });

    it('excludes Secure when secure=false', () => {
      const header = sessionCookie('test-token', {
        secure: false,
        maxAgeSeconds: 7776000,
      });

      const parts = header.split('; ');
      expect(parts).not.toContain('Secure');
      expect(parts).toContain('HttpOnly');
      expect(parts).toContain('SameSite=Lax');
      expect(parts).toContain('Max-Age=7776000');
    });

    it('includes Domain when provided', () => {
      const header = sessionCookie('test-token', {
        secure: true,
        domain: 'example.test',
        maxAgeSeconds: 7776000,
      });

      const parts = header.split('; ');
      expect(parts).toContain('Domain=example.test');
    });

    it('excludes Domain when empty string', () => {
      const header = sessionCookie('test-token', {
        secure: true,
        domain: '',
        maxAgeSeconds: 7776000,
      });

      const parts = header.split('; ');
      expect(parts.some((p) => p.startsWith('Domain='))).toBe(false);
    });

    it('floors maxAgeSeconds', () => {
      const header = sessionCookie('test-token', {
        secure: true,
        maxAgeSeconds: 7776000.9,
      });

      expect(header).toContain('Max-Age=7776000');
    });
  });

  describe('clearSessionCookie', () => {
    it('clears secure cookie without domain', () => {
      const header = clearSessionCookie({
        secure: true,
      });

      const parts = header.split('; ');
      expect(parts[0]).toBe('gobbit_session=');
      expect(parts).toContain('Max-Age=0');
      expect(parts).toContain('HttpOnly');
      expect(parts).toContain('SameSite=Lax');
      expect(parts).toContain('Path=/');
      expect(parts).toContain('Secure');
      expect(parts.some((p) => p.startsWith('Domain='))).toBe(false);
    });

    it('clears cookie without Secure when secure=false', () => {
      const header = clearSessionCookie({
        secure: false,
      });

      const parts = header.split('; ');
      expect(parts).toContain('Max-Age=0');
      expect(parts[0]).toBe('gobbit_session=');
      expect(parts).not.toContain('Secure');
    });

    it('includes Domain when clearing with domain', () => {
      const header = clearSessionCookie({
        secure: true,
        domain: 'example.test',
      });

      const parts = header.split('; ');
      expect(parts).toContain('Domain=example.test');
      expect(parts).toContain('Max-Age=0');
    });
  });
});
