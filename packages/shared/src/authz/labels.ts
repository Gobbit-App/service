import type { CategoryVisibility, MemberRole } from '../enums';

type Label = { label: string; description: string };

/** D185: how the PWA names each role; `owner` reads "Co-owner" (account owners are implicit). */
export const ROLE_LABELS: Readonly<Record<MemberRole, Label>> = {
  owner: { label: 'Co-owner', description: 'Everything except deleting the deck' },
  maintainer: { label: 'Maintainer', description: 'Edit, publish, manage categories' },
  editor: { label: 'Editor', description: 'Add and edit cards' },
  reader: { label: 'Reader', description: 'Read only' },
};

/** 053: one friendly sentence per role for someone who has just joined a deck. */
export const ROLE_WELCOME: Readonly<Record<MemberRole, string>> = {
  owner: 'You can do everything here except delete the deck.',
  maintainer: 'You can read, add and edit cards, publish them and manage categories.',
  editor: 'You can read this deck and add and edit cards.',
  reader: 'You can read this deck.',
};

/** D184: the three-way category visibility select. */
export const VISIBILITY_LABELS: Readonly<Record<CategoryVisibility, Label>> = {
  private: { label: 'Admins only', description: 'Owners and maintainers' },
  shared: { label: 'Members', description: 'Everyone in the deck' },
  public: { label: 'Everyone', description: 'Anyone with the link, when the deck is public' },
};
