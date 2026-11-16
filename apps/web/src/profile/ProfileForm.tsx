import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { initialsFor } from '@gobbit/shared/avatar';
import {
  codePointLength,
  PROFILE_LOCATION_MAX,
  PROFILE_NAME_MAX,
} from '@gobbit/shared/card-limits';
import { isApiError } from '../api/api-error';
import { api, unwrap } from '../api/client';
import { useOnline } from '../api/offline';
import { EVENTS_KEY, queryKeys, REVIEW_KEY } from '../api/query-keys';
import { idbDraftsKv } from '../editor/drafts-store';
import { LimitMeter } from '../editor/fields/LimitMeter';
import { TextInput } from '../editor/fields/TextInput';
import { useLeaveGuard } from '../editor/use-leave-guard';
import { Button } from '../ui/buttons/Button';
import { PhotoField, type ProfilePhoto } from './PhotoField';
import { usernameMessage, useUsernameCheck } from './use-username-check';

export type ProfileValues = {
  username: string;
  firstName: string;
  lastName: string;
  location: string;
  /** The photo the form will save (an uploaded asset), or null for none. */
  avatar: ProfilePhoto | null;
};

export type SavedProfile = {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  avatar: { publicId: string; width?: number; height?: number } | null;
};

/** D145: the unsaved form lives under this key; sign-out clears the whole store. */
export const PROFILE_DRAFT_KEY = 'profile';

export const PROFILE_COPY = {
  usernameHint: 'Others can currently find you only by email.',
  available: 'Available',
  checking: 'Checking…',
  saved: 'Saved.',
  restored: 'Restored your unsaved changes.',
  offline: "You're offline. Saving needs a connection.",
  failed: "Couldn't save your profile. Try again.",
  limit: (max: number) => `Use at most ${max} characters.`,
} as const;

const FIELDS = ['username', 'firstName', 'lastName', 'location'] as const;
type Field = (typeof FIELDS)[number];
type FieldErrors = Partial<Record<Field, string>>;
type Errors = { fields: FieldErrors; form: string | null };
const NO_ERRORS: Errors = { fields: {}, form: null };

const toValues = (p: SavedProfile): ProfileValues => ({
  username: p.username ?? '',
  firstName: p.firstName ?? '',
  lastName: p.lastName ?? '',
  location: p.location ?? '',
  avatar: p.avatar,
});

/** The server's field messages (`errors[].path/message`), usernames in human words. */
function serverErrors(err: unknown): Errors {
  const list = isApiError(err) && err.status === 422 ? err.problem?.errors : null;
  const fields: FieldErrors = {};
  if (Array.isArray(list)) {
    for (const e of list as { path?: unknown; message?: unknown }[]) {
      const field = FIELDS.find((f) => f === e?.path);
      if (field && typeof e.message === 'string' && !fields[field]) {
        fields[field] = field === 'username' ? usernameMessage(e.message) : e.message;
      }
    }
  }
  return Object.keys(fields).length
    ? { fields, form: null }
    : { fields, form: PROFILE_COPY.failed };
}

/** The draft keeps only the uploaded photo's publicId (never image data). */
type Stored = { v: 1; values: Record<Field, string> & { avatar?: string | null } };
function isStored(v: unknown): v is Stored {
  const r = v as { v?: unknown; values?: Record<string, unknown> } | null;
  return r?.v === 1 && FIELDS.every((f) => typeof r.values?.[f] === 'string');
}
const photoId = (v: Pick<ProfileValues, 'avatar'>) => v.avatar?.publicId ?? null;
const fromStored = (s: Stored['values']): ProfileValues => ({
  ...s,
  avatar: s.avatar ? { publicId: s.avatar } : null,
});

/**
 * 046 (Story 1, 7): the profile fields. Empty means cleared; the server trims, validates and
 * decides username availability. Unsaved edits are kept as a draft (restored on remount,
 * cleared on save and sign-out) and leaving with them asks first.
 */
