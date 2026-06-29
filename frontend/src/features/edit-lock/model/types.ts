/** Mirrors backend LockStatus: current edit-lock state from the caller's view. */
export interface LockStatus {
  locked: boolean
  locked_by: string | null
  locked_by_email: string | null
  expires_at: string | null
  /** True when the live lock is held by the caller. */
  is_me: boolean
}
