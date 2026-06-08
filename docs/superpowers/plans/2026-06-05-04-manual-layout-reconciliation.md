# Manual Layout + Reconciliation (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag ERD tables on the canvas and persist their positions into `project.layout` JSONB via the existing debounced autosave, then restore them on every successful parse through pure, name-based reconciliation (ADR-0004) — keeping placed tables put, dagre-laying-out new/unpositioned tables, and dropping a renamed table's position — plus a one-shot "Auto-arrange" button that discards saved positions and re-runs dagre for all nodes.

**Architecture:** A new PURE `entities/layout` FSD slice owns the persisted-layout types and two deterministic functions — `reconcileLayout` (merge stored positions into freshly-parsed flow nodes by node id, reusing `autoLayout` for the dagre baseline) and `nodesToLayout` (extract current positions into the persisted shape) — with a `fitGroupBoxes` helper that re-fits group container boxes after member overrides. It imports React Flow TYPES only (like `entities/erd`), never the runtime. The runtime wiring lives in `features`: `ErdCanvas` becomes a controlled `useNodesState` canvas that reconciles `savedPositions`, captures drags on `onNodeDragStop`, and adds an Auto-arrange `<Panel>` button; a new `features/layout-persistence` hook holds the live positions state seeded from `project.layout`; and `useProjectAutosave` gains a dual serialized baseline so layout-only changes fire a save. `pages/editor` composes everything. FSD downward imports only (`app > pages > widgets > features > entities > shared`); the persistence transport is the unchanged Plan 2 PATCH (`{ dbml_text, layout }`). NO backend changes.

**Tech Stack:** React 19, Vite 8, TypeScript 6, `@xyflow/react@12.11` (React Flow v12), `@dagrejs/dagre@2.0.4` (already used by `autoLayout` — no new runtime libs), TanStack Query v5, Zustand v5, Vitest 4 + Testing Library + `@testing-library/user-event` + jsdom, Playwright. The true type gate is `npm run build` (= `tsc -b && vite build`) run from `frontend/` (the root tsconfig is solution-style, so `tsc --noEmit` misses new files); unit runner is `npm run test:run`; E2E is `npx playwright test` (run by the controller against the live Docker stack).

---

## Scope & Decisions

**Three pillars:**
1. **Manual layout** — drag tables on the canvas.
2. **Persistence** — store node positions in `project.layout` JSONB via the EXISTING debounced autosave (Plan 2 path).
3. **ADR-0004 name-based reconciliation** — on every successful parse, merge stored positions with parse output by name keys: unpositioned nodes get dagre auto-layout, positioned nodes keep stored coords, a renamed table loses its position (treated as new), removed entries are silently ignored.

**Decision A (waypoints EXCLUDED):** Edge waypoint editing is out of scope. Edges keep React Flow default auto-routing (recompute = auto-reset). No waypoint state, types, or persistence anywhere; the stored layout has NO `edges` key.

**Decision B (Auto-arrange INCLUDED):** A one-shot "Auto-arrange" canvas button discards all saved positions and re-runs dagre for every node, then persists the result.

**Node id == name key drives reconciliation:** `schemaToFlow` already ids nodes by name — table = `` `${schema}.${name}` ``, enum = `` `enum:${schema}.${name}` ``, note = `` `note:${name}` ``, group = `` `group:${name}` ``. Keying stored positions by node id therefore IS keying by name (ADR-0004): a rename changes the id, the stored entry no longer matches, and the node is treated as new (loses its position). No special rename-handling code is needed.

**Backend unchanged:** `backend/app/schemas/project.py` `ProjectUpdate.layout: dict[str, Any] | None` and `ProjectRead.layout` already accept and round-trip arbitrary nested dicts; the PATCH already persists `layout` (proven by `backend/tests/test_projects.py::test_patch_autosave_persists_layout`). Plan 4 is frontend-only.

**Verification gates:**
- Unit (per task, TDD): `npm run test:run -- <file>` from `frontend/` — failing test first, then implement to green.
- Full unit suite: `npm run test:run` from `frontend/`.
- Type gate (authoritative): `npm run build` from `frontend/`.
- E2E: `npx playwright test` from `frontend/` — **run by the CONTROLLER** against the live Docker stack (`docker compose up -d` + `docker compose restart frontend` first, per the HMR gotcha). Subagents author the spec but do NOT run E2E.

**Stored layout shape (the contract — identical everywhere it appears):**

```json
{
  "version": 1,
  "positions": {
    "public.users": { "x": 320, "y": 80 },
    "public.posts": { "x": 320, "y": 360 },
    "enum:public.role": { "x": 40, "y": 80 },
    "public.audit_log": { "x": 24, "y": 12, "parentId": "group:internal" }
  }
}
```

Each entry stores `x`/`y` exactly as React Flow reports `node.position` (ABSOLUTE for ungrouped nodes, RELATIVE-to-parent for grouped members — store and restore the same field, no coordinate conversion). Grouped members ALSO store `parentId` (frame guard: relative coords are valid only under the same parent). Group container positions are NOT persisted (group nodes are non-draggable; their position + size are layout output recomputed each parse). A legacy/empty project has `project.layout == {}`; reconcile treats a missing or non-v1 `positions` as `{}` (everything falls to dagre).

---

## File Structure

### Frontend — Create
- `frontend/src/entities/layout/model/types.ts` — `StoredPosition`, `LayoutPositions`, `StoredLayout` types (type-only `XYPosition` import).
- `frontend/src/entities/layout/lib/reconcile.ts` — PURE `reconcileLayout(flowNodes, flowEdges, stored)` + `nodesToLayout(nodes)`; reuses `autoLayout`, overrides saved positions by node id, frame-guards grouped members.
- `frontend/src/entities/layout/lib/reconcile.test.ts` — Vitest unit tests for `reconcileLayout` + `nodesToLayout`.
- `frontend/src/entities/layout/lib/groupBox.ts` — PURE `fitGroupBoxes(nodes)`: recompute group node position + `style.width`/`height` to fit all members and re-base members.
- `frontend/src/entities/layout/lib/groupBox.test.ts` — Vitest unit tests for `fitGroupBoxes`.
- `frontend/src/entities/layout/index.ts` — barrel: `reconcileLayout`, `nodesToLayout`, `fitGroupBoxes`, and the `StoredLayout`/`LayoutPositions`/`StoredPosition` types.
- `frontend/src/features/layout-persistence/api/useLayoutPersistence.ts` — positions state hook seeded from `project.layout`, exposing `positions`/`setPositions`/`layout`/`layoutBaseline`.
- `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx` — Vitest unit tests for the hook.
- `frontend/src/features/layout-persistence/index.ts` — barrel: `useLayoutPersistence`.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.fixture.ts` — the shared two-table `schema` fixture, extracted from `ErdCanvas.test.tsx` so both canvas test files import one copy.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx` — mock-driven drag-stop + Auto-arrange wiring tests (owns the `@xyflow/react` mock so the real-render label test in `ErdCanvas.test.tsx` keeps the real React Flow).
- `frontend/e2e/editor-layout.spec.ts` — Playwright E2E (drag->persist->reload, add-table, rename, Auto-arrange).

### Frontend — Modify
- `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` — controlled `useNodesState`; reconcile via `entities/layout` keyed on `schemaKey`+`positionsKey`; `onNodesChange` + `onNodeDragStop` lifting `StoredLayout`; `<Panel>` Auto-arrange button; new `savedPositions` + `onLayoutChange` props.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx` — reconcile-path render case (real React Flow; drag-stop + Auto-arrange wiring live in the separate `ErdCanvas.wiring.test.tsx`).
- `frontend/src/features/project-autosave/api/useProjectAutosave.ts` — add `layoutBaseline` option; dual-baseline serialized guard so layout-only changes fire a save without object-identity loops.
- `frontend/src/features/project-autosave/api/useProjectAutosave.test.tsx` — layout-only fire, layout re-seed skip, no-loop cases.
- `frontend/src/pages/editor/index.tsx` — hold positions via `useLayoutPersistence`; pass `savedPositions`/`onLayoutChange` to `ErdCanvas`; thread `layout` + `layoutBaseline` into `useProjectAutosave`.
- `frontend/src/pages/editor/index.test.tsx` — layout seeding + canvas prop wiring.

### Backend
- **No changes.** Confirmed: `backend/app/schemas/project.py` `ProjectUpdate.layout: dict[str, Any] | None` and `ProjectRead.layout` already accept and round-trip arbitrary dicts; the PATCH already persists `layout`.

---

# Block A — entities/layout (PURE reconciliation + types)

New FSD `entities/layout` slice: types + pure `reconcile`/`nodesToLayout`/`fitGroupBoxes`, Vitest only, NO React/React Flow runtime. Reuses `autoLayout`. Locks the `StoredLayout` shape and node-id-as-name-key reconciliation here so Block B has a stable contract. All commands run from `/home/soron/projects/erd-dbml/frontend`.

## Task 1: Create the `entities/layout` types (StoredLayout / positions)

Bootstrap the new FSD `entities/layout` slice with the persisted-layout types. This slice is PURE: it imports React Flow TYPES only (mirroring `entities/erd`), never the React Flow runtime. These types are the stable contract Block B consumes, so they land first.

**Files:**
- Create: `frontend/src/entities/layout/model/types.ts`

- [ ] **Step 1: Write the types file.**

Create `frontend/src/entities/layout/model/types.ts` with exactly:

```ts
/**
 * Persisted-layout types (Plan 4). These describe the versioned object stored in
 * `project.layout` JSONB and round-tripped through the Plan 2 autosave path.
 *
 * Keys are React Flow node ids. Because schemaToFlow ids nodes by name
 * (table = `${schema}.${name}`, enum = `enum:${schema}.${name}`,
 * note = `note:${name}`, group = `group:${name}`), keying positions by node id
 * IS keying by name (ADR-0004): a rename changes the id, so the old entry no
 * longer matches and the node is treated as new (loses its position).
 *
 * entities layer: imports only the React Flow XYPosition TYPE (like entities/erd).
 * No JSX, no hooks, no React Flow runtime (FSD downward imports).
 */
import type { XYPosition } from '@xyflow/react' // TYPE-ONLY import (like entities/erd)

/**
 * One persisted node position. `parentId` is present ONLY for grouped members,
 * recording the group node id the RELATIVE coords were saved under (frame guard:
 * relative coords are valid only under the same parent group). Ungrouped nodes
 * store ABSOLUTE coords and omit `parentId`.
 *
 * XYPosition is `{ x: number; y: number }` in @xyflow/react; StoredPosition is
 * deliberately its own type (adds optional parentId) rather than aliasing it.
 */
export interface StoredPosition {
  x: number
  y: number
  /** Group node id this position is relative to, if the node was grouped at save time. */
  parentId?: string
}

/** Map of node id -> persisted position. Node id == ADR-0004 name key. */
export type LayoutPositions = Record<string, StoredPosition>

/** The versioned object stored in project.layout JSONB. */
export interface StoredLayout {
  version: 1
  positions: LayoutPositions
}

/** Re-exported for callers that want the React Flow position shape. */
export type { XYPosition }
```

- [ ] **Step 2: Type-check the new file (the TRUE type gate).**

The root tsconfig is solution-style, so `tsc --noEmit` misses new files; `npm run build` (= `tsc -b && vite build`) is the real gate. Run from `frontend/`:

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ built in …` (no TS errors). The new slice compiles even though nothing imports it yet.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/model/types.ts && \
  git commit -m "feat(layout): add StoredLayout/LayoutPositions persisted-layout types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `reconcileLayout` — keep stored positions, dagre the rest (ungrouped)

The core ADR-0004 merge. `reconcileLayout` runs `autoLayout` over the FULL graph once (the dagre baseline), then OVERRIDES the position of any non-group node that has a frame-matching stored entry. This task covers the ungrouped happy path: a stored position is kept verbatim; a node with no stored entry falls to dagre. Grouped members (frame guard) and group-box refit come in later tasks; we stub `fitGroupBoxes` as identity here so the ungrouped path is provably correct first.

**Files:**
- Create: `frontend/src/entities/layout/lib/reconcile.ts`
- Create: `frontend/src/entities/layout/lib/groupBox.ts` (identity stub; real impl in Task 5)
- Test: `frontend/src/entities/layout/lib/reconcile.test.ts`

- [ ] **Step 1: Write the FAILING test.**

Create `frontend/src/entities/layout/lib/reconcile.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { reconcileLayout } from './reconcile'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd'
import type { LayoutPositions } from '@/entities/layout/model/types'

/** Empty-column table node (matches autoLayout's nodeSize estimate of 240x40). */
function tableNode(id: string, parentId?: string): ErdFlowNode {
  const node: ErdFlowNode = {
    id,
    type: 'table',
    position: { x: 0, y: 0 },
    data: { tableName: id, tableId: id, columns: [] },
  }
  if (parentId) node.parentId = parentId
  return node
}

function relEdge(source: string, target: string): ErdFlowEdge {
  return {
    id: `${source}->${target}`,
    type: 'relation',
    source,
    target,
    data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
  }
}

describe('reconcileLayout (ungrouped)', () => {
  it('keeps a stored position for a node whose id matches', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    expect(users.position).toEqual({ x: 320, y: 80 })
  })

  it('lays out a node with no stored entry via dagre (some position assigned)', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const posts = out.find((n) => n.id === 'public.posts')!
    // posts has no stored entry -> dagre placed it; and dagre separates it from
    // the (overridden) users node, so it is NOT at the stored coords.
    expect(typeof posts.position.x).toBe('number')
    expect(typeof posts.position.y).toBe('number')
    expect(posts.position).not.toEqual({ x: 320, y: 80 })
  })

  it('returns one node per input node, preserving ids and data', () => {
    const nodes = [tableNode('a'), tableNode('b')]
    const edges = [relEdge('a', 'b')]
    const out = reconcileLayout(nodes, edges, {})
    expect(out.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(out.find((n) => n.id === 'a')!.data).toBe(
      nodes.find((n) => n.id === 'a')!.data,
    )
  })

  it('returns [] for an empty graph', () => {
    expect(reconcileLayout([], [], {})).toEqual([])
  })

  it('falls back to full dagre when stored is empty', () => {
    const nodes = [tableNode('a'), tableNode('b')]
    const edges = [relEdge('a', 'b')]
    const out = reconcileLayout(nodes, edges, {})
    // No overrides: distinct dagre positions.
    expect(out.find((n) => n.id === 'a')!.position).not.toEqual(
      out.find((n) => n.id === 'b')!.position,
    )
  })
})
```

