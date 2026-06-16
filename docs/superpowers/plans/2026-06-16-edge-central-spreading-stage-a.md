# Edge Central Spreading (Stage A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop DISTINCT edges (different source AND target) that coincidentally route through the same gutter from overlapping into one line, by spreading overlapping collinear segments onto parallel tracks across ALL edges.

**Architecture:** Each `RelationEdge` keeps computing its own raw orthogonal route (it already gets endpoint coords from React Flow). A new context collects every auto-routed edge's raw polyline into a shared map; a pure `spreadEdgeRoutes` pass derives adjusted polylines (overlapping interior segments nudged apart); each `RelationEdge` renders its adjusted polyline. This avoids re-deriving RF endpoint coordinates (no fragile `@xyflow/system` import) and keeps routing per-edge — only the SPREAD is central.

**Tech Stack:** React + @xyflow/react v12, Vitest, Playwright. Pure spreader in `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts`; shared store in `frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx`; wiring in `RelationEdge.tsx` + `ErdCanvas.tsx`. Tests in docker: `docker compose -p codegram exec -T frontend npm run test:run -- <path>`.

**Spec:** `docs/superpowers/specs/2026-06-16-edge-overlap-spreading-design.md` (Stage A). Builds on Stage B (`sourceTrunkOffset`) + STEP_OUT, already on main.

**Scope:** auto-routed FK edges only. Manual-waypoint edges and enum links are EXCLUDED from spreading (render exactly as today). Endpoint stub segments (first/last) are never shifted (they stay anchored to the handle).

---

## File Structure

**Create:**
- `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts` — pure: given all edges' polylines, return adjusted polylines with overlapping interior collinear segments spread onto parallel tracks.
- `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts` — unit tests.
- `frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx` — React context: collects raw routes, exposes the spread (adjusted) map.

**Modify:**
- `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` — register raw route + render adjusted route from context.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` — wrap the canvas in the provider.
- `frontend/e2e/edge-path.spec.ts` — E2E asserting two independent edges no longer share an identical vertical corridor segment.

---

## Task 1: pure `spreadEdgeRoutes`

**Files:**
- Create: `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts`
- Test: `frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`

Interface:
```ts
import type { Point } from './routeOrthogonal'
export interface EdgeRoute { id: string; points: Point[] }
/** Spread overlapping INTERIOR collinear segments across edges onto parallel
 *  tracks. Endpoint stub segments (index 0 and the last) are never moved.
 *  Returns a NEW map id -> adjusted points; inputs are not mutated. */
export function spreadEdgeRoutes(routes: EdgeRoute[], gap?: number): Map<string, Point[]>
```

Algorithm (document inline):
1. Deep-copy each route's points (never mutate input).
2. Enumerate INTERIOR segments only: for route with points `p0..pn`, segments `i = 1 .. n-2` (skip `0` and `n-1`, the anchored stubs). Each segment → `{ id, segIdx, orient: 'h'|'v', fixed, lo, hi }` where for a vertical segment `fixed = x`, `[lo,hi] = sorted(y0,y1)`; horizontal mirror.
3. Group segments with the SAME `orient`, the SAME `fixed` (exact integer equality — routes come from an integer grid), and OVERLAPPING `[lo,hi]` ranges (`aLo < bHi && bLo < aHi`). Group only segments from DIFFERENT edge ids (two segments of one edge never spread against each other). Transitive grouping (union-find or BFS over the overlap relation).
4. For each group of size `k ≥ 2`: order members deterministically by `id` then `segIdx`; assign track offset `(j - (k-1)/2) * gap` (default `gap = 12`). Shift that segment's `fixed` by its offset — i.e. move BOTH its endpoint vertices perpendicular (vertical seg: both vertices' `x += offset`; horizontal: both `y += offset`). Because the neighbour segments are perpendicular and share those vertices, moving the vertices keeps the polyline orthogonal (the neighbours just change length).
5. Return `Map<id, Point[]>`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'
import type { Point } from './routeOrthogonal'

const xs = (pts: Point[]) => pts.map((p) => p.x)
const isOrtho = (pts: Point[]) =>
  pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y)

describe('spreadEdgeRoutes', () => {
  it('returns inputs unchanged when nothing overlaps', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }])
    expect(out.get('a')).toEqual(a)
  })

  it('does NOT move endpoint stub segments (anchors stay put)', () => {
    // Two edges whose FIRST segment (stub) is collinear must keep their anchors.
    const a: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 80 }, { x: 200, y: 80 }]
    const b: Point[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 90 }, { x: 200, y: 90 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }])
    expect(out.get('a')![0]).toEqual({ x: 0, y: 0 }) // anchor unmoved
    expect(out.get('b')![0]).toEqual({ x: 0, y: 0 })
    expect(out.get('a')![out.get('a')!.length - 1]).toEqual({ x: 200, y: 80 }) // target anchor unmoved
  })

  it('spreads two distinct edges sharing an interior vertical corridor onto different X', () => {
    // Both run a long interior vertical at x=100 over overlapping Y; they must split.
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const b: Point[] = [{ x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 250 }, { x: 300, y: 250 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }, { id: 'b', points: b }], 12)
    const aVx = out.get('a')![1].x // interior vertical x for edge a
    const bVx = out.get('b')![1].x
    expect(aVx).not.toBe(bVx) // fanned apart
    expect(Math.abs(aVx - bVx)).toBe(12)
    expect(isOrtho(out.get('a')!)).toBe(true)
    expect(isOrtho(out.get('b')!)).toBe(true)
    // endpoints unchanged
    expect(out.get('a')![0]).toEqual({ x: 0, y: 0 })
    expect(out.get('a')![3]).toEqual({ x: 300, y: 200 })
  })

  it('leaves a single edge untouched even if its own segments are collinear', () => {
    const a: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }]
    const out = spreadEdgeRoutes([{ id: 'a', points: a }])
    expect(out.get('a')).toEqual(a)
  })
})
```

