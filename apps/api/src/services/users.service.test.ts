import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUsersService, displayNameFromEmail, normalizeEmail } from './users.service';

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
  let service: ReturnType<typeof createUsersService>;

  beforeEach(() => {
    repo = { findByEmail: vi.fn(), createWithAccount: vi.fn() };
    service = createUsersService({ users: repo });
  });

  it('findByEmail normalizes its input', async () => {
    repo.findByEmail.mockResolvedValue(user);
    await service.findByEmail(' Jane@Example.com ');
    expect(repo.findByEmail).toHaveBeenCalledWith('jane@example.com');
  });

  describe('findOrCreateByEmail', () => {
    it('returns an existing user without creating', async () => {
      repo.findByEmail.mockResolvedValue(user);
      await expect(service.findOrCreateByEmail('JANE@example.com')).resolves.toEqual({
        user,
        created: false,
      });
      expect(repo.createWithAccount).not.toHaveBeenCalled();
    });

    it('creates a missing user with the local part as display name', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.createWithAccount.mockResolvedValue(user);

      await expect(service.findOrCreateByEmail(' Jane@Example.com ')).resolves.toEqual({
        user,
        created: true,
      });
      expect(repo.createWithAccount).toHaveBeenCalledWith({
        email: 'jane@example.com',
        displayName: 'jane',
      });
    });

    it('falls back to the winner on a unique violation race', async () => {
      repo.findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
      repo.createWithAccount.mockRejectedValue({ code: '23505' });

      await expect(service.findOrCreateByEmail('jane@example.com')).resolves.toEqual({
        user,
        created: false,
      });
    });

    it('detects a unique violation on the error cause', async () => {
      repo.findByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(user);
      repo.createWithAccount.mockRejectedValue(new Error('x', { cause: { code: '23505' } }));

      const result = await service.findOrCreateByEmail('jane@example.com');
      expect(result.created).toBe(false);
    });

    it('rethrows other errors', async () => {
      repo.findByEmail.mockResolvedValue(null);
      repo.createWithAccount.mockRejectedValue(new Error('boom'));
      await expect(service.findOrCreateByEmail('jane@example.com')).rejects.toThrow('boom');
    });
  });
});
