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