- [ ] **Step 2: Run the test — expect a FAIL (module does not exist).**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -25
```

Expected FAIL: `Failed to resolve import "./reconcile"` (or `Cannot find module './reconcile'`) — the implementation file does not exist yet.

- [ ] **Step 3: Implement `reconcileLayout` (ungrouped path; `fitGroupBoxes` stubbed as identity).**

Create `frontend/src/entities/layout/lib/reconcile.ts` with:

```ts
/**
 * PURE layout reconciliation (Plan 4, ADR-0004). Merges stored node positions
 * into freshly-parsed flow nodes BY NODE ID. Because schemaToFlow ids nodes by
 * name, reconciling by id IS reconciling by name: a rename changes the id, the
 * stored entry no longer matches, and the node is treated as new (-> dagre).
 *
 * Strategy: run autoLayout over the FULL graph ONCE (complete dagre baseline,
 * with group sizing + member re-basing all correct), then OVERRIDE the position
 * of every non-group node that has a frame-matching stored entry. Overriding a
 * grouped member can push it outside the dagre-computed group box, so a final
 * fitGroupBoxes pass re-sizes each group node to fit ALL its members. This is
 * simpler than laying out a partial graph (which breaks group sizing).
 *
 * entities layer: imports only entities/erd (autoLayout + TYPES) and the
 * entities/layout types. NO React, NO React Flow runtime (FSD downward imports).
 */
import { autoLayout } from '@/entities/erd'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd'
import { fitGroupBoxes } from './groupBox'
import type { LayoutPositions, StoredLayout } from '@/entities/layout/model/types'

/**
 * True when a stored entry's frame matches a flow node's frame: both ungrouped
 * (parentId undefined on both) OR grouped under the same parent. A mismatch
 * (table moved groups / became grouped / became ungrouped) means the stored
 * coords are in the wrong frame, so the node must fall back to dagre.
 */
function frameMatches(node: ErdFlowNode, stored: { parentId?: string }): boolean {
  return (node.parentId ?? undefined) === (stored.parentId ?? undefined)
}

/**
 * Merge stored positions into freshly-parsed flow nodes (ADR-0004, by node id).
 * PURE & deterministic. Reuses autoLayout for the unpositioned fallback.
 */
export function reconcileLayout(
  flowNodes: ErdFlowNode[],
  flowEdges: ErdFlowEdge[],
  stored: LayoutPositions,
): ErdFlowNode[] {
  if (flowNodes.length === 0) return []

  // 1. Full-graph dagre baseline (group sizing + member re-basing all correct).
  const baseline = autoLayout(flowNodes, flowEdges)

  // 2. Override non-group nodes that have a frame-matching stored entry.
  const overridden = baseline.map((node) => {
    if (node.type === 'group') return node // group nodes are never positioned from stored data
    const entry = stored[node.id]
    if (!entry || !frameMatches(node, entry)) return node // unpositioned -> keep dagre baseline
    return { ...node, position: { x: entry.x, y: entry.y } }
  })

  // 3. Re-fit each group node to its (possibly moved) members.
  return fitGroupBoxes(overridden)
}

/**
 * Extract current node positions into the persisted shape. Excludes group
 * container nodes (their position/size are layout output, not persisted).
 * Records parentId for grouped members so reconcile can frame-guard on restore.
 */
export function nodesToLayout(nodes: ErdFlowNode[]): StoredLayout {
  const positions: LayoutPositions = {}
  for (const node of nodes) {
    if (node.type === 'group') continue
    positions[node.id] = {
      x: node.position.x,
      y: node.position.y,
      ...(node.parentId ? { parentId: node.parentId } : {}),
    }
  }
  return { version: 1, positions }
}
```

- [ ] **Step 4: Create the identity stub for `fitGroupBoxes` so this task's tests can pass.**

`reconcile.ts` imports `fitGroupBoxes` from `./groupBox`; create that file now as an identity pass (real implementation lands in Task 5). Create `frontend/src/entities/layout/lib/groupBox.ts`:

```ts
/**
 * PURE group-box refit (Plan 4). After reconcile overrides member positions, a
 * grouped member can fall outside the dagre-computed group box; this recomputes
 * each group node's position + style.width/height to fit ALL its members, then
 * re-bases members relative to the new group origin.
 *
 * entities layer: imports only entities/erd TYPES. NO React Flow runtime.
 */
import type { ErdFlowNode } from '@/entities/erd'

// Placeholder identity pass; real implementation in Task 5.
export function fitGroupBoxes(nodes: ErdFlowNode[]): ErdFlowNode[] {
  return nodes
}
```

- [ ] **Step 5: Run the test — expect PASS.**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -20
```

Expected: all 5 tests in `reconcile.test.ts` pass (`Test Files 1 passed`).

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/lib/reconcile.ts src/entities/layout/lib/reconcile.test.ts src/entities/layout/lib/groupBox.ts && \
  git commit -m "feat(layout): reconcileLayout overrides dagre baseline with stored positions by id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Rename loses position; removed entry dropped (id semantics)

ADR-0004's two automatic behaviors fall straight out of node-id-as-name-key: a renamed table gets a new id with no stored entry (-> dagre, loses position), and a stored id absent from the parse is silently ignored (orphan, no special pruning). No new implementation code — these tests prove the semantics already hold. (If they fail, the override loop in Task 2 is wrong.)

**Files:**
- Test: `frontend/src/entities/layout/lib/reconcile.test.ts` (extend)

- [ ] **Step 1: Add the cases (expected to pass once run).**

Append a new `describe` block to `frontend/src/entities/layout/lib/reconcile.test.ts` (after the existing `describe('reconcileLayout (ungrouped)', ...)` block, reusing the `tableNode`/`relEdge` helpers already defined at the top of the file):

```ts
describe('reconcileLayout (ADR-0004 id semantics)', () => {
  it('treats a renamed table (new id) as new -> dagre, not the old stored coords', () => {
    // Stored layout was for the OLD name; the parse now emits the NEW name.
    const stored: LayoutPositions = {
      'public.users': { x: 999, y: 999 },
    }
    const nodes = [tableNode('public.members'), tableNode('public.posts')]
    const edges = [relEdge('public.members', 'public.posts')]
    const out = reconcileLayout(nodes, edges, stored)
    const renamed = out.find((n) => n.id === 'public.members')!
    // No stored entry for the new id -> dagre position, NOT the orphaned (999,999).
    expect(renamed.position).not.toEqual({ x: 999, y: 999 })
    expect(typeof renamed.position.x).toBe('number')
  })

  it('silently ignores a stored id that is absent from the parse (orphan)', () => {
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 },
      'public.deleted_table': { x: 10, y: 10 }, // no longer in the schema
    }
    const nodes = [tableNode('public.users')]
    const edges: ErdFlowEdge[] = []
    const out = reconcileLayout(nodes, edges, stored)
    // Orphan produces no node; only the present node is returned.
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('public.users')
    expect(out.find((n) => n.id === 'public.deleted_table')).toBeUndefined()
    // Present node still honored its stored entry.
    expect(out[0].position).toEqual({ x: 320, y: 80 })
  })
})
```

- [ ] **Step 2: Run the test — expect PASS (semantics already correct).**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -20
```

Expected: both new cases pass (id-based override + the orphan never being produced are inherent to mapping over `flowNodes`). If either fails, the Task 2 override loop must be reviewed before continuing.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/lib/reconcile.test.ts && \
  git commit -m "test(layout): rename loses position + orphan stored entries dropped (ADR-0004)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Grouped-member frame guard (relative coords kept / dropped)

A stored RELATIVE position is only valid under the SAME parent group. `reconcileLayout` keeps it when `stored.parentId === node.parentId`, and falls back to dagre when they differ (table moved groups / became grouped / became ungrouped). The `frameMatches` helper from Task 2 already implements this; these tests lock all three mismatch shapes plus the matching-keep case.

**Files:**
- Test: `frontend/src/entities/layout/lib/reconcile.test.ts` (extend)

- [ ] **Step 1: Add a `groupNode` helper and the frame-guard cases.**

Add this `groupNode` helper just below the existing `tableNode`/`relEdge` helpers at the top of `frontend/src/entities/layout/lib/reconcile.test.ts`:

```ts
function groupNode(id: string): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    data: { groupName: id },
  }
}
```

Then append the block:

```ts
describe('reconcileLayout (grouped-member frame guard)', () => {
  it('keeps a stored RELATIVE position when parentId matches', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
    ]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // Frame matches -> stored RELATIVE coords kept verbatim (before group refit
    // re-bases; with the single member at the top-left after refit it stays put).
    expect(users.position).toEqual({ x: 24, y: 12 })
  })

  it('drops a stored position when the node moved to a DIFFERENT group', () => {
    const nodes = [
      groupNode('group:core'),
      groupNode('group:billing'),
      tableNode('public.users', 'group:billing'), // now under a different group
    ]
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' }, // saved under the OLD group
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // parentId mismatch -> stale frame -> dagre, NOT the stored (24,12).
    expect(users.position).not.toEqual({ x: 24, y: 12 })
  })

  it('drops a stored UNGROUPED position when the node became grouped', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'), // now grouped
    ]
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 320, y: 80 }, // saved while ungrouped (no parentId)
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // stored.parentId undefined but node.parentId='group:core' -> mismatch -> dagre.
    expect(users.position).not.toEqual({ x: 320, y: 80 })
  })

  it('drops a stored GROUPED position when the node became ungrouped', () => {
    const nodes = [tableNode('public.users')] // no parentId now
    const edges: ErdFlowEdge[] = []
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' }, // saved while grouped
    }
    const out = reconcileLayout(nodes, edges, stored)
    const users = out.find((n) => n.id === 'public.users')!
    // node.parentId undefined but stored.parentId set -> mismatch -> dagre.
    expect(users.position).not.toEqual({ x: 24, y: 12 })
  })
})
```

- [ ] **Step 2: Run the test — expect PASS (frameMatches already implements the guard).**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -20
```

Expected: all four frame-guard cases pass. The keep-case asserts `{x:24,y:12}` exactly — this holds while `fitGroupBoxes` is still the identity stub (Task 2). **Task 5 makes `fitGroupBoxes` re-base members, so its Step 1 changes this single assertion to a containment check.** Do not assert exact relative coords once the real refit lands.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/lib/reconcile.test.ts && \
  git commit -m "test(layout): grouped-member frame guard keeps/drops by parentId match

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `fitGroupBoxes` — re-fit group box to dragged members & re-base

Replace the identity stub with the real refit. After reconcile overrides member positions, a member can land outside the dagre-computed group box. `fitGroupBoxes` recomputes each group node's position + `style.width`/`height` to cover ALL its members in ABSOLUTE space, then re-bases members so their `position` is relative to the NEW group origin — using the SAME size estimates + `GROUP_PADDING` as `autoLayout` so the colored region and member coords never diverge.

**Files:**
- Modify: `frontend/src/entities/layout/lib/groupBox.ts`
- Create: `frontend/src/entities/layout/lib/groupBox.test.ts`
- Modify: `frontend/src/entities/layout/lib/reconcile.test.ts` (adjust the one keep-assertion per the Task 4 note)

- [ ] **Step 1: Adjust the Task 4 exact-coord assertion (now that refit re-bases).**

In `frontend/src/entities/layout/lib/reconcile.test.ts`, replace the body of the `keeps a stored RELATIVE position when parentId matches` test with a containment assertion (the member must stay inside the refit group box; exact coords change because refit re-bases):

```ts
  it('keeps a stored RELATIVE position when parentId matches', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
    ]
    const edges = [relEdge('public.users', 'public.posts')]
    const stored: LayoutPositions = {
      'public.users': { x: 24, y: 12, parentId: 'group:core' },
      'public.posts': { x: 24, y: 200, parentId: 'group:core' },
    }
    const out = reconcileLayout(nodes, edges, stored)
    const group = out.find((n) => n.id === 'group:core')!
    const groupW = Number(group.style?.width)
    const groupH = Number(group.style?.height)
    const users = out.find((n) => n.id === 'public.users')!
    // Frame matched -> stored coords honored; refit re-bases members to be
    // relative to the new group origin, so they sit INSIDE the group box
    // (empty-column table node = 240x40, matching autoLayout's nodeSize).
    const MEMBER_W = 240
    const MEMBER_H = 40
    expect(users.position.x).toBeGreaterThanOrEqual(0)
    expect(users.position.y).toBeGreaterThanOrEqual(0)
    expect(users.position.x + MEMBER_W).toBeLessThanOrEqual(groupW)
    expect(users.position.y + MEMBER_H).toBeLessThanOrEqual(groupH)
  })
```

- [ ] **Step 2: Write the FAILING `groupBox` test.**