- [ ] **Step 2: Run → fail** (`docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts`). Expected: module not found / function undefined.

- [ ] **Step 3: Implement `spreadEdgeRoutes.ts`** per the algorithm above. Use a plain BFS/union-find over the overlap relation; integer equality for `fixed`. Default `gap = 12`. Keep it pure (deep-copy points first).

- [ ] **Step 4: Run → pass.** Iterate on the implementation until all 4 tests pass. If the two-edge spread test's `aVx`/`bVx` symmetric offsets land differently than `±6` around the shared `x=100` (i.e. `94` and `106`), assert the DIFFERENCE (`abs === 12`) and `not.toBe` rather than absolute values — keep the "fanned apart + orthogonal + anchors fixed" intent.

- [ ] **Step 5: Type-check.** `docker compose -p codegram exec -T frontend npm run type-check` → clean.

- [ ] **Step 6: Commit.**
```bash
git add frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.ts frontend/src/features/erd-canvas/lib/spreadEdgeRoutes.test.ts
git commit -m "feat(erd-canvas): pure spreadEdgeRoutes (fan overlapping interior segments apart)"
```

---

## Task 2: shared-store integration

**Files:**
- Create: `frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx`
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`, `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`

- [ ] **Step 1: Create the context provider**

`edgeRoutesContext.tsx`:
```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Point } from './routeOrthogonal'
import { spreadEdgeRoutes } from './spreadEdgeRoutes'

interface EdgeRoutesValue {
  register: (id: string, points: Point[] | null) => void
  adjusted: Map<string, Point[]>
}
const Ctx = createContext<EdgeRoutesValue | null>(null)

const samePolyline = (a: Point[] | undefined, b: Point[] | null): boolean => {
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.x === b[i].x && p.y === b[i].y)
}