export function ProfileForm({
  userId,
  email,
  profile,
}: {
  userId: string;
  /** Only the fallback for the preview's initials; never displayed. */
  email: string;
  profile: SavedProfile;
}): ReactElement {
  const qc = useQueryClient();
  const online = useOnline();
  const [saved, setSaved] = useState(() => toValues(profile));
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  });
  const [values, setValues] = useState<ProfileValues>(saved);
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);

  const [uploading, setUploading] = useState(false);
  const differs = (a: ProfileValues, b: ProfileValues) =>
    FIELDS.some((f) => a[f] !== b[f]) || photoId(a) !== photoId(b);
  const dirty = differs(values, saved);
  const check = useUsernameCheck(values.username, profile.username);

  useEffect(() => {
    let live = true;
    idbDraftsKv()
      .get(PROFILE_DRAFT_KEY)
      .then((stored) => {
        if (live && isStored(stored) && differs(fromStored(stored.values), savedRef.current)) {
          setValues(fromStored(stored.values));
          setRestored(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const kv = idbDraftsKv();
    const write = dirty
      ? kv.set(PROFILE_DRAFT_KEY, { v: 1, values: { ...values, avatar: photoId(values) } })
      : kv.del(PROFILE_DRAFT_KEY);
    write.catch(() => undefined);
  }, [ready, dirty, values]);

  const guard = useLeaveGuard({
    when: dirty,
    subject: 'your profile',
    onDiscard: () => idbDraftsKv().del(PROFILE_DRAFT_KEY),
  });

  const save = useMutation({
    mutationFn: (v: ProfileValues): Promise<SavedProfile> =>
      unwrap(
        api.PATCH('/me/profile', {
          body: {
            username: v.username.trim() || null,
            firstName: v.firstName.trim() || null,
            lastName: v.lastName.trim() || null,
            location: v.location.trim() || null,
            // Only a changed photo is sent; absent leaves it as it is.
            ...(photoId(v) !== photoId(saved)
              ? { avatar: v.avatar ? { publicId: v.avatar.publicId } : null }
              : {}),
          },
        }),
      ),
    onSuccess: (updated) => {
      setErrors(NO_ERRORS);
      setRestored(false);
      setSaved(toValues(updated));
      setValues(toValues(updated));
      qc.setQueryData(queryKeys.me, (me: { profile: SavedProfile } | undefined) =>
        me ? { ...me, profile: updated } : me,
      );
      // Names show on cards, members, the review queue and the log: refetch, no sign-out needed.
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      for (const key of [
        queryKeys.itemLists,
        ['item'],
        queryKeys.decks,
        [REVIEW_KEY],
        [EVENTS_KEY],
      ]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (err) => setErrors(serverErrors(err)),
  });

  const setAvatar = (avatar: ProfilePhoto | null) => {
    setValues((v) => ({ ...v, avatar }));
    save.reset();
  };

  const edit = (field: Field) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, fields: { ...e.fields, [field]: undefined } }));
    save.reset();
  };

  const limitError = (field: 'firstName' | 'lastName' | 'location', max: number) =>
    codePointLength(values[field].trim()) > max ? PROFILE_COPY.limit(max) : undefined;
  const local = {
    firstName: limitError('firstName', PROFILE_NAME_MAX),
    lastName: limitError('lastName', PROFILE_NAME_MAX),
    location: limitError('location', PROFILE_LOCATION_MAX),
  };
  const usernameError =
    errors.fields.username ??
    (check.status === 'unavailable' ? usernameMessage(check.reason) : undefined);
  // Only what the client can be sure of blocks; availability stays the server's call.
  const blocked =
    Boolean(local.firstName || local.lastName || local.location) ||
    (check.status === 'unavailable' && check.reason !== 'unavailable');

  const name = [values.firstName, values.lastName]
    .map((n) => n.trim())
    .filter(Boolean)
    .join(' ');
  const username = values.username.trim();
  const meter = (field: 'firstName' | 'lastName' | 'location', max: number) => (
    <LimitMeter used={codePointLength(values[field].trim())} max={max} />
  );
  const usernameHint =
    check.status === 'checking'
      ? PROFILE_COPY.checking
      : check.status === 'available'
        ? PROFILE_COPY.available
        : username
          ? ''
          : PROFILE_COPY.usernameHint;

  return (
    <form
      className="profile-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && online && !blocked && !save.isPending) save.mutate(values);
      }}
    >
      <PhotoField
        member={{
          id: userId,
          initials: initialsFor({ firstName: values.firstName, lastName: values.lastName, email }),
          name: name || null,
          username: username || null,
        }}
        photo={values.avatar}
        onChange={setAvatar}
        onUploadingChange={setUploading}
        disabled={save.isPending}
      />
      <div className="field-group">
        <TextInput
          label="First name"
          value={values.firstName}
          onChange={edit('firstName')}
          error={errors.fields.firstName ?? local.firstName}
          hint={meter('firstName', PROFILE_NAME_MAX)}
        />
        <TextInput
          label="Last name"
          value={values.lastName}
          onChange={edit('lastName')}
          error={errors.fields.lastName ?? local.lastName}
          hint={meter('lastName', PROFILE_NAME_MAX)}
        />
        <TextInput
          label="Username"
          value={values.username}
          onChange={edit('username')}
          error={usernameError}
          hint={<span role="status">{usernameHint}</span>}
        />
        <TextInput
          label="Location"
          value={values.location}
          onChange={edit('location')}
          error={errors.fields.location ?? local.location}
          hint={meter('location', PROFILE_LOCATION_MAX)}
        />
      </div>
      {restored && dirty && <p className="muted">{PROFILE_COPY.restored}</p>}
      <div className="settings-actions">
        <Button
          type="submit"
          icon="check"
          label="Save"
          disabled={!dirty || save.isPending || uploading}
          disabledReason={dirty && !online ? PROFILE_COPY.offline : null}
        />
        <Button
          icon="undo"
          label="Reset"
          variant="ghost"
          disabled={!dirty || save.isPending}
          onClick={() => {
            setValues(saved);
            setErrors(NO_ERRORS);
            setRestored(false);
            save.reset();
          }}
        />
      </div>
      {errors.form && (
        <p className="form-error" role="alert">
          {errors.form}
        </p>
      )}
      <p className="muted" role="status">
        {save.isSuccess && !dirty ? PROFILE_COPY.saved : ''}
      </p>
      {guard}
    </form>
  );
}
