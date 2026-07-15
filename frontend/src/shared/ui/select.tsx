import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Minimal native <select> styled to match Input's control shape (height,
 * border, radius, focus ring) so form controls stay one visual family (F1) —
 * do not restyle a bare <select> at the call site.
 *
 * The native option popup is painted by the browser from the control's own
 * color/background, so an implicit (transparent/inherited) control leaves the
 * dropdown white-on-white in dark theme. We therefore pin readable design
 * tokens on BOTH the control (text-foreground) and the options
 * ([&>option] → popover surface; :checked → accent), so plain usage renders
 * correctly in every theme without any call-site styling.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-sm text-foreground shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground [&>option:checked]:bg-accent [&>option:checked]:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Select }