Create `frontend/src/entities/layout/lib/groupBox.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { fitGroupBoxes } from './groupBox'
import type { ErdFlowNode } from '@/entities/erd'

/** Empty-column table node (autoLayout nodeSize estimate: 240 x 40). */
function memberNode(id: string, parentId: string, x: number, y: number): ErdFlowNode {
  return {
    id,
    type: 'table',
    position: { x, y },
    parentId,
    data: { tableName: id, tableId: id, columns: [] },
  }
}

function groupNode(id: string, x: number, y: number): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    style: { width: 10, height: 10 },
    data: { groupName: id },
  }
}

describe('fitGroupBoxes', () => {
  it('expands the group box to cover a member dragged beyond the old box and re-bases members', () => {
    const GROUP_PADDING = 24
    const MEMBER_W = 240
    const MEMBER_H = 40
    // Group originally at absolute (100,100), 10x10. One member sits at the
    // origin; another was "dragged" far to the right (relative x=500) so it
    // falls well outside the old 10x10 box.
    const nodes = [
      groupNode('group:core', 100, 100),
      memberNode('public.a', 'group:core', 0, 0),
      memberNode('public.b', 'group:core', 500, 0),
    ]
    const out = fitGroupBoxes(nodes)
    const group = out.find((n) => n.id === 'group:core')!
    const a = out.find((n) => n.id === 'public.a')!
    const b = out.find((n) => n.id === 'public.b')!

    const groupW = Number(group.style?.width)
    const groupH = Number(group.style?.height)
    // Box now spans both members (x range 0..500+240) + 2*padding.
    expect(groupW).toBe(500 + MEMBER_W + GROUP_PADDING * 2)
    expect(groupH).toBe(MEMBER_H + GROUP_PADDING * 2)

    // Members re-based relative to the NEW origin: both inside [0, groupSize].
    for (const m of [a, b]) {
      expect(m.position.x).toBeGreaterThanOrEqual(0)
      expect(m.position.y).toBeGreaterThanOrEqual(0)
      expect(m.position.x + MEMBER_W).toBeLessThanOrEqual(groupW)
      expect(m.position.y + MEMBER_H).toBeLessThanOrEqual(groupH)
    }
    // The leftmost/topmost member sits exactly at the padding inset.
    expect(a.position).toEqual({ x: GROUP_PADDING, y: GROUP_PADDING })
  })

  it('leaves a group node with no members untouched', () => {
    const nodes = [groupNode('group:empty', 5, 5)]
    const out = fitGroupBoxes(nodes)
    expect(out[0].position).toEqual({ x: 5, y: 5 })
  })

  it('passes ungrouped nodes through unchanged', () => {
    const lone: ErdFlowNode = {
      id: 'public.solo',
      type: 'table',
      position: { x: 7, y: 9 },
      data: { tableName: 'solo', tableId: 'public.solo', columns: [] },
    }
    const out = fitGroupBoxes([lone])
    expect(out[0].position).toEqual({ x: 7, y: 9 })
  })
})
```

- [ ] **Step 3: Run the test — expect FAIL (stub returns input unchanged).**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/groupBox.test.ts 2>&1 | tail -25
```

Expected FAIL: the first case fails on `expect(groupW).toBe(...)` — the stub leaves `style.width` at `10`, so `Number(group.style?.width)` is `10`, not `500 + 240 + 48`.

- [ ] **Step 4: Implement `fitGroupBoxes`.**

Replace the ENTIRE contents of `frontend/src/entities/layout/lib/groupBox.ts` with:

```ts
/**
 * PURE group-box refit (Plan 4). After reconcile overrides member positions, a
 * grouped member can fall outside the dagre-computed group box. For every group
 * node this recomputes its position + style.width/height to fit ALL its members
 * in ABSOLUTE space, then re-bases members so their `position` is relative to the
 * NEW group origin (React Flow: child absolute = parentAbsolute + child.position).
 *
 * Uses the SAME node-size estimates + GROUP_PADDING as entities/erd autoLayout so
 * the colored group region and member coords never diverge. Group nodes with no
 * members and all ungrouped nodes pass through unchanged.
 *
 * entities layer: imports only entities/erd TYPES. NO React Flow runtime.
 */
import type { ErdFlowNode } from '@/entities/erd'

// Mirror of autoLayout's size estimates (entities/erd/lib/autoLayout.ts).
const TABLE_WIDTH = 240
const HEADER_HEIGHT = 40
const ROW_HEIGHT = 26
const ENUM_WIDTH = 200
const STICKY_WIDTH = 220
const STICKY_HEIGHT = 120
const GROUP_PADDING = 24

/** Estimate a node's rendered size (same heuristics as autoLayout.nodeSize). */
function nodeSize(node: ErdFlowNode): { width: number; height: number } {
  if (node.type === 'table') {
    const cols = Array.isArray((node.data as { columns?: unknown[] }).columns)
      ? (node.data as { columns: unknown[] }).columns.length
      : 0
    return { width: TABLE_WIDTH, height: HEADER_HEIGHT + cols * ROW_HEIGHT }
  }
  if (node.type === 'enum') {
    const vals = Array.isArray((node.data as { values?: unknown[] }).values)
      ? (node.data as { values: unknown[] }).values.length
      : 0
    return { width: ENUM_WIDTH, height: HEADER_HEIGHT + vals * ROW_HEIGHT }
  }
  return { width: STICKY_WIDTH, height: STICKY_HEIGHT }
}

/**
 * Re-fit each group node to cover all its members and re-base members to the new
 * group origin. PURE: returns NEW nodes; input is not mutated.
 */
export function fitGroupBoxes(nodes: ErdFlowNode[]): ErdFlowNode[] {
  const groups = nodes.filter((n) => n.type === 'group')
  if (groups.length === 0) return nodes

  // Build, for each group, the absolute bbox of its members (member absolute =
  // group OLD absolute + member relative). Then the new group origin = bbox
  // top-left minus padding; new size = bbox extent + 2*padding.
  const newOrigin = new Map<string, { x: number; y: number }>()
  const newSize = new Map<string, { width: number; height: number }>()

  for (const group of groups) {
    const members = nodes.filter((n) => n.parentId === group.id)
    if (members.length === 0) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const m of members) {
      const { width, height } = nodeSize(m)
      const absX = group.position.x + m.position.x
      const absY = group.position.y + m.position.y
      minX = Math.min(minX, absX)
      minY = Math.min(minY, absY)
      maxX = Math.max(maxX, absX + width)
      maxY = Math.max(maxY, absY + height)
    }
    newOrigin.set(group.id, { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING })
    newSize.set(group.id, {
      width: maxX - minX + GROUP_PADDING * 2,
      height: maxY - minY + GROUP_PADDING * 2,
    })
  }

  return nodes.map((node) => {
    if (node.type === 'group') {
      const origin = newOrigin.get(node.id)
      const size = newSize.get(node.id)
      if (!origin || !size) return node // no members -> untouched
      return {
        ...node,
        position: origin,
        style: { ...node.style, width: size.width, height: size.height },
      }
    }
    // Re-base a grouped member relative to its group's NEW origin.
    if (node.parentId) {
      const oldGroup = groups.find((g) => g.id === node.parentId)
      const origin = newOrigin.get(node.parentId)
      if (oldGroup && origin) {
        const absX = oldGroup.position.x + node.position.x
        const absY = oldGroup.position.y + node.position.y
        return { ...node, position: { x: absX - origin.x, y: absY - origin.y } }
      }
    }
    return node
  })
}
```

- [ ] **Step 5: Run BOTH affected test files — expect PASS.**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/groupBox.test.ts src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -25
```

Expected: both files green. `groupBox.test.ts` (3 cases) passes; `reconcile.test.ts` still passes including the now-containment-based grouped keep-case.

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/lib/groupBox.ts src/entities/layout/lib/groupBox.test.ts src/entities/layout/lib/reconcile.test.ts && \
  git commit -m "feat(layout): fitGroupBoxes re-fits group box to dragged members and re-bases

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `nodesToLayout` — extract positions to the persisted shape

`nodesToLayout` (already implemented alongside `reconcileLayout` in Task 2) lifts the canvas's current node positions into a `StoredLayout`. It excludes group container nodes (their position/size are recomputed each parse, never persisted) and records `parentId` for grouped members (the frame guard). Lock its contract with dedicated tests.

**Files:**
- Test: `frontend/src/entities/layout/lib/reconcile.test.ts` (extend — `nodesToLayout` lives in `reconcile.ts`)

- [ ] **Step 1: Import `nodesToLayout` and add its cases.**

Change the existing import at the top of `frontend/src/entities/layout/lib/reconcile.test.ts`:

```ts
import { reconcileLayout, nodesToLayout } from './reconcile'
```

Then append the block (reuses `tableNode`/`groupNode` helpers; adds a local `enumNode`):

```ts
function enumNode(id: string): ErdFlowNode {
  return {
    id,
    type: 'enum',
    position: { x: 40, y: 80 },
    data: { enumName: id, values: [] },
  }
}

describe('nodesToLayout', () => {
  it('produces { version: 1, positions } keyed by node id', () => {
    const users = tableNode('public.users')
    users.position = { x: 320, y: 80 }
    const out = nodesToLayout([users])
    expect(out).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
    })
  })

  it('records parentId for grouped members only', () => {
    const grouped = tableNode('public.audit', 'group:internal')
    grouped.position = { x: 24, y: 12 }
    const ungrouped = tableNode('public.users')
    ungrouped.position = { x: 320, y: 80 }
    const out = nodesToLayout([grouped, ungrouped])
    expect(out.positions['public.audit']).toEqual({
      x: 24,
      y: 12,
      parentId: 'group:internal',
    })
    expect(out.positions['public.users']).toEqual({ x: 320, y: 80 })
    expect('parentId' in out.positions['public.users']).toBe(false)
  })

  it('excludes group container nodes', () => {
    const group = groupNode('group:internal')
    group.position = { x: 0, y: 0 }
    const member = tableNode('public.audit', 'group:internal')
    member.position = { x: 24, y: 12 }
    const out = nodesToLayout([group, member])
    expect(out.positions['group:internal']).toBeUndefined()
    expect(out.positions['public.audit']).toBeDefined()
  })

  it('includes enum + sticky nodes', () => {
    const out = nodesToLayout([enumNode('enum:public.role')])
    expect(out.positions['enum:public.role']).toEqual({ x: 40, y: 80 })
  })
})
```

- [ ] **Step 2: Run the test — expect PASS (`nodesToLayout` implemented in Task 2).**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/entities/layout/lib/reconcile.test.ts 2>&1 | tail -20
```

Expected: all `nodesToLayout` cases pass alongside the earlier reconcile cases. (If `nodesToLayout` is missing the `parentId` spread or the group-skip, fix `reconcile.ts` now.)

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/lib/reconcile.test.ts && \
  git commit -m "test(layout): nodesToLayout extracts positions, records parentId, skips groups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Barrel exports + full slice gate

Expose the slice's public API (`reconcileLayout`, `nodesToLayout`, `fitGroupBoxes`, and the three types) via `entities/layout/index.ts` so Block B imports from `@/entities/layout` (not deep paths). Then run the full unit suite + the TRUE type gate to confirm the slice is self-contained and the whole project still builds.

**Files:**
- Create: `frontend/src/entities/layout/index.ts`

- [ ] **Step 1: Write the barrel.**

Create `frontend/src/entities/layout/index.ts` with:

```ts
export { reconcileLayout, nodesToLayout } from './lib/reconcile'
export { fitGroupBoxes } from './lib/groupBox'
export type {
  StoredPosition,
  LayoutPositions,
  StoredLayout,
} from './model/types'
```

- [ ] **Step 2: Run the FULL unit suite — expect PASS.**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run test:run 2>&1 | tail -25
```

Expected: every test file passes (the new `reconcile.test.ts` + `groupBox.test.ts` plus all pre-existing suites — Block A touches no runtime, so nothing else changes).

- [ ] **Step 3: Run the TRUE type gate — expect PASS.**

```bash
cd /home/soron/projects/erd-dbml/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ built in …` with no TS errors. This is the gate that proves the new files type-check (solution-style tsconfig means `tsc --noEmit` would miss them).

- [ ] **Step 4: Commit.**

