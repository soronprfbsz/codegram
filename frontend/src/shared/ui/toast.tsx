import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Toast } from 'radix-ui'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

/**
 * App-wide transient notification — the single source of "something just
 * happened" feedback (F1). Surfaces, colours and spacing come from the
 * `--erd-*` tokens only; call sites pass a message and nothing else.
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

const accent: Record<ToastKind, string> = {
  success: 'var(--erd-success)',
  error: 'var(--erd-error)',
  info: 'var(--erd-text-3)',
}

const Icon: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const viewportStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 320,
  maxWidth: 'calc(100vw - 32px)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  outline: 'none',
}

function rootStyle(kind: ToastKind): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'var(--erd-surface)',
    border: '1px solid var(--erd-border)',
    borderLeft: `3px solid ${accent[kind]}`,
    boxShadow: 'var(--erd-shadow)',
    color: 'var(--erd-text)',
    fontSize: 'var(--erd-fs-sm)',
  }
}

const closeStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  background: 'transparent',
  border: 'none',
  padding: 2,
  cursor: 'pointer',
  color: 'var(--erd-text-3)',
}

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
              data-testid="toast"
              data-kind={item.kind}
              style={rootStyle(item.kind)}
              onOpenChange={(open) => {
                if (!open) {
                  setItems((prev) => prev.filter((i) => i.id !== item.id))
                }
              }}
            >
              <Glyph size={ICON_SIZE} color={accent[item.kind]} aria-hidden />
              <Toast.Title>{item.message}</Toast.Title>
              <Toast.Close aria-label={t('common.close')} style={closeStyle}>
                <X size={14} aria-hidden />
              </Toast.Close>
            </Toast.Root>
          )
        })}
        <Toast.Viewport style={viewportStyle} />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
