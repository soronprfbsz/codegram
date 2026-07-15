/**
 * Account DTOs mirroring backend pydantic schemas (ADR-0016).
 * entities layer: model types only, no imports upward (FSD rule).
 */

/** Fixed system role catalog (ADR-0016: exactly admin/user). */
export type RoleName = 'admin' | 'user'

/** Matches backend AccountRead: one row of the admin-facing account list. */
export interface Account {
  id: string
  email: string
  role_name: string | null
}

/** Matches backend AccountMe: the caller's own identity + resolved RBAC state. */
export interface AccountMe {
  id: string
  email: string
  role_name: string | null
  permissions: string[]
  must_change_password: boolean
}

/** Matches backend PasswordResetRead: the one-time plaintext temp password. */
export interface PasswordResetResult {
  temp_password: string
}

/** Matches backend AdminContact: one admin's contact email (public list). */
export interface AdminContact {
  email: string
}
