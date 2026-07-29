import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties } from 'react'

/**
 * Single source of truth for the ERD top bar's control styling.
 *
 * Every top-bar control (table search, 정보 / 버전 기록 toggles, 가져오기 /
 * 내보내기 dropdown triggers) MUST be built from these tokens / components so
 * the whole bar reads as one design — same height, border, radius, surface,
 * text color, font size and icon size. Do NOT re-style controls per call site.
 *
 * shared layer: depended on by widgets (export-menu, table-search) and the
 * editor page alike.
 */

/** Control height (px) — every top-bar control is this tall. */
export const TOPBAR_CONTROL_HEIGHT = 32
/** lucide icon size for every top-bar control (leading icon + chevron). */
export const TOPBAR_ICON_SIZE = 14
/** lucide stroke width for every top-bar control icon. */
export const TOPBAR_ICON_STROKE = 2

/**
 * The shared visual "frame" — the box every control sits in. Exposed so
 * non-button controls (e.g. the search field wrapper) share the exact frame.
 */
export const topbarFrameStyle: CSSProperties = {
  height: TOPBAR_CONTROL_HEIGHT,
  boxSizing: 'border-box',
  borderRadius: 6,
  fontSize: 'var(--erd-fs-sm)',
  fontWeight: 500,
  fontFamily: 'inherit',
  lineHeight: 1,
  // 배경·테두리·글자색·hover·선택(aria-pressed) 상태는 `.erd-topbar-btn` CSS가
  // 토큰 기반으로 단일 정의한다(F1/F2). 인라인으로 색을 박지 않는다.
}

interface TopbarIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Toggle "on" state — paints the pressed background (also sets aria-pressed). */
  pressed?: boolean
}

/**
 * Square icon-only control — every control on the bar that is not the search
 * field or the mode switch (정보 / 버전 기록 토글, 가져오기 / 내보내기 트리거).
 * Pass a single lucide icon sized with {@link TOPBAR_ICON_SIZE} as the child,
 * and always an `aria-label` + `title`: with no label, those ARE the label.
 */
export const TopbarIconButton = forwardRef<HTMLButtonElement, TopbarIconButtonProps>(
  function TopbarIconButton({ pressed, style, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="erd-topbar-btn"
        aria-pressed={pressed}
        disabled={disabled}
        style={{
          ...topbarFrameStyle,
          width: TOPBAR_CONTROL_HEIGHT,
          display: 'grid',
          placeItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          ...style,
        }}
        {...rest}
      />
    )
  },
)
