import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast } from 'radix-ui'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

/**
 * App-wide transient notification — the single source of "something just
 * happened" feedback (F1). It renders at the app root (see `app/index.tsx`),
 * so it is a general-purpose control (F2), not an ERD-canvas surface: colours
 * and shape come from the shadcn semantic tokens/utility classes, matching
 * the sibling radix wrappers `dialog.tsx`/`popover.tsx`/`select.tsx`. Call
 * sites pass a message and nothing else.
 *
 * shared layer: depends on nothing upward (FSD rule). Built on the radix Toast
 * primitive that ships inside the already-installed `radix-ui` package, so this
 * adds no dependency.
 */

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Post a transient message. Throws outside <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside a <ToastProvider>')
  return api
}

/** How long a message stays up before it dismisses itself. */
const DURATION_MS = 3000
const ICON_SIZE = 16

// Module-scoped so ids stay unique across providers without a random source.
let nextId = 0

/** Icon per kind — semantic accent color classes only (F5), no raw hex. */
const Icon: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const accentClass: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-muted-foreground',
}

const viewportClassName =
  'fixed bottom-4 right-4 z-50 m-0 flex w-80 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none'

const rootClassName =
  'grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'

const closeClassName =
  'grid place-items-center rounded border-0 bg-transparent p-0.5 text-muted-foreground cursor-pointer hover:text-foreground'

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    setItems((prev) => [...prev, { id: (nextId += 1), kind, message }])
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      <Toast.Provider swipeDirection="right" duration={DURATION_MS}>
        {children}
        {items.map((item) => {
          const Glyph = Icon[item.kind]
          return (
            <Toast.Root
              key={item.id}
              data-slot="toast"
              data-testid="toast"
              data-kind={item.kind}
              className={rootClassName}
              onOpenChange={(open) => {
                if (!open) {
                  setItems((prev) => prev.filter((i) => i.id !== item.id))
                }
              }}
            >
              <Glyph size={ICON_SIZE} className={accentClass[item.kind]} aria-hidden />
              <Toast.Title data-slot="toast-title">{item.message}</Toast.Title>
              <Toast.Close
                data-slot="toast-close"
                aria-label={t('common.close')}
                className={closeClassName}
              >
                <X size={14} aria-hidden />
              </Toast.Close>
            </Toast.Root>
          )
        })}
        <Toast.Viewport
          data-slot="toast-viewport"
          label={t('toast.viewportLabel')}
          className={viewportClassName}
        />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
