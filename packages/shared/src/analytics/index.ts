/** 033: app analytics — screens, content events and the payload sanitiser (D244–D248). */
export * from './screens';
export * from './events';
export * from './sanitize';
export * from './privacy';

/** D246: the global before-send hook the tracker tag names in `data-before-send`. */
export const BEFORE_SEND_HOOK = '__gobbitAnalyticsBeforeSend';