```bash
cd /home/soron/projects/erd-dbml/frontend && \
  git add src/entities/layout/index.ts && \
  git commit -m "feat(layout): barrel exports for reconcile/nodesToLayout/fitGroupBoxes + types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

**Block A exit criteria (all must hold before Block B):**
- `entities/layout` slice exists: `model/types.ts`, `lib/reconcile.ts`, `lib/groupBox.ts`, `index.ts` + colocated `*.test.ts`.
- `reconcileLayout` proven: positioned-kept, unpositioned->dagre, rename-loses-position (id change), removed-entry-dropped, grouped-member frame guard (keep + 3 mismatch shapes), group-box refit, empty schema.
- `nodesToLayout` proven: `{version:1,positions}`, parentId for grouped members only, group containers excluded, enum/sticky included.
- `fitGroupBoxes` proven: expands box to cover dragged members + re-bases; no-member / ungrouped pass-through.
- NO React/React Flow runtime imported anywhere in the slice (type-only `@xyflow/react`, `autoLayout` + types from `@/entities/erd`).
- NO backend changes.
- `npm run test:run` and `npm run build` both green from `frontend/`.

---

# Block B — Features wiring (canvas controlled nodes, autosave fix, persistence hook, editor compose)

Wires the pure `entities/layout` slice (Block A) into the live app: fixes the autosave layout-only-skip bug, converts `ErdCanvas` to controlled nodes with drag capture and an Auto-arrange button, adds a `features/layout-persistence` hook that holds the live positions state, and composes everything in `EditorPage`. TDD strict (failing Vitest test first). The type gate is `npm run build` (run from `frontend/`); unit runner is `npm run test:run`. All `npm` commands run from `/home/soron/projects/erd-dbml/frontend`.

**Block B depends on Block A:** `@/entities/layout` must already export `reconcileLayout`, `nodesToLayout`, and the `StoredLayout` / `LayoutPositions` / `StoredPosition` types. Do not start Block B until Block A's gate (`npm run test:run` + `npm run build`) is green.

**No backend changes.** `ProjectUpdate.layout: dict[str, Any] | None` and `ProjectRead.layout` already round-trip arbitrary nested dicts; the PATCH already persists `layout`. Block B touches the frontend only.

## Task 8: Fix `useProjectAutosave` — fire on layout-only changes (dual-baseline guard)

The bug (confirmed): in `useProjectAutosave.ts` the save-decision effect deps already include `layout`, so a layout-only drag re-runs the effect — but the guard `if (baseline !== undefined && dbmlText === baseline) return` short-circuits because `dbmlText` still equals `baseline`, so a layout-only change NEVER saves. Fix with a dual baseline compared by **serialized value** (never object identity).

**Files:**
- Modify: `frontend/src/features/project-autosave/api/useProjectAutosave.ts` (the `import` line 1; the `UseProjectAutosaveOptions` interface; the destructure; the save-decision effect)
- Test: `frontend/src/features/project-autosave/api/useProjectAutosave.test.tsx` (append cases; existing cases must stay green)

- [ ] **Step 1: Add the failing tests for layout-only save + layout seed skip.**
  Append these three cases inside the existing `describe('useProjectAutosave', ...)` block in `frontend/src/features/project-autosave/api/useProjectAutosave.test.tsx`, immediately before its closing `})`. They reuse the file's existing `mutateMock`, fake timers (`beforeEach`/`afterEach`), and the mocked `@/entities/project`.

  ```tsx
  it('saves on a layout-only change (dbmlText unchanged) when layout diverges from its baseline', () => {
    const seed = { version: 1, positions: { 'public.users': { x: 0, y: 0 } } }
    const moved = { version: 1, positions: { 'public.users': { x: 320, y: 80 } } }

    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'table users {}',
          baseline: 'table users {}', // dbml is at baseline (no text edit)
          layout,
          layoutBaseline: seed,
        }),
      { initialProps: { layout: seed } },
    )

    // Seed render: layout === layoutBaseline, dbml === baseline -> no save.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mutateMock).not.toHaveBeenCalled()

    // A drag changes only the layout; dbmlText still equals the baseline.
    rerender({ layout: moved })
    act(() => {
      vi.advanceTimersByTime(600)
    })

    expect(mutateMock).toHaveBeenCalledTimes(1)
    const [payload] = mutateMock.mock.calls[0]
    expect(payload).toEqual({ dbml_text: 'table users {}', layout: moved })
  })

  it('does NOT save when layout is re-seeded equal to its baseline (project re-seed)', () => {
    const seed = { version: 1, positions: { 'public.users': { x: 10, y: 10 } } }
    // A NEW object with identical content (mimics a query-cache update on reload).
    const reseed = JSON.parse(JSON.stringify(seed)) as Record<string, unknown>

    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'table users {}',
          baseline: 'table users {}',
          layout,
          layoutBaseline: seed,
        }),
      { initialProps: { layout: seed } },
    )

    rerender({ layout: reseed }) // new identity, SAME serialized value
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('does NOT loop when layoutBaseline is omitted but a new-identity layout object arrives', () => {
    // No layoutBaseline => layout changes must NOT trigger a save on their own
    // (only dbml edits do); guards against an inline-object infinite save loop.
    const { rerender } = renderHook(
      ({ layout }: { layout: Record<string, unknown> }) =>
        useProjectAutosave({
          projectId: 'p-1',
          dbmlText: 'seeded',
          baseline: 'seeded',
          layout,
        }),
      { initialProps: { layout: { version: 1, positions: {} } } },
    )

    // New object identity each rerender, no dbml edit, no layoutBaseline.
    rerender({ layout: { version: 1, positions: {} } })
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mutateMock).not.toHaveBeenCalled()
  })
  ```

- [ ] **Step 2: Run the new tests — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/project-autosave/api/useProjectAutosave.test.tsx 2>&1 | tail -25
  ```
  Expected: the first new case (`saves on a layout-only change ...`) fails with `expected "spy" to be called 1 times, but got 0 times` (the `dbmlText === baseline` guard skips the layout-only change). Compilation also fails because `layoutBaseline` is not yet a known option (`Object literal may only specify known properties`).

- [ ] **Step 3: Add the `useMemo` import and the `layoutBaseline` option.**
  In `frontend/src/features/project-autosave/api/useProjectAutosave.ts`, change the first import line to:
  ```ts
  import { useEffect, useMemo, useRef, useState } from 'react'
  ```
  Replace the `UseProjectAutosaveOptions` interface with:
  ```ts
  interface UseProjectAutosaveOptions {
    projectId: string
    dbmlText: string
    layout?: Record<string, unknown>
    /**
     * The last server-seeded value. Autosave never fires while dbmlText still
     * equals the baseline, so opening a project (the seed) and re-seeding on a
     * project switch don't trigger a PATCH — only genuine user edits do.
     */
    baseline?: string
    /**
     * The last server-seeded layout. A layout-only change (dragging a table;
     * dbmlText unchanged) saves only when the serialized layout diverges from
     * this baseline, so the layout seed and a project re-seed never PATCH.
     */
    layoutBaseline?: Record<string, unknown>
    delayMs?: number
  }
  ```
  Add `layoutBaseline` to the destructured params:
  ```ts
  export function useProjectAutosave({
    projectId,
    dbmlText,
    layout,
    baseline,
    layoutBaseline,
    delayMs = 600,
  }: UseProjectAutosaveOptions): UseProjectAutosaveResult {
  ```

- [ ] **Step 4: Add serialized keys and replace the single guard with a dual guard.**
  Insert the two memoized keys after the `aliveRef` mount effect, just before `const debouncedSave = ...`:
  ```ts
  // Serialize once per render so the change-detector compares by VALUE, not
  // object identity. An inline/new-identity layout object must not loop the save.
  const layoutKey = useMemo(() => JSON.stringify(layout ?? null), [layout])
  const layoutBaselineKey = useMemo(
    () => JSON.stringify(layoutBaseline ?? null),
    [layoutBaseline],
  )
  ```
  Replace the save-decision effect (currently guarded by `if (baseline !== undefined && dbmlText === baseline) return`, deps `[dbmlText, layout, baseline, debouncedSave]`) with:
  ```ts
  useEffect(() => {
    // Skip the first run after mount/switch: only autosave after a real edit.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    // Fire if dbml diverged from its baseline OR layout diverged from its
    // baseline; skip when BOTH match (covers the seed + re-seed for both
    // inputs). When baseline is undefined (no dbml seed) keep the legacy
    // "always save on dbml change" behavior; layout only fires when a
    // layoutBaseline is supplied AND its serialized value diverged.
    const dbmlChanged = baseline === undefined || dbmlText !== baseline
    const layoutChanged =
      layoutBaseline !== undefined && layoutKey !== layoutBaselineKey
    if (!dbmlChanged && !layoutChanged) {
      return
    }
    debouncedSave()
  }, [dbmlText, baseline, layoutKey, layoutBaselineKey, debouncedSave])
  ```
  Leave the `debouncedSave` body (`updateMutation.mutate({ dbml_text: dbmlText, layout }, ...)`) and the project-switch re-arm effect unchanged. **Do not keep raw `layout` in the deps** — `layoutKey` supersedes it (a raw-object dep would loop on inline identities).

- [ ] **Step 5: Run the full autosave suite — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/project-autosave/api/useProjectAutosave.test.tsx 2>&1 | tail -20
  ```
  Expected: all cases pass, including the pre-existing payload assertion `{ dbml_text: 'edited', layout: undefined }` (layout defaults to `undefined`) and the three new cases.

- [ ] **Step 6: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/features/project-autosave/api/useProjectAutosave.ts src/features/project-autosave/api/useProjectAutosave.test.tsx && \
    git commit -m "fix(project-autosave): fire on layout-only changes via dual serialized baseline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 9: `ErdCanvas` — controlled nodes + `savedPositions` reconcile path

Convert `ErdCanvasInner` from derive-and-pass to controlled `useNodesState`, reconcile saved positions via Block A, and re-seed by effect only when the serialized signatures change so live drags survive unrelated re-renders. Add the additive `savedPositions` / `onLayoutChange` props (Plan 3b callers still compile).

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` (imports lines 1–17; `ErdCanvasProps` lines 19–22; `ErdCanvasInner` lines 49–78; `ErdCanvas` wrapper lines 90 + 101–107)
- Test: `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx` (append a case)

- [ ] **Step 1: Add the failing reconcile-path test.**
  Append this case inside the existing `describe('ErdCanvas', ...)` block in `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx`, before its closing `})`. It reuses the file's existing `schema` fixture (top of file) and the global React Flow jsdom mocks from `src/test/setup.ts`.
  ```tsx
  it('renders nodes with savedPositions provided (reconcile path) without crashing', async () => {
    const savedPositions = {
      'public.users': { x: 320, y: 80 },
      'public.posts': { x: 320, y: 360 },
    }
    render(<ErdCanvas schema={schema} savedPositions={savedPositions} />)
    // Reconcile + render must still produce both table labels.
    expect(await screen.findByText('users')).toBeInTheDocument()
    expect(screen.getByText('posts')).toBeInTheDocument()
  })
  ```

