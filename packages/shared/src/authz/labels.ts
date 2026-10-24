import type { CategoryVisibility, MemberRole } from '../enums';

type Label = { label: string; description: string };

/** D185: how the PWA names each role; `owner` reads "Co-owner" (account owners are implicit). */
export const ROLE_LABELS: Readonly<Record<MemberRole, Label>> = {
  owner: { label: 'Co-owner', description: 'Everything except deleting the deck' },
  maintainer: { label: 'Maintainer', description: 'Edit, publish, manage categories' },
  editor: { label: 'Editor', description: 'Add and edit cards' },
  reader: { label: 'Reader', description: 'Read only' },
};

/** D184: the three-way category visibility select. */
export const VISIBILITY_LABELS: Readonly<Record<CategoryVisibility, Label>> = {
  private: { label: 'Admins only', description: 'Owners and maintainers' },
  shared: { label: 'Members', description: 'Everyone in the deck' },
  public: { label: 'Everyone', description: 'Anyone with the link, when the deck is public' },
};
