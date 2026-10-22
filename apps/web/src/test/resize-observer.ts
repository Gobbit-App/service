/**
 * A controllable ResizeObserver for jsdom (which has none). Installed once by the Vitest setup;
 * tests call `FakeResizeObserver.resize(element, width)` to report a new content width.
 */
export class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
  }

  /** Whether any live observer watches `element`. */
  static watching(element: Element): boolean {
    return FakeResizeObserver.instances.some((o) => o.observed.has(element));
  }

  /** Reports `element` at `width` px to every observer watching it. */
  static resize(element: Element, width: number): void {
    for (const observer of FakeResizeObserver.instances) {
      if (!observer.observed.has(element)) continue;
      const entry = { target: element, contentRect: { width } } as ResizeObserverEntry;
      observer.callback([entry], observer as unknown as ResizeObserver);
    }
  }
}

export function installResizeObserver(): void {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}
