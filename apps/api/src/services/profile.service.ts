import type { MemberSummary, Profile, ProfilePatch } from '@gobbit/shared';
import { PROFILE_LOCATION_MAX, PROFILE_NAME_MAX } from '@gobbit/shared';
import { checkUsernameShape } from '@gobbit/shared/username';
import { initialsFor } from '@gobbit/shared/avatar';
import type { AssetRow } from '@gobbit/db';
import type { DecisionLogger } from '../lib/decision-event';
import type { LogHash } from '../lib/log-hash';
import type { ProfilePatch as ProfileColumns, ProfileRow } from '../repositories/users.repo';
import type { ProfileRepo } from '../repositories/profile.repo';
import { HttpError, rateLimited, unauthorized, unprocessableField } from '../errors/http-errors';
import { usernameConflictReason } from '../errors/pg-error-map';
import type { CurrentUser } from '../types';
import { rateKeys } from '../lib/rate-window';
import type { MemberSummaries } from './member-summaries';
import type { RateLimitService } from './rate-limit.service';
import type { ProfileDecisions } from './profile.events';

/** Repos bound to one transaction. */
export interface ProfileTxRepos {
  users: {
    profileById(id: string): Promise<ProfileRow | null>;
    updateProfile(userId: string, patch: ProfileColumns): Promise<ProfileRow | null>;
  };
  profile: Pick<ProfileRepo, 'insertProfileEvent' | 'insertHold'>;
}

export interface ProfileServiceDeps {
  usernameHoldDays: number;
  now: () => Date;
  logHash: LogHash;
  decisions: DecisionLogger<ProfileDecisions>;
  lookupRatePerHour: number;
  updateRatePerHour: number;
  rateLimits: Pick<RateLimitService, 'check'>;
  summaries: Pick<MemberSummaries, 'summaries'>;
  findByUsername(lower: string): Promise<{ id: string } | null>;
  findByEmail(email: string): Promise<{ id: string } | null>;
  activeHold(lower: string, now: Date): Promise<{ releasedBy: string } | null>;
  sharesDeckWith(callerId: string, targetId: string): Promise<boolean>;
  profileById(id: string): Promise<ProfileRow | null>;
  assetByPublicId(publicId: string): Promise<AssetRow | null>;
  transaction<T>(fn: (repos: ProfileTxRepos) => Promise<T>): Promise<T>;
}

const DAY_MS = 86_400_000;
const FIELDS = ['username', 'firstName', 'lastName', 'location'] as const;
const LIMITS = ['firstName', 'lastName', 'location'] as const;
const LIMIT_MAX = {
  firstName: PROFILE_NAME_MAX,
  lastName: PROFILE_NAME_MAX,
  location: PROFILE_LOCATION_MAX,
};
const PROFILE_FIELDS = [...FIELDS, 'avatar'] as const;

/** The email is read only to compute initials; it never reaches the DTO. */
export function toProfile(row: ProfileRow): Profile {
  return {
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    location: row.location,
    avatar: row.avatar,
    initials: initialsFor({ firstName: row.firstName, lastName: row.lastName, email: row.email }),
  };
}

const clean = (v: string | null | undefined) => v?.trim() || null;

type Outcome = { row: ProfileRow; from: string | null; heldUntil: Date | null; changed: boolean };

