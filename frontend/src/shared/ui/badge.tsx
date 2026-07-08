import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/shared/lib/utils'

/**
 * Minimal status/label pill. Single source for small inline labels (e.g. a
 * project's "shared" marker) so their shape/color come from one place, not
 * ad-hoc inline styles at each call site (frontend rule F1).
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        // Light: a solid accent chip (bg-primary/10 amber-on-white was too low
        // contrast to read). Dark: keep the softer tinted look, which reads well
        // on the dark surface. Both use the design-system primary token pair so
        // contrast holds in either theme.
        default:
          'border-transparent bg-primary text-primary-foreground dark:bg-primary/15 dark:text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
