export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/;

export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'administrator',
  'gobbit',
  'support',
  'help',
  'root',
  'system',
  'staff',
  'team',
  'official',
  'me',
  'null',
  'undefined',
  'api',
  'www',
  'mail',
  'noreply',
  'security',
  'abuse',
];

export function checkUsernameShape(value: string): 'ok' | 'invalid' | 'reserved' {
  if (value.includes('@') || !USERNAME_PATTERN.test(value)) return 'invalid';
  return RESERVED_USERNAMES.includes(value.toLowerCase()) ? 'reserved' : 'ok';
}
