/** The part of Umami's `window.umami` the app uses (tracker v3). */
export type Umami = {
  /** No arguments: a page view of the current page; a name: a custom event. */
  track: (name?: string, data?: Record<string, unknown>) => unknown;
  /** Starts a new identified session (resets the tracker's cache token). */
  identify: (id: string) => unknown;
};
