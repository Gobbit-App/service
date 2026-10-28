/** D222: `waitlist` keeps unknown emails out of sign-in; `open` lets anyone register. */
export const registrationModes = ['waitlist', 'open'] as const;
export type RegistrationMode = (typeof registrationModes)[number];

/** D241: why a user row was created (`users.registered_via`). */
export const registrationReasons = ['deck_invite', 'waitlist_invite', 'open_sign_in'] as const;
export type RegistrationReason = (typeof registrationReasons)[number];
