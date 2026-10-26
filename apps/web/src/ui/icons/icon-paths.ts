/**
 * D210: Gobbit's one icon set. Hand-drawn on a 24 px grid, content inside 2–22, drawn with a
 * 1.75 stroke, round caps and joins (see Icon.tsx). Paths use absolute commands only so the
 * grid can be checked by a test. No icon library, no Unicode glyphs.
 */
export const ICON_PATHS = {
  back: 'M15 5L8 12L15 19',
  forward: 'M9 5L16 12L9 19',
  close: 'M6 6L18 18M18 6L6 18',
  edit: 'M4 20H8L19 9A2.83 2.83 0 0 0 15 5L4 16Z M13.5 6.5L17.5 10.5',
  star: 'M12 3.5L14.6 8.8L20.5 9.7L16.25 13.8L17.25 19.6L12 16.9L6.75 19.6L7.75 13.8L3.5 9.7L9.4 8.8Z',
  share: 'M12 3V15M8 7L12 3L16 7M5 12V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V12',
  more: 'M5 12A1.25 1.25 0 1 0 7.5 12A1.25 1.25 0 1 0 5 12Z M10.75 12A1.25 1.25 0 1 0 13.25 12A1.25 1.25 0 1 0 10.75 12Z M16.5 12A1.25 1.25 0 1 0 19 12A1.25 1.25 0 1 0 16.5 12Z',
  trash: 'M4 7H20M9 7V4.5H15V7M6 7L7 20H17L18 7M10 11V16M14 11V16',
  archive: 'M3.5 4.5H20.5V8.5H3.5Z M5 8.5V19.5H19V8.5 M10 12.5H14',
  restore: 'M3.5 4.5H20.5V8.5H3.5Z M5 8.5V19.5H19V8.5 M12 17V11.5M9.5 14L12 11.5L14.5 14',
  undo: 'M9 14L4 9L9 4 M4 9H15A5 5 0 0 1 15 19H11',
  history: 'M3.5 12A8.5 8.5 0 1 0 6 6M3 3.5V7.5H7 M12 7.5V12L15 14',
  settings: 'M4 6H14M18 6H20M16 4V8 M4 12H8M12 12H20M10 10V14 M4 18H15M19 18H20M17 16V20',
  search: 'M10.5 4A6.5 6.5 0 1 0 10.5 17A6.5 6.5 0 1 0 10.5 4Z M15.5 15.5L20 20',
  plus: 'M12 5V19M5 12H19',
  copy: 'M9 9H19V19H9Z M15 9V5H5V15H9',
  photo:
    'M3.5 5.5H20.5V18.5H3.5Z M3.5 16L8.5 11L13 15.5L15.5 13L20.5 18 M14.5 9.5A1.5 1.5 0 1 0 17.5 9.5A1.5 1.5 0 1 0 14.5 9.5Z',
  upload: 'M12 15V4M7.5 8.5L12 4L16.5 8.5M4 15V19A1 1 0 0 0 5 20H19A1 1 0 0 0 20 19V15',
  check: 'M5 12.5L10 17.5L19 7',
  reject: 'M12 3.5A8.5 8.5 0 1 0 12 20.5A8.5 8.5 0 1 0 12 3.5Z M9 9L15 15M15 9L9 15',
  send: 'M20.5 3.5L10.5 13.5 M20.5 3.5L14 20.5L10.5 13.5L3.5 10Z',
  'sign-out': 'M10 4H5V20H10 M15 8L19 12L15 16 M19 12H9',
  refresh: 'M20 12A8 8 0 1 1 17.66 6.34M18 2.5V6.5H14',
  external: 'M14 4H20V10 M20 4L11 13 M18 14V19A1 1 0 0 1 17 20H5A1 1 0 0 1 4 19V7A1 1 0 0 1 5 6H10',
  'arrow-up': 'M12 19V5M6 11L12 5L18 11',
  'arrow-down': 'M12 5V19M6 13L12 19L18 13',
  'arrow-left': 'M19 12H5M11 6L5 12L11 18',
  'arrow-right': 'M5 12H19M13 6L19 12L13 18',
  browse: 'M7 4H17 M5 7.5H19 M4 11H20V20H4Z',
  inbox: 'M3.5 13.5L6 5H18L20.5 13.5V19H3.5Z M3.5 13.5H8.5L9.5 16H14.5L15.5 13.5H20.5',
  'file-import': 'M14 3.5H6V20.5H18V7.5Z M14 3.5V7.5H18 M12 10.5V16.5M9.5 14L12 16.5L14.5 14',
  select:
    'M4 4.5H10V10.5H4Z M5.5 7.5L6.75 8.75L8.75 6.25 M13 7.5H20 M4 13.5H10V19.5H4Z M13 16.5H20',
  link: 'M10 14A4 4 0 0 0 15.66 14L18.5 11.16A4 4 0 0 0 12.84 5.5L11.5 6.84 M14 10A4 4 0 0 0 8.34 10L5.5 12.84A4 4 0 0 0 11.16 18.5L12.5 17.16',
  'user-minus':
    'M9.5 4A3.5 3.5 0 1 0 9.5 11A3.5 3.5 0 1 0 9.5 4Z M3 20A6.5 6.5 0 0 1 16 20 M16 9H21',
  key: 'M8 11A4 4 0 1 0 8 19A4 4 0 1 0 8 11Z M10.8 12.2L19 4M16 7L18.5 9.5M14 9L16 11',
  eye: 'M2.5 12C5 7 8.5 5 12 5C15.5 5 19 7 21.5 12C19 17 15.5 19 12 19C8.5 19 5 17 2.5 12Z M12 9A3 3 0 1 0 12 15A3 3 0 1 0 12 9Z',
  'bell-off': 'M6 16V11A6 6 0 0 1 15.5 6.1 M18 10.5V16L19.5 17.5H8 M10 20H14 M4 4L20 20',
  list: 'M8 6H20M8 12H20M8 18H20M4 6H4.01M4 12H4.01M4 18H4.01',
  clipboard: 'M9 4H15V6.5H9Z M9 5H6V20.5H18V5H15',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Icons that may be drawn filled (e.g. a pressed favorite). */
export const FILLABLE: ReadonlySet<IconName> = new Set<IconName>(['star']);

/** Icons that point along the reading direction and mirror in RTL; all others never flip. */
export const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(['back', 'forward']);
