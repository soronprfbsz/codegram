/**
 * Project-snapshot DTOs mirroring the backend pydantic schemas (ADR-0014).
 * entities layer: model types only, no imports upward (FSD rule).
 */

/** Concrete snapshot kind stored on the row. */
export type SnapshotKind = 'auto_fine' | 'auto_coarse' | 'manual'

/** UI grouping used by the history panel tabs (maps to one or more kinds). */
export type SnapshotGroup = 'auto' | 'manual'

/** Matches backend ProjectSnapshotMeta: the lightweight list/calendar row. */
export interface SnapshotMeta {
  id: string
  project_id: string
  kind: SnapshotKind
  label: string | null
  content_hash: string
  created_at: string
}

/** Matches backend ProjectSnapshotRead: meta + the restorable body. */
export interface SnapshotFull extends SnapshotMeta {
  dbml_text: string
  layout: Record<string, unknown>
}

/** Matches backend SnapshotCalendarDay: one local date with a snapshot count. */
export interface SnapshotCalendarDay {
  /** Local date as YYYY-MM-DD. */
  date: string
  count: number
}
