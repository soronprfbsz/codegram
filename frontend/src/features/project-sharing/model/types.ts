import type { ProjectRole } from '@/entities/project'

/** Role assignable when sharing — the owner role is never assigned. */
export type MemberRole = 'editor' | 'viewer'

/** Matches backend MemberRead: one project participant (owner included). */
export interface Member {
  user_id: string
  email: string
  role: ProjectRole
}