- [ ] **Step 2: Run the test — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx 2>&1 | tail -20
  ```
  Expected: a TypeScript/compile error — `Property 'savedPositions' does not exist on type 'IntrinsicAttributes & ErdCanvasProps'` (the prop is not yet declared).

- [ ] **Step 3: Update imports and `ErdCanvasProps`.**
  In `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`, replace the import block (lines 1–17) with:
  ```tsx
  import { useEffect, useMemo, useRef } from 'react'
  import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    useNodesState,
    type NodeTypes,
    type EdgeTypes,
  } from '@xyflow/react'
  import '@xyflow/react/dist/style.css'
  import type { DbmlSchema } from '@/entities/dbml'
  import { schemaToFlow, type ErdFlowNode } from '@/entities/erd'
  import {
    reconcileLayout,
    nodesToLayout,
    type LayoutPositions,
    type StoredLayout,
  } from '@/entities/layout'
  import { TableNode } from './TableNode'
  import { EnumNode } from './EnumNode'
  import { StickyNote } from './StickyNote'
  import { GroupNode } from './GroupNode'
  import { RelationEdge } from './RelationEdge'
  ```
  (`autoLayout` is no longer imported here — `reconcileLayout` owns the dagre baseline. Removing it is cleanup of an import THIS change orphans.)
  Replace `ErdCanvasProps` (lines 19–22) with:
  ```tsx
  export interface ErdCanvasProps {
    /** The normalized schema to render (parse.schema ?? parse.lastValidSchema). */
    schema?: DbmlSchema
    /** Persisted positions to reconcile in (project.layout.positions). */
    savedPositions?: LayoutPositions
    /** Fired on drag-stop (and Auto-arrange) with the FULL layout to persist. */
    onLayoutChange?: (layout: StoredLayout) => void
  }
  ```
  Leave `schemaSignature` (lines 33–35) and the module-scope `nodeTypes`/`edgeTypes` (lines 39–47) unchanged.

- [ ] **Step 4: Rewrite `ErdCanvasInner` to controlled nodes.**
  Replace the whole `ErdCanvasInner` function (lines 49–78) with:
  ```tsx
  function ErdCanvasInner({ schema, savedPositions, onLayoutChange }: ErdCanvasProps) {
    // STABLE structural signature (NOT schema identity) so a no-op edit does
    // not re-run schemaToFlow + reconcile and re-seed the nodes.
    const schemaKey = useMemo(() => schemaSignature(schema), [schema])
    // STABLE serialized positions key so an unstable savedPositions identity
    // does NOT re-run reconcile and clobber an in-flight drag.
    const positionsKey = useMemo(
      () => JSON.stringify(savedPositions ?? {}),
      [savedPositions],
    )

    // Compute schemaToFlow ONCE per structural change; share its nodes+edges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const flow = useMemo(
      () => (schema ? schemaToFlow(schema) : { nodes: [], edges: [] }),
      [schemaKey],
    )

    // Reconcile saved positions into freshly-parsed nodes (Block A, by node id).
    // Keyed on schemaKey + positionsKey only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const reconciledNodes = useMemo(
      () => reconcileLayout(flow.nodes, flow.edges, savedPositions ?? {}),
      [flow, positionsKey],
    )

    const edges = useMemo(() => flow.edges, [flow])

    const [nodes, setNodes, onNodesChange] = useNodesState<ErdFlowNode>([])

    // Push reconciled nodes into state ONLY when the derived input changes —
    // NOT every render. useNodesState preserves live drags across unrelated
    // re-renders; this effect re-seeds only on a real schema/positions change.
    useEffect(() => {
      setNodes(reconciledNodes)
    }, [reconciledNodes, setNodes])

    // Read the LATEST nodes at drag-stop without a stale closure.
    const nodesRef = useRef(nodes)
    nodesRef.current = nodes

    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => onLayoutChange?.(nodesToLayout(nodesRef.current))}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    )
  }
  ```
  (`onNodeDragStop` wiring is finalized here; Task 10 adds its dedicated test. `nodesConnectable={false}` and `deleteKeyCode={null}` are kept — drag is enabled but structural connect / delete is not. No waypoint editing.)

- [ ] **Step 5: Thread the new props through the `ErdCanvas` wrapper.**
  Change the `ErdCanvas` wrapper signature (line 90):
  ```tsx
  export function ErdCanvas({ schema, savedPositions, onLayoutChange }: ErdCanvasProps) {
  ```
  and the provider block (lines 101–107):
  ```tsx
    return (
      <div data-testid="erd-canvas" className="h-full w-full rounded border">
        <ReactFlowProvider>
          <ErdCanvasInner
            schema={schema}
            savedPositions={savedPositions}
            onLayoutChange={onLayoutChange}
          />
        </ReactFlowProvider>
      </div>
    )
  ```
  Leave the empty-state placeholder (lines 91–100) unchanged.

- [ ] **Step 6: Run the canvas suite — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx 2>&1 | tail -20
  ```
  Expected: all cases pass, including the new `renders nodes with savedPositions ...` and the existing `schemaSignature` cases.

- [ ] **Step 7: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/features/erd-canvas/ui/ErdCanvas.tsx src/features/erd-canvas/ui/ErdCanvas.test.tsx && \
    git commit -m "feat(erd-canvas): controlled nodes reconciling savedPositions via entities/layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 10: `ErdCanvas` — drag-stop lifts `StoredLayout`; group nodes non-draggable

Verify the `onNodeDragStop` → `onLayoutChange(nodesToLayout(...))` wiring fires and emits the persisted shape, and make group container nodes non-draggable (Plan 4 persists only table/enum/sticky positions). jsdom cannot simulate real drag pixel geometry, so the test asserts the **handler contract** by invoking the wired callback through React Flow's prop, not by moving the pointer.

**Decision (chosen here, not deferred): separate test FILE for the mock-driven wiring tests.** `vi.mock('@xyflow/react')` is hoisted file-wide, so it would replace the real `ReactFlow` for the WHOLE `ErdCanvas.test.tsx` file — breaking Task 9's `findByText('users')`/`getByText('posts')` label assertions, which need the REAL React Flow to render node bodies. To keep both regimes clean, the mock-driven drag-stop (Task 10) and Auto-arrange (Task 11) wiring tests live in a **new file** `ErdCanvas.wiring.test.tsx` that owns the file-wide mock; the real-render label test (Task 9) stays in `ErdCanvas.test.tsx` with the real React Flow. The mock **must render its children** so the descendant `<Panel>`/`<Button>` (Task 11) mount.

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` (`ErdCanvasInner` — set `draggable: false` on group nodes; reuse the existing `onNodeDragStop`)
- Create: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx` (new file owning the `@xyflow/react` mock; Task 9's `ErdCanvas.test.tsx` keeps the real React Flow)
- Create: `frontend/src/features/erd-canvas/ui/ErdCanvas.fixture.ts` (the shared two-table `schema` fixture, extracted so both canvas test files import ONE copy)
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx` (import `schema` from the new fixture instead of defining it inline)

- [ ] **Step 0: Extract the shared `schema` fixture so both test files use one copy.**
  Move the existing inline `const schema: DbmlSchema = { ... }` block (currently at the top of `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx`) into a new module `frontend/src/features/erd-canvas/ui/ErdCanvas.fixture.ts`:
  ```ts
  import type { DbmlSchema } from '@/entities/dbml'

  /** Two-table fixture (`public.users` + `public.posts` with an n-1 relation)
   *  shared by ErdCanvas.test.tsx and ErdCanvas.wiring.test.tsx. Lifted verbatim
   *  from ErdCanvas.test.tsx so the node ids match in both. */
  export const schema: DbmlSchema = {
    /* ...the exact object currently defined inline at the top of
       ErdCanvas.test.tsx (tables users/posts, the n-1 ref, empty enums/
       tableGroups/notes) — moved here unchanged... */
  }
  ```
  Then in `ErdCanvas.test.tsx`, DELETE the inline `const schema` definition and import it instead:
  ```tsx
  import { schema } from './ErdCanvas.fixture'
  ```
  (`ErdCanvas.test.tsx` keeps its real-React-Flow render tests unchanged otherwise; only the fixture source moves. Run `npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx` to confirm it stays green after the extraction.)

- [ ] **Step 1: Create the wiring test file with the failing drag-stop wiring test.**
  jsdom has no `DOMMatrix`/real viewport transform, so we mock `@xyflow/react`'s `ReactFlow` to expose `onNodeDragStop` and immediately invoke it, asserting `onLayoutChange` receives a `StoredLayout`. Create `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx` with these imports + the hoisted `vi.mock` at the top (the mock **renders `props.children`** so descendant `<Panel>`/button mount in Task 11):
  ```tsx
  import * as React from 'react'
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ErdCanvas } from './ErdCanvas'
  import { schema } from './ErdCanvas.fixture'

  // `schema` is the two-table fixture (`public.users` + `public.posts` with a
  // relation) extracted into ErdCanvas.fixture.ts (Step 0 below) so this file
  // and ErdCanvas.test.tsx share ONE source of truth and node ids match.

  // Mock the React Flow runtime so we can drive onNodeDragStop without a real
  // DOM drag (jsdom has no DOMMatrix / viewport transform). The mock captures
  // the props ErdCanvasInner passes AND renders its children so descendant
  // <Panel>/<Button> (Task 11) mount. (Mocks hoist to the top of the file.)
  vi.mock('@xyflow/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@xyflow/react')>()
    return {
      ...actual,
      ReactFlow: (props: { children?: React.ReactNode } & Record<string, unknown>) => {
        ;(globalThis as Record<string, unknown>).__rfProps = props
        return <div data-testid="rf-mock">{props.children}</div>
      },
    }
  })
  ```
  Then add the drag-stop `describe`:
  ```tsx
  describe('ErdCanvas drag-stop persistence', () => {
    it('lifts a StoredLayout via onLayoutChange when a node drag stops', async () => {
      const onLayoutChange = vi.fn()
      render(
        <ErdCanvas
          schema={schema}
          savedPositions={{ 'public.users': { x: 320, y: 80 } }}
          onLayoutChange={onLayoutChange}
        />,
      )

      // The mocked ReactFlow stored the props; read its wired handlers + nodes.
      const props = (globalThis as Record<string, unknown>).__rfProps as {
        nodes: Array<{ id: string; type?: string }>
        onNodeDragStop: () => void
      }
      // Group nodes (none here) would be non-draggable; tables are draggable.
      expect(props.nodes.some((n) => n.id === 'public.users')).toBe(true)

      // Fire drag-stop the way React Flow would.
      props.onNodeDragStop()

      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      const lifted = onLayoutChange.mock.calls[0][0] as {
        version: number
        positions: Record<string, { x: number; y: number }>
      }
      expect(lifted.version).toBe(1)
      expect(lifted.positions['public.users']).toBeDefined()
    })
  })
  ```

- [ ] **Step 2: Run the wiring test file — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx 2>&1 | tail -25
  ```
  Expected: the new case fails. If Task 9's `onNodeDragStop` is present it may already emit; the explicit condition this task locks in is the **group non-draggable** guard (next step) and the dedicated assertion. If `onNodeDragStop` were missing it would fail with `props.onNodeDragStop is not a function`.
  > NOTE: the `@xyflow/react` mock lives in the SEPARATE `ErdCanvas.wiring.test.tsx` file (the chosen split, above), so Task 9's `findByText('users')`/`getByText('posts')` label assertions in `ErdCanvas.test.tsx` keep the REAL React Flow and are unaffected. The mock here renders `props.children`, so the `<Panel>`/`<Button>` added in Task 11 will mount; it does NOT render real `TableNode` bodies (no RF store/context), so this file asserts only on the captured `__rfProps` (wired handlers + `nodes` array), never on node label text.

- [ ] **Step 3: Mark group container nodes non-draggable in the reconciled set.**
  In `ErdCanvasInner` (Task 9), map group nodes to `draggable: false` right after `reconcileLayout`. Replace the `reconciledNodes` `useMemo` body so its result fixes group draggability:
  ```tsx
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const reconciledNodes = useMemo(() => {
      const next = reconcileLayout(flow.nodes, flow.edges, savedPositions ?? {})
      // Group containers are layout output (position + size recomputed each
      // parse); Plan 4 never persists them, so they must not be dragged.
      return next.map((n) =>
        n.type === 'group' ? { ...n, draggable: false } : n,
      )
    }, [flow, positionsKey])
  ```

- [ ] **Step 4: Run both canvas test files — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx 2>&1 | tail -20
  ```
  Expected: both files pass — the new wiring case in `ErdCanvas.wiring.test.tsx` AND the untouched Task 9 real-render label assertions in `ErdCanvas.test.tsx` (which keep the real React Flow because the mock is scoped to the wiring file only).

- [ ] **Step 5: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/features/erd-canvas/ui/ErdCanvas.tsx src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx && \
    git commit -m "feat(erd-canvas): lift StoredLayout on drag-stop; group nodes non-draggable

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 11: `ErdCanvas` — one-shot "Auto-arrange" button (Decision B)

Add a `<Panel position="top-right">` button that discards all saved positions, re-runs dagre for every node (reconcile with empty positions), emits the cleared/auto layout so autosave overwrites stored layout, and re-fits the viewport imperatively.

**Files:**
- Modify: `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` (`ErdCanvasInner` imports + render; add the button)
- Test: `frontend/src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx` (append a case; extend the Task 10 mock in the SAME wiring file)

- [ ] **Step 1: Add the failing Auto-arrange test to the wiring file.**
  Extend the `@xyflow/react` mock from Task 10 (in `ErdCanvas.wiring.test.tsx`) to also expose `Panel` and `useReactFlow` (with a `fitView` spy). Replace the `vi.mock('@xyflow/react', ...)` factory at the top of the wiring test file with — note the mocked `ReactFlow` STILL renders `props.children` (mandatory, so the `<Panel>` child and the Auto-arrange `<Button>` mount; the separately-mocked `Panel` then renders its own children):
  ```tsx
  const fitViewMock = vi.fn()
  vi.mock('@xyflow/react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@xyflow/react')>()
    return {
      ...actual,
      ReactFlow: (props: { children?: React.ReactNode } & Record<string, unknown>) => {
        ;(globalThis as Record<string, unknown>).__rfProps = props
        return <div data-testid="rf-mock">{props.children}</div>
      },
      Panel: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="rf-panel">{children}</div>
      ),
      useReactFlow: () => ({ fitView: fitViewMock }),
    }
  })
  ```
  (Add `import userEvent from '@testing-library/user-event'` at the top of the wiring test file if absent; `import * as React from 'react'` is already present from Task 10.) Then append:
  ```tsx
  describe('ErdCanvas Auto-arrange', () => {
    it('renders an accessible Auto-arrange button that re-emits a recomputed layout', async () => {
      const user = userEvent.setup()
      const onLayoutChange = vi.fn()
      // Seed an off-dagre saved position so the auto-arranged result differs.
      render(
        <ErdCanvas
          schema={schema}
          savedPositions={{ 'public.users': { x: 999, y: 999 } }}
          onLayoutChange={onLayoutChange}
        />,
      )

      const button = screen.getByRole('button', { name: /auto-arrange/i })
      expect(button).toBeInTheDocument()

      await user.click(button)

      // Emitted a fresh layout (positions derived from dagre, not the saved 999).
      expect(onLayoutChange).toHaveBeenCalled()
      const emitted = onLayoutChange.mock.calls.at(-1)?.[0] as {
        version: number
        positions: Record<string, { x: number; y: number }>
      }
      expect(emitted.version).toBe(1)
      expect(emitted.positions['public.users']).toBeDefined()
      expect(emitted.positions['public.users']).not.toEqual({ x: 999, y: 999 })
    })
  })
  ```
  The Auto-arrange handler calls `requestAnimationFrame(() => fitView(...))`; jsdom provides `requestAnimationFrame`, so the test does not need to await it — the `onLayoutChange` emit is synchronous on click.

- [ ] **Step 2: Run the wiring test file — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx 2>&1 | tail -20
  ```
  Expected: `Unable to find an accessible element with the role "button" and name /auto-arrange/i` — the button does not exist yet. (The mocked `ReactFlow` already renders `props.children`, so once the `<Panel>`/`<Button>` are implemented in Step 3 they WILL mount and `getByRole` will resolve — this FAIL is purely "no button yet", not a dropped-children artifact.)

- [ ] **Step 3: Add `Panel` / `useReactFlow` imports, the Button import, and the button.**
  In `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`, extend the `@xyflow/react` import (from Task 9) to include `Panel` and `useReactFlow`:
  ```tsx
  import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    Panel,
    useNodesState,
    useReactFlow,
    type NodeTypes,
    type EdgeTypes,
  } from '@xyflow/react'
  ```
  Add the project Button import (FSD: feature importing shared is downward — allowed):
  ```tsx
  import { Button } from '@/shared/ui/button'
  ```
  Inside `ErdCanvasInner`, add the imperative re-fit hook and the auto-arrange handler just before the `return`:
  ```tsx
    const { fitView } = useReactFlow()

    function handleAutoArrange() {
      // Discard ALL saved positions: reconcile with an EMPTY set => pure dagre.
      const dagreNodes = reconcileLayout(flow.nodes, flow.edges, {}).map((n) =>
        n.type === 'group' ? { ...n, draggable: false } : n,
      )
      setNodes(dagreNodes)
      onLayoutChange?.(nodesToLayout(dagreNodes))
      // Re-fit after measurement lands (v12 fitView is initial-only otherwise).
      requestAnimationFrame(() => fitView({ padding: 0.1, duration: 200 }))
    }
  ```
  Add the `<Panel>` as the first child inside `<ReactFlow>`:
  ```tsx
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => onLayoutChange?.(nodesToLayout(nodesRef.current))}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-right">
          <Button variant="outline" size="sm" onClick={handleAutoArrange}>
            Auto-arrange
          </Button>
        </Panel>
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
  ```
  The visible text "Auto-arrange" is the button's accessible name (no extra `aria-label` needed).