export function EdgeRoutesProvider({ children }: { children: ReactNode }) {
  const rawRef = useRef<Map<string, Point[]>>(new Map())
  const [version, setVersion] = useState(0)
  const frameRef = useRef<number | null>(null)
  const bump = useCallback(() => {
    if (frameRef.current != null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      setVersion((v) => v + 1)
    })
  }, [])
  const register = useCallback(
    (id: string, points: Point[] | null) => {
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
  const adjusted = useMemo(() => {
    void version
    return spreadEdgeRoutes([...rawRef.current].map(([id, points]) => ({ id, points })))
  }, [version])
  const value = useMemo<EdgeRoutesValue>(() => ({ register, adjusted }), [register, adjusted])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEdgeRoutes(): EdgeRoutesValue | null {
  return useContext(Ctx)
}
```

- [ ] **Step 2: Wrap the canvas in ErdCanvas**

In `ErdCanvas.tsx`, import `EdgeRoutesProvider` and wrap the `<ReactFlow>` subtree (find where `<ReactFlow ...>` is rendered) so all edges share one provider. Place it INSIDE `ReactFlowProvider`/the existing providers, around the `<ReactFlow>` element.

- [ ] **Step 3: Register + consume in RelationEdge**

In `RelationEdge.tsx`:
- After `renderedPoints` (the final auto polyline used for the path) is computed, register it and read the adjusted version. Add near the top: `const edgeRoutes = useEdgeRoutes()`.
- Add an effect: `useEffect(() => { edgeRoutes?.register(id, manualWaypoints ? null : (orthoPoints ?? null)); return () => edgeRoutes?.register(id, null) }, [edgeRoutes, id, manualWaypoints, orthoPoints])`.
- Where the rendered auto polyline is chosen, prefer the adjusted: `const adjusted = edgeRoutes?.adjusted.get(id); const autoPoints = adjusted ?? orthoPoints`. Use `autoPoints` for the rendered path / `renderedPoints` reporting (keep manual-path branch unchanged).
- Read the EXACT current variable names from the file first (e.g. `orthoPoints`, `renderedPoints`, `edgePath`) and wire `autoPoints` into the same place `orthoPoints` currently feeds, so segment-drag/reporting still work.

- [ ] **Step 4: Type-check + erd-canvas unit tests**

`docker compose -p codegram exec -T frontend npm run type-check` → clean.
`docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas` → PASS. Single-edge RelationEdge fixtures have no provider (useEdgeRoutes returns null) → falls back to `orthoPoints`, so existing tests are unchanged. (If a test renders RelationEdge and now warns about missing context, the null-guard `edgeRoutes?.` keeps it working.)

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/features/erd-canvas/lib/edgeRoutesContext.tsx frontend/src/features/erd-canvas/ui/RelationEdge.tsx frontend/src/features/erd-canvas/ui/ErdCanvas.tsx
git commit -m "feat(erd-canvas): central edge-route spreading via shared context"
```

---

## Task 3: E2E + visual

**Files:**
- Modify: `frontend/e2e/edge-path.spec.ts`

- [ ] **Step 1: Add the E2E**

Seed the reporter schema where an `account` co-source trunk and an independent `publishing → publishing_file` edge previously shared a vertical corridor. Assert that NO two edges share an identical interior vertical segment (same x over an overlapping y-range). Reuse `registerAndLogin`. Concretely: collect every edge's path `d`, extract interior vertical segments `{x, yLo, yHi}` (exclude first/last segment), and assert no two segments from DIFFERENT edges have equal `x` AND overlapping `[yLo,yHi]`.

```ts
test('independent edges do not share an identical vertical corridor', async ({ page }) => {
  const email = `spread-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table account { account_id BIGINT [pk] }',
    'Table service {',
    '  service_id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table publishing { publishing_id BIGINT [pk] }',
    'Table publishing_file {',
    '  publishing_file_id BIGINT [pk]',
    '  publishing_id BIGINT [ref: > publishing.publishing_id]',
    '}',
  ].join('\n')
  // Positions chosen so the two unrelated edges would, pre-fix, share an x gutter.
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0, y: 0 },
      'public.service': { x: 0, y: 300 },
      'public.publishing': { x: 300, y: 0 },
      'public.publishing_file': { x: 0, y: 600 },
    },
  }
  const resp = await page.request.post('/api/projects', { data: { name: 'Spread', dbml_text: dbml, layout } })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect.poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 }).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(1000) // allow the spread pass (rAF) to settle

  const segs = await page.evaluate(() => {
    const out: { id: string; x: number; lo: number; hi: number }[] = []
    for (const g of Array.from(document.querySelectorAll('.react-flow__edge'))) {
      const eid = g.getAttribute('data-id') ?? ''
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      // interior segments only (exclude first & last)
      for (let i = 1; i < pts.length - 2; i++) {
        if (pts[i].x === pts[i + 1].x) {
          out.push({ id: eid, x: pts[i].x, lo: Math.min(pts[i].y, pts[i + 1].y), hi: Math.max(pts[i].y, pts[i + 1].y) })
        }
      }
    }
    return out
  })
  const overlap = (a: typeof segs[number], b: typeof segs[number]) =>
    a.id !== b.id && a.x === b.x && a.lo < b.hi && b.lo < a.hi
  const clash = segs.some((a, i) => segs.slice(i + 1).some((b) => overlap(a, b)))
  expect(clash).toBe(false)
})
```

- [ ] **Step 2: Run + revert-check** (overlay config; `cd …/frontend &&` in the SAME command; delete config after). Run `edge-path`. Then revert-check: temporarily render `orthoPoints` instead of `autoPoints` in RelationEdge (bypass the spread), confirm the new test FAILS (a clash exists), then restore. Do NOT commit the revert.

- [ ] **Step 3: Commit.**
```bash
git add frontend/e2e/edge-path.spec.ts
git commit -m "test(e2e): independent edges no longer share a vertical corridor"
```

- [ ] **Step 4: Full regression + visual.** `docker compose -p codegram exec -T frontend sh -c "npm run type-check && npm run test:run"`; full E2E with overlay config; before/after screenshot of the reporter schema (publishing_id/service_id) via SendUserFile.

---

## Self-Review (author checked)

- **Spec coverage (Stage A):** coincidental corridor sharing → Task 1 (pure spreader) + Task 2 (central collection/render) + Task 3 (E2E/visual). ✓
- **Architecture risk acknowledged:** chose shared-store (per-edge raw routing kept; only spread centralized) over full centralization, because the latter needs `@xyflow/system`'s `getEdgePosition` (a transitive dep, fragile to import) to re-derive endpoint coords. The shared-store uses RF-provided per-edge coords. Tradeoff: a one-frame raw→adjusted reflow on load/relayout (rAF-debounced).
- **Preservation:** manual-waypoint + enum edges excluded (register null → render unchanged); endpoint stubs never shifted (anchors fixed); single-edge unit fixtures have no provider → null-guard falls back to `orthoPoints`.
- **Placeholders:** none — all code shown; Task 2 Step 3 requires reading the exact current `RelationEdge` variable names before wiring.
- **Known limitation:** the spreader shifts interior segments via vertex moves (keeps orthogonality) but does not re-verify against obstacles, so an extreme spread could graze a card; `gap=12` is small and bounded, acceptable for v1 (note if observed).
