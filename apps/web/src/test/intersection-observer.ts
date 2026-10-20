import { vi } from 'vitest';

type Callback = IntersectionObserverCallback;

/** A controllable IntersectionObserver for jsdom: tests call `intersect()` to report pages. */
export class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  readonly options: IntersectionObserverInit | undefined;
  private readonly callback: Callback;

  constructor(callback: Callback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.add(element);
  }

  unobserve(element: Element): void {
    this.observed.delete(element);
  }

  disconnect(): void {
    this.observed.clear();
    FakeIntersectionObserver.instances = FakeIntersectionObserver.instances.filter(
      (o) => o !== this,
    );
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Reports `element` at `ratio` visibility to every live observer watching it. */
  static intersect(element: Element, ratio: number): void {
    for (const observer of FakeIntersectionObserver.instances) {
      if (!observer.observed.has(element)) continue;
      const entry = {
        target: element,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      } as IntersectionObserverEntry;
      observer.callback([entry], observer as unknown as IntersectionObserver);
    }
  }
}

export function installIntersectionObserver(): void {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
}
