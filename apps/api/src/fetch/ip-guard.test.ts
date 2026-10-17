import { describe, expect, it } from 'vitest';
import {
  BlockedAddressError,
  createGuardedLookup,
  isBlockedAddress,
  type LookupAll,
} from './ip-guard';

type LookupResult = {
  err: Error | null;
  address: string | { address: string; family: number }[];
  family: number | undefined;
};

function run(
  lookup: ReturnType<typeof createGuardedLookup>,
  hostname: string,
  options: unknown,
): Promise<LookupResult> {
  return new Promise((resolve) => {
    lookup(hostname, options, (err, address, family) => {
      resolve({ err, address, family });
    });
  });
}

const BLOCKED = [
  '127.0.0.1',
  '10.1.2.3',
  '172.16.0.1',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '0.0.0.0',
  '255.255.255.255',
  '224.0.0.1',
  '::1',
  '::',
  'fe80::1',
  'fc00::1',
  'fd00:ec2::254',
  '::ffff:127.0.0.1',
  '::ffff:10.0.0.1',
  'not-an-ip',
  '',
];

const PUBLIC = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'];

describe('ip-guard (D-fetch)', () => {
  describe('isBlockedAddress', () => {
    it.each(BLOCKED)('blocks %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(true);
    });

    it.each(PUBLIC)('allows %s', (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    });
  });

  describe('createGuardedLookup', () => {
    it('returns the first address when all public and options has no all flag', async () => {
      const lookupAll: LookupAll = async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '1.1.1.1', family: 4 },
      ];
      const lookup = createGuardedLookup({ lookupAll });
      const r = await run(lookup, 'example.test', {});
      expect(r.err).toBeNull();
      expect(r.address).toBe('8.8.8.8');
      expect(r.family).toBe(4);
    });

    it('returns the full list when options.all is true', async () => {
      const list = [
        { address: '8.8.8.8', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ];
      const lookupAll: LookupAll = async () => list;
      const lookup = createGuardedLookup({ lookupAll });
      const r = await run(lookup, 'example.test', { all: true });
      expect(r.err).toBeNull();
      expect(r.address).toEqual(list);
    });

    it('errors with BlockedAddressError naming the first blocked address', async () => {
      const lookupAll: LookupAll = async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
        { address: '192.168.0.1', family: 4 },
      ];
      const lookup = createGuardedLookup({ lookupAll });
      const r = await run(lookup, 'internal.test', {});
      if (!(r.err instanceof BlockedAddressError)) {
        throw new Error('expected BlockedAddressError');
      }
      expect(r.err.address).toBe('10.0.0.1');
      expect(r.err.name).toBe('BlockedAddressError');
      expect(r.err.message).toBe('Blocked address 10.0.0.1');
    });

    it('errors when lookup returns no addresses, message contains hostname', async () => {
      const lookupAll: LookupAll = async () => [];
      const lookup = createGuardedLookup({ lookupAll });
      const r = await run(lookup, 'nothing.example.test', {});
      expect(r.err).toBeInstanceOf(Error);
      expect(r.err?.message).toContain('nothing.example.test');
    });

    it('passes lookupAll rejections through to the callback', async () => {
      const failure = new Error('dns down');
      const lookupAll: LookupAll = async () => {
        throw failure;
      };
      const lookup = createGuardedLookup({ lookupAll });
      const r = await run(lookup, 'example.test', {});
      expect(r.err).toBe(failure);
    });

    it('allows loopback when a custom isBlocked returns false', async () => {
      const lookupAll: LookupAll = async () => [{ address: '127.0.0.1', family: 4 }];
      const lookup = createGuardedLookup({ lookupAll, isBlocked: () => false });
      const r = await run(lookup, 'localhost', {});
      expect(r.err).toBeNull();
      expect(r.address).toBe('127.0.0.1');
      expect(r.family).toBe(4);
    });
  });
});
