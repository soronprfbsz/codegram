/**
 * Project DTOs mirroring the backend pydantic schemas.
 * entities layer: model types only, no imports upward (FSD rule).
 */

/** A user's role on a project. Owner is implicit (project ownership); editor
 *  and viewer are granted via sharing (ADR-0015). */
export type ProjectRole = 'owner' | 'editor' | 'viewer'

/** Matches backend ProjectRead: GET /api/projects/{id} response. */
export interface Project {
  id: string
  user_id: string
  name: string
  dbml_text: string
  layout: Record<string, unknown>
  glyph: string | null
  /** Icon/text color (categorical key). */
  color: string | null
  /** Background color (categorical key incl. 'transparent'); null → tint of color. */
  bg_color: string | null
  /** Optimistic-concurrency counter; echoed on content-write PATCHes. */
  version: number
  /** Caller's role on this project (list/get/create responses; null on actions). */
  role: ProjectRole | null
  /** Owner's email — for the "shared by" badge (null on action responses). */
  owner_email: string | null
  created_at: string
  updated_at: string
}

/** Matches backend ProjectCreate: POST /api/projects body. */
export interface ProjectCreatePayload {
  name: string
  dbml_text?: string
  layout?: Record<string, unknown>
}

/** Matches backend ProjectUpdate: PATCH /api/projects/{id} body (all optional). */
export interface ProjectUpdatePayload {
  name?: string
  dbml_text?: string
  layout?: Record<string, unknown>
  glyph?: string
  color?: string
  bg_color?: string
  /** Version the edit was based on — content writes reject if stale (409). */
  version?: number
}
