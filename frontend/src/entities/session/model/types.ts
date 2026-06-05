/**
 * User DTO returned by GET /api/users/me.
 * Matches the fastapi-users UserRead schema (UUID id + flags).
 */
export interface User {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
}
