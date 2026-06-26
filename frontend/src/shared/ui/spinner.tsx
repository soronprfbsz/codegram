import { Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export interface SpinnerProps {
  /** Optional label shown under the spinner (centered loading state). */
  label?: string
  size?: number
  className?: string
}

/**
 * Shared loading indicator — an animated spinner with an optional label.
 * Single source for "작업 중/불러오는 중" states across the app (F1/G1).
 */
export function Spinner({ label, size = 22, className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-2.5', className)}
    >
      <Loader2 size={size} className="animate-spin text-primary" strokeWidth={2.25} />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  )
}
