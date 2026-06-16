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
import { useStore } from '@xyflow/react'
import type { Point, Rect } from './routeOrthogonal'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'
import { mergeBundleRoutes } from './mergeBundleRoutes'

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

/**
 * Perpendicular spacing between DIFFERENT-PK lines that share a corridor. Sized
 * for a clearly-visible gap (a bit above the 14px target-approach LANE_GAP) so
 * distinct relationships never read as one thick line. Same-PK bundles are NOT
 * affected — they share a track regardless of this value.
 */
const SPREAD_GAP = 18

type RegisterFn = (
  id: string,
  points: Point[] | null,
  bundleKey?: string | null,
) => void

const RegisterCtx = createContext<RegisterFn | null>(null)
const AdjustedCtx = createContext<Map<string, Point[]>>(new Map())

const samePolyline = (a: Point[] | undefined, b: Point[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

export function EdgeRoutesProvider({ children }: { children: ReactNode }) {
  const rawRef = useRef<Map<string, Point[]>>(new Map())
  // Per-edge bundle key (`${targetTable}|${referencedPK}`) — same key ⇒ same
  // relationship bundle (merged onto one forked trunk; never spread apart).
  const bundleRef = useRef<Map<string, string>>(new Map())
  const [version, setVersion] = useState(0)

  // 후처리 가로지름 검사용 카드 장애물(테이블/enum/sticky). ReactFlowProvider
  // 안이라 nodeLookup을 구독한다 — 이 Map 참조는 pan/zoom에는 안정하고 노드가
  // 바뀔 때만 변하므로(RelationEdge와 동일), 매 store 업데이트가 아니라 노드
  // 변경 시에만 rect를 재파생한다. ref에 담아 기존 version recompute 시점에
  // 최신값을 쓴다(노드 이동 시 엣지 재등록 → bump 발생).
  const nodeLookup = useStore((s) => s.nodeLookup)
  const obstaclesRef = useRef<Rect[]>([])
  obstaclesRef.current = useMemo(() => {
    const rects: Rect[] = []
    for (const n of nodeLookup.values()) {
      if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky') continue
      const pos = n.internals.positionAbsolute
      rects.push({
        x: pos.x,
        y: pos.y,
        width: n.measured?.width ?? 240,
        height: n.measured?.height ?? 80,
      })
    }
    return rects
  }, [nodeLookup])

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
    (id, points, bundleKey) => {
      if (points == null) {
        bundleRef.current.delete(id)
        if (rawRef.current.delete(id)) bump()
        return
      }
      if (bundleKey != null) bundleRef.current.set(id, bundleKey)
      else bundleRef.current.delete(id)
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
  // Two passes: (1) BUNDLE same-PK edges onto one forked trunk, then (2) SPREAD
  // distinct bundles off any shared corridor (skipping same-bundle segments so
  // the merged trunk survives).
  const adjusted = useMemo(() => {
    void version
    const keyOf = (id: string) => bundleRef.current.get(id) ?? null
    const raw = [...rawRef.current].map(([id, points]) => ({ id, points }))
    const obstacles = obstaclesRef.current
    const merged = mergeBundleRoutes(raw, keyOf, obstacles)
    const mergedRoutes = raw.map(({ id }) => ({ id, points: merged.get(id)! }))
    return spreadEdgeRoutes(mergedRoutes, SPREAD_GAP, keyOf, obstacles)
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