export function createProfileService(deps: ProfileServiceDeps) {
  const { decisions, logHash } = deps;
  const hash = (name: string) => logHash('username', name);

  /** D429: the photo must be the caller's own recorded profile image; dimensions come from it. */
  async function resolveAvatar(
    user: CurrentUser,
    given: { publicId: string } | null,
    requestId: string,
  ): Promise<ProfileRow['avatar']> {
    if (!given) return null;
    const asset = await deps.assetByPublicId(given.publicId);
    const reason = !asset
      ? 'unknown'
      : asset.scope !== 'profile' || asset.ownerUserId !== user.id || asset.kind !== 'image'
        ? 'foreign'
        : asset.rejectedAt !== null
          ? 'rejected'
          : null;
    if (reason || !asset) {
      decisions.record('profile.avatar', {
        outcome: 'refused',
        reason: reason ?? 'unknown',
        requestId,
        userId: user.id,
      });
      throw unprocessableField('avatar.publicId', 'Unknown image');
    }
    return {
      publicId: asset.publicId,
      ...(asset.width !== null ? { width: asset.width } : {}),
      ...(asset.height !== null ? { height: asset.height } : {}),
    };
  }

  return {
    async get(user: CurrentUser): Promise<Profile> {
      const row = await deps.profileById(user.id);
      if (!row) throw unauthorized();
      return toProfile(row);
    },

    /** D425: advisory; the save decides. Taken and held answer alike. */
    async checkUsername(
      user: CurrentUser,
      username: string,
      requestId: string,
    ): Promise<{ available: boolean; reason?: 'invalid' | 'reserved' | 'unavailable' }> {
      const base = { requestId, userId: user.id, usernameHash: hash(username) };
      const gate = await deps.rateLimits.check(
        rateKeys.profileLookupUser(user.id),
        deps.lookupRatePerHour,
      );
      if (!gate.allowed) {
        decisions.record('profile.username_check', {
          ...base,
          outcome: 'refused',
          reason: 'rate_limited',
        });
        throw rateLimited(gate.retryAfterSeconds);
      }
      const name = username.trim();
      const shape = checkUsernameShape(name);
      let reason: 'invalid' | 'reserved' | 'unavailable' | undefined =
        shape === 'ok' ? undefined : shape;
      if (!reason) {
        const lower = name.toLowerCase();
        const [owner, held] = await Promise.all([
          deps.findByUsername(lower),
          deps.activeHold(lower, deps.now()),
        ]);
        if ((owner && owner.id !== user.id) || (held && held.releasedBy !== user.id)) {
          reason = 'unavailable';
        }
      }
      decisions.record('profile.username_check', {
        ...base,
        outcome: reason ? 'unavailable' : 'available',
        reason,
      });
      return reason ? { available: false, reason } : { available: true };
    },

    /** D424: username for anyone, email only for a deck mate; every miss looks the same. */
    async lookup(
      user: CurrentUser,
      query: string,
      requestId: string,
    ): Promise<{ member: MemberSummary | null }> {
      const q = query.trim();
      const kind = q.includes('@') ? 'email' : 'username';
      const base = {
        requestId,
        userId: user.id,
        kind,
        queryHash: logHash(kind === 'email' ? 'email' : 'username', q),
      };
      const gate = await deps.rateLimits.check(
        rateKeys.profileLookupUser(user.id),
        deps.lookupRatePerHour,
      );
      if (!gate.allowed) {
        decisions.record('profile.lookup', { ...base, outcome: 'refused', reason: 'rate_limited' });
        throw rateLimited(gate.retryAfterSeconds);
      }
      const target =
        kind === 'email'
          ? await deps.findByEmail(q.toLowerCase())
          : await deps.findByUsername(q.toLowerCase());
      const visible =
        target && (kind === 'username' || (await deps.sharesDeckWith(user.id, target.id)));
      const member = visible
        ? ((await deps.summaries.summaries([target.id])).get(target.id) ?? null)
        : null;
      if (member)
        decisions.record('profile.lookup', { ...base, outcome: 'found', targetId: member.id });
      else decisions.record('profile.lookup', { ...base, outcome: 'not_found' });
      return { member };
    },

    async update(user: CurrentUser, patch: ProfilePatch, requestId: string): Promise<Profile> {
      // Counted before anything is read or written: cycling usernames would grow username_holds.
      const gate = await deps.rateLimits.check(
        rateKeys.profileUpdateUser(user.id),
        deps.updateRatePerHour,
      );
      if (!gate.allowed) {
        decisions.record('profile.update', {
          outcome: 'refused',
          reason: 'rate_limited',
          requestId,
          userId: user.id,
        });
        throw rateLimited(gate.retryAfterSeconds);
      }
      const next: ProfileColumns = {};
      for (const f of FIELDS) if (patch[f] !== undefined) next[f] = clean(patch[f]);
      for (const f of LIMITS) {
        const v = next[f];
        if (v && [...v].length > LIMIT_MAX[f]) {
          throw unprocessableField(f, `Use at most ${LIMIT_MAX[f]} characters.`);
        }
      }
      if (patch.avatar !== undefined) {
        next.avatar = await resolveAvatar(user, patch.avatar, requestId);
      }

      if (next.username) {
        const shape = checkUsernameShape(next.username);
        if (shape !== 'ok') {
          decisions.record('profile.username', {
            outcome: 'refused',
            reason: shape,
            requestId,
            userId: user.id,
            usernameHash: hash(next.username),
          });
          throw unprocessableField('username', shape);
        }
      }

      let result: Outcome;
      try {
        result = await deps.transaction(async ({ users, profile }): Promise<Outcome> => {
          const current = await users.profileById(user.id);
          if (!current) throw unauthorized();

          const changes = PROFILE_FIELDS.filter(
            (f) =>
              f in next &&
              (f === 'avatar'
                ? next.avatar?.publicId !== current.avatar?.publicId
                : next[f] !== current[f]),
          );
          if (changes.length === 0) {
            return { row: current, from: null, heldUntil: null, changed: false };
          }
          const write = Object.fromEntries(changes.map((f) => [f, next[f]])) as ProfileColumns;

          // A case-only rename keeps the same lower-cased name, so there is nothing to hold.
          const old = current.username;
          const releases =
            changes.includes('username') &&
            old !== null &&
            old.toLowerCase() !== next.username?.toLowerCase();
          const heldUntil = releases
            ? new Date(deps.now().getTime() + deps.usernameHoldDays * DAY_MS)
            : null;
          if (releases && heldUntil) {
            await profile.insertHold({
              usernameLower: old.toLowerCase(),
              releasedBy: user.id,
              holdUntil: heldUntil,
            });
          }

          const row = await users.updateProfile(user.id, write);
          if (!row) throw unauthorized();
          await profile.insertProfileEvent({ userId: user.id, changes, requestId });
          return { row, from: old, heldUntil, changed: true };
        });
      } catch (err) {
        // The failed statement aborted the transaction, so the hold rolled back with it.
        const reason = usernameConflictReason(err);
        if (!reason) throw err;
        decisions.record('profile.username', {
          outcome: 'refused',
          reason,
          requestId,
          userId: user.id,
          usernameHash: hash(next.username ?? ''),
        });
        throw new HttpError(
          422,
          '/problems/username-unavailable',
          'Unprocessable Content',
          'That username is not available',
          [{ path: 'username', message: 'unavailable' }],
        );
      }

      const to = result.row.username;
      if (result.changed && to !== result.from) {
        decisions.record('profile.username', {
          outcome: !to ? 'cleared' : result.from ? 'changed' : 'claimed',
          requestId,
          userId: user.id,
          usernameHash: hash((to ?? result.from)!),
        });
      }
      if (result.heldUntil) {
        decisions.record('profile.username_hold', {
          outcome: 'held',
          requestId,
          userId: user.id,
          usernameHash: hash(result.from!),
          holdUntil: result.heldUntil.toISOString(),
        });
      }
      return toProfile(result.row);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
