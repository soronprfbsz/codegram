import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Testing Library's `waitFor` only advances fake timers when it can detect a
// global `jest` object (jestFakeTimersAreEnabled checks `typeof jest`). Under
// Vitest that global is absent, so `waitFor` falls back to real-time polling
// and hangs while `vi.useFakeTimers()` is active. Expose a minimal shim that
// forwards to Vitest's timer controls so `waitFor` pumps the fake clock.
;(globalThis as unknown as { jest: unknown }).jest = {
  advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
}

afterEach(() => {
  cleanup()
})

// --- React Flow (Plan 3b) jsdom mocks ---------------------------------------
// @xyflow/react measures the DOM (ResizeObserver, getBoundingClientRect,
// matchMedia) which jsdom does not implement. These minimal mocks let the
// canvas mount and render its nodes; layout/positions are NOT asserted in
// jsdom (those are covered by the pure layout unit test + Playwright E2E).
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom does not implement scrollIntoView; the search list scrolls its active
// row into view, so provide a no-op (scroll position is not asserted in jsdom).
Element.prototype.scrollIntoView = function scrollIntoView() {}

// jsdom returns a zero-size rect; give nodes a non-zero box so React Flow's
// measurement step produces dimensions instead of NaN.
Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    width: 200,
    height: 120,
    top: 0,
    left: 0,
    bottom: 120,
    right: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

// CodeMirror 6 measures selection geometry via Range.getClientRects() in its
// rAF measure loop. jsdom does not implement it, so a measure pumped by a test
// (e.g. a userEvent click advancing timers) throws "getClientRects is not a
// function". Shim Range geometry with empty rects — layout is not asserted in
// jsdom (real geometry is covered by Playwright E2E).
Range.prototype.getClientRects = function getClientRects() {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  } as unknown as DOMRectList
}
Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
  return {
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}
