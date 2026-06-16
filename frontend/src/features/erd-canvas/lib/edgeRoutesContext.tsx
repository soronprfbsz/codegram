import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Point } from './routeOrthogonal'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'

/**
 * Shared collector that spreads coincidentally-overlapping edge routes apart.
 *
 * Each RelationEdge REGISTERS its raw (per-edge A*) polyline here; the provider
 * runs the pure `spreadEdgeRoutes` over ALL registered routes and exposes the
 * ADJUSTED map (overlapping interior segments fanned onto parallel tracks).
 * RelationEdge then renders its adjusted polyline, falling back to its raw one.
 *
 * Two SEPARATE contexts on purpose: `register` is a stable callback (so an
 * edge's registration effect does NOT re-run when the adjusted map changes),
 * while `adjusted` changes every settle (consumers re-render to read their new
 * route). Recompute is signalled by a `version` counter — the route data itself
 * lives in a ref, so registering does not re-render until the rAF-batched bump.
 *
 * features/erd-canvas/lib — pure-fn + React context only (no upward imports).
 */

type RegisterFn = (id: string, points: Point[] | null) => void

const RegisterCtx = createContext<RegisterFn | null>(null)
const AdjustedCtx = createContext<Map<string, Point[]>>(new Map())

const samePolyline = (a: Point[] | undefined, b: Point[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

export function EdgeRoutesProvider({ children }: { children: ReactNode }) {
  const rawRef = useRef<Map<string, Point[]>>(new Map())
  const [version, setVersion] = useState(0)
  const frameRef = useRef<number | null>(null)

  // Coalesce a burst of register() calls (e.g. all edges mounting) into ONE
  // recompute on the next animation frame.
  const bump = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setVersion((v) => v + 1)
    })
  }, [])

  // Stable across renders (deps: only the stable bump) so registration effects
  // in edges don't re-run when the adjusted map changes.
  const register = useCallback<RegisterFn>(
    (id, points) => {
      if (points == null) {
        if (rawRef.current.delete(id)) bump()
        return
      }
      if (samePolyline(rawRef.current.get(id), points)) return
      rawRef.current.set(id, points)
      bump()
    },
    [bump],
  )

  // Cancel a pending frame on unmount (avoid a setState after unmount).
  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
  }, [])

  // `version` is the recompute trigger; the route data is read from the ref.
  const adjusted = useMemo(() => {
    void version
    return spreadEdgeRoutes([...rawRef.current].map(([id, points]) => ({ id, points })))
  }, [version])

  return (
    <RegisterCtx.Provider value={register}>
      <AdjustedCtx.Provider value={adjusted}>{children}</AdjustedCtx.Provider>
    </RegisterCtx.Provider>
  )
}

/** Stable registrar — safe to use in an effect dep list (identity never changes). */
export function useRegisterRoute(): RegisterFn | null {
  return useContext(RegisterCtx)
}

/** The current spread (adjusted) route map; changes each settle. */
export function useAdjustedRoutes(): Map<string, Point[]> {
  return useContext(AdjustedCtx)
}
