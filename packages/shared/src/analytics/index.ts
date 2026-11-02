/** 033: app analytics — screens, content events and the payload sanitiser (D252–D256). */
export * from './screens';
export * from './events';
export * from './sanitize';
export * from './privacy';

/** D254: the global before-send hook the tracker tag names in `data-before-send`. */
export const BEFORE_SEND_HOOK = '__gobbitAnalyticsBeforeSend';
