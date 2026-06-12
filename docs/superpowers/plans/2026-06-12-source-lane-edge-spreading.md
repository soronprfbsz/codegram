# Source-Lane Edge Spreading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop distinct FK edges that leave the same PK column from overlapping into one line by fanning them onto separate horizontal corridors (a source-side lane offset symmetric to the existing target-side one).

**Architecture:** `routeOrthogonal` gains a `sourceLaneOffset` that pushes the source step-out port in Y (perpendicular to the source's left/right exit) with an orthogonal L-stub from the anchor, so co-source edges travel distinct gutters instead of sharing the PK's exit row. `RelationEdge` computes a `sourceLaneIndex` (edges sharing this edge's source handle, ordered by target handle) and passes `sourceLaneIndex * LANE_GAP` as that offset — mirroring how it already computes `laneIndex` for the target side.

**Tech Stack:** React + @xyflow/react v12, Vitest, Playwright. Pure router in `features/erd-canvas/lib/routeOrthogonal.ts`; per-edge wiring in `features/erd-canvas/ui/RelationEdge.tsx`. Tests in docker: `docker compose -p codegram exec -T frontend npm run test:run -- <path>`.

**Root cause (reproduced + edge-dumped):** Table handles are fixed (FK column left / PK right). One PK feeding several FK tables (e.g. `customer.id` → `customer_project` AND `customer_site_version`) emits edges that all leave `customer.id`'s right handle at the same row Y and travel along that shared row until they diverge — overlapping into one visible horizontal line. Geometry side-selection (already shipped) fixed *wrap* overlaps; the existing `targetLaneOffset` separates edges *entering* the same target; neither separates edges *leaving* the same source. This plan adds the missing source-side fan-out.

**Scope note:** This fixes the STRUCTURED bundling cause (same source column → many tables), which is what the reported diagrams show. Purely-coincidental overlaps (edges with different source AND target that happen to share a gutter) are out of scope; if any remain, they can be hand-separated via the existing segment-drag, or addressed later with a full central edge-spreading pass.

---

## File Structure

**Modify:**
- `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts` — add optional `sourceLaneOffset` param: offset the source port in Y + insert an orthogonal L-stub corner so the path stays axis-aligned.
- `frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts` — tests for the new param.
- `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` — compute `sourceLaneIndex` (useStore selector) + pass `sourceLaneIndex * LANE_GAP` into the `routeOrthogonal` call.
- `frontend/e2e/edge-path.spec.ts` — E2E asserting two same-source edges no longer share a horizontal corridor (different gutter Y).

---

## Task 1: `routeOrthogonal` source-lane Y offset

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts`
- Test: `frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts`

Current signature (for reference):
```ts
export function routeOrthogonal(
  source: Point, target: Point, sourceSide: Side, targetSide: Side,
  obstacles: Rect[], margin = MARGIN, targetLaneOffset = 0,
): Point[]
```
Current source port:
```ts
const sPort: Point = { x: source.x + (sourceSide === 'right' ? margin : -margin), y: source.y }
```
Current return:
```ts
return simplify([source, ...path, target])
```
Note `path[0]` is `sPort` (the A* start node), so today the first rendered segment is `source → sPort` (horizontal, since `sPort.y === source.y`).

- [ ] **Step 1: Write the failing tests**

Add to `routeOrthogonal.test.ts` (keep existing tests; `isOrthogonal` and `pathAvoids` helpers already exist in the file):

```ts
describe('routeOrthogonal sourceLaneOffset (source-side fan-out)', () => {
  it('with offset 0, two facing endpoints route on a single straight line', () => {
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [], undefined, 0, 0)
    expect(isOrthogonal(pts)).toBe(true)
    const ys = new Set(pts.map((p) => p.y))
    expect(ys.size).toBe(1) // no jog when offset is 0
  })

  it('offsets the source exit corridor by sourceLaneOffset (Y), staying orthogonal', () => {
    // Same endpoints, lane 1 (offset 20) must leave the source row and travel on y=20.
    const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 0 }, 'right', 'left', [], undefined, 0, 20)
    expect(isOrthogonal(pts)).toBe(true)
    expect(pts[0]).toEqual({ x: 0, y: 0 }) // still anchored at the source handle
    expect(pts[pts.length - 1]).toEqual({ x: 300, y: 0 }) // still anchored at the target handle
    // The long horizontal travel happens at the offset Y (20), not the source row (0).
    const ysVisited = pts.map((p) => p.y)
    expect(ysVisited).toContain(20)
    // There is an L-stub at the source: a horizontal step out then a vertical jog to y=20.
    expect(pts[1]).toEqual({ x: 16, y: 0 }) // margin step-out at source row (MARGIN=16)
    expect(pts[2]).toEqual({ x: 16, y: 20 }) // vertical jog to the lane corridor
  })

  it('two co-source edges (lanes 0 and 1) end up on DIFFERENT horizontal corridors', () => {
    const lane0 = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 100 }, 'right', 'left', [], undefined, 0, 0)
    const lane1 = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 140 }, 'right', 'left', [], undefined, 0, 20)
    // The Y at which each edge leaves the source neighbourhood differs by the lane offset.
    expect(lane0[1].y).toBe(0)
    expect(lane1[2].y).toBe(20)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: FAIL — `routeOrthogonal` ignores the 8th arg (no `sourceLaneOffset`), so the offset cases don't jog.

