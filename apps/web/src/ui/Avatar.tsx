import { useState, type ReactElement } from 'react';
import { avatarColorIndex } from '@gobbit/shared/avatar';
import { CloudImage } from '../cards/CloudImage';
import { useCloudName } from '../cards/use-cloud-name';
import { Icon } from './icons/Icon';

export interface AvatarMember {
  id: string | null;
  initials: string;
  name?: string | null;
  username?: string | null;
  photo?: { publicId: string; width?: number; height?: number } | null;
}

/** D422: username, else profile name, else "Member"; never the email-derived name. */
export function avatarLabel(member: Pick<AvatarMember, 'name' | 'username'>): string {
  return member.username || member.name || 'Member';
}

/**
 * D428: a fixed round box (24 or 40 px) with the member's photo, else initials on their palette
 * colour, else a person glyph. A `span`, never a link or button: it names the member through
 * the `data-tip` tooltip (tap, hover, focus) and shows no email or id.
 */
export function Avatar({
  member,
  size = 'sm',
  label,
  ariaLabel,
  decorative = false,
}: {
  member: AvatarMember;
  size?: 'sm' | 'md';
  /** Overrides `avatarLabel(member)` in the tooltip. */
  label?: string;
  /** Overrides the accessible name (default "Added by <label>"). */
  ariaLabel?: string;
  /** Inside a control that already names it (a menu item): no role, focus stop or tooltip. */
  decorative?: boolean;
}): ReactElement {
  const cloudName = useCloudName();
  const [failed, setFailed] = useState<string | null>(null);
  const text = label ?? avatarLabel(member);
  const photo = member.photo && member.photo.publicId !== failed ? member.photo : null;
  const palette = member.id === null ? null : avatarColorIndex(member.id) + 1;
  const style =
    palette === null || !member.initials
      ? undefined
      : { background: `var(--avatar-${palette}-bg)`, color: `var(--avatar-${palette}-fg)` };

  return (
    <span
      className={`avatar avatar--${size}`}
      style={style}
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            tabIndex: 0,
            'aria-label': ariaLabel ?? `Added by ${text}`,
            'data-tip': text,
            'data-tip-tap': '',
          })}
    >
      {photo && cloudName ? (
        <CloudImage
          className="avatar__photo"
          cloudName={cloudName}
          publicId={photo.publicId}
          alt=""
          width={photo.width ?? 512}
          height={photo.height ?? 512}
          onError={() => setFailed(photo.publicId)}
        />
      ) : member.initials ? (
        <span className="avatar__initials" aria-hidden="true">
          {member.initials}
        </span>
      ) : (
        <Icon name="user" className="avatar__glyph" />
      )}
    </span>
  );
}