- [ ] **Step 4: Run both canvas test files — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx 2>&1 | tail -20
  ```
  Expected: all cases pass. Because the mocked `ReactFlow` renders `props.children`, the `<Panel>` child mounts and the mocked `Panel` renders the Auto-arrange `<Button>`, so `getByRole('button', { name: /auto-arrange/i })` resolves and clicking it emits the recomputed `StoredLayout` via `onLayoutChange`. The Task 9 real-render label assertions in `ErdCanvas.test.tsx` remain green (unaffected by the wiring-file mock).

- [ ] **Step 5: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/features/erd-canvas/ui/ErdCanvas.tsx src/features/erd-canvas/ui/ErdCanvas.wiring.test.tsx && \
    git commit -m "feat(erd-canvas): one-shot Auto-arrange button discarding saved positions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 12: `features/layout-persistence` — positions state hook

A small feature hook that owns the live `positions` state, seeds it from `project.layout`, exposes a setter for `onLayoutChange`, and produces the **referentially stable** `StoredLayout` (and `layoutBaseline`) objects fed to `useProjectAutosave`. Centralizing this keeps `EditorPage` thin and the stability guarantee in one tested place.

**Files:**
- Create: `frontend/src/features/layout-persistence/api/useLayoutPersistence.ts`
- Create: `frontend/src/features/layout-persistence/index.ts`
- Test: `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx`

- [ ] **Step 1: Write the failing hook test.**
  Create `frontend/src/features/layout-persistence/api/useLayoutPersistence.test.tsx`:
  ```tsx
  import { describe, it, expect } from 'vitest'
  import { act, renderHook } from '@testing-library/react'
  import { useLayoutPersistence } from './useLayoutPersistence'

  describe('useLayoutPersistence', () => {
    it('seeds positions + baseline from project.layout.positions keyed on projectId', () => {
      const layout = {
        version: 1,
        positions: { 'public.users': { x: 10, y: 20 } },
      }
      const { result } = renderHook(() =>
        useLayoutPersistence({ projectId: 'p-1', projectLayout: layout }),
      )
      expect(result.current.positions).toEqual({ 'public.users': { x: 10, y: 20 } })
      expect(result.current.layout).toEqual({
        version: 1,
        positions: { 'public.users': { x: 10, y: 20 } },
      })
      expect(result.current.layoutBaseline).toEqual({
        version: 1,
        positions: { 'public.users': { x: 10, y: 20 } },
      })
    })

    it('treats a missing/empty/legacy project.layout as no positions', () => {
      const { result } = renderHook(() =>
        useLayoutPersistence({ projectId: 'p-1', projectLayout: {} }),
      )
      expect(result.current.positions).toEqual({})
      expect(result.current.layout).toEqual({ version: 1, positions: {} })
    })

    it('keeps the layout object referentially stable across re-renders until positions change', () => {
      const layout = { version: 1, positions: {} }
      const { result, rerender } = renderHook(
        ({ pid }: { pid: string }) =>
          useLayoutPersistence({ projectId: pid, projectLayout: layout }),
        { initialProps: { pid: 'p-1' } },
      )
      const first = result.current.layout
      rerender({ pid: 'p-1' }) // same project, no position change
      expect(result.current.layout).toBe(first) // SAME identity (no save loop)
    })

    it('setPositions updates positions + the derived layout (new identity)', () => {
      const { result } = renderHook(() =>
        useLayoutPersistence({ projectId: 'p-1', projectLayout: {} }),
      )
      const before = result.current.layout
      act(() => {
        result.current.setPositions({ 'public.users': { x: 5, y: 5 } })
      })
      expect(result.current.positions).toEqual({ 'public.users': { x: 5, y: 5 } })
      expect(result.current.layout).not.toBe(before)
      expect(result.current.layout.positions).toEqual({
        'public.users': { x: 5, y: 5 },
      })
      // Baseline stays at the seeded (empty) value so a drag DIVERGES from it.
      expect(result.current.layoutBaseline).toEqual({ version: 1, positions: {} })
    })

    it('re-seeds positions when projectId changes', () => {
      let pid = 'p-1'
      let projectLayout: Record<string, unknown> = {
        version: 1,
        positions: { 'public.a': { x: 1, y: 1 } },
      }
      const { result, rerender } = renderHook(() =>
        useLayoutPersistence({ projectId: pid, projectLayout }),
      )
      expect(result.current.positions).toEqual({ 'public.a': { x: 1, y: 1 } })
      pid = 'p-2'
      projectLayout = { version: 1, positions: { 'public.b': { x: 2, y: 2 } } }
      rerender()
      expect(result.current.positions).toEqual({ 'public.b': { x: 2, y: 2 } })
    })

    it('seeds positions on the loading -> loaded transition (id arrives after first render)', () => {
      // PRODUCTION timing: useProject returns isLoading/data=undefined first,
      // so the FIRST render has projectId=undefined + projectLayout=undefined
      // (lazy initializer captures {}). When the project loads, projectId goes
      // undefined -> 'p-1' and the seed effect MUST fire and restore positions.
      // Keying the seed on the URL param (always 'p-1') would miss this and is
      // the bug this test guards against.
      let projectId: string | undefined = undefined
      let projectLayout: Record<string, unknown> | undefined = undefined
      const { result, rerender } = renderHook(() =>
        useLayoutPersistence({ projectId, projectLayout }),
      )
      // While loading: no positions seeded yet.
      expect(result.current.positions).toEqual({})

      // Project loads.
      projectId = 'p-1'
      projectLayout = { version: 1, positions: { 'public.users': { x: 7, y: 9 } } }
      rerender()

      // The undefined -> 'p-1' transition fired the seed effect.
      expect(result.current.positions).toEqual({ 'public.users': { x: 7, y: 9 } })
      expect(result.current.layoutBaseline).toEqual({
        version: 1,
        positions: { 'public.users': { x: 7, y: 9 } },
      })
    })
  })
  ```

- [ ] **Step 2: Run the test — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/layout-persistence/api/useLayoutPersistence.test.tsx 2>&1 | tail -20
  ```
  Expected: `Failed to resolve import "./useLayoutPersistence"` (module does not exist yet).

- [ ] **Step 3: Implement the hook.**
  Create `frontend/src/features/layout-persistence/api/useLayoutPersistence.ts`:
  ```ts
  import { useEffect, useMemo, useState } from 'react'
  import type { LayoutPositions, StoredLayout } from '@/entities/layout'

  interface UseLayoutPersistenceOptions {
    /**
     * The LOADED project's id (project?.id), NOT the URL param. The seed effect
     * keys on this so the undefined -> id transition (project finishes loading)
     * fires the seed. Keying on the always-stable URL param would mean the seed
     * never re-runs once the project loads, and saved positions would never be
     * restored on a real page load. This mirrors the existing dbml-baseline seed.
     */
    projectId: string | undefined
    /** project.layout JSONB (project?.layout; may be {} / legacy / non-v1 / undefined while loading). */
    projectLayout: Record<string, unknown> | undefined
  }

  interface UseLayoutPersistenceResult {
    /** Live, editable positions (seeded from project, updated on drag). */
    positions: LayoutPositions
    /** Replace positions (called from ErdCanvas onLayoutChange). */
    setPositions: (next: LayoutPositions) => void
    /** Referentially-stable StoredLayout for autosave (only changes with positions). */
    layout: StoredLayout
    /** Server-seeded layout for autosave's dual baseline. */
    layoutBaseline: StoredLayout
  }

  /** Read `positions` out of an arbitrary project.layout JSONB, treating a
   *  missing or non-v1 shape as empty (everything falls to dagre downstream). */
  function readSeededPositions(
    projectLayout: Record<string, unknown> | undefined,
  ): LayoutPositions {
    const positions = (projectLayout as Partial<StoredLayout> | undefined)
      ?.positions
    return positions ?? {}
  }

  /**
   * Holds the live node positions for a project, seeded from project.layout and
   * re-seeded on a project switch. Produces the referentially-stable StoredLayout
   * passed to useProjectAutosave (stable so an inline object cannot loop the save).
   * features layer: depends on entities/layout types only (FSD downward imports).
   */
  export function useLayoutPersistence({
    projectId,
    projectLayout,
  }: UseLayoutPersistenceOptions): UseLayoutPersistenceResult {
    const [positions, setPositions] = useState<LayoutPositions>(() =>
      readSeededPositions(projectLayout),
    )
    const [baselinePositions, setBaselinePositions] = useState<LayoutPositions>(
      () => readSeededPositions(projectLayout),
    )

    // Seed on load + re-seed on a project switch. Keyed on the LOADED project's
    // id (projectId === project?.id), so the undefined -> id transition (project
    // finishes loading) fires the seed and saved positions are actually restored
    // on a real page load. Keyed on id ONLY (not projectLayout identity) so an
    // autosave-driven cache update (same id, new object identity) does NOT
    // re-fire the seed and clobber live drags.
    useEffect(() => {
      if (projectId === undefined) return // not loaded yet; seed when it arrives
      const seeded = readSeededPositions(projectLayout)
      setPositions(seeded)
      setBaselinePositions(seeded)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId])

    const layout = useMemo<StoredLayout>(
      () => ({ version: 1, positions }),
      [positions],
    )
    const layoutBaseline = useMemo<StoredLayout>(
      () => ({ version: 1, positions: baselinePositions }),
      [baselinePositions],
    )

    return { positions, setPositions, layout, layoutBaseline }
  }
  ```
  Create `frontend/src/features/layout-persistence/index.ts`:
  ```ts
  export { useLayoutPersistence } from './api/useLayoutPersistence'
  ```

- [ ] **Step 4: Run the test — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/features/layout-persistence/api/useLayoutPersistence.test.tsx 2>&1 | tail -20
  ```
  Expected: all six cases pass. (The "stable identity" case relies on `useMemo([positions])` returning the same `layout` object when `positions` is unchanged; the new "loading -> loaded transition" case proves the seed fires on the undefined -> id transition, matching production timing.)

- [ ] **Step 5: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/features/layout-persistence/api/useLayoutPersistence.ts src/features/layout-persistence/api/useLayoutPersistence.test.tsx src/features/layout-persistence/index.ts && \
    git commit -m "feat(layout-persistence): positions state hook seeding from project.layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 13: `EditorPage` — compose persistence + canvas + autosave

Thread `useLayoutPersistence` into `EditorPage`: seed positions from `project.layout`, pass `savedPositions` / `onLayoutChange` to `ErdCanvas`, and feed `layout` + `layoutBaseline` into `useProjectAutosave`.

**Files:**
- Modify: `frontend/src/pages/editor/index.tsx` (import after the `erd-canvas` import line 15; the hook calls around lines 41–46; the canvas render around line 98)
- Test: `frontend/src/pages/editor/index.test.tsx` (append cases; existing cases must stay green)

- [ ] **Step 1: Add the failing wiring tests.**
  Append these two cases inside the existing `describe('EditorPage', ...)` block in `frontend/src/pages/editor/index.test.tsx`, before its closing `})`. They reuse the file's `renderEditor` helper, the `autosaveSpy` set up in `beforeEach`, and the `project` mock pattern.
  ```tsx
  it('seeds layout from project.layout.positions into the autosave layout', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {
          version: 1,
          positions: { 'public.users': { x: 320, y: 80 } },
        },
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    const lastCall = autosaveSpy.mock.calls.at(-1)?.[0] as {
      layout?: { version: number; positions: Record<string, unknown> }
      layoutBaseline?: { version: number; positions: Record<string, unknown> }
    }
    expect(lastCall.layout).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
    })
    expect(lastCall.layoutBaseline).toEqual({
      version: 1,
      positions: { 'public.users': { x: 320, y: 80 } },
    })
  })

  it('passes savedPositions + onLayoutChange to the ERD canvas', () => {
    // Spy the ErdCanvas to capture the props EditorPage threads to it.
    const erdSpy = vi
      .spyOn(canvas, 'ErdCanvas')
      .mockReturnValue(<div data-testid="erd-canvas-stub" />)

    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: { version: 1, positions: { 'public.users': { x: 1, y: 2 } } },
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    const props = erdSpy.mock.calls.at(-1)?.[0] as {
      savedPositions?: Record<string, unknown>
      onLayoutChange?: (l: unknown) => void
    }
    expect(props.savedPositions).toEqual({ 'public.users': { x: 1, y: 2 } })
    expect(typeof props.onLayoutChange).toBe('function')
  })
  ```
  Add the `canvas` namespace import at the top of the test file (next to the existing `import * as project` / `import * as autosave`):
  ```tsx
  import * as canvas from '@/features/erd-canvas'
  ```

- [ ] **Step 2: Run the tests — expect FAIL.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/pages/editor/index.test.tsx 2>&1 | tail -20
  ```
  Expected: `seeds layout ...` fails because `lastCall.layout` is `undefined` (EditorPage passes no layout yet); `passes savedPositions ...` fails because `props.savedPositions` is `undefined`.

- [ ] **Step 3: Wire `useLayoutPersistence` into `EditorPage`.**
  In `frontend/src/pages/editor/index.tsx`, add the import after the `erd-canvas` import (line 15):
  ```tsx
  import { useLayoutPersistence } from '@/features/layout-persistence'
  ```
  Replace the dbml/baseline state + autosave call block (lines 41–46, currently `const [dbmlText, setDbmlText] = useState('')` through `const parse = useDbmlParse(dbmlText)`) with:
  ```tsx
    const [dbmlText, setDbmlText] = useState('')
    // The last server-seeded value; autosave skips while dbmlText still equals it.
    const [baseline, setBaseline] = useState('')
    // Live positions seeded from project.layout, re-seeded on a project switch.
    // Pass the LOADED project's id (project?.id), NOT the URL param `id`: the
    // hook keys its seed effect on this so the undefined -> id transition (the
    // project finishing loading) fires the seed and restores saved positions.
    // Using the always-stable URL param would mean the seed never re-runs after
    // load, leaving saved positions unrestored. (Mirrors the dbml seed below,
    // which is also keyed on project?.id.)
    const { positions, setPositions, layout, layoutBaseline } =
      useLayoutPersistence({ projectId: project?.id, projectLayout: project?.layout })
    const { status } = useProjectAutosave({
      projectId: id,
      dbmlText,
      baseline,
      layout,
      layoutBaseline,
    })
    // Live, debounced parse of the editor text into the normalized model.
    const parse = useDbmlParse(dbmlText)
  ```
  Leave the existing dbml seed effect (the `useEffect` keyed on `[project?.id]` that sets `dbmlText`/`baseline`) unchanged — `useLayoutPersistence` owns its own layout seed keyed on the same `projectId`.

