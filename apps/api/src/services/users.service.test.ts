import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistrationMode } from '@gobbit/shared/auth';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import { createLogHash } from '../lib/log-hash';
import type { AuthDecisions } from './auth.events';
import {
  createUsersService,
  displayNameFromEmail,
  normalizeEmail,
  RegistrationClosed,
} from './users.service';

const user = { id: 'u1', accountId: 'a1', email: 'jane@example.com', displayName: 'jane' };

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Jane@Example.COM \n')).toBe('jane@example.com');
  });
});

describe('displayNameFromEmail', () => {
  it('uses the local part', () => {
    expect(displayNameFromEmail('jane@example.com')).toBe('jane');
  });

  it('falls back to the full address when the local part is empty', () => {
    expect(displayNameFromEmail('@example.com')).toBe('@example.com');
  });
});

describe('createUsersService', () => {
  let repo: any;
  let decksRepo: any;
  let service: ReturnType<typeof createUsersService>;
  let capture: ReturnType<typeof captureLogger>;

  const build = (mode: RegistrationMode) =>
    createUsersService({
      users: repo,
      decks: decksRepo,
      mode,
      logHash: createLogHash('k'.repeat(32)),
      decisions: decisionLogger<AuthDecisions>('users', { parent: capture.logger }),
    });

  beforeEach(() => {
    repo = { findByEmail: vi.fn(), createWithAccount: vi.fn() };
    decksRepo = { ensureDefault: vi.fn() };
    capture = captureLogger();
    service = build('waitlist');
  });

  it('findByEmail normalizes its input', async () => {
    repo.findByEmail.mockResolvedValue(user);
    await service.findByEmail(' Jane@Example.com ');
    expect(repo.findByEmail).toHaveBeenCalledWith('jane@example.com');
  });

  describe('ensurePersonalDeck', () => {
    it('ensures the default deck for the user account with the default name', async () => {
      const deck = { id: 'd1', isDefault: true };
      decksRepo.ensureDefault.mockResolvedValue(deck);

      await expect(service.ensurePersonalDeck(user)).resolves.toBe(deck);
      expect(decksRepo.ensureDefault).toHaveBeenCalledWith({
        accountId: 'a1',
        name: 'My deck',
      });
    });

    it('propagates repository failures so the sign-in can roll back', async () => {
      decksRepo.ensureDefault.mockRejectedValue(new Error('could not be ensured'));

      await expect(service.ensurePersonalDeck(user)).rejects.toThrow('could not be ensured');
    });
  });

  it('findExisting normalizes and never creates', async () => {
    repo.findByEmail.mockResolvedValue(null);
    await expect(service.findExisting(' Jane@Example.com ')).resolves.toBeNull();
    expect(repo.findByEmail).toHaveBeenCalledWith('jane@example.com');
    expect(repo.createWithAccount).not.toHaveBeenCalled();
  });

  describe('register (D222, D241)', () => {
    const ctx = { requestId: 'req-1' };

    it('returns an existing user without creating and records existing', async () => {
      repo.findByEmail.mockResolvedValue(user);
      await expect(service.register('JANE@example.com', 'open_sign_in', ctx)).resolves.toEqual({
        user,
        created: false,
      });
      expect(repo.createWithAccount).not.toHaveBeenCalled();
      await capture.flush();
      expect(
        expectDecision(capture.lines, 'users.register', { outcome: 'existing' }),
      ).toMatchObject({ userId: 'u1', via: 'open_sign_in', requestId: 'req-1' });
    });

    it.each([
      ['deck_invite', 'waitlist', 'inviter-1'],
      ['waitlist_invite', 'waitlist', 'admin-1'],
      ['deck_invite', 'open', 'inviter-1'],
      ['waitlist_invite', 'open', 'admin-1'],
      ['open_sign_in', 'open', undefined],
    ] as const)('creates for %s in %s mode', async (reason, mode, actorId) => {
      const svc = build(mode);
      repo.findByEmail.mockResolvedValue(null);
      repo.createWithAccount.mockResolvedValue(user);

      await expect(
        svc.register(' Jane@Example.com ', reason, { ...ctx, actorId }),
      ).resolves.toEqual({ user, created: true });
      expect(repo.createWithAccount).toHaveBeenCalledWith({
        email: 'jane@example.com',
        displayName: 'jane',
        via: reason,
        by: actorId ?? null,
      });
      await capture.flush();
      const line = expectDecision(capture.lines, 'users.register', { outcome: 'created' });
      expect(line).toMatchObject({ userId: 'u1', via: reason, emailHash: expect.any(String) });
      expect(line.actorId).toBe(actorId);
    });

    it('refuses open_sign_in in waitlist mode without creating', async () => {
      repo.findByEmail.mockResolvedValue(null);

      await expect(
        service.register('jane@example.com', 'open_sign_in', ctx),
      ).rejects.toBeInstanceOf(RegistrationClosed);
      expect(repo.createWithAccount).not.toHaveBeenCalled();
      await capture.flush();
      const line = expectDecision(capture.lines, 'users.register', {
        outcome: 'refused',
        reason: 'registration_closed',
      });
      expect(line).toMatchObject({ via: 'open_sign_in', requestId: 'req-1' });
      expect(JSON.stringify(capture.lines)).not.toContain('jane@example.com');
    });

    it('falls back to the winner on a unique violation race', async () => {
      repo.findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
      repo.createWithAccount.mockRejectedValue({ code: '23505' });

      await expect(service.register('jane@example.com', 'deck_invite', ctx)).resolves.toEqual({
        user,
        created: false,
      });
    });

    it('detects a unique violation on the error cause', async () => {
      repo.findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
      repo.createWithAccount.mockRejectedValue(new Error('x', { cause: { code: '23505' } }));

      const result = await service.register('jane@example.com', 'deck_invite', ctx);
      expect(result.created).toBe(false);
    });

    it('rethrows other errors', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.createWithAccount.mockRejectedValue(new Error('boom'));
      await expect(service.register('jane@example.com', 'deck_invite', ctx)).rejects.toThrow(
        'boom',
      );
    });
  });
});