- [ ] **Step 3: Implement the param**

In `routeOrthogonal.ts`, change the signature to add `sourceLaneOffset = 0` as the LAST param:

```ts
export function routeOrthogonal(
  source: Point,
  target: Point,
  sourceSide: Side,
  targetSide: Side,
  obstacles: Rect[],
  margin = MARGIN,
  targetLaneOffset = 0,
  sourceLaneOffset = 0,
): Point[] {
```

Change the source port to carry the Y offset (X step-out unchanged):

```ts
  const sPort: Point = {
    x: source.x + (sourceSide === 'right' ? margin : -margin),
    y: source.y + sourceLaneOffset,
  }
```

The candidate-line sets already seed from the ports — confirm `ysSet` includes both `source.y` and `sPort.y`. The existing line is:
```ts
  const ysSet = new Set<number>([source.y, target.y, sPort.y, tPort.y])
```
`source.y` (for the L-stub corner) and `sPort.y` (the offset corridor) are both present — no change needed there.

Finally, insert the orthogonal L-stub corner between the anchor and the (now Y-offset) start port. Change the success return from:
```ts
  return simplify([source, ...path, target])
```
to:
```ts
  // L-stub at the source: step out horizontally on the anchor row, then jog
  // vertically to the lane corridor. When sourceLaneOffset is 0 the corner
  // equals sPort and simplify() drops it, so the straight case is unchanged.
  const sourceCorner: Point = { x: sPort.x, y: source.y }
  return simplify([source, sourceCorner, ...path, target])
```

ALSO update the no-route fallback (a few lines above the success return) the same way so a degenerate graph still emits the stub:
```ts
  // No route found → simple L/Z fallback through the ports.
  if (startKey !== goalKey && !came.has(goalKey)) {
    return simplify([
      source,
      { x: sPort.x, y: source.y },
      sPort,
      { x: tPort.x, y: sPort.y },
      tPort,
      target,
    ])
  }
```

Update the function's top doc comment to mention `sourceLaneOffset` alongside the existing `targetLaneOffset` description (one sentence: "sourceLaneOffset pushes the source port in Y with an L-stub so edges leaving the same PK fan onto separate corridors").

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: PASS (existing tests + 3 new). If the `pts[1]`/`pts[2]` exact-coordinate assertions fail, read the actual output and confirm the SHAPE is `source → (margin,0) → (margin,offset) → …`; adjust the expected indices only if `simplify` merged a point you didn't anticipate — but do NOT weaken the "travels on the offset Y" assertion.

- [ ] **Step 5: Type-check**

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/routeOrthogonal.ts frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts
git commit -m "feat(erd-canvas): routeOrthogonal sourceLaneOffset (fan co-source edges onto separate corridors)"
```

---

## Task 2: `RelationEdge` computes + passes the source lane

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`

Context: `RelationEdge` already computes a `laneIndex` for the target side via a `useStore` selector, and passes `laneIndex * LANE_GAP` as the 7th arg (`targetLaneOffset`) to `routeOrthogonal`. It also destructures `sourceHandleId` from props and reads `targetHandleId` is available on `EdgeProps`. We mirror that for the source.

- [ ] **Step 1: Add the `sourceLaneIndex` selector**

In `RelationEdge.tsx`, just AFTER the existing `laneIndex = useStore(...)` block, add:

```ts
  // Source fan-out lane: index of THIS edge among the relation edges LEAVING the
  // SAME source handle (the PK column), ordered by target handle. Edges sharing
  // a source PK otherwise leave on one shared corridor (the PK's exit row) and
  // overlap into a single line; a distinct lane per edge fans them apart.
  const sourceLaneIndex = useStore((s) => {
    if (isEnumLink) return 0
    const myKey = sourceHandleId ?? source
    const targets: string[] = []
    for (const e of s.edges) {
      if ((e.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
      if ((e.sourceHandle ?? e.source) !== myKey) continue
      targets.push(e.targetHandle ?? e.target)
    }
    const myTarget = targetHandleId ?? target
    const idx = [...new Set(targets)].sort().indexOf(myTarget)
    return idx < 0 ? 0 : idx
  })
```

`targetHandleId` must be destructured from props. Check the `RelationEdgeImpl({ ... })` destructure list near the top of the component; it already pulls `sourceHandleId`. Add `targetHandleId` to that destructure if not present:
```ts
  sourceHandleId,
  targetHandleId,
  data,
```

- [ ] **Step 2: Pass the offset into routeOrthogonal**

Find the `routeOrthogonal(...)` call inside the `orthoPoints` useMemo. It currently ends with:
```ts
      undefined,
      laneIndex * LANE_GAP,
    )
```
Change it to add the source offset as the 8th arg:
```ts
      undefined,
      laneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
    )
```

