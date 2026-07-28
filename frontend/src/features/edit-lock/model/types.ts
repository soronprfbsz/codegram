/**
 * Why a content write came back 409. The backend distinguishes the two in
 * `{detail: {reason}}` and they mean different things to the user:
 * - edit_locked: someone else holds the edit lease now.
 * - stale_version: the lease is fine, but a newer save landed first, so this
 *   window is editing on top of out-of-date content.
 */
export type EditConflictReason = 'edit_locked' | 'stale_version'

/** Mirrors backend LockStatus: current edit-lock state from the caller's view. */
export interface LockStatus {
  locked: boolean
  locked_by: string | null
  locked_by_email: string | null
  expires_at: string | null
  /** True when the live lock is held by the caller. */
  is_me: boolean
}
