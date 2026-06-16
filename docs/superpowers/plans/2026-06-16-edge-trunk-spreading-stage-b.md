# Edge Trunk Spreading (Stage B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fan edges that leave the same source handle onto parallel vertical corridors so a co-source "trunk" (e.g. the six edges leaving `account.account_id`) no longer collapses into one overlapping line.

**Architecture:** `routeOrthogonal` already fans the source port in Y (`sourceLaneOffset`), but that jog is absorbed by `simplify()` the moment the edge turns vertical — so a *vertical* trunk stays collapsed. Add a **perpendicular** (across-the-card, i.e. X for a left/right handle) push to the source step-out, sized by the same lane index, so co-source edges step out to distinct X and run as parallel verticals. `RelationEdge` already computes `sourceLaneIndex`; it passes `sourceLaneIndex * LANE_GAP` as the new offset. The existing Y-fan is kept for the dual (horizontal-spread) case.

**Tech Stack:** React + @xyflow/react v12, Vitest, Playwright. Pure router in `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts`; per-edge wiring in `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`. Tests in docker: `docker compose -p codegram exec -T frontend npm run test:run -- <path>` (type-check: `npm run type-check`). Stack already up on :4001.

**Spec:** `docs/superpowers/specs/2026-06-16-edge-overlap-spreading-design.md` (Stage B). Stage A (central spreading pass) is a separate, later plan.

---

## File Structure

**Modify:**
- `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts` — add a 9th optional param `sourceTrunkOffset = 0` that pushes the source step-out port perpendicular to the card (X), so the vertical trunk fans into parallel lanes.
- `frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts` — unit tests for the new param.
- `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` — pass `sourceLaneIndex * LANE_GAP` as the 9th arg (`sourceTrunkOffset`).
- `frontend/e2e/edge-path.spec.ts` — E2E asserting a co-source trunk fans onto distinct vertical corridors.

**Background — current `routeOrthogonal` signature & source port (for reference):**
```ts
export function routeOrthogonal(
  source: Point, target: Point, sourceSide: Side, targetSide: Side,
  obstacles: Rect[], margin = MARGIN, targetLaneOffset = 0, sourceLaneOffset = 0,
): Point[] {
  const sPort: Point = {
    x: source.x + (sourceSide === 'right' ? margin : -margin),
    y: source.y + sourceLaneOffset,
  }
  // ...
  const sourceCorner: Point = { x: sPort.x, y: source.y }
  return simplify([source, sourceCorner, ...path, target])
}
```
`MARGIN = 16`, `TURN_PENALTY = 12`. In the rendered polyline `pts[0]` is `source` (anchor), `pts[1]` is the step-out corner at `x = sPort.x` (this is what the trunk runs along when the edge turns vertical).

---

## Task 1: `routeOrthogonal` perpendicular source-trunk offset

**Files:**
- Modify: `frontend/src/features/erd-canvas/lib/routeOrthogonal.ts`
- Test: `frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this block inside the existing top-level `describe` in `routeOrthogonal.test.ts`, right AFTER the `describe('routeOrthogonal sourceLaneOffset (source-side fan-out)', () => { ... })` block (the `isOrthogonal` helper already exists in the file):

```ts
  describe('routeOrthogonal sourceTrunkOffset (perpendicular trunk fan)', () => {
    it('with offset 0 the source step-out sits at the plain margin', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 200 }, 'right', 'left', [], undefined, 0, 0, 0)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[0]).toEqual({ x: 0, y: 0 }) // anchored at the source handle
      expect(pts[1].x).toBe(16) // step-out at MARGIN, no trunk push
    })

    it('pushes the source step-out port out by sourceTrunkOffset (right side)', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: 300, y: 200 }, 'right', 'left', [], undefined, 0, 0, 14)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[0]).toEqual({ x: 0, y: 0 })
      expect(pts[1].x).toBe(30) // MARGIN(16) + trunkOffset(14)
      expect(pts[pts.length - 1]).toEqual({ x: 300, y: 200 }) // still anchored at target
    })

    it('mirrors the push to the LEFT when the source exits on the left side', () => {
      const pts = routeOrthogonal({ x: 0, y: 0 }, { x: -300, y: 200 }, 'left', 'right', [], undefined, 0, 0, 14)
      expect(isOrthogonal(pts)).toBe(true)
      expect(pts[1].x).toBe(-30) // -(MARGIN + trunkOffset)
    })

    it('two co-source edges to vertically-stacked targets run on DIFFERENT trunk X', () => {
      // A target card BELOW-RIGHT forces the route to leave the source and travel
      // vertically along the step-out X — the trunk. Two lanes must use different X.
      const obstacles = [{ x: 260, y: 120, width: 240, height: 200 }]
      const lane0 = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 200 }, 'right', 'left', obstacles, undefined, 0, 0, 0)
      const lane1 = routeOrthogonal({ x: 0, y: 0 }, { x: 260, y: 260 }, 'right', 'left', obstacles, undefined, 0, 0, 14)
      // The step-out / trunk X differs by the trunk offset.
      expect(lane1[1].x - lane0[1].x).toBe(14)
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: FAIL — `routeOrthogonal` ignores the 9th arg, so `pts[1].x` is `16`/`-16` (not `30`/`-30`) and the lane diff is `0`, not `14`.

