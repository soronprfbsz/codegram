import { Database } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { resolveProjectColor, resolveProjectBgColor, resolveGlyphIcon } from '../model/glyph'

/**
 * Pure display badge for a project's glyph. `color` is the icon/text color;
 * `bgColor` is the background. When `bgColor` is null it falls back to a soft
 * tint of the icon color (backward compatible with single-color projects);
 * 'transparent' means no fill. Renders the stored glyph (lucide icon token /
 * emoji / short text) or a neutral Database fallback. No state, no mutations.
 */
export function ProjectGlyph({
  glyph,
  color,
  bgColor,
  size = 32,
  className,
}: {
  glyph?: string | null
  color?: string | null
  /** Background color key; null → tint of `color`, 'transparent' → no fill. */
  bgColor?: string | null
  size?: number
  className?: string
}) {
  // 아이콘/글씨색. 'transparent'(또는 비정상)면 가독성 있는 중립색으로.
  const iconColor =
    !color || color === 'transparent' ? 'var(--erd-text-2)' : resolveProjectColor(color)
  // 배경: null → 아이콘색 틴트(하위호환), 'transparent' → 없음, 그 외 → 단색.
  const bg =
    bgColor == null
      ? `color-mix(in srgb, ${iconColor} 14%, transparent)`
      : bgColor === 'transparent'
        ? 'transparent'
        : resolveProjectBgColor(bgColor)

  const hasGlyph = !!glyph && glyph.trim().length > 0
  const inner = Math.round(size * 0.5)

  // 글리프 없음 → 중립 Database 아이콘(배경/아이콘색 규칙은 동일 적용).
  if (!hasGlyph) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-md', className)}
        style={{ width: size, height: size, backgroundColor: bg }}
      >
        <Database size={inner} color={iconColor} />
      </span>
    )
  }

  // 1순위: 아이콘 토큰(`@key`)은 선택한 아이콘색으로 다시 그려지는 lucide 벡터.
  const Icon = resolveGlyphIcon(glyph)
  if (Icon) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-md', className)}
        style={{ width: size, height: size, backgroundColor: bg }}
      >
        <Icon size={Math.round(size * 0.55)} color={iconColor} strokeWidth={2} />
      </span>
    )
  }

  // 레거시 이모지: 자기 색 유지(색 강제 안 함), 배경만 적용.
  const isEmoji = /\p{Extended_Pictographic}/u.test(glyph!)
  if (isEmoji) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-md leading-none', className)}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.58),
          backgroundColor: bg,
        }}
      >
        {glyph}
      </span>
    )
  }

  // 직접 입력한 글자: 글씨색 = 아이콘/글씨색, 배경 = bg.
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-md leading-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: inner,
        fontWeight: 600,
        color: iconColor,
        backgroundColor: bg,
      }}
    >
      {glyph}
    </span>
  )
}
