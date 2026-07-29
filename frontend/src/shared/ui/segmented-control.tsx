import type { ReactNode } from 'react'
import { TOPBAR_CONTROL_HEIGHT } from './topbar-control'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Leading lucide icon, sized by the caller (TOPBAR_ICON_SIZE on the bar). */
  icon?: ReactNode
  disabled?: boolean
  /** Native tooltip — use it to say WHY a segment is disabled. */
  title?: string
}

export interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  /** Names the group for screen readers, e.g. "편집 모드 전환". */
  ariaLabel: string
  /** `${testId}` on the group, `${testId}-${value}` on each segment. */
  testId?: string
}

/**
 * Two-or-more-way mode switch — the app's single source for "pick one of these
 * states", as opposed to ConfirmDialog's "decide" or a button's "do".
 *
 * A switch shows the state you are NOT in as well as the one you are, which a
 * badge plus a button cannot: those say one thing twice and leave the reader to
 * work out which is the label and which is the action. All colour, height and
 * radius come from the --erd-* tokens via .erd-segmented in index.css, so it
 * sits at exactly the same height as every other top-bar control (F1/F2).
 *
 * The selected thumb is a real sliding element rather than a background swap:
 * with a mode switch, seeing WHICH WAY you moved is the feedback.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  testId,
}: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div
      className="erd-segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{ height: TOPBAR_CONTROL_HEIGHT }}
    >
      <span
        className="erd-segmented-thumb"
        aria-hidden
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          data-testid={testId ? `${testId}-${o.value}` : undefined}
          className="erd-segmented-item"
          onClick={() => {
            if (o.value !== value) onChange(o.value)
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