Add `sourceLaneIndex` to the `orthoPoints` useMemo dependency array (it already lists `laneIndex`):
```ts
    laneIndex,
    sourceLaneIndex,
  ])
```

- [ ] **Step 3: Type-check + run the edge unit tests**

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: clean.
Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas`
Expected: PASS (RelationEdge tests render without a multi-edge store, so `sourceLaneIndex` resolves to 0 and the rendered paths are unchanged for those single-edge fixtures).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/erd-canvas/ui/RelationEdge.tsx
git commit -m "feat(erd-canvas): fan edges leaving the same PK onto separate corridors (sourceLaneIndex)"
```

---

## Task 3: E2E + visual verification

**Files:**
- Modify: `frontend/e2e/edge-path.spec.ts`

- [ ] **Step 1: Add an E2E that asserts co-source edges use different corridors**

Append to `edge-path.spec.ts` (reuse its existing `registerAndLogin` helper). Schema: one PK (`customer`) feeding TWO tables, seeded so both tables sit to the right of `customer` (same exit side), forcing the shared-corridor case the fix targets.

```ts
test('edges leaving the same PK fan onto separate horizontal corridors', async ({ page }) => {
  const email = `fanout-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table customer {',
    '  id BIGINT [pk]',
    '}',
    'Table a {',
    '  id BIGINT [pk]',
    '  customer_id BIGINT [ref: > customer.id]',
    '}',
    'Table b {',
    '  id BIGINT [pk]',
    '  customer_id BIGINT [ref: > customer.id]',
    '}',
  ].join('\n')
  // Seed: customer on the left, a and b stacked on the right (same exit side).
  const layout = {
    version: 1,
    positions: {
      'public.customer': { x: 0, y: 0 },
      'public.a': { x: 600, y: 0 },
      'public.b': { x: 600, y: 300 },
    },
  }
  const resp = await page.request.post('/api/projects', {
    data: { name: 'Fanout', dbml_text: dbml, layout },
  })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(800)

  // Both edges leave customer.id. Collect, for each, the set of Y values on its
  // long horizontal segments. The two edges must NOT share an identical single
  // exit corridor — at least one must travel on a distinct (offset) Y.
  const exitYs = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'))
      .filter((g) => (g.getAttribute('data-id') ?? '').includes('public.customer.(id)'))
    return edges.map((g) => {
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      // Parse "M x y L x y L ..." → the Y of the SECOND point (the exit corridor row
      // after the source step-out / jog).
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      // points are pairs; point index 2 is the 3rd point (after L-stub jog) when offset>0,
      // else point index 1. Return the max-frequency Y across all points as the corridor.
      const ys: number[] = []
      for (let i = 1; i < nums.length; i += 2) ys.push(nums[i])
      return ys
    })
  })
  expect(exitYs.length).toBe(2)
  // The two edges' point-Y sets must not be identical (they fan apart).
  expect(JSON.stringify(exitYs[0])).not.toBe(JSON.stringify(exitYs[1]))
})
```

- [ ] **Step 2: Run it (throwaway overlay config, then delete)**

```bash
cd /home/soron/projects/codegram/frontend
cat > playwright.bg-overlay.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({ testDir: './e2e', fullyParallel: true, retries: 0, reporter: 'list', use: { baseURL: 'http://localhost:4001', trace: 'off' }, projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }] })
EOF
npx playwright test edge-path --config playwright.bg-overlay.config.ts
rm -f playwright.bg-overlay.config.ts
```
Expected: all edge-path tests PASS including the new one. If it fails because both edges genuinely fan (good) but the parse picked the wrong points, inspect the printed `d` and adjust the parsing — do NOT weaken the "not identical" intent.

- [ ] **Step 3: Commit**

```bash
cd /home/soron/projects/codegram
git add frontend/e2e/edge-path.spec.ts
git commit -m "test(e2e): co-source edges fan onto separate corridors"
```

- [ ] **Step 4: Full regression + visual confirm**

```bash
docker compose -p codegram exec -T frontend sh -c "npm run type-check && npm run test:run"   # all unit pass
```
Then run the full E2E with the overlay config (from `frontend/`), and capture a screenshot of a multi-FK-to-one-PK schema (e.g. the reporter's `customer_project` + `customer_site_version` both FK-ing `customer` & `project`) to visually confirm the lines no longer merge. Send before/after with SendUserFile.

---

## Self-Review (author checked)

- **Spec coverage:** root cause = same-source corridor sharing → Task 1 (router Y-fan + L-stub) + Task 2 (per-edge source lane) + Task 3 (E2E/visual). ✓
- **Type consistency:** `sourceLaneOffset` is the 8th `routeOrthogonal` arg in both the call (Task 2) and signature (Task 1); `LANE_GAP` is the existing constant reused; `sourceLaneIndex` mirrors `laneIndex`. ✓
- **Placeholders:** none — all code shown.
- **Risk/known-limitation:** caps not applied — a PK feeding N tables fans 0..(N-1)*14px tall; acceptable. Coincidental (different src+tgt) overlaps remain out of scope (stated above). The L-stub adds one corner at fanned sources (dbdiagram-style fan), intended.
