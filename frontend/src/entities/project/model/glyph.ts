/** Project glyph/color palette constants (entities layer: no upward imports). */

export type ProjectColorKey =
  | 'blue'
  | 'purple'
  | 'teal'
  | 'orange'
  | 'red'
  | 'slate'

/** Color key -> CSS color value (reuses the ERD categorical palette hexes). */
export const PROJECT_COLORS: Record<ProjectColorKey, string> = {
  blue: '#1570EF',
  purple: '#6938EF',
  teal: '#0E9384',
  orange: '#DC6803',
  red: '#B42318',
  slate: '#475467',
}

export const PROJECT_COLOR_KEYS = Object.keys(
  PROJECT_COLORS,
) as ProjectColorKey[]

export const DEFAULT_PROJECT_COLOR: ProjectColorKey = 'slate'

/** Resolve a stored color (key or null) to a CSS color, with slate fallback. */
export function resolveProjectColor(
  color: string | null | undefined,
): string {
  if (color && color in PROJECT_COLORS) {
    return PROJECT_COLORS[color as ProjectColorKey]
  }
  return PROJECT_COLORS[DEFAULT_PROJECT_COLOR]
}

/** Quick-pick emoji palette shown in the glyph picker. */
export const PROJECT_GLYPH_PALETTE: string[] = [
  '🗄️', '📊', '📈', '🛒', '👥', '🔑', '☁️', '📦',
  '🏷️', '🧩', '🌐', '⚙️', '🚀', '📝', '🧮', '🗂️',
  '🔒', '💾', '🧱', '🪣', '🎯', '📁', '🧪', '🔧',
]

/** Max stored glyph length (length, not grapheme count). Matches backend. */
export const GLYPH_MAX_LENGTH = 8