- [ ] **Step 3: Implement the param**

In `routeOrthogonal.ts`, add `sourceTrunkOffset = 0` as the LAST (9th) param:

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
  sourceTrunkOffset = 0,
): Point[] {
```

Change the source port so the perpendicular (X) step-out carries the trunk offset (Y push unchanged):

```ts
  const sMargin = margin + sourceTrunkOffset
  const sPort: Point = {
    x: source.x + (sourceSide === 'right' ? sMargin : -sMargin),
    y: source.y + sourceLaneOffset,
  }
```

No other change is needed: `xsSet` already seeds from `sPort.x` (line `const xsSet = new Set<number>([source.x, target.x, sPort.x, tPort.x])`), the `sourceCorner`/fallback already derive from `sPort.x`, and `simplify` is unaffected.

Update the function's top doc comment to mention `sourceTrunkOffset` (one sentence: "sourceTrunkOffset pushes the source step-out perpendicular to the card (X) so edges leaving the same handle fan onto parallel vertical trunks instead of collapsing onto one — complementing the in-Y sourceLaneOffset").

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas/lib/routeOrthogonal.test.ts`
Expected: PASS (existing tests + 4 new). If the stacked-targets test's lane diff is not exactly 14, read the actual `pts` — confirm the SHAPE is `source → (sMargin,0) → (sMargin, …down)` and that both lanes turn vertical at their own `sPort.x`; do NOT weaken the "different trunk X" intent.

- [ ] **Step 5: Type-check**

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/erd-canvas/lib/routeOrthogonal.ts frontend/src/features/erd-canvas/lib/routeOrthogonal.test.ts
git commit -m "feat(erd-canvas): routeOrthogonal sourceTrunkOffset (perpendicular fan for co-source trunks)"
```

---

## Task 2: `RelationEdge` passes the trunk offset

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/RelationEdge.tsx`

Context: `RelationEdge` already computes `sourceLaneIndex` (the index of this edge among edges leaving the same source handle) and passes `sourceLaneIndex * LANE_GAP` as the 8th arg (`sourceLaneOffset`) to `routeOrthogonal`. Stage B passes the SAME index as the new 9th arg so the trunk also fans in X. `LANE_GAP` is the existing constant.

- [ ] **Step 1: Pass the offset into routeOrthogonal**

Find the `routeOrthogonal(...)` call inside the `orthoPoints` useMemo. It currently ends:
```ts
      undefined,
      laneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
    )
```
Change it to add the trunk offset as the 9th arg:
```ts
      undefined,
      laneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
      sourceLaneIndex * LANE_GAP,
    )
```
(`sourceLaneIndex` is already in the `orthoPoints` useMemo dependency array from the earlier source-lane change — no deps change needed. Verify it is present; if not, add `sourceLaneIndex` to the deps array.)

- [ ] **Step 2: Type-check + run the edge unit tests**

Run: `docker compose -p codegram exec -T frontend npm run type-check`
Expected: clean.
Run: `docker compose -p codegram exec -T frontend npm run test:run -- src/features/erd-canvas`
Expected: PASS (single-edge fixtures resolve `sourceLaneIndex` to 0, so the trunk offset is 0 and rendered paths are unchanged).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/erd-canvas/ui/RelationEdge.tsx
git commit -m "feat(erd-canvas): fan co-source trunks onto parallel corridors (sourceTrunkOffset)"
```

---

## Task 3: E2E — co-source trunk fans onto distinct vertical corridors

**Files:**
- Modify: `frontend/e2e/edge-path.spec.ts`

Context: reuse the file's existing `registerAndLogin` helper. Seed one source PK (`account.account_id`) feeding several FK columns in tables stacked vertically BELOW it, so all those edges leave `account.account_id` and run down a trunk. Without Stage B they share one trunk X; with it they fan onto distinct X.

- [ ] **Step 1: Add the E2E**

Append to `edge-path.spec.ts`:

```ts
test('edges leaving the same source handle fan onto distinct vertical trunks', async ({ page }) => {
  const email = `trunk-${Date.now()}@example.com`
  await registerAndLogin(page, email, 'password123')
  const dbml = [
    'Table account {',
    '  account_id BIGINT [pk]',
    '}',
    'Table a {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table b {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
    'Table c {',
    '  id BIGINT [pk]',
    '  created_by BIGINT [ref: > account.account_id]',
    '}',
  ].join('\n')
  // account on top; a/b/c stacked directly BELOW it so every account edge runs
  // down a vertical trunk to reach its target.
  const layout = {
    version: 1,
    positions: {
      'public.account': { x: 0, y: 0 },
      'public.a': { x: 0, y: 240 },
      'public.b': { x: 0, y: 440 },
      'public.c': { x: 0, y: 640 },
    },
  }
  const resp = await page.request.post('/api/projects', {
    data: { name: 'Trunk', dbml_text: dbml, layout },
  })
  const { id } = await resp.json()
  await page.goto(`/editor/${id}`)
  await expect
    .poll(async () => page.locator('.react-flow__edge-path').count(), { timeout: 8000 })
    .toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(800)

  // For each edge leaving account.account_id, find the X of its longest VERTICAL
  // segment (the trunk it runs down). With the fix these must be distinct.
  const trunkXs = await page.evaluate(() => {
    const edges = Array.from(document.querySelectorAll('.react-flow__edge'))
      .filter((g) => (g.getAttribute('data-id') ?? '').includes('public.account.(account_id)'))
    return edges.map((g) => {
      const d = g.querySelector('.react-flow__edge-path')?.getAttribute('d') ?? ''
      const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
      let best = { x: NaN, len: -1 }
      for (let i = 0; i + 1 < pts.length; i++) {
        if (pts[i].x === pts[i + 1].x) {
          const len = Math.abs(pts[i + 1].y - pts[i].y)
          if (len > best.len) best = { x: pts[i].x, len }
        }
      }
      return best.x
    })
  })
  expect(trunkXs.length).toBeGreaterThanOrEqual(3)
  // No two co-source edges share the same trunk X (all distinct).
  expect(new Set(trunkXs).size).toBe(trunkXs.length)
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
Expected: all edge-path tests PASS including the new one. IMPORTANT (cwd trap): the committed `playwright.config.ts` baseURL is stale (`:5173`) and host node_modules is incomplete, so the overlay config + the `cd …/frontend &&` in the SAME command are required; the shell is zsh and does not persist cwd across commands. Delete the overlay config after (do not commit it). If the parse picks the wrong segment, inspect the printed `d` and fix the parse — do NOT weaken the "all distinct" assertion.

- [ ] **Step 3: Verify the test GUARDS the fix (revert-check)**

Temporarily set the 9th arg back to `0` in `RelationEdge.tsx` (`0` instead of `sourceLaneIndex * LANE_GAP` on the trunk-offset line), re-run the new test, and confirm it FAILS (the trunk Xs collapse to one). Then restore the arg. This proves the test is not tautological. (Do not commit the revert.)

- [ ] **Step 4: Commit**

```bash
cd /home/soron/projects/codegram
git add frontend/e2e/edge-path.spec.ts
git commit -m "test(e2e): co-source trunk fans onto distinct vertical corridors"
```

- [ ] **Step 5: Full regression + visual confirm**

```bash
docker compose -p codegram exec -T frontend sh -c "npm run type-check && npm run test:run"
```
Expected: all unit pass. Then run the full E2E with the overlay config (from `frontend/`), and capture a before/after screenshot of the reporter's `account`-trunk schema to confirm the trunk visibly fans. Send before/after via SendUserFile. (Known flake, not a regression: `projects.spec.ts` "rename a project" can fail intermittently under full-parallel load; passes in isolation.)

---

## Self-Review (author checked)

- **Spec coverage (Stage B):** root cause = co-source vertical trunk sharing one corridor (Y-fan absorbed) → Task 1 (perpendicular X push) + Task 2 (per-edge wiring) + Task 3 (E2E/visual + revert-check). ✓
- **Type consistency:** `sourceTrunkOffset` is the 9th `routeOrthogonal` arg in both the signature (Task 1) and the call (Task 2); `LANE_GAP` and `sourceLaneIndex` are existing identifiers reused from the prior source-lane change. ✓
- **Placeholders:** none — all code shown.
- **Known limitation (by design):** coincidental overlaps between edges with different source AND target (e.g. `publishing → publishing_file`) are NOT fixed by Stage B — that is Stage A (central spreading pass), a separate plan. The Y-fan is intentionally kept alongside the new X-fan so the horizontal-spread case still works.
