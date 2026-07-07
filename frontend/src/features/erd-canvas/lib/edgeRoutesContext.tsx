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
import { useStore, type ReactFlowState } from '@xyflow/react'
import type { ObstacleNode, Point, Rect } from './routeOrthogonal'
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
// Shared obstacle-node list for per-edge A* (buildObstacles). Built ONCE per
// geometry change here instead of each of the ~440 edges rebuilding it from
// nodeLookup on every re-route.
const ObstacleNodesCtx = createContext<ObstacleNode[]>([])

const samePolyline = (a: Point[] | undefined, b: Point[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

/** Content equality for a list of rects — keeps the useStore selector output
 * stable across unrelated store updates (pan/zoom/select), so it only changes
 * when card/group geometry actually moves. */
const rectsEqual = (a: Rect[], b: Rect[]): boolean =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.x === b[i].x && r.y === b[i].y && r.width === b[i].width && r.height === b[i].height,
  )

/** Content equality for the shared obstacle-node list — keeps the selector
 * output stable across unrelated store updates (same rule as rectsEqual). */
const obstacleNodesEqual = (a: ObstacleNode[], b: ObstacleNode[]): boolean =>
  a.length === b.length &&
  a.every((n, i) => {
    const m = b[i]
    return (
      n.id === m.id &&
      n.type === m.type &&
      n.parentId === m.parentId &&
      n.rect.x === m.rect.x &&
      n.rect.y === m.rect.y &&
      n.rect.width === m.rect.width &&
      n.rect.height === m.rect.height
    )
  })

export function EdgeRoutesProvider({ children }: { children: ReactNode }) {
  const rawRef = useRef<Map<string, Point[]>>(new Map())
  // Per-edge bundle key (`${targetTable}|${referencedPK}`) — same key ⇒ same
  // relationship bundle (merged onto one forked trunk; never spread apart).
  const bundleRef = useRef<Map<string, string>>(new Map())
  const [version, setVersion] = useState(0)

  // 후처리 가로지름 검사용 카드 장애물(테이블/enum/sticky). React Flow의
  // nodeLookup Map은 참조가 안정(in-place 변경)이라 `useMemo([nodeLookup])`로는
  // 갱신을 감지하지 못한다(첫 렌더의 빈 상태로 고정됨). 그래서 selector로 rect를
  // 직접 뽑고, 내용 기반 equality로 비교한다 — 노드가 추가/이동/측정돼 rect가
  // 실제로 바뀔 때만 새 배열을 내보내(=`adjusted` 재계산 유발) 후처리가 최신 카드
  // 기준으로 가로지름을 재검사한다. rect가 그대로면 같은 참조를 유지해(equality
  // true) pan/zoom/선택 같은 무관한 store 업데이트로는 재렌더하지 않는다.
  const obstacles = useStore(
    useCallback((s: ReactFlowState): Rect[] => {
      const rects: Rect[] = []
      for (const n of s.nodeLookup.values()) {
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
    }, []),
    rectsEqual,
  )

  // Group box rects — same subscribe pattern. Targets inside a group get the
  // intra-group "spine bus" (mergeBundleRoutes 2-level routing). Group dims come
  // from style (packGroupedLayout sets them; measured is often empty for groups).
  const groupBoxes = useStore(
    useCallback((s: ReactFlowState): Rect[] => {
      const rects: Rect[] = []
      for (const n of s.nodeLookup.values()) {
        if (n.type !== 'group') continue
        const pos = n.internals.positionAbsolute
        const w = n.measured?.width ?? (n.style?.width as number | undefined)
        const h = n.measured?.height ?? (n.style?.height as number | undefined)
        if (w == null || h == null) continue
        rects.push({ x: pos.x, y: pos.y, width: w, height: h })
      }
      return rects
    }, []),
    rectsEqual,
  )

  // Shared obstacle-node list for per-edge A* (buildObstacles filters endpoint
  // groups per edge, but the base list is the same for all). Built once here on
  // geometry change; width/height fallback matches the per-edge build exactly
  // (measured ?? style ?? 240/80) so routing inputs are IDENTICAL.
  const obstacleNodes = useStore(
    useCallback((s: ReactFlowState): ObstacleNode[] => {
      const out: ObstacleNode[] = []
      for (const n of s.nodeLookup.values()) {
        if (n.type !== 'table' && n.type !== 'enum' && n.type !== 'sticky' && n.type !== 'group')
          continue
        const pos = n.internals.positionAbsolute
        out.push({
          id: n.id,
          type: n.type,
          parentId: n.parentId,
          rect: {
            x: pos.x,
            y: pos.y,
            width: n.measured?.width ?? (n.style?.width as number | undefined) ?? 240,
            height: n.measured?.height ?? (n.style?.height as number | undefined) ?? 80,
          },
        })
      }
      return out
    }, []),
    obstacleNodesEqual,
  )

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

  // Recompute when EITHER edges re-register (`version`) OR the obstacle set
  // changes (`obstacles` — nodes added/moved/measured). The latter is essential:
  // on first paint nodeLookup may be unmeasured so `obstacles` is empty; once it
  // populates, the post-passes must re-run to catch buses that would now cross a
  // card. Two passes: (1) BUNDLE same-PK edges onto one forked trunk, then (2)
  // SPREAD distinct bundles off any shared corridor (same-bundle segments share a
  // track so the merged trunk survives).
  const adjusted = useMemo(() => {
    void version
    const keyOf = (id: string) => bundleRef.current.get(id) ?? null
    const raw = [...rawRef.current].map(([id, points]) => ({ id, points }))
    const merged = mergeBundleRoutes(raw, keyOf, obstacles, groupBoxes)
    const mergedRoutes = raw.map(({ id }) => ({ id, points: merged.get(id)! }))
    return spreadEdgeRoutes(mergedRoutes, SPREAD_GAP, keyOf, obstacles, groupBoxes)
  }, [version, obstacles, groupBoxes])

  return (
    <RegisterCtx.Provider value={register}>
      <ObstacleNodesCtx.Provider value={obstacleNodes}>
        <AdjustedCtx.Provider value={adjusted}>{children}</AdjustedCtx.Provider>
      </ObstacleNodesCtx.Provider>
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

/** Shared obstacle-node list (built once per geometry change) for per-edge A*. */
export function useObstacleNodes(): ObstacleNode[] {
  return useContext(ObstacleNodesCtx)
}
