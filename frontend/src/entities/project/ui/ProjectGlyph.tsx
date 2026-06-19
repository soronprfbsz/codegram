import { Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { resolveProjectColor } from '../model/glyph'

/**
 * Pure display badge for a project's glyph. Renders the stored glyph string
 * (emoji or short text) centered on a colored chip; falls back to a neutral
 * Database chip when no glyph is set. No state, no mutations — safe to reuse
 * in both the dashboard (feature) and the sidebar (widget).
 */
export function ProjectGlyph({
  glyph,
  color,
  size = 32,
  className,
}: {
  glyph?: string | null
  color?: string | null
  size?: number
  className?: string
}) {
  const hasGlyph = !!glyph && glyph.trim().length > 0
  const inner = Math.round(size * 0.5)

  if (!hasGlyph) {
    return (
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground',
          className,
        )}
        style={{ width: size, height: size }}
      >
        <Database size={inner} />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md leading-none text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: inner,
        backgroundColor: resolveProjectColor(color),
      }}
    >
      {glyph}
    </span>
  )
}