- [ ] **Step 4: Pass the new props to `ErdCanvas`.**
  Replace the canvas render (line 98, `<ErdCanvas schema={parse.schema ?? parse.lastValidSchema} />`):
  ```tsx
              <ErdCanvas
                schema={parse.schema ?? parse.lastValidSchema}
                savedPositions={positions}
                onLayoutChange={(next) => setPositions(next.positions)}
              />
  ```

- [ ] **Step 5: Run the editor suite — expect PASS.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run -- src/pages/editor/index.test.tsx 2>&1 | tail -20
  ```
  Expected: all cases pass, including the pre-existing autosave-contract assertion (`projectId`, `dbmlText`, `baseline` are unchanged; `layout`/`layoutBaseline` are additive).

- [ ] **Step 6: Commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add src/pages/editor/index.tsx src/pages/editor/index.test.tsx && \
    git commit -m "feat(editor): thread saved positions + layout autosave through the canvas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 14: Full gate — unit suite + type build green

Confirm the whole frontend unit suite and the true type gate pass after Block B's changes.

**Files:** none (verification only; commit only if cleanup is needed).

- [ ] **Step 1: Run the full unit suite.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run test:run 2>&1 | tail -25
  ```
  Expected: all suites pass (autosave, erd-canvas, layout-persistence, editor, plus Block A's `entities/layout` tests and all pre-existing tests).

- [ ] **Step 2: Run the true type gate.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && npm run build 2>&1 | tail -20
  ```
  (= `tsc -b && vite build`. The root tsconfig is solution-style, so `tsc --noEmit` misses new files — `npm run build` is the authoritative gate, especially for the new `features/layout-persistence` slice.) Expected: build succeeds with no type errors.

- [ ] **Step 3: If either step surfaced an issue, fix it minimally and re-run both, then commit.**
  ```bash
  cd /home/soron/projects/erd-dbml/frontend && \
    git add -A && \
    git commit -m "chore(layout): block B gate fixes (tests + type build green)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```
  If both were already green, skip the commit (nothing to record).

---

**Block B exit criteria:** `npm run test:run` and `npm run build` are both green; `ErdCanvas` drags persist via `onLayoutChange`; Auto-arrange re-emits a dagre layout; the autosave fires on layout-only changes but never on a seed/re-seed; and `EditorPage` seeds positions from `project.layout` and threads them to both the canvas and autosave. (Real drag-and-persist + reload-restores verification is Block C's Playwright spec, run by the controller — jsdom cannot exercise real drag geometry.)

---

# Block C — Playwright E2E (authored by subagent, RUN by controller)

Author `frontend/e2e/editor-layout.spec.ts` only; the **CONTROLLER** runs it against the live Docker stack (`docker compose restart frontend` first, per the HMR gotcha). **Subagents do NOT run E2E.**

**Confirmed environment facts (verified against the real files — do not re-derive):**
- `frontend/playwright.config.ts` sets `baseURL: 'http://localhost:5173'`; auth cookie name is `fastapiusersauth`; register flow waits for `POST /api/auth/jwt/login → 204` then `waitForURL(pathname === '/')` (see `e2e/auth.spec.ts`, `e2e/editor-erd.spec.ts`).
- Project create: fill `getByPlaceholder('Project name')`, click `getByRole('button', { name: 'Create' })`, capture `POST /api/projects → 201`, then `waitForURL(pathname === '/editor/${projectId}')`.
- DBML editor: `page.getByTestId('dbml-editor').locator('.cm-content').click()` then `page.keyboard.type(...)`.
- Parse debounce = **300 ms** (`useDbmlParse(text, delayMs = 300)`), autosave debounce = **600 ms** (`useProjectAutosave({ delayMs = 600 })`). We do NOT hard-wait these; we `waitForResponse` on the PATCH and poll the canvas.
- Autosave transport: `PATCH /api/projects/{id}` (`entities/project/api/useUpdateProject.ts`), body `{ dbml_text, layout }`.
- Node DOM: React Flow renders each node as `.react-flow__node` carrying `data-id="<nodeId>"`. Node id for a default-schema table is `public.<name>` (verified: `DbmlTable.id === 'public.users'`; `schemaToFlow` uses `table.id` as the node id). So `public.users` → `.react-flow__node[data-id="public.users"]`. The table name renders as visible text (`TableNode` renders `data.tableName`).
- Each `.react-flow__node` gets an inline `style="transform: translate(<x>px, <y>px); ..."` set by React Flow from `node.position` composed with the viewport transform. Edge line selector is `.react-flow__edge-path` (Plan 3b gotcha — `.react-flow__edge path` also matches `<defs>` markers). `getByDisplayValue` does NOT exist in Playwright — never use it.

## Task 15: Author the layout-persistence E2E spec (drag → autosave → reload restores position)

**Files:**
- Create: `frontend/e2e/editor-layout.spec.ts`

This task creates the spec file with shared helpers and the first (primary ship-criteria) test. Tasks 16–18 add three more `test(...)` blocks to the **same file** — write this task first so the helpers exist.

- [ ] **Step 1: Create the spec file with shared helpers + the drag → autosave → reload test.** Write the full file below. It reuses the auth/create patterns from `editor-erd.spec.ts` and adds layout-specific helpers (`createProjectAndOpen`, `typeDbml`, `dragNode`, `transformOf`).

```ts
// frontend/e2e/editor-layout.spec.ts
import { test, expect, type Page } from '@playwright/test'

const PASSWORD = 'password123'

/** Register a fresh user; lands authenticated on the home route. */
async function registerAndLogin(page: Page, email: string) {
  await page.goto('/register')
  await page.locator('#register-email').fill(email)
  await page.locator('#register-password').fill(PASSWORD)
  await page.locator('#register-confirm-password').fill(PASSWORD)

  const loginResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
  )
  await page.getByRole('button', { name: 'Sign up' }).click()
  await loginResponse
  await page.waitForURL((url) => url.pathname === '/')
}

/** Create a project from the home page and navigate into its editor.
 *  Returns the new project id. */
async function createProjectAndOpen(page: Page, name: string): Promise<string> {
  const createResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/projects') &&
      resp.request().method() === 'POST' &&
      resp.status() === 201,
  )
  await page.getByPlaceholder('Project name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  const created = await (await createResponse).json()
  const projectId = created.id as string
  await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)
  return projectId
}

/** Type DBML into the CodeMirror editor (replaces any existing content). */
async function typeDbml(page: Page, dbml: string) {
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  // Select-all + delete replaces whatever is there (CodeMirror is contenteditable).
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type(dbml)
}

/** Wait for the next autosave PATCH for this project and return its parsed body. */
async function waitForAutosavePatch(
  page: Page,
  projectId: string,
): Promise<{
  dbml_text?: string
  layout?: {
    version: number
    positions: Record<string, { x: number; y: number; parentId?: string }>
  }
}> {
  const resp = await page.waitForResponse(
    (r) =>
      r.url().includes(`/api/projects/${projectId}`) &&
      r.request().method() === 'PATCH' &&
      r.status() === 200,
  )
  return resp.request().postDataJSON()
}

/** Parse the inline React Flow transform of a node into {x, y} screen coords.
 *  React Flow writes `transform: translate(<x>px, <y>px)` on .react-flow__node.
 *  This is screen space (node.position composed with the viewport transform),
 *  so compare transforms WITHIN one viewport state, not across a re-fit. */
async function transformOf(
  page: Page,
  nodeId: string,
): Promise<{ x: number; y: number }> {
  const handle = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
  await expect(handle).toBeVisible()
  const transform = await handle.evaluate(
    (el) => (el as HTMLElement).style.transform,
  )
  const match = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px/.exec(transform)
  if (!match) throw new Error(`no translate in transform "${transform}" for ${nodeId}`)
  return { x: parseFloat(match[1]), y: parseFloat(match[2]) }
}

/** Drag a node by a screen-space delta using the React Flow-friendly
 *  mouse.down → move(steps) → up sequence (a single jump won't register a drag). */
async function dragNode(page: Page, nodeId: string, dx: number, dy: number) {
  const handle = page.locator(`.react-flow__node[data-id="${nodeId}"]`)
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no bounding box for ${nodeId}`)
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 })
  await page.mouse.up()
}

const TWO_TABLE_DBML = [
  'Table users {',
  '  id integer [pk]',
  '}',
  'Table posts {',
  '  id integer [pk]',
  '  user_id integer [ref: > users.id]',
  '}',
].join('\n')

test.describe('Editor manual layout persistence', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('dragging a table persists its position and survives reload', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-drag-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Drag')

    // Type a two-table schema and wait for the canvas to render both nodes.
    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await expect(
      page.locator('.react-flow__node[data-id="public.users"]'),
    ).toBeVisible()

    // The initial DBML edit triggers an autosave; consume it so the next
    // PATCH we wait for is the layout-only one caused by the drag.
    await waitForAutosavePatch(page, projectId)

    // Record the node's screen position before dragging.
    const before = await transformOf(page, 'public.users')

    // Drag the users node down-right; this is a layout-only change
    // (dbml_text unchanged) and must trigger an autosave PATCH.
    await dragNode(page, 'public.users', 160, 120)

    // Drag-stop lifts the full StoredLayout; autosave PATCHes within 600ms.
    const dragBody = await waitForAutosavePatch(page, projectId)
    expect(dragBody.layout).toBeTruthy()
    expect(dragBody.layout?.version).toBe(1)
    const savedPositions = dragBody.layout?.positions ?? {}
    expect(Object.keys(savedPositions).length).toBeGreaterThanOrEqual(1)
    expect(savedPositions['public.users']).toBeTruthy()

    // The node visibly moved on screen (drag applied to controlled state).
    const after = await transformOf(page, 'public.users')
    expect(
      Math.abs(after.x - before.x) + Math.abs(after.y - before.y),
    ).toBeGreaterThan(50)

    // The persisted coordinate for users (node.position, pre-viewport).
    const persistedX = savedPositions['public.users'].x
    const persistedY = savedPositions['public.users'].y

    // Reload: positions must be re-seeded from project.layout.positions and
    // reconciled back onto the parsed nodes (NOT reset to dagre).
    await page.reload()
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(
      page.locator('.react-flow__node[data-id="public.users"]'),
    ).toBeVisible()
    // Let the post-reload parse settle so reconcile runs on real nodes.
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)

    // Robust, viewport-independent check: nudge users by a TINY amount and
    // confirm the PATCH base position is the previously-persisted coord
    // (reconcile restored it), not dagre's.
    const beforeNudge = await transformOf(page, 'public.users')
    await dragNode(page, 'public.users', 8, 8)
    const reloadBody = await waitForAutosavePatch(page, projectId)
    const restored = reloadBody.layout?.positions?.['public.users']
    expect(restored).toBeTruthy()
    // The restored base position equals the persisted coord plus an ~8px nudge,
    // well within 20px — proves the dragged position survived reload. If
    // reconcile had reset to dagre, this would differ by hundreds of px.
    expect(Math.abs((restored?.x ?? 0) - persistedX)).toBeLessThan(20)
    expect(Math.abs((restored?.y ?? 0) - persistedY)).toBeLessThan(20)
    // Sanity: the node was actually present and measured before the nudge.
    expect(beforeNudge.x).not.toBeNaN()
  })
})
```

> **Why the "small nudge after reload" instead of a raw pixel compare?** The `.react-flow__node` inline `transform` is **screen space** = `node.position` composed with the viewport (`fitView` zoom/pan), which differs across a reload. The persisted `layout.positions[id]` is the **pre-viewport** `node.position` that reconcile restores. An 8px drag forces a fresh `nodesToLayout` save whose base coord is the reconciled `node.position` plus the nudge — comparing *that* to the pre-reload persisted coord (within 20px) is viewport-independent and directly proves ADR-0004 restoration (vs. a dagre reset, which would be hundreds of px off). The nudge must be 8px, not 1px: React Flow only begins a drag once the move exceeds `nodeDragThreshold` (=1), so a 1px diagonal can net a ~0 position delta, leaving `layoutKey === layoutBaselineKey` (re-seeded from the persisted layout on reload) so the autosave guard SKIPS the save and `waitForAutosavePatch` hangs to the test timeout. 8px reliably clears the threshold and stays within the 20px tolerance.

- [ ] **Step 2: Record expected pre-implementation (TDD red) state for the controller.** When run against a build that has NOT yet implemented Blocks A/B, this MUST FAIL: `waitForAutosavePatch` after the drag **times out** (current `useProjectAutosave` skips layout-only saves — the documented bug), so the test fails at `const dragBody = await waitForAutosavePatch(...)` with `Timeout 30000ms exceeded while waiting for event "response"`. After Blocks A + B land, the drag fires a `PATCH .../api/projects/<id>` with `{ layout: { version: 1, positions: { "public.users": {...}, ... } } }`, and the reload + nudge restores the coord — test goes green.

- [ ] **Step 3: Commit the spec.** From repo root:
```bash
cd /home/soron/projects/erd-dbml && \
  git add frontend/e2e/editor-layout.spec.ts && \
  git commit -m "test(e2e): drag persists table layout and survives reload (ADR-0004)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: Add the add-table test — new table gets a sensible dagre position, placed tables unmoved

**Files:**
- Modify: `frontend/e2e/editor-layout.spec.ts` (add a second `test(...)` inside the existing `test.describe`, after the drag test; reuse the helpers from Task 15)

- [ ] **Step 1: Append the add-table test to the describe block.** Insert this `test(...)` immediately before the closing `})` of `test.describe('Editor manual layout persistence', ...)`:

