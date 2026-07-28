import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEditLease } from './useEditLease'
import * as api from './editLock'
import type { LockStatus } from '../model/types'

const PROJECT = 'p-1'

function heldByMe(): LockStatus {
  return {
    locked: true,
    locked_by: 'u-me',
    locked_by_email: 'me@example.com',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    is_me: true,
  }
}

function heldByOther(): LockStatus {
  return {
    locked: true,
    locked_by: 'u-other',
    locked_by_email: 'other@example.com',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    is_me: false,
  }
}

const FREE: LockStatus = {
  locked: false,
  locked_by: null,
  locked_by_email: null,
  expires_at: null,
  is_me: false,
}

/**
 * Render the hook with a QueryClient the test can reach, so a change in lock
 * status can be delivered straight into the cache. Waiting on the 15s poll
 * would be testing TanStack's timer, not this hook's reaction to the status.
 */
function renderLease(canEdit = true, isOwner = false) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
  const view = renderHook(() => useEditLease(PROJECT, { canEdit, isOwner }), {
    wrapper,
  })
  const pollReturns = (status: LockStatus) =>
    act(() => {
      vi.mocked(api.fetchLockStatus).mockResolvedValue(status)
      qc.setQueryData(api.lockQueryKeys.status(PROJECT), status)
    })
  return { ...view, pollReturns }
}

describe('useEditLease', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(api, 'releaseLock').mockImplementation(() => {})
    vi.spyOn(api, 'acquireLock').mockResolvedValue(heldByMe())
    vi.spyOn(api, 'fetchLockStatus').mockResolvedValue(heldByMe())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // --- closing the tab hands the lease back at once (ADR-0024) --------------
  it('releases the lease on pagehide, so the next editor does not wait out the TTL', async () => {
    const { result } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))

    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(api.releaseLock).toHaveBeenCalledWith(PROJECT)
  })

  it('releases on pagehide even before the first status has landed', () => {
    // Gating the release on locally-known holder state leaked the lease when a
    // tab was closed right after opening — exactly the hole this closes. The
    // server ignores a release from a non-holder, so sending it is free.
    renderLease()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(api.releaseLock).toHaveBeenCalledWith(PROJECT)
  })

  it('never releases for a viewer, who never took a lease', () => {
    renderLease(false)
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(api.releaseLock).not.toHaveBeenCalled()
  })

  it('re-acquires when the page comes back from the bfcache', async () => {
    const { result } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))
    vi.mocked(api.acquireLock).mockClear()

    // Not persisted (a plain load) → nothing to re-take.
    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('pageshow'), { persisted: false }),
      )
    })
    expect(api.acquireLock).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(
        Object.assign(new Event('pageshow'), { persisted: true }),
      )
    })
    await waitFor(() => expect(api.acquireLock).toHaveBeenCalled())
  })

  // --- the heartbeat is no longer visibility-gated (ADR-0024) ---------------
  it('keeps renewing while the tab is hidden', async () => {
    const { result } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))
    vi.mocked(api.acquireLock).mockClear()

    // Switching tabs is part of an edit session — gating on this is what made
    // a one-minute detour silently expire the lease.
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'hidden',
      configurable: true,
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000)
    })
    expect(api.acquireLock).toHaveBeenCalled()
  })

  it('does not renew a lease it is not holding', async () => {
    vi.mocked(api.fetchLockStatus).mockResolvedValue(heldByOther())
    vi.mocked(api.acquireLock).mockRejectedValue(new Error('409'))
    const { result } = renderLease()
    await waitFor(() => expect(result.current.lockedByOther).toBe(true))
    vi.mocked(api.acquireLock).mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000)
    })
    expect(api.acquireLock).not.toHaveBeenCalled()
  })

  // --- losing the lease is announced, not discovered (ADR-0024) -------------
  it('raises lostLease as soon as the status stops naming the caller', async () => {
    const { result, pollReturns } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))
    expect(result.current.lostLease).toBe(false)

    pollReturns(heldByOther())
    await waitFor(() => expect(result.current.lostLease).toBe(true))
    // ...and it says so BEFORE any save has been attempted.
    expect(result.current.bumped).toBe(false)
  })

  it('does not claim a loss for someone who never held the lease', async () => {
    vi.mocked(api.fetchLockStatus).mockResolvedValue(heldByOther())
    vi.mocked(api.acquireLock).mockRejectedValue(new Error('409'))
    const { result } = renderLease()
    await waitFor(() => expect(result.current.lockedByOther).toBe(true))

    expect(result.current.lostLease).toBe(false)
  })

  it('clears lostLease once the lease is taken back', async () => {
    const { result, pollReturns } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))

    pollReturns(FREE)
    await waitFor(() => expect(result.current.lostLease).toBe(true))

    vi.mocked(api.acquireLock).mockResolvedValue(heldByMe())
    await act(async () => {
      result.current.takeover()
    })
    await waitFor(() => expect(result.current.lostLease).toBe(false))
    expect(result.current.isHolder).toBe(true)
  })

  // --- conflict reasons are kept apart (ADR-0024 / edit_locked vs stale) ----
  it('reports the two 409 reasons distinctly', async () => {
    const { result } = renderLease()
    await waitFor(() => expect(result.current.isHolder).toBe(true))

    act(() => result.current.reportConflict('stale_version'))
    expect(result.current.conflictReason).toBe('stale_version')

    act(() => result.current.clearBumped())
    expect(result.current.conflictReason).toBe(null)

    // Anything else (including a missing reason) is a lease takeover.
    act(() => result.current.reportConflict())
    expect(result.current.conflictReason).toBe('edit_locked')
    expect(result.current.bumped).toBe(true)
  })

  // --- viewers never take part ---------------------------------------------
  it('never acquires for a viewer', async () => {
    const { result } = renderLease(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000)
    })
    expect(api.acquireLock).not.toHaveBeenCalled()
    expect(result.current.readOnly).toBe(true)
  })
})