```ts
  test('adding a table gives it an auto position without moving placed tables', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-add-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Add')

    // Start with two tables.
    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // consume the initial-text save.

    // Manually position `users` so it has a persisted coordinate.
    await dragNode(page, 'public.users', 200, 40)
    const placedBody = await waitForAutosavePatch(page, projectId)
    const placedUsers = placedBody.layout?.positions?.['public.users']
    expect(placedUsers).toBeTruthy()
    const placedX = placedUsers!.x
    const placedY = placedUsers!.y

    // Add a THIRD, unrelated table by appending to the DBML.
    const threeTableDbml = [
      TWO_TABLE_DBML,
      '',
      'Table tags {',
      '  id integer [pk]',
      '  label varchar',
      '}',
    ].join('\n')
    await typeDbml(page, threeTableDbml)

    // Parse settles; three nodes now render.
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(3)
    await expect(
      page.locator('.react-flow__node[data-id="public.tags"]'),
    ).toBeVisible()

    // The DBML change triggers a save; read back the reconciled layout.
    const addBody = await waitForAutosavePatch(page, projectId)
    const positions = addBody.layout?.positions ?? {}

    // The new table got a dagre position (NOT stacked at origin {0,0}).
    const tags = await transformOf(page, 'public.tags')
    expect(Math.abs(tags.x) + Math.abs(tags.y)).toBeGreaterThan(1)

    // The previously-placed `users` table KEPT its manual position
    // (reconcile preserved it; only `tags` was newly laid out by dagre).
    const usersAfter = positions['public.users']
    expect(usersAfter).toBeTruthy()
    expect(Math.abs(usersAfter!.x - placedX)).toBeLessThan(20)
    expect(Math.abs(usersAfter!.y - placedY)).toBeLessThan(20)
  })
```

> **Note on the "save after adding a table" wait:** Typing the third table changes `dbml_text`, so this PATCH fires from the dbml-changed branch of the dual-baseline guard (Task 8). Crucially, reconcile re-seeding the canvas on a parse does **NOT** call `onLayoutChange` — `onLayoutChange` fires only on `onNodeDragStop` and Auto-arrange (Tasks 9–13). So the PATCH carries EditorPage's CURRENT `positions` state — `users` retained (its previously persisted entry) — but WITHOUT a `tags` entry: the new table is dagre-placed visually in the canvas (via reconcile) yet is never pushed into `positions` state, so it is not in this PATCH body. That is intentional and acceptable: a newly added table's dagre position is not persisted until the user drags it or clicks Auto-arrange; on reload it is simply re-dagre'd deterministically. The assertions therefore depend only on (a) `positions['public.users']` (read from the PATCH body) staying within 20px of the manual coord — proving reconcile did NOT relayout the already-positioned table — and (b) the rendered `tags` node having a non-origin `transform` (`transformOf`), proving reconcile dagre-placed it in the canvas. Do NOT assert that `tags` appears in the PATCH `layout.positions`.

- [ ] **Step 2: Record expected pre-implementation state.** Before Blocks A/B: fails at the first `waitForAutosavePatch` after a drag (layout-only skip bug) — same timeout as the drag test. After implementation: green.

- [ ] **Step 3: Commit.**
```bash
cd /home/soron/projects/erd-dbml && \
  git add frontend/e2e/editor-layout.spec.ts && \
  git commit -m "test(e2e): new table gets dagre position, placed tables stay put

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: Add the rename test — renaming a table loses its manual position (ADR-0004)

**Files:**
- Modify: `frontend/e2e/editor-layout.spec.ts` (add a third `test(...)` inside the same `test.describe`, after the add-table test)

- [ ] **Step 1: Append the rename test to the describe block.** Insert this `test(...)` before the closing `})` of the describe block:

```ts
  test('renaming a table loses its manual position (ADR-0004)', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-rename-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Rename')

    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // consume the initial-text save.

    // Place `posts` at a distinctive manual position far from any dagre slot.
    await dragNode(page, 'public.posts', 260, 220)
    await waitForAutosavePatch(page, projectId)
    // Capture the on-screen position of the manually-placed `posts` node. The
    // renamed node must NOT end up here. (We read the rendered transform, not
    // the PATCH body, because a dbml-only rename never calls onLayoutChange and
    // so never pushes the new node into the persisted positions — mirrors the
    // add-table test's invariant.)
    const draggedPostsPos = await transformOf(page, 'public.posts')

    // Rename `posts` -> `articles` in the DBML (keep the ref valid).
    const renamedDbml = [
      'Table users {',
      '  id integer [pk]',
      '}',
      'Table articles {',
      '  id integer [pk]',
      '  user_id integer [ref: > users.id]',
      '}',
    ].join('\n')
    await typeDbml(page, renamedDbml)

    // The renamed node now exists under a NEW id; the old id is gone.
    await expect(
      page.locator('.react-flow__node[data-id="public.articles"]'),
    ).toBeVisible()
    await expect(
      page.locator('.react-flow__node[data-id="public.posts"]'),
    ).toHaveCount(0)

    // The rename is a dbml change -> autosave fires; wait for it as a settle
    // point. Its body carries the orphan `public.posts` entry (the new node is
    // never pushed into positions state), so we do NOT read the new node's
    // coord from the PATCH body.
    await waitForAutosavePatch(page, projectId)

    // ADR-0004 on-screen: `articles` is treated as a brand-new node (no stored
    // entry under the new id), so reconcile dagre-places it. Prove it LOST the
    // old manual position by comparing rendered transforms within this one
    // viewport state — `articles` must be far from where the dragged `posts`
    // sat, and not stacked at origin.
    const articlesScreen = await transformOf(page, 'public.articles')
    expect(
      Math.abs(articlesScreen.x) + Math.abs(articlesScreen.y),
    ).toBeGreaterThan(1)
    const movedFarFromOldManual =
      Math.abs(articlesScreen.x - draggedPostsPos.x) +
      Math.abs(articlesScreen.y - draggedPostsPos.y)
    expect(movedFarFromOldManual).toBeGreaterThan(50)
  })
```

> **Why this proves ADR-0004 with no special-case code:** `schemaToFlow` ids the renamed table `public.articles`; the stored entry is keyed `public.posts`. Reconcile finds no `stored["public.articles"]`, classifies it UNPOSITIONED, and dagre-places it. The orphan `public.posts` entry is silently ignored (Plan 4 does not prune). The assertion that `articles`'s rendered transform is >50px from where the dragged `posts` sat is the observable signature of "rename = new node, position lost."
>
> **Why verify the renamed node via its rendered transform, not the PATCH body (mirrors Task 16's invariant):** reconcile/parse never calls `onLayoutChange` — that fires only on `onNodeDragStop` and Auto-arrange (Tasks 9–13). A dbml-only rename therefore dagre-places `articles` in the canvas but NEVER pushes it into EditorPage's `positions` state; the rename PATCH body's `layout.positions` carries the orphan `public.posts` entry, not `public.articles`. Reading the new node's coord from the body would assert on `undefined`. The screen-transform comparison is captured within one stable viewport state (a dbml-only re-seed via `setNodes` does NOT re-fit — only Auto-arrange explicitly re-fits), so `draggedPostsPos` and `articlesScreen` share the same viewport transform.

- [ ] **Step 2: Record expected pre-implementation state.** Before Blocks A/B: fails at the post-drag `waitForAutosavePatch` (layout-only skip). After: green.

- [ ] **Step 3: Commit.**
```bash
cd /home/soron/projects/erd-dbml && \
  git add frontend/e2e/editor-layout.spec.ts && \
  git commit -m "test(e2e): renaming a table drops its manual position (ADR-0004)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: Add the Auto-arrange test — discards manual positions and re-runs dagre (Decision B)

**Files:**
- Modify: `frontend/e2e/editor-layout.spec.ts` (add a fourth `test(...)` inside the same `test.describe`, after the rename test)

- [ ] **Step 1: Append the Auto-arrange test to the describe block.** Insert before the closing `})` of the describe block. The Auto-arrange control is a `<Panel>` button labelled exactly `Auto-arrange` (Task 11):

```ts
  test('Auto-arrange discards manual positions and re-runs dagre', async ({
    page,
  }) => {
    await registerAndLogin(page, `layout-auto-${Date.now()}@example.com`)
    const projectId = await createProjectAndOpen(page, 'Layout Auto')

    await typeDbml(page, TWO_TABLE_DBML)
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect
      .poll(async () => page.locator('.react-flow__node').count(), {
        timeout: 5000,
      })
      .toBeGreaterThanOrEqual(2)
    await waitForAutosavePatch(page, projectId) // initial-text save.

    // Manually move `users` so we have a non-dagre position to discard.
    await dragNode(page, 'public.users', 220, 160)
    const placedBody = await waitForAutosavePatch(page, projectId)
    const placedUsers = placedBody.layout?.positions?.['public.users']
    expect(placedUsers).toBeTruthy()
    const placedX = placedUsers!.x
    const placedY = placedUsers!.y

    // Click Auto-arrange (one-shot dagre over all nodes, discards saved coords).
    await page.getByRole('button', { name: 'Auto-arrange' }).click()

    // Auto-arrange lifts a fresh StoredLayout -> autosave PATCHes.
    const autoBody = await waitForAutosavePatch(page, projectId)
    const positions = autoBody.layout?.positions ?? {}
    expect(positions['public.users']).toBeTruthy()
    expect(positions['public.posts']).toBeTruthy()

    // The re-derived dagre position for `users` differs from the manual one.
    const autoUsers = positions['public.users']!
    const movedFromManual =
      Math.abs(autoUsers.x - placedX) + Math.abs(autoUsers.y - placedY)
    expect(movedFromManual).toBeGreaterThan(50)

    // Edge still present after re-layout (auto-routing reset, Decision A).
    await expect(page.locator('.react-flow__edge-path').first()).toBeVisible()
  })
```

> **Why `getByRole('button', { name: 'Auto-arrange' })`:** Task 11 specifies a `<Panel position="top-right">` containing a `<button>Auto-arrange</button>`. The accessible name is the button text — no testid needed. Edge assertions use `.react-flow__edge-path` (the line), never `.react-flow__edge path` (also matches `<defs>` markers) per the Plan 3b gotcha.

- [ ] **Step 2: Record expected pre-implementation state.** Before Block B: the `Auto-arrange` button does not exist, so `.click()` fails (locator resolves 0 elements) — and even the prior post-drag `waitForAutosavePatch` times out. After Block B: green.

- [ ] **Step 3: Commit.**
```bash
cd /home/soron/projects/erd-dbml && \
  git add frontend/e2e/editor-layout.spec.ts && \
  git commit -m "test(e2e): Auto-arrange discards manual positions and re-runs dagre

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 19: Controller runs the suite against the live stack (verification gate)

**Files:** none (execution only).

> **CONTROLLER ONLY — subagents do NOT run E2E.**

- [ ] **Step 1: Bring up the full stack and flush Vite HMR.** From the repo root (`/home/soron/projects/erd-dbml`):
```bash
docker compose up -d
docker compose restart frontend     # Plan 3b gotcha: HMR can miss new CSS/plugin/canvas code
```

- [ ] **Step 2: Run only the layout spec first (fast feedback).** From `frontend/`:
```bash
cd /home/soron/projects/erd-dbml/frontend && npx playwright test e2e/editor-layout.spec.ts
```
Expected (after Blocks A + B implemented): **4 passed** (drag-restore, add-table, rename, Auto-arrange).

- [ ] **Step 3: Run the full E2E suite to confirm no regressions.** From `frontend/`:
```bash
cd /home/soron/projects/erd-dbml/frontend && npx playwright test
```
Expected: the existing `auth.spec.ts`, `home.spec.ts`, `projects.spec.ts`, `editor-erd.spec.ts` plus the new `editor-layout.spec.ts` all pass. If a flake appears on a screen-pixel assertion, re-read the "tiny nudge after reload" rationale in Task 15 — never tighten the px delta below the documented thresholds; the persisted (pre-viewport) coordinate, not the screen transform, is the source of truth.

---

## Ship criteria → test mapping

| Ship criterion (Plan 4) | Test in `editor-layout.spec.ts` (Task) | Key assertion |
|---|---|---|
| Manual drag persists; survives reload (ADR-0004 restore) | `dragging a table persists its position and survives reload` (Task 15) | post-reload nudge save's base coord ≈ pre-reload persisted coord (within 20px); drag PATCH carries `layout.version === 1` + non-empty `positions` |
| Layout-only change fires autosave (the documented skip-bug fix) | same test (Task 15) | `waitForAutosavePatch` resolves after a drag with **unchanged** `dbml_text` |
| New table gets sensible dagre position; placed tables unmoved | `adding a table gives it an auto position without moving placed tables` (Task 16) | `tags` position ≠ origin; `users` within 20px of its manual coord |
| Rename loses manual position (rename = new node) | `renaming a table loses its manual position (ADR-0004)` (Task 17) | old `data-id="public.posts"` gone; new `public.articles` >50px from old manual coord |
| Auto-arrange discards positions + re-runs dagre + persists (Decision B) | `Auto-arrange discards manual positions and re-runs dagre` (Task 18) | post-click PATCH `positions['public.users']` >50px from manual coord; edge still renders |
| Edges keep auto-routing (Decision A — no waypoint state) | covered implicitly in Tasks 15 & 18 | `.react-flow__edge-path` visible after relayout; the spec asserts NO `layout.edges`/waypoint key anywhere |

**Execution note (repeat):** the **CONTROLLER** runs `npx playwright test` from `frontend/` with the Docker stack up (`docker compose up -d` + `docker compose restart frontend`). The subagent authoring these tests does **not** execute them. All four tests are expected to be **red** until Block A (`entities/layout`) and Block B (canvas controlled nodes + autosave dual-baseline fix + EditorPage wiring) land; the first red signal is a `waitForResponse` timeout on the post-drag PATCH (the layout-only-skip bug), which is exactly the behavior Block B fixes.
