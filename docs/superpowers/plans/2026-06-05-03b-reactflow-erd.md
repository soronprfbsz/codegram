# Codegram — Plan 3b: React Flow ERD Rendering (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the normalized `DbmlSchema` produced by Plan 3a as a React Flow v12 ERD: tables as custom nodes with one row per column and per-column connection handles, crow-foot relationship edges anchored at the exact columns, enum nodes, table-group colored background regions, and sticky notes. Positions are auto-computed with dagre on every parse — this is a read-only, auto-laid-out view. The diagram is wired into the editor page as a split view fed by the same `useDbmlParse` result, preserving the Plan 2/3a autosave contract byte-for-byte and falling back to the last valid schema on a transient parse error.

**Architecture:** A PURE, framework-agnostic adapter in `entities/erd` maps `DbmlSchema -> { nodes, edges }` in React Flow shapes (node ids = the normalized keys per ADR-0004, handle ids = the column ids); a PURE dagre `autoLayout` positions those nodes (clustering table-group members and sizing the group region). The React Flow runtime is confined to `features/erd-canvas` (custom `TableNode`/`EnumNode`/`StickyNote`/`GroupNode` + crow-foot `RelationEdge`, assembled by `ErdCanvas`). `pages/editor` composes the editor + canvas. FSD downward imports only: `entities/erd` imports `shared` + `entities/dbml` + React Flow TYPES only; `features/erd-canvas` imports `entities/erd` + `entities/dbml` + `shared` + the React Flow runtime; `pages/editor` composes. NO layout persistence, NO manual-drag persistence, NO name-based reconciliation (those are Plan 4). NO backend changes.

**Tech Stack:** React 19, Vite 8, TS 6, TanStack Query v5, Zustand v5, React Router v7, shadcn v4.10 (Tailwind v4), Vitest 4 + Testing Library + `@testing-library/user-event` + jsdom, Playwright. Added in 3b: `@xyflow/react@^12.11.0` (ADR-0003 lock-in) + `@dagrejs/dagre@^2.0.0`. `@dbml/core@8.2.5` + CodeMirror already added in 3a. The normalized model lives in `entities/dbml` (`DbmlSchema`/`DbmlTable`/`DbmlColumn` with `id`/`pk`/`isFk`/`notNull`/`unique`/`increment`/`type`/`headerColor`, `DbmlRef` with `fromSchema`/`fromTable`/`fromColumns`/`toSchema`/`toTable`/`toColumns`/`relation` in `{1-1,1-n,n-1,n-n}`, `DbmlEnum`/`DbmlTableGroup`(`tables` = qualified `${schema}.${table}` keys, `color`)/`DbmlNote`). `useDbmlParse` (`features/dbml-editor/model`) returns `{ status, schema?, errors?, lastValidSchema? }`.

---

## File Structure

**Create:**
- `frontend/src/entities/erd/model/types.ts` — ERD view types: `ErdColumn`, the node-`data` variants (`TableNodeData`/`EnumNodeData`/`StickyNodeData`/`GroupNodeData`), `RelationEdgeData`, `RelationEndpointMarker`, and `ErdFlowNode`/`ErdFlowEdge`/`ErdFlow` aliases over the React Flow `Node`/`Edge` TYPES.
- `frontend/src/entities/erd/lib/schemaToFlow.ts` — PURE adapter: `DbmlSchema -> { nodes, edges }` (one TableNode per table with per-column handle ids, one EnumNode per enum, one StickyNote per note, one GroupNode per table group with member `parentId`, one Edge per ref column-pair carrying crow-foot relation markers, optional dashed enum-link edges).
- `frontend/src/entities/erd/lib/schemaToFlow.test.ts` — PURE unit tests for the adapter (no React Flow runtime).
- `frontend/src/entities/erd/lib/autoLayout.ts` — PURE dagre layered layout: positions nodes from nodes+edges, clusters group members, sizes the group region, deterministic.
- `frontend/src/entities/erd/lib/autoLayout.test.ts` — PURE unit tests for the layout (no React Flow runtime).
- `frontend/src/entities/erd/index.ts` — barrel re-exporting the types + `schemaToFlow` + `autoLayout`.
- `frontend/src/features/erd-canvas/ui/TableNode.tsx` — custom node: colored header + one row per column with PK/FK/NN/UQ markers and a per-column left/right `<Handle>` keyed by the column id.
- `frontend/src/features/erd-canvas/ui/TableNode.test.tsx` — renders within `ReactFlowProvider`; asserts labels, markers, two handles per column keyed by column id.
- `frontend/src/features/erd-canvas/ui/EnumNode.tsx` — custom node listing enum values + one target handle for the optional enum-link edge.
- `frontend/src/features/erd-canvas/ui/EnumNode.test.tsx` — renders within `ReactFlowProvider`; asserts name + values + one handle.
- `frontend/src/features/erd-canvas/ui/StickyNote.tsx` — read-only sticky text card (no handles).
- `frontend/src/features/erd-canvas/ui/StickyNote.test.tsx` — renders within `ReactFlowProvider`; asserts title + content + no handles.
- `frontend/src/features/erd-canvas/ui/GroupNode.tsx` — colored, non-interactive background region behind table-group members.
- `frontend/src/features/erd-canvas/ui/GroupNode.test.tsx` — renders within `ReactFlowProvider`; asserts label + tinted, pointer-events:none region.
- `frontend/src/features/erd-canvas/ui/RelationEdge.tsx` — crow-foot custom edge (per-endpoint markers from `relation`) + the pure `startMarkerKind`/`endMarkerKind` mapping.
- `frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx` — pure marker-mapping tests + a `ReactFlowProvider`-wrapped render asserting the edge path + marker defs.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` — `ReactFlowProvider` + `ReactFlow` with `nodeTypes`/`edgeTypes`, fed by a `schema?: DbmlSchema` prop via `schemaToFlow` + `autoLayout`; imports the React Flow CSS; empty-state placeholder.
- `frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx` — renders nodes for a schema (within the global jsdom mocks) + the empty state.
- `frontend/src/features/erd-canvas/index.ts` — feature barrel exporting `ErdCanvas` + its props type.
- `frontend/src/test/reactFlowMocks.test.ts` — guard test that the jsdom mocks (`ResizeObserver`/`matchMedia`/non-zero `getBoundingClientRect`) exist.
- `frontend/e2e/editor-erd.spec.ts` — Playwright editor E2E: type DBML, assert the canvas renders table nodes + a relationship edge in the DOM.

**Modify:**
- `frontend/src/app/providers/router.tsx` — lazy-load `EditorPage` + wrap in `<Suspense>` (code-splits `@dbml/core`, CodeMirror, and React Flow off the login/home bundle).
- `frontend/package.json` — add `@xyflow/react` + `@dagrejs/dagre`.
- `frontend/src/test/setup.ts` — append jsdom mocks (`ResizeObserver`, `matchMedia`, non-zero `getBoundingClientRect`) required by the React Flow component/canvas tests; the existing `jest` shim and `afterEach(cleanup)` are preserved byte-for-byte.
- `frontend/src/pages/editor/index.tsx` — add `ErdCanvas` (fed by `parse.schema ?? parse.lastValidSchema`) in a split view (editor left, canvas right, compact `ParseErrorPanel` + `SchemaSummary` sidebar); the autosave/seed/baseline seam is preserved exactly.
- `frontend/src/pages/editor/index.test.tsx` — add a test asserting the ERD canvas region mounts in the split view.

---

## Tasks

### Task 1: Lazy-load EditorPage + Suspense boundary (router code-split)

This is the FIRST tidy-up from the 3a final review (D10): split `@dbml/core`, CodeMirror, and (later in 3b) React Flow onto the editor route only so they are NOT shipped to the login/home bundle. There is no clean unit-level red phase for a code-split (the route still renders `EditorPage`); the meaningful verification is the **production build emitting a separate editor chunk**. We assert that with a build + grep, plus the existing suite staying green.

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/src/app/providers/router.tsx`
- Verify: build output + existing tests

- [ ] **Step 1: Capture the BEFORE baseline (editor code is in the main chunk).**

Run (a clean production build, then check which chunk holds the editor page):

```bash
cd /home/soron/projects/codegram/frontend && npm run build 2>&1 | tail -20
```

Expected: the build succeeds (`✓ built in …`). Now check that the editor module is currently bundled into a shared/index chunk (no dedicated editor chunk yet):

```bash
cd /home/soron/projects/codegram/frontend && grep -rl "useProjectAutosave\|DbmlEditor" dist/assets/*.js | head
```

Expected: one or more of the **main** entry/index chunks match (e.g. `dist/assets/index-*.js`). This documents the pre-split state: editor code rides the eager bundle. (If a stale `dist/` exists, this still reflects the current router.)

- [ ] **Step 2: Convert the static EditorPage import to a lazy import and add a Suspense boundary.**

Replace the ENTIRE contents of `/home/soron/projects/codegram/frontend/src/app/providers/router.tsx` with:

```tsx
import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'
import { RequireAuth, RequireGuest } from '@/app/providers/RequireAuth'

// Lazy-load the editor route so @dbml/core, CodeMirror and React Flow are
// code-split onto the editor chunk only — NOT shipped to login/home (Plan 3b
// D10 tidy-up). pages/editor exports a NAMED EditorPage, so map it to a
// default export for React.lazy.
const EditorPage = lazy(() =>
  import('@/pages/editor').then((m) => ({ default: m.EditorPage })),
)

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RequireAuth>
        <HomePage />
      </RequireAuth>
    ),
  },
  {
    path: '/editor/:id',
    element: (
      <RequireAuth>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              Loading editor…
            </div>
          }
        >
          <EditorPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  {
    path: '/login',
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  {
    path: '/register',
    element: (
      <RequireGuest>
        <RegisterPage />
      </RequireGuest>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 3: Verify a SEPARATE editor chunk is now emitted (the code-split worked).**

Run:

```bash
cd /home/soron/projects/codegram/frontend && rm -rf dist && npm run build 2>&1 | tail -20
```

Expected: build succeeds (`✓ built in …`). Now confirm the editor code lives in its OWN chunk (a dynamic import produces a separate `*.js`), distinct from the entry chunk:

```bash
cd /home/soron/projects/codegram/frontend && grep -rl "useProjectAutosave\|DbmlEditor" dist/assets/*.js
```

Expected: the matching file is a **secondary chunk** (a hashed `*.js`, NOT the main entry `index-*.js` that Vite lists first). Cross-check that the entry chunk no longer pulls the editor in eagerly:

```bash
cd /home/soron/projects/codegram/frontend && grep -L "DbmlEditor" dist/assets/index-*.js
```

Expected: the primary entry chunk is listed by `grep -L` (it does NOT contain `DbmlEditor`), proving the editor is split off. (Vite prints the chunk list in the build output; the editor chunk appears as its own line.)

- [ ] **Step 4: Verify the existing suite still passes (no regression).**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run 2>&1 | tail -15
```

Expected: all existing test files pass (`Test Files  N passed (N)` / `Tests  M passed (M)`), no failures.

- [ ] **Step 5: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add src/app/providers/router.tsx && git commit -m "perf(router): lazy-load editor route to code-split @dbml/core + React Flow off login/home"
```

---

### Task 2: Add @xyflow/react + @dagrejs/dagre

Dependency-install only. This is not behavior-testable in a red→green TDD loop, so the red phase is explicitly artificial here — the verification is: the packages install at the pinned versions, the type entry points resolve under `tsc`, and the existing suite stays green. (The React Flow CSS import lives in `ErdCanvas.tsx` — Task 13 — so it code-splits onto the editor chunk per D10; the jsdom mocks the component tests need are added in Task 12. We do NOT touch `main.tsx` or `setup.ts` here.)

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/package.json` (via `npm install`)

- [ ] **Step 1: Install the two runtime dependencies at the verified versions.**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm install @xyflow/react@^12.11.0 @dagrejs/dagre@^2.0.0
```

Expected: npm adds both to `dependencies` and reports `added N packages`. Confirm:

```bash
cd /home/soron/projects/codegram/frontend && node -e "const p=require('./package.json'); console.log(p.dependencies['@xyflow/react'], p.dependencies['@dagrejs/dagre'])"
```

Expected output (a line like):

```
^12.11.0 ^2.0.0
```

- [ ] **Step 2: Verify the deps' type entry points resolve and the suite is green.**

Run a type-check (proves `@xyflow/react` + `@dagrejs/dagre` type entry points resolve):

```bash
cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
```

Expected: no output errors / exit 0 (a clean `tsc --noEmit`).

Run the existing suite (proves the install didn't break anything):

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run 2>&1 | tail -15
```

Expected: `Test Files  N passed (N)` / `Tests  M passed (M)`, no failures.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add package.json package-lock.json && git commit -m "build(erd): add @xyflow/react + @dagrejs/dagre"
```

---

### Task 3: ERD view types (entities/erd/model/types.ts)

Type-only module — there is no runtime behavior to red-test. The verification is `tsc --noEmit` compiling the file (and the later adapter/components consuming it). These types describe the `data` payloads carried by each React Flow node variant and alias the React Flow `Node`/`Edge` generic types so the pure adapter (Task 4) returns React-Flow-ready shapes WITHOUT importing the React Flow runtime — only its TYPES. (Per the FSD note: importing `Node`/`Edge` TYPES from `@xyflow/react` in `entities/erd` is acceptable; no runtime/JSX is imported here.) These field names — `ErdColumn.{pk,fk,nn,unique}`, `TableNodeData.tableName`, `EnumNodeData.enumName`, `StickyNodeData.{title,content}`, `GroupNodeData.groupName` — are the single source of truth; the adapter (Task 4) and every node component (Tasks 7–10) consume EXACTLY these.

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/erd/model/types.ts`

- [ ] **Step 1: Create the ERD view-type module.**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/model/types.ts` with EXACTLY:

```ts
/**
 * ERD view types (Plan 3b). These describe the `data` payloads the React Flow
 * custom nodes/edges receive and alias React Flow's Node/Edge generics so the
 * PURE schemaToFlow adapter (entities/erd/lib) can produce React-Flow-ready
 * shapes without importing the React Flow RUNTIME — only its TYPES.
 *
 * entities layer: imports only TYPES from @xyflow/react + entities/dbml types.
 * No JSX, no hooks, no side effects (FSD downward imports).
 */
import type { Node, Edge } from '@xyflow/react'
import type { DbmlRelation } from '@/entities/dbml'

/** Discriminator for the four custom React Flow node kinds. */
export type ErdNodeType = 'table' | 'enum' | 'sticky' | 'group'

/** A single column row rendered inside a TableNode, with its handle id. */
export interface ErdColumn {
  /** Handle id == DbmlColumn.id (`${schema}.${table}.${name}`). Edges anchor here. */
  id: string
  name: string
  type: string
  pk: boolean
  /** Foreign-key participant (DbmlColumn.isFk). */
  fk: boolean
  /** NOT NULL (DbmlColumn.notNull). */
  nn: boolean
  /** UNIQUE (DbmlColumn.unique). */
  unique: boolean
}

/** `data` for a TableNode: header + one row per column (each carries a handle id). */
export interface TableNodeData {
  /** Table display name. */
  tableName: string
  /** DbmlTable.id (`${schema}.${name}`) — node id, kept here for convenience. */
  tableId: string
  /** [headercolor: ...] hex when set. */
  headerColor?: string
  columns: ErdColumn[]
  [key: string]: unknown
}

/** `data` for an EnumNode: name + ordered value labels. */
export interface EnumNodeData {
  enumName: string
  values: string[]
  [key: string]: unknown
}

/** `data` for a StickyNote node: a read-only text card. */
export interface StickyNodeData {
  title: string
  content: string
  headerColor?: string
  [key: string]: unknown
}

/** `data` for a GroupNode: a colored background region behind its members. */
export interface GroupNodeData {
  groupName: string
  /** [color: ...] hex when set. */
  color?: string
  [key: string]: unknown
}

/** Union of every node `data` shape the canvas can render. */
export type ErdNodeData =
  | TableNodeData
  | EnumNodeData
  | StickyNodeData
  | GroupNodeData

/**
 * Per-endpoint crow-foot marker kind. 'one' renders a single bar; 'many'
 * renders the three-prong crow-foot. Derived from DbmlRef.relation per endpoint.
 */
export type RelationEndpointMarker = 'one' | 'many'

/** `data` carried by a RelationEdge so the custom edge can draw crow-foot markers. */
export interface RelationEdgeData {
  /** Ordered cardinality `${from}-${to}` straight from DbmlRef.relation. */
  relation: DbmlRelation
  /** Marker at the source (from) endpoint. */
  sourceMarker: RelationEndpointMarker
  /** Marker at the target (to) endpoint. */
  targetMarker: RelationEndpointMarker
  /** True for the dashed column→enum link edges (not an FK relationship). */
  isEnumLink?: boolean
  [key: string]: unknown
}

/** A React Flow node specialized to ERD node `data` shapes. */
export type ErdFlowNode = Node<ErdNodeData>

/** A React Flow edge specialized to ERD relation `data`. */
export type ErdFlowEdge = Edge<RelationEdgeData>

/** What the PURE schemaToFlow adapter returns. */
export interface ErdFlow {
  nodes: ErdFlowNode[]
  edges: ErdFlowEdge[]
}
```

- [ ] **Step 2: Verify the types compile.**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
```

Expected: no errors / exit 0.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add src/entities/erd/model/types.ts && git commit -m "feat(erd): add ERD view types (node data variants + relation markers)"
```

---

### Task 4: PURE schemaToFlow adapter + comprehensive unit tests

TDD: write the failing test first, see it fail (module missing), implement the minimal pure function, see it pass. The adapter is the crux of Plan 3b — `DbmlSchema -> { nodes, edges }` with: one `table` node per `DbmlTable` (data = columns with handle ids == `DbmlColumn.id`), one `enum` node per `DbmlEnum`, one `sticky` node per `DbmlNote`, one `group` node per `DbmlTableGroup` (members get `parentId`, group node emitted BEFORE its members so React Flow establishes the hierarchy), one `Edge` per ref COLUMN-PAIR (composite FK → one edge per pair — stated choice), with `sourceHandle`/`targetHandle` == the per-column `DbmlColumn.id` reconstructed from `ref.fromColumns`/`ref.toColumns`, and per-endpoint crow-foot markers derived from `ref.relation` (NOT assuming from=many). Self-refs are supported (handles differ even when tables match). Optional dashed `column→enum` link edges are INCLUDED (cheap: a column whose `type` matches an enum name in the same schema gets one dashed edge) — stated choice.

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/erd/lib/schemaToFlow.ts`
- Test: `/home/soron/projects/codegram/frontend/src/entities/erd/lib/schemaToFlow.test.ts`

- [ ] **Step 1: Write the failing test FIRST.**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/lib/schemaToFlow.test.ts` with EXACTLY:

```ts
import { describe, it, expect } from 'vitest'
import { schemaToFlow } from './schemaToFlow'
import type {
  DbmlSchema,
  DbmlTable,
  DbmlColumn,
  DbmlRef,
  DbmlRelation,
} from '@/entities/dbml'
import type { TableNodeData, RelationEdgeData } from '@/entities/erd/model/types'

// --- fixture builders (exact normalized-model fields) -----------------------

function col(
  schema: string,
  table: string,
  name: string,
  over: Partial<DbmlColumn> = {},
): DbmlColumn {
  return {
    id: `${schema}.${table}.${name}`,
    name,
    type: 'integer',
    pk: false,
    notNull: false,
    unique: false,
    increment: false,
    isFk: false,
    ...over,
  }
}

function table(
  schema: string,
  name: string,
  columns: DbmlColumn[],
  over: Partial<DbmlTable> = {},
): DbmlTable {
  return {
    id: `${schema}.${name}`,
    name,
    schema,
    columns,
    ...over,
  }
}

function ref(
  fromTable: string,
  fromColumns: string[],
  toTable: string,
  toColumns: string[],
  relation: DbmlRelation,
  schema = 'public',
): DbmlRef {
  return {
    id: `${schema}.${fromTable}.(${fromColumns.join(',')})>${schema}.${toTable}.(${toColumns.join(',')})`,
    fromTable,
    fromSchema: schema,
    fromColumns,
    toTable,
    toSchema: schema,
    toColumns,
    relation,
  }
}

function emptySchema(over: Partial<DbmlSchema> = {}): DbmlSchema {
  return { tables: [], refs: [], enums: [], tableGroups: [], notes: [], ...over }
}

// --- tests ------------------------------------------------------------------

describe('schemaToFlow — nodes', () => {
  it('creates one table node per DbmlTable with id == DbmlTable.id', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [col('public', 'posts', 'id', { pk: true })]),
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const tableNodes = nodes.filter((n) => n.type === 'table')
    expect(tableNodes).toHaveLength(2)
    expect(tableNodes.map((n) => n.id).sort()).toEqual([
      'public.posts',
      'public.users',
    ])
  })

  it('table node data.columns carry handle ids == DbmlColumn.id with pk/fk/nn/unique flags', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true }),
          col('public', 'users', 'email', { unique: true, notNull: true, isFk: false }),
        ]),
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const node = nodes.find((n) => n.id === 'public.users')!
    const data = node.data as TableNodeData
    expect(data.tableName).toBe('users')
    expect(data.columns.map((c) => c.id)).toEqual([
      'public.users.id',
      'public.users.email',
    ])
    expect(data.columns[0].pk).toBe(true)
    expect(data.columns[1].unique).toBe(true)
    expect(data.columns[1].nn).toBe(true)
  })

  it('propagates headerColor onto the table node data', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id')], {
          headerColor: '#3498db',
        }),
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const data = nodes.find((n) => n.id === 'public.users')!.data as TableNodeData
    expect(data.headerColor).toBe('#3498db')
  })

  it('creates one enum node per DbmlEnum listing its values', () => {
    const schema = emptySchema({
      enums: [
        {
          name: 'role',
          schema: 'public',
          values: [{ name: 'admin' }, { name: 'member' }],
        },
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const enumNodes = nodes.filter((n) => n.type === 'enum')
    expect(enumNodes).toHaveLength(1)
    expect(enumNodes[0].id).toBe('enum:public.role')
    expect((enumNodes[0].data as { values: string[] }).values).toEqual([
      'admin',
      'member',
    ])
  })

  it('creates one sticky node per standalone note', () => {
    const schema = emptySchema({
      notes: [{ name: 'TODO', content: 'normalize addresses' }],
    })
    const { nodes } = schemaToFlow(schema)
    const sticky = nodes.filter((n) => n.type === 'sticky')
    expect(sticky).toHaveLength(1)
    expect(sticky[0].id).toBe('note:TODO')
    expect((sticky[0].data as { content: string }).content).toBe(
      'normalize addresses',
    )
  })
})

describe('schemaToFlow — table groups', () => {
  it('emits a group node and assigns parentId to its members, group BEFORE members', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id')]),
        table('public', 'posts', [col('public', 'posts', 'id')]),
      ],
      tableGroups: [
        { name: 'core', color: '#ffcc00', tables: ['public.users', 'public.posts'] },
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const groupNode = nodes.find((n) => n.type === 'group')!
    expect(groupNode.id).toBe('group:core')
    expect((groupNode.data as { color?: string }).color).toBe('#ffcc00')

    const users = nodes.find((n) => n.id === 'public.users')!
    const posts = nodes.find((n) => n.id === 'public.posts')!
    expect(users.parentId).toBe('group:core')
    expect(posts.parentId).toBe('group:core')

    // React Flow requires a parent node to appear BEFORE its children.
    const groupIdx = nodes.findIndex((n) => n.id === 'group:core')
    const usersIdx = nodes.findIndex((n) => n.id === 'public.users')
    expect(groupIdx).toBeLessThan(usersIdx)
  })

  it('leaves ungrouped tables without a parentId', () => {
    const schema = emptySchema({
      tables: [table('public', 'loose', [col('public', 'loose', 'id')])],
    })
    const { nodes } = schemaToFlow(schema)
    expect(nodes.find((n) => n.id === 'public.loose')!.parentId).toBeUndefined()
  })
})

describe('schemaToFlow — edges (crow-foot + column handles)', () => {
  it('1-n: source marker one, target marker many; handles == column ids', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [
          col('public', 'posts', 'user_id', { isFk: true }),
        ]),
      ],
      refs: [ref('users', ['id'], 'posts', ['user_id'], '1-n')],
    })
    const { edges } = schemaToFlow(schema)
    expect(edges).toHaveLength(1)
    const e = edges[0]
    expect(e.source).toBe('public.users')
    expect(e.target).toBe('public.posts')
    expect(e.sourceHandle).toBe('public.users.id')
    expect(e.targetHandle).toBe('public.posts.user_id')
    const data = e.data as RelationEdgeData
    expect(data.relation).toBe('1-n')
    expect(data.sourceMarker).toBe('one')
    expect(data.targetMarker).toBe('many')
  })

  it('n-1: source marker many, target marker one', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'posts', [col('public', 'posts', 'user_id')]),
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
      ],
      refs: [ref('posts', ['user_id'], 'users', ['id'], 'n-1')],
    })
    const data = schemaToFlow(schema).edges[0].data as RelationEdgeData
    expect(data.sourceMarker).toBe('many')
    expect(data.targetMarker).toBe('one')
  })

  it('1-1: both markers one', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'profiles', [
          col('public', 'profiles', 'user_id', { unique: true }),
        ]),
      ],
      refs: [ref('users', ['id'], 'profiles', ['user_id'], '1-1')],
    })
    const data = schemaToFlow(schema).edges[0].data as RelationEdgeData
    expect(data.sourceMarker).toBe('one')
    expect(data.targetMarker).toBe('one')
  })

  it('n-n: both markers many', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'tags', [col('public', 'tags', 'id', { pk: true })]),
        table('public', 'posts', [col('public', 'posts', 'id', { pk: true })]),
      ],
      refs: [ref('tags', ['id'], 'posts', ['id'], 'n-n')],
    })
    const data = schemaToFlow(schema).edges[0].data as RelationEdgeData
    expect(data.sourceMarker).toBe('many')
    expect(data.targetMarker).toBe('many')
  })

  it('composite FK: one edge per column pair with matching per-pair handles', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'a', [
          col('public', 'a', 'k1', { pk: true }),
          col('public', 'a', 'k2', { pk: true }),
        ]),
        table('public', 'b', [
          col('public', 'b', 'fk1', { isFk: true }),
          col('public', 'b', 'fk2', { isFk: true }),
        ]),
      ],
      refs: [ref('a', ['k1', 'k2'], 'b', ['fk1', 'fk2'], '1-n')],
    })
    const { edges } = schemaToFlow(schema)
    expect(edges).toHaveLength(2)
    expect(edges.map((e) => e.sourceHandle).sort()).toEqual([
      'public.a.k1',
      'public.a.k2',
    ])
    expect(edges.map((e) => e.targetHandle).sort()).toEqual([
      'public.b.fk1',
      'public.b.fk2',
    ])
    // Edge ids are unique per pair.
    expect(new Set(edges.map((e) => e.id)).size).toBe(2)
  })

  it('self-reference: source and target nodes match, handles differ', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'employees', [
          col('public', 'employees', 'id', { pk: true }),
          col('public', 'employees', 'manager_id', { isFk: true }),
        ]),
      ],
      refs: [ref('employees', ['manager_id'], 'employees', ['id'], 'n-1')],
    })
    const { edges } = schemaToFlow(schema)
    expect(edges).toHaveLength(1)
    const e = edges[0]
    expect(e.source).toBe('public.employees')
    expect(e.target).toBe('public.employees')
    expect(e.sourceHandle).toBe('public.employees.manager_id')
    expect(e.targetHandle).toBe('public.employees.id')
  })

  it('every relation edge uses the relation edge type', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [col('public', 'posts', 'user_id')]),
      ],
      refs: [ref('users', ['id'], 'posts', ['user_id'], '1-n')],
    })
    expect(schemaToFlow(schema).edges[0].type).toBe('relation')
  })
})

describe('schemaToFlow — enum link edges (optional, included)', () => {
  it('adds a dashed column→enum edge when a column type matches an enum name', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true }),
          col('public', 'users', 'role', { type: 'role' }),
        ]),
      ],
      enums: [
        { name: 'role', schema: 'public', values: [{ name: 'admin' }] },
      ],
    })
    const { edges } = schemaToFlow(schema)
    const enumLink = edges.find(
      (e) => (e.data as RelationEdgeData | undefined)?.isEnumLink,
    )
    expect(enumLink).toBeDefined()
    expect(enumLink!.source).toBe('public.users')
    expect(enumLink!.sourceHandle).toBe('public.users.role')
    expect(enumLink!.target).toBe('enum:public.role')
  })

  it('does not create an enum link when no column type matches', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
      ],
      enums: [
        { name: 'role', schema: 'public', values: [{ name: 'admin' }] },
      ],
    })
    const { edges } = schemaToFlow(schema)
    expect(edges.some((e) => (e.data as RelationEdgeData | undefined)?.isEnumLink)).toBe(
      false,
    )
  })
})

describe('schemaToFlow — empty + counts', () => {
  it('returns empty arrays for an empty schema', () => {
    const { nodes, edges } = schemaToFlow(emptySchema())
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and SEE IT FAIL (module missing).**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/erd/lib/schemaToFlow.test.ts 2>&1 | tail -15
```

Expected: failure — Vitest cannot resolve the import:

```
Error: Failed to resolve import "./schemaToFlow" from "src/entities/erd/lib/schemaToFlow.test.ts".
```

(or a `No test files found`/transform error naming `./schemaToFlow`). The point: the test cannot run because `schemaToFlow.ts` does not exist yet.

- [ ] **Step 3: Implement the PURE adapter (minimal, complete).**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/lib/schemaToFlow.ts` with EXACTLY:

```ts
/**
 * PURE adapter (Plan 3b, D2): DbmlSchema -> { nodes, edges } in React Flow
 * shapes. NO hooks, NO side effects, NO React Flow runtime — only the Node/Edge
 * TYPES (via entities/erd/model/types). Node ids are the normalized keys
 * (DbmlTable.id, `enum:${schema}.${name}`, `note:${name}`, `group:${name}`) so
 * Plan 4 Layout can reconcile by name (ADR-0004). Positions are NOT computed
 * here — autoLayout (separate pure unit) assigns them.
 *
 * entities layer: imports only entities/dbml + entities/erd types (FSD).
 */
import type {
  DbmlSchema,
  DbmlTable,
  DbmlRef,
  DbmlRelation,
} from '@/entities/dbml'
import type {
  ErdFlow,
  ErdFlowNode,
  ErdFlowEdge,
  ErdColumn,
  TableNodeData,
  EnumNodeData,
  StickyNodeData,
  GroupNodeData,
  RelationEndpointMarker,
  RelationEdgeData,
} from '@/entities/erd/model/types'

const ZERO = { x: 0, y: 0 }

/** Stable node id for an enum (distinct namespace from table ids). */
function enumNodeId(schema: string, name: string): string {
  return `enum:${schema}.${name}`
}

/** Stable node id for a standalone note. */
function noteNodeId(name: string): string {
  return `note:${name}`
}

/** Stable node id for a table group. */
function groupNodeId(name: string): string {
  return `group:${name}`
}

/** Map one side of a DbmlRelation to its crow-foot marker. '1' -> one, 'n' -> many. */
function sideMarker(side: '1' | 'n'): RelationEndpointMarker {
  return side === 'n' ? 'many' : 'one'
}

/** Split `${from}-${to}` into per-endpoint markers (NOT assuming from=many). */
function relationMarkers(relation: DbmlRelation): {
  source: RelationEndpointMarker
  target: RelationEndpointMarker
} {
  const [from, to] = relation.split('-') as ['1' | 'n', '1' | 'n']
  return { source: sideMarker(from), target: sideMarker(to) }
}

/** Build the ErdColumn rows (handle ids == DbmlColumn.id) for a table node. */
function toErdColumns(table: DbmlTable): ErdColumn[] {
  return table.columns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    pk: c.pk,
    fk: c.isFk,
    nn: c.notNull,
    unique: c.unique,
  }))
}

/** Reconstruct a column's handle id from a ref endpoint (`${schema}.${table}.${column}`). */
function columnHandleId(schema: string, table: string, column: string): string {
  return `${schema}.${table}.${column}`
}

/** One relationship edge per column pair (composite FK -> one edge per pair). */
function refToEdges(ref: DbmlRef): ErdFlowEdge[] {
  const { source, target } = relationMarkers(ref.relation)
  const sourceNode = `${ref.fromSchema}.${ref.fromTable}`
  const targetNode = `${ref.toSchema}.${ref.toTable}`
  const pairCount = Math.min(ref.fromColumns.length, ref.toColumns.length)
  const edges: ErdFlowEdge[] = []
  for (let i = 0; i < pairCount; i++) {
    const fromCol = ref.fromColumns[i]
    const toCol = ref.toColumns[i]
    const data: RelationEdgeData = {
      relation: ref.relation,
      sourceMarker: source,
      targetMarker: target,
    }
    edges.push({
      id: `${ref.id}#${i}`,
      type: 'relation',
      source: sourceNode,
      target: targetNode,
      sourceHandle: columnHandleId(ref.fromSchema, ref.fromTable, fromCol),
      targetHandle: columnHandleId(ref.toSchema, ref.toTable, toCol),
      data,
    })
  }
  return edges
}

/**
 * Build dashed column->enum link edges: a column whose `type` equals an enum's
 * name (same schema) gets one dashed edge from its handle to the enum node.
 * (D5 choice: included — cheap single pass.)
 */
function enumLinkEdges(schema: DbmlSchema): ErdFlowEdge[] {
  const enumKey = new Set(schema.enums.map((e) => `${e.schema}.${e.name}`))
  const edges: ErdFlowEdge[] = []
  for (const table of schema.tables) {
    for (const col of table.columns) {
      const key = `${table.schema}.${col.type}`
      if (enumKey.has(key)) {
        const data: RelationEdgeData = {
          relation: 'n-1',
          sourceMarker: 'many',
          targetMarker: 'one',
          isEnumLink: true,
        }
        edges.push({
          id: `enumlink:${col.id}`,
          type: 'relation',
          source: table.id,
          sourceHandle: col.id,
          target: enumNodeId(table.schema, col.type),
          data,
        })
      }
    }
  }
  return edges
}

/**
 * Convert a normalized DbmlSchema into React Flow nodes + edges. Group nodes are
 * emitted BEFORE their member tables so React Flow can establish the parent/child
 * hierarchy; grouped member tables receive parentId == the group node id.
 */
export function schemaToFlow(schema: DbmlSchema): ErdFlow {
  // Map each grouped table id -> its group node id (members get parentId).
  const parentOf = new Map<string, string>()
  for (const group of schema.tableGroups) {
    for (const tableId of group.tables) {
      parentOf.set(tableId, groupNodeId(group.name))
    }
  }

  const groupNodes: ErdFlowNode[] = schema.tableGroups.map((group) => {
    const data: GroupNodeData = { groupName: group.name, color: group.color }
    return {
      id: groupNodeId(group.name),
      type: 'group',
      position: { ...ZERO },
      data,
    }
  })

  const tableNodes: ErdFlowNode[] = schema.tables.map((table) => {
    const data: TableNodeData = {
      tableName: table.name,
      tableId: table.id,
      headerColor: table.headerColor,
      columns: toErdColumns(table),
    }
    const node: ErdFlowNode = {
      id: table.id,
      type: 'table',
      position: { ...ZERO },
      data,
    }
    const parentId = parentOf.get(table.id)
    if (parentId) {
      node.parentId = parentId
    }
    return node
  })

  const enumNodes: ErdFlowNode[] = schema.enums.map((e) => {
    const data: EnumNodeData = {
      enumName: e.name,
      values: e.values.map((v) => v.name),
    }
    return {
      id: enumNodeId(e.schema, e.name),
      type: 'enum',
      position: { ...ZERO },
      data,
    }
  })

  const stickyNodes: ErdFlowNode[] = schema.notes.map((note) => {
    const data: StickyNodeData = {
      title: note.name,
      content: note.content,
      headerColor: note.headerColor,
    }
    return {
      id: noteNodeId(note.name),
      type: 'sticky',
      position: { ...ZERO },
      data,
    }
  })

  // Group nodes FIRST (React Flow parent-before-child requirement), then tables,
  // then enums + sticky notes.
  const nodes: ErdFlowNode[] = [
    ...groupNodes,
    ...tableNodes,
    ...enumNodes,
    ...stickyNodes,
  ]

  const edges: ErdFlowEdge[] = [
    ...schema.refs.flatMap(refToEdges),
    ...enumLinkEdges(schema),
  ]

  return { nodes, edges }
}
```

- [ ] **Step 4: Run the test and SEE IT PASS.**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/erd/lib/schemaToFlow.test.ts 2>&1 | tail -15
```

Expected: all tests pass, e.g.:

```
 ✓ src/entities/erd/lib/schemaToFlow.test.ts (15 tests) ...
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

- [ ] **Step 5: Type-check (no leaked `any`, types align).**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
```

Expected: no errors / exit 0.

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add src/entities/erd/lib/schemaToFlow.ts src/entities/erd/lib/schemaToFlow.test.ts && git commit -m "feat(erd): pure schemaToFlow adapter (per-column handles, crow-foot edges, groups, enum links)"
```

---

### Task 5: PURE dagre autoLayout + unit tests

TDD: failing test first → minimal impl → pass. `autoLayout` is a pure function: given the adapter's `{ nodes, edges }`, it runs a layered dagre layout and returns NEW nodes with computed `position` (and, for group nodes, a computed `style.width`/`style.height` bounding box behind their members). It keeps group members clustered by laying out members RELATIVE to their group via dagre `compound` subgraphs (`setParent`), then converts dagre's center-anchored coordinates to React Flow's top-left `position`. It is deterministic (same input → same output). Enum-link edges are excluded from the dagre graph so dashed type-links don't distort the table layout. No persistence — callers re-run this every parse.

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/erd/lib/autoLayout.ts`
- Test: `/home/soron/projects/codegram/frontend/src/entities/erd/lib/autoLayout.test.ts`

- [ ] **Step 1: Write the failing test FIRST.**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/lib/autoLayout.test.ts` with EXACTLY:

```ts
import { describe, it, expect } from 'vitest'
import { autoLayout } from './autoLayout'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'

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

function groupNode(id: string): ErdFlowNode {
  return {
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    data: { groupName: id },
  }
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

describe('autoLayout', () => {
  it('assigns non-overlapping positions to connected nodes', () => {
    const nodes = [tableNode('public.users'), tableNode('public.posts')]
    const edges = [relEdge('public.users', 'public.posts')]
    const out = autoLayout(nodes, edges)
    const users = out.find((n) => n.id === 'public.users')!
    const posts = out.find((n) => n.id === 'public.posts')!
    // Distinct positions (dagre separated them along the rank axis).
    expect(users.position).not.toEqual(posts.position)
  })

  it('returns one output node per input node, preserving ids and data', () => {
    const nodes = [tableNode('a'), tableNode('b'), tableNode('c')]
    const edges = [relEdge('a', 'b'), relEdge('b', 'c')]
    const out = autoLayout(nodes, edges)
    expect(out.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(out.find((n) => n.id === 'a')!.data).toBe(
      nodes.find((n) => n.id === 'a')!.data,
    )
  })

  it('is deterministic: identical input yields identical positions', () => {
    const make = () => ({
      nodes: [tableNode('a'), tableNode('b')],
      edges: [relEdge('a', 'b')],
    })
    const first = autoLayout(make().nodes, make().edges)
    const second = autoLayout(make().nodes, make().edges)
    expect(first.map((n) => n.position)).toEqual(
      second.map((n) => n.position),
    )
  })

  it('keeps group members clustered and sizes the group node to its members', () => {
    const nodes = [
      groupNode('group:core'),
      tableNode('public.users', 'group:core'),
      tableNode('public.posts', 'group:core'),
      tableNode('public.audit'), // ungrouped, far in the graph
    ]
    const edges = [
      relEdge('public.users', 'public.posts'),
      relEdge('public.posts', 'public.audit'),
    ]
    const out = autoLayout(nodes, edges)
    const group = out.find((n) => n.id === 'group:core')!
    // Group node received a measurable bounding box.
    expect(Number(group.style?.width)).toBeGreaterThan(0)
    expect(Number(group.style?.height)).toBeGreaterThan(0)
    // Both members still reference the group as parent.
    expect(out.find((n) => n.id === 'public.users')!.parentId).toBe('group:core')
    expect(out.find((n) => n.id === 'public.posts')!.parentId).toBe('group:core')
  })

  it('does not crash on an empty graph', () => {
    expect(autoLayout([], [])).toEqual([])
  })

  it('positions an isolated node (no edges) without throwing', () => {
    const out = autoLayout([tableNode('solo')], [])
    expect(out).toHaveLength(1)
    expect(typeof out[0].position.x).toBe('number')
    expect(typeof out[0].position.y).toBe('number')
  })
})
```

- [ ] **Step 2: Run the test and SEE IT FAIL (module missing).**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/erd/lib/autoLayout.test.ts 2>&1 | tail -15
```

Expected: failure resolving the import:

```
Error: Failed to resolve import "./autoLayout" from "src/entities/erd/lib/autoLayout.test.ts".
```

(The module does not exist yet.)

- [ ] **Step 3: Implement the PURE dagre layout (minimal, complete).**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/lib/autoLayout.ts` with EXACTLY:

```ts
/**
 * PURE dagre layered layout (Plan 3b, D8). Given the adapter's nodes + edges it
 * computes a position for every node (top-left, React Flow convention) and a
 * bounding-box style for each group node so it renders as a colored region
 * behind its members. Group members are kept clustered via dagre compound
 * subgraphs (setParent). Deterministic for a given input. NO persistence — the
 * canvas re-runs this every parse. NO React Flow runtime is imported (types only).
 *
 * entities layer: imports only @dagrejs/dagre + entities/erd types (FSD).
 */
import dagre from '@dagrejs/dagre'
import type { ErdFlowNode, ErdFlowEdge } from '@/entities/erd/model/types'

/** Conservative node-size estimates fed to dagre (dagre needs dims up front). */
const TABLE_WIDTH = 240
const HEADER_HEIGHT = 40
const ROW_HEIGHT = 26
const ENUM_WIDTH = 200
const STICKY_WIDTH = 220
const STICKY_HEIGHT = 120
const GROUP_PADDING = 24

/** Estimate a node's rendered size so dagre lays out without DOM measurement. */
function nodeSize(node: ErdFlowNode): { width: number; height: number } {
  if (node.type === 'table') {
    const cols = Array.isArray(
      (node.data as { columns?: unknown[] }).columns,
    )
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
  // sticky + group fall back to fixed boxes (group is re-sized post-layout).
  return { width: STICKY_WIDTH, height: STICKY_HEIGHT }
}

/**
 * Lay out nodes with dagre and return NEW nodes carrying computed positions.
 * Group nodes are excluded from dagre's own node set (they are containers) but
 * declared as compound parents via setParent so dagre clusters their members;
 * after layout each group node is sized to the bounding box of its members.
 * Enum-link (dashed) edges are excluded from the layout graph so they do not
 * distort the table ranking.
 */
export function autoLayout(
  nodes: ErdFlowNode[],
  edges: ErdFlowEdge[],
): ErdFlowNode[] {
  if (nodes.length === 0) return []

  const g = new dagre.graphlib.Graph({ compound: true })
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 160, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const groupIds = new Set(
    nodes.filter((n) => n.type === 'group').map((n) => n.id),
  )

  // Register non-group nodes with their estimated sizes; declare group parents.
  for (const node of nodes) {
    if (groupIds.has(node.id)) {
      // Compound parent placeholder; dagre will compute its cluster extent.
      g.setNode(node.id, {})
      continue
    }
    const { width, height } = nodeSize(node)
    g.setNode(node.id, { width, height })
    if (node.parentId && groupIds.has(node.parentId)) {
      g.setParent(node.id, node.parentId)
    }
  }

  // Only relationship edges between laid-out nodes drive ranking; skip dashed
  // enum links and any edge whose endpoints aren't graph nodes.
  for (const edge of edges) {
    if ((edge.data as { isEnumLink?: boolean } | undefined)?.isEnumLink) continue
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  dagre.layout(g)

  // First pass: position every non-group node (dagre anchors at center).
  const positioned: ErdFlowNode[] = nodes.map((node) => {
    if (groupIds.has(node.id)) return node // group sized in second pass
    const laid = g.node(node.id)
    const { width, height } = nodeSize(node)
    return {
      ...node,
      position: {
        x: (laid?.x ?? 0) - width / 2,
        y: (laid?.y ?? 0) - height / 2,
      },
    }
  })

  // Second pass: size each group node to the bounding box of its members.
  const finalNodes = positioned.map((node) => {
    if (!groupIds.has(node.id)) return node
    const laid = g.node(node.id)
    if (laid && typeof laid.width === 'number' && typeof laid.height === 'number') {
      return {
        ...node,
        position: {
          x: laid.x - laid.width / 2 - GROUP_PADDING,
          y: laid.y - laid.height / 2 - GROUP_PADDING,
        },
        style: {
          ...node.style,
          width: laid.width + GROUP_PADDING * 2,
          height: laid.height + GROUP_PADDING * 2,
        },
      }
    }
    return { ...node, style: { ...node.style, width: 1, height: 1 } }
  })

  return finalNodes
}
```

- [ ] **Step 4: Run the test and SEE IT PASS.**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/erd/lib/autoLayout.test.ts 2>&1 | tail -15
```

Expected: all tests pass, e.g.:

```
 ✓ src/entities/erd/lib/autoLayout.test.ts (6 tests) ...
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

- [ ] **Step 5: Type-check.**

Run:

```bash
cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
```

Expected: no errors / exit 0.

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add src/entities/erd/lib/autoLayout.ts src/entities/erd/lib/autoLayout.test.ts && git commit -m "feat(erd): pure dagre autoLayout (layered LR, group clustering, deterministic)"
```

---

### Task 6: entities/erd barrel

Barrel-only module — no runtime behavior, so no red phase. The verification is that the barrel re-exports resolve under `tsc` and the existing entities pattern (a single `index.ts` per slice, like `entities/dbml/index.ts`) is matched. This is the public surface `features/erd-canvas` and `pages/editor` import from.

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/erd/index.ts`

- [ ] **Step 1: Create the barrel.**

Create `/home/soron/projects/codegram/frontend/src/entities/erd/index.ts` with EXACTLY:

```ts
export { schemaToFlow } from './lib/schemaToFlow'
export { autoLayout } from './lib/autoLayout'
export type {
  ErdNodeType,
  ErdColumn,
  TableNodeData,
  EnumNodeData,
  StickyNodeData,
  GroupNodeData,
  ErdNodeData,
  RelationEndpointMarker,
  RelationEdgeData,
  ErdFlowNode,
  ErdFlowEdge,
  ErdFlow,
} from './model/types'
```

- [ ] **Step 2: Verify the barrel resolves and the full ERD test set is green.**

Type-check:

```bash
cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
```

Expected: no errors / exit 0.

Run the entities/erd tests together (proves the barrel + both pure units coexist):

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/erd 2>&1 | tail -15
```

Expected:

```
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram/frontend && git add src/entities/erd/index.ts && git commit -m "feat(erd): barrel-export schemaToFlow, autoLayout, and ERD view types"
```

---

### Task 7: `TableNode` — custom table node with per-column handles

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/TableNode.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/TableNode.test.tsx`

The `schemaToFlow` adapter (Task 4) emits table nodes of `type: 'table'` whose `data` is a `TableNodeData` (`{ tableName, tableId, headerColor?, columns: ErdColumn[] }`), where each `ErdColumn` carries `{ id, name, type, pk, fk, nn, unique }` and `id` is the column key `${schema}.${table}.${column}`. This task renders that node. Each column row gets a `target` handle on the left and a `source` handle on the right, both keyed `id={col.id}` so `RelationEdge` can attach at the exact column. `isConnectable={false}` because 3b is read-only (no user edge drawing); handles still render so React Flow can resolve edge endpoints.

- [ ] **Step 1: Write the failing test for `TableNode`.**

  This test renders the node inside a `ReactFlowProvider` (handles require the store context). jsdom cannot lay out the flow, but it CAN see the header text, the column name/type text, the PK/FK/NN/UQ marker text, and the `.react-flow__handle` DOM elements React Flow renders for each `<Handle>`. We assert two handles per column (left + right) and the labels.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/TableNode.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ReactFlowProvider } from '@xyflow/react'
  import { TableNode, type TableNodeProps } from './TableNode'

  function renderNode(props: TableNodeProps) {
    return render(
      <ReactFlowProvider>
        <TableNode {...props} />
      </ReactFlowProvider>,
    )
  }

  const baseProps = {
    id: 'public.users',
    type: 'table',
    selected: false,
    zIndex: 0,
    isConnectable: false,
    xPos: 0,
    yPos: 0,
    dragging: false,
    draggable: false,
    selectable: false,
    deletable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 220,
    height: 120,
  } as const

  describe('TableNode', () => {
    it('renders the table name in the header', () => {
      renderNode({
        ...baseProps,
        data: {
          tableName: 'users',
          tableId: 'public.users',
          headerColor: '#3498db',
          columns: [
            {
              id: 'public.users.id',
              name: 'id',
              type: 'integer',
              pk: true,
              fk: false,
              nn: true,
              unique: false,
            },
          ],
        },
      } as TableNodeProps)
      expect(screen.getByText('users')).toBeInTheDocument()
    })

    it('renders one row per column with name, type and markers', () => {
      renderNode({
        ...baseProps,
        data: {
          tableName: 'users',
          tableId: 'public.users',
          columns: [
            {
              id: 'public.users.id',
              name: 'id',
              type: 'integer',
              pk: true,
              fk: false,
              nn: true,
              unique: false,
            },
            {
              id: 'public.users.org_id',
              name: 'org_id',
              type: 'integer',
              pk: false,
              fk: true,
              nn: false,
              unique: true,
            },
          ],
        },
      } as TableNodeProps)

      expect(screen.getByText('id')).toBeInTheDocument()
      expect(screen.getByText('org_id')).toBeInTheDocument()
      expect(screen.getAllByText('integer')).toHaveLength(2)
      // PK + NN markers on the first row, FK + UQ markers on the second.
      expect(screen.getByTestId('marker-pk-public.users.id')).toBeInTheDocument()
      expect(screen.getByTestId('marker-nn-public.users.id')).toBeInTheDocument()
      expect(
        screen.getByTestId('marker-fk-public.users.org_id'),
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('marker-uq-public.users.org_id'),
      ).toBeInTheDocument()
    })

    it('renders a left + right handle per column keyed by the column id', () => {
      const { container } = renderNode({
        ...baseProps,
        data: {
          tableName: 'users',
          tableId: 'public.users',
          columns: [
            {
              id: 'public.users.id',
              name: 'id',
              type: 'integer',
              pk: true,
              fk: false,
              nn: true,
              unique: false,
            },
          ],
        },
      } as TableNodeProps)

      // React Flow renders each <Handle> as a div.react-flow__handle.
      const handles = container.querySelectorAll('.react-flow__handle')
      expect(handles).toHaveLength(2)
      // Both handles carry the column id as their data-handleid.
      const ids = Array.from(handles).map((h) =>
        h.getAttribute('data-handleid'),
      )
      expect(ids).toEqual(['public.users.id', 'public.users.id'])
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no `TableNode` module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/TableNode.test.tsx 2>&1 | tail -15
  ```

  Expected: failure resolving the import, e.g. `Error: Failed to resolve import "./TableNode" from "src/features/erd-canvas/ui/TableNode.test.tsx".` (the file does not exist yet).

- [ ] **Step 3: Implement `TableNode`.**

  The `TableNodeData` type is defined in `entities/erd` (Task 3) and re-exported from its barrel; we import the type from `@/entities/erd`. The component is `memo`-wrapped (per-keystroke re-renders are frequent). Markers use `data-testid` so jsdom tests can target them. `Position` and `Handle` come from `@xyflow/react`.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/TableNode.tsx` with EXACTLY:

  ```tsx
  import { memo } from 'react'
  import { Handle, Position, type NodeProps } from '@xyflow/react'
  import type { TableNodeData } from '@/entities/erd'

  export type TableNodeProps = NodeProps & { data: TableNodeData }

  /**
   * Custom React Flow node for a DBML table. Renders a colored header (table
   * name) and one row per column showing name, type, and PK/FK/NN/UQ markers.
   * Each column row carries a target Handle on the left and a source Handle on
   * the right, both keyed by the column id (`${schema}.${table}.${column}`) so
   * RelationEdge can attach at the exact column. Handles are non-connectable
   * (3b is a read-only auto-layout view); they exist only as edge anchors.
   * features layer: depends on shared + entities/erd + @xyflow/react.
   */
  function TableNodeImpl({ data }: TableNodeProps) {
    return (
      <div className="min-w-[200px] rounded border border-gray-300 bg-white text-xs shadow-sm">
        <div
          className="rounded-t px-3 py-1.5 text-sm font-semibold text-white"
          style={{ backgroundColor: data.headerColor ?? '#475569' }}
        >
          {data.tableName}
        </div>
        <div className="divide-y divide-gray-100">
          {data.columns.map((col) => (
            <div
              key={col.id}
              data-testid={`column-${col.id}`}
              className="relative flex items-center justify-between gap-2 px-3 py-1"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={col.id}
                isConnectable={false}
                className="!h-2 !w-2 !border !border-gray-400 !bg-white"
              />
              <span className="flex items-center gap-1 font-medium text-gray-800">
                {col.name}
                {col.pk && (
                  <span
                    data-testid={`marker-pk-${col.id}`}
                    title="Primary key"
                    className="text-amber-600"
                  >
                    PK
                  </span>
                )}
                {col.fk && (
                  <span
                    data-testid={`marker-fk-${col.id}`}
                    title="Foreign key"
                    className="text-sky-600"
                  >
                    FK
                  </span>
                )}
                {col.nn && (
                  <span
                    data-testid={`marker-nn-${col.id}`}
                    title="Not null"
                    className="text-rose-600"
                  >
                    NN
                  </span>
                )}
                {col.unique && (
                  <span
                    data-testid={`marker-uq-${col.id}`}
                    title="Unique"
                    className="text-violet-600"
                  >
                    UQ
                  </span>
                )}
              </span>
              <span className="text-gray-500">{col.type}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={col.id}
                isConnectable={false}
                className="!h-2 !w-2 !border !border-gray-400 !bg-white"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  export const TableNode = memo(TableNodeImpl)
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/TableNode.test.tsx 2>&1 | tail -15
  ```

  Expected: `Test Files  1 passed (1)` / `Tests  3 passed (3)`.

  Note: React Flow may log a jsdom measurement warning (`[React Flow]: ... ResizeObserver`); harmless — the `ResizeObserver`/`matchMedia`/`getBoundingClientRect` mocks added in Task 12 silence it. Even without those mocks the assertions pass because jsdom renders the handle DOM regardless of measurement.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/TableNode.tsx src/features/erd-canvas/ui/TableNode.test.tsx && git commit -m "feat(erd-canvas): add TableNode with per-column handles and markers"
  ```

---

### Task 8: `EnumNode` — custom enum node

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/EnumNode.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/EnumNode.test.tsx`

The adapter (Task 4) emits enum nodes of `type: 'enum'` whose `data` is `EnumNodeData` (`{ enumName, values: string[] }`). The optional dashed enum-link edges (Task 4) target the enum node as a whole; this node provides a single `target` Handle on its left so such an edge has an anchor. (When no enum-link edge exists, the handle is inert.)

- [ ] **Step 1: Write the failing test for `EnumNode`.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/EnumNode.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ReactFlowProvider } from '@xyflow/react'
  import { EnumNode, type EnumNodeProps } from './EnumNode'

  function renderNode(props: EnumNodeProps) {
    return render(
      <ReactFlowProvider>
        <EnumNode {...props} />
      </ReactFlowProvider>,
    )
  }

  const baseProps = {
    id: 'enum:public.user_role',
    type: 'enum',
    selected: false,
    zIndex: 0,
    isConnectable: false,
    xPos: 0,
    yPos: 0,
    dragging: false,
    draggable: false,
    selectable: false,
    deletable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 160,
    height: 80,
  } as const

  describe('EnumNode', () => {
    it('renders the enum name and each value', () => {
      renderNode({
        ...baseProps,
        data: { enumName: 'user_role', values: ['admin', 'member', 'guest'] },
      } as EnumNodeProps)

      expect(screen.getByText('user_role')).toBeInTheDocument()
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('member')).toBeInTheDocument()
      expect(screen.getByText('guest')).toBeInTheDocument()
    })

    it('renders a single target handle for optional enum-link edges', () => {
      const { container } = renderNode({
        ...baseProps,
        data: { enumName: 'user_role', values: ['admin'] },
      } as EnumNodeProps)
      expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(1)
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/EnumNode.test.tsx 2>&1 | tail -15
  ```

  Expected: import-resolution failure (`Failed to resolve import "./EnumNode"`).

- [ ] **Step 3: Implement `EnumNode`.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/EnumNode.tsx` with EXACTLY:

  ```tsx
  import { memo } from 'react'
  import { Handle, Position, type NodeProps } from '@xyflow/react'
  import type { EnumNodeData } from '@/entities/erd'

  export type EnumNodeProps = NodeProps & { data: EnumNodeData }

  /**
   * Custom React Flow node for a DBML enum: a labeled card listing the enum's
   * values. Carries a single non-connectable target Handle (left) so the
   * optional column-type -> enum link edge (when the adapter emits one) has an
   * anchor; otherwise the handle is inert. 3b is read-only.
   * features layer: depends on shared + entities/erd + @xyflow/react.
   */
  function EnumNodeImpl({ data }: EnumNodeProps) {
    return (
      <div className="min-w-[140px] rounded border border-amber-300 bg-amber-50 text-xs shadow-sm">
        <Handle
          type="target"
          position={Position.Left}
          isConnectable={false}
          className="!h-2 !w-2 !border !border-amber-400 !bg-white"
        />
        <div className="rounded-t bg-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-900">
          {data.enumName}
        </div>
        <ul className="flex flex-col gap-0.5 px-3 py-1.5 text-amber-800">
          {data.values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      </div>
    )
  }

  export const EnumNode = memo(EnumNodeImpl)
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/EnumNode.test.tsx 2>&1 | tail -15
  ```

  Expected: `Tests  2 passed (2)`.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/EnumNode.tsx src/features/erd-canvas/ui/EnumNode.test.tsx && git commit -m "feat(erd-canvas): add EnumNode listing enum values"
  ```

---

### Task 9: `StickyNote` — custom sticky-note node

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/StickyNote.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/StickyNote.test.tsx`

The adapter (Task 4) emits sticky nodes of `type: 'sticky'` whose `data` is `StickyNodeData` (`{ title, content, headerColor? }`, mapped from `DbmlNote`). This is a read-only text card with no handles (notes have no relationships).

- [ ] **Step 1: Write the failing test for `StickyNote`.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/StickyNote.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ReactFlowProvider } from '@xyflow/react'
  import { StickyNote, type StickyNoteProps } from './StickyNote'

  function renderNode(props: StickyNoteProps) {
    return render(
      <ReactFlowProvider>
        <StickyNote {...props} />
      </ReactFlowProvider>,
    )
  }

  const baseProps = {
    id: 'note:Onboarding',
    type: 'sticky',
    selected: false,
    zIndex: 0,
    isConnectable: false,
    xPos: 0,
    yPos: 0,
    dragging: false,
    draggable: false,
    selectable: false,
    deletable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 200,
    height: 80,
  } as const

  describe('StickyNote', () => {
    it('renders the note title and content', () => {
      renderNode({
        ...baseProps,
        data: {
          title: 'Onboarding',
          content: 'Run the seed script before first login.',
        },
      } as StickyNoteProps)

      expect(screen.getByText('Onboarding')).toBeInTheDocument()
      expect(
        screen.getByText('Run the seed script before first login.'),
      ).toBeInTheDocument()
    })

    it('renders no connection handles', () => {
      const { container } = renderNode({
        ...baseProps,
        data: { title: 'Onboarding', content: 'text' },
      } as StickyNoteProps)
      expect(container.querySelectorAll('.react-flow__handle')).toHaveLength(0)
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx 2>&1 | tail -15
  ```

  Expected: import-resolution failure (`Failed to resolve import "./StickyNote"`).

- [ ] **Step 3: Implement `StickyNote`.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/StickyNote.tsx` with EXACTLY:

  ```tsx
  import { memo } from 'react'
  import type { NodeProps } from '@xyflow/react'
  import type { StickyNodeData } from '@/entities/erd'

  export type StickyNoteProps = NodeProps & { data: StickyNodeData }

  /**
   * Custom React Flow node for a standalone DBML Note: a read-only sticky card
   * showing the note title and content. No handles (notes have no
   * relationships). Position is auto-laid-out and NOT persisted in 3b.
   * features layer: depends on shared + entities/erd + @xyflow/react.
   */
  function StickyNoteImpl({ data }: StickyNoteProps) {
    return (
      <div
        className="min-w-[160px] max-w-[260px] rounded border border-yellow-300 bg-yellow-100 text-xs shadow-sm"
        style={
          data.headerColor ? { borderTopColor: data.headerColor } : undefined
        }
      >
        <div className="border-b border-yellow-200 px-3 py-1.5 text-sm font-semibold text-yellow-900">
          {data.title}
        </div>
        <p className="whitespace-pre-wrap px-3 py-1.5 text-yellow-800">
          {data.content}
        </p>
      </div>
    )
  }

  export const StickyNote = memo(StickyNoteImpl)
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/StickyNote.test.tsx 2>&1 | tail -15
  ```

  Expected: `Tests  2 passed (2)`.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/StickyNote.tsx src/features/erd-canvas/ui/StickyNote.test.tsx && git commit -m "feat(erd-canvas): add StickyNote read-only text card node"
  ```

---

### Task 10: `GroupNode` — colored background region behind table-group members

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/GroupNode.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/GroupNode.test.tsx`

The adapter (Task 4) emits group nodes of `type: 'group'` whose `data` is `GroupNodeData` (`{ groupName, color? }`). Per D6, the group node is a colored background REGION: it is sized by `autoLayout` (Task 5, which sets `node.style.width`/`height` to the members' bounding box) and rendered behind its member tables. It must be non-interactive so clicks/drags pass through to the tables on top — set `pointer-events: none` on the rendered region. The group node is emitted FIRST in the nodes array (React Flow requires parents before children) and its members carry `parentId` = this node's id (set by the adapter); `autoLayout` keeps members clustered.

- [ ] **Step 1: Write the failing test for `GroupNode`.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/GroupNode.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ReactFlowProvider } from '@xyflow/react'
  import { GroupNode, type GroupNodeProps } from './GroupNode'

  function renderNode(props: GroupNodeProps) {
    return render(
      <ReactFlowProvider>
        <GroupNode {...props} />
      </ReactFlowProvider>,
    )
  }

  const baseProps = {
    id: 'group:Sales',
    type: 'group',
    selected: false,
    zIndex: 0,
    isConnectable: false,
    xPos: 0,
    yPos: 0,
    dragging: false,
    draggable: false,
    selectable: false,
    deletable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    width: 600,
    height: 400,
  } as const

  describe('GroupNode', () => {
    it('renders the group name label', () => {
      renderNode({
        ...baseProps,
        data: { groupName: 'Sales', color: '#ff6b6b' },
      } as GroupNodeProps)
      expect(screen.getByText('Sales')).toBeInTheDocument()
    })

    it('renders a non-interactive region tinted with the group color', () => {
      renderNode({
        ...baseProps,
        data: { groupName: 'Sales', color: '#ff6b6b' },
      } as GroupNodeProps)
      const region = screen.getByTestId('group-region-group:Sales')
      expect(region).toHaveStyle({ pointerEvents: 'none' })
      // The color is applied (rendered as rgb by jsdom).
      expect(region.style.backgroundColor).not.toBe('')
    })

    it('falls back to a neutral tint when no color is set', () => {
      renderNode({
        ...baseProps,
        id: 'group:Misc',
        data: { groupName: 'Misc' },
      } as GroupNodeProps)
      const region = screen.getByTestId('group-region-group:Misc')
      expect(region.style.backgroundColor).not.toBe('')
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/GroupNode.test.tsx 2>&1 | tail -15
  ```

  Expected: import-resolution failure (`Failed to resolve import "./GroupNode"`).

- [ ] **Step 3: Implement `GroupNode`.**

  The region fills the node's box (`100%` of the width/height `autoLayout` set on `node.style`). `pointerEvents: 'none'` lets clicks reach member tables above. The tint is the group color at low opacity; we hex-to-rgba it with a default neutral gray.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/GroupNode.tsx` with EXACTLY:

  ```tsx
  import { memo } from 'react'
  import type { NodeProps } from '@xyflow/react'
  import type { GroupNodeData } from '@/entities/erd'

  export type GroupNodeProps = NodeProps & { data: GroupNodeData }

  /**
   * Convert a #rrggbb (or #rgb) hex to an rgba() string at the given alpha.
   * Falls back to a neutral slate tint for missing/invalid input so a group
   * region is always visible.
   */
  function tint(color: string | undefined, alpha: number): string {
    const fallback = '100, 116, 139' // slate-500
    if (!color) return `rgba(${fallback}, ${alpha})`
    let hex = color.trim().replace(/^#/, '')
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('')
    }
    if (hex.length !== 6 || /[^0-9a-fA-F]/.test(hex)) {
      return `rgba(${fallback}, ${alpha})`
    }
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  /**
   * Custom React Flow node for a DBML table group: a colored background REGION
   * drawn behind its member tables (D6). The node is sized by the layout step
   * (style.width/height set to the members' bounding box) and rendered first in
   * the nodes array so member tables (parentId = this node) stack above it. The
   * region is pointer-events:none so interaction passes through to the tables.
   * features layer: depends on shared + entities/erd + @xyflow/react.
   */
  function GroupNodeImpl({ id, data }: GroupNodeProps) {
    return (
      <div
        data-testid={`group-region-${id}`}
        className="h-full w-full rounded-lg"
        style={{
          pointerEvents: 'none',
          width: '100%',
          height: '100%',
          backgroundColor: tint(data.color, 0.1),
          border: `2px dashed ${tint(data.color, 0.6)}`,
        }}
      >
        <span
          className="absolute left-2 top-1 text-xs font-semibold"
          style={{ color: tint(data.color, 0.9), pointerEvents: 'none' }}
        >
          {data.groupName}
        </span>
      </div>
    )
  }

  export const GroupNode = memo(GroupNodeImpl)
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/GroupNode.test.tsx 2>&1 | tail -15
  ```

  Expected: `Tests  3 passed (3)`.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/GroupNode.tsx src/features/erd-canvas/ui/GroupNode.test.tsx && git commit -m "feat(erd-canvas): add GroupNode colored background region"
  ```

---

### Task 11: `RelationEdge` — crow-foot custom edge

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/RelationEdge.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx`

The adapter (Task 4) emits edges of `type: 'relation'` whose `data` is `RelationEdgeData` (`{ relation, sourceMarker, targetMarker, isEnumLink? }`) and whose `sourceHandle`/`targetHandle` are the column ids. This task renders a smoothstep path with crow-foot markers at each endpoint, mapped from the two halves of `relation` (`${from}-${to}`). Per D4, the `from` half drives the SOURCE-end marker and the `to` half drives the TARGET-end marker — we do NOT assume `from` is the many side. `'1'` → a single perpendicular bar marker; `'n'` → a crow-foot (three-prong) marker. (The edge recomputes the markers from `data.relation` via the exported helpers; this matches the `sourceMarker`/`targetMarker` the adapter already precomputed.)

The pure relation→marker mapping (`startMarkerKind`/`endMarkerKind`) is exported so it can be unit-tested without rendering React Flow; the component is tested within `ReactFlowProvider`.

- [ ] **Step 1: Write the failing test for the marker mapping + the edge render.**

  The mapping test is pure (no React Flow). The render test mounts the edge inside `<ReactFlowProvider>` and an `<svg>` (edges render into SVG) and asserts the `<path class="react-flow__edge-path">` exists and that the two `<marker>` defs are present.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/RelationEdge.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render } from '@testing-library/react'
  import { ReactFlowProvider, Position } from '@xyflow/react'
  import {
    RelationEdge,
    startMarkerKind,
    endMarkerKind,
    type RelationEdgeProps,
  } from './RelationEdge'

  describe('relation -> crow-foot marker mapping', () => {
    it('maps each relation half to the correct endpoint marker', () => {
      // from half drives the start (source) marker; to half drives the end.
      expect(startMarkerKind('1-1')).toBe('one')
      expect(endMarkerKind('1-1')).toBe('one')

      expect(startMarkerKind('1-n')).toBe('one')
      expect(endMarkerKind('1-n')).toBe('many')

      expect(startMarkerKind('n-1')).toBe('many')
      expect(endMarkerKind('n-1')).toBe('one')

      expect(startMarkerKind('n-n')).toBe('many')
      expect(endMarkerKind('n-n')).toBe('many')
    })
  })

  function renderEdge(props: RelationEdgeProps) {
    return render(
      <ReactFlowProvider>
        <svg>
          <RelationEdge {...props} />
        </svg>
      </ReactFlowProvider>,
    )
  }

  const baseProps = {
    id: 'e1',
    source: 'public.posts',
    target: 'public.users',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    animated: false,
    deletable: false,
    selectable: false,
    sourceHandleId: 'public.posts.user_id',
    targetHandleId: 'public.users.id',
  } as const

  describe('RelationEdge', () => {
    it('renders an edge path and crow-foot marker defs for a 1-n relation', () => {
      const { container } = renderEdge({
        ...baseProps,
        data: { relation: '1-n', sourceMarker: 'one', targetMarker: 'many' },
      } as RelationEdgeProps)

      // BaseEdge renders the path with the react-flow__edge-path class.
      expect(
        container.querySelector('path.react-flow__edge-path'),
      ).toBeTruthy()
      // Two endpoint markers are defined for this edge id.
      expect(container.querySelector('marker#crowfoot-start-e1')).toBeTruthy()
      expect(container.querySelector('marker#crowfoot-end-e1')).toBeTruthy()
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/RelationEdge.test.tsx 2>&1 | tail -15
  ```

  Expected: import-resolution failure (`Failed to resolve import "./RelationEdge"`).

- [ ] **Step 3: Implement `RelationEdge`.**

  `RelationEdgeData` is defined in `entities/erd` (Task 3) and re-exported from its barrel. We draw a smoothstep path via `getSmoothStepPath`, then render two per-edge `<marker>` defs (start = crow-foot or bar for the `from` half; end likewise for the `to` half) and reference them through `BaseEdge`'s `markerStart`/`markerEnd`. Markers are per-edge (id suffixed with the edge id) so each edge's orientation is independent. `orient="auto-start-reverse"` on the start marker flips it to point inward.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/RelationEdge.tsx` with EXACTLY:

  ```tsx
  import { memo } from 'react'
  import {
    BaseEdge,
    getSmoothStepPath,
    type EdgeProps,
  } from '@xyflow/react'
  import type { RelationEdgeData } from '@/entities/erd'
  import type { DbmlRelation } from '@/entities/dbml'

  export type RelationEdgeProps = EdgeProps & { data?: RelationEdgeData }

  type MarkerKind = 'one' | 'many'

  /** Crow-foot kind for the SOURCE end = the `from` half of `${from}-${to}`. */
  export function startMarkerKind(relation: DbmlRelation): MarkerKind {
    return relation.startsWith('n') ? 'many' : 'one'
  }

  /** Crow-foot kind for the TARGET end = the `to` half of `${from}-${to}`. */
  export function endMarkerKind(relation: DbmlRelation): MarkerKind {
    return relation.endsWith('n') ? 'many' : 'one'
  }

  /**
   * SVG path for a crow-foot marker. 'one' = a single perpendicular bar; 'many'
   * = a three-prong crow-foot. Drawn in a 16x16 box; refX=15 anchors the open
   * end at the line tip so the symbol sits just off the table edge.
   */
  function markerPath(kind: MarkerKind): string {
    return kind === 'many'
      ? 'M15 2 L1 8 L15 14 M1 8 L15 8'
      : 'M11 2 L11 14'
  }

  /**
   * Custom React Flow edge for a DBML relationship. Routes a smoothstep
   * (orthogonal-ish) path between the two column handles and draws crow-foot
   * cardinality markers at each endpoint mapped from the two halves of
   * `data.relation` (D4: the `from` half drives the source marker, the `to`
   * half the target marker — NOT an assumption that `from` is the many side).
   * Markers are defined per edge id so each edge orients independently.
   * features layer: depends on shared + entities/erd + entities/dbml +
   * @xyflow/react.
   */
  function RelationEdgeImpl({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  }: RelationEdgeProps) {
    const [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
    })

    const relation = data?.relation ?? '1-n'
    const startKind = startMarkerKind(relation)
    const endKind = endMarkerKind(relation)

    return (
      <>
        <defs>
          <marker
            id={`crowfoot-start-${id}`}
            markerWidth="16"
            markerHeight="16"
            refX="15"
            refY="8"
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path
              d={markerPath(startKind)}
              stroke="#64748b"
              strokeWidth="1.5"
              fill="none"
            />
          </marker>
          <marker
            id={`crowfoot-end-${id}`}
            markerWidth="16"
            markerHeight="16"
            refX="15"
            refY="8"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path
              d={markerPath(endKind)}
              stroke="#64748b"
              strokeWidth="1.5"
              fill="none"
            />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={edgePath}
          markerStart={`url(#crowfoot-start-${id})`}
          markerEnd={`url(#crowfoot-end-${id})`}
          style={{ stroke: '#94a3b8', strokeWidth: 1.5 }}
        />
      </>
    )
  }

  export const RelationEdge = memo(RelationEdgeImpl)
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/RelationEdge.test.tsx 2>&1 | tail -15
  ```

  Expected: `Tests  2 passed (2)`.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/RelationEdge.tsx src/features/erd-canvas/ui/RelationEdge.test.tsx && git commit -m "feat(erd-canvas): add crow-foot RelationEdge with per-endpoint markers"
  ```

---

### Task 12: jsdom mocks for React Flow (test setup)

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/src/test/setup.ts`
- Test: `/home/soron/projects/codegram/frontend/src/test/reactFlowMocks.test.ts` (create — a tiny guard that the mocks exist)

`ErdCanvas` (Task 13) mounts the full `<ReactFlow>`, which measures the DOM via `ResizeObserver`, `getBoundingClientRect`, and `matchMedia` — none of which jsdom implements. This task adds minimal global mocks so the canvas mounts without throwing and renders its `.react-flow__node` elements. This MUST land before Task 13. It is additive: the existing `jest` shim and `afterEach(cleanup)` are preserved byte-for-byte.

- [ ] **Step 1: Write a failing guard test for the mocks.**

  Create `/home/soron/projects/codegram/frontend/src/test/reactFlowMocks.test.ts` with EXACTLY:

  ```ts
  import { describe, it, expect } from 'vitest'

  describe('jsdom mocks for React Flow', () => {
    it('defines ResizeObserver globally', () => {
      expect(typeof globalThis.ResizeObserver).toBe('function')
      const ro = new globalThis.ResizeObserver(() => {})
      expect(typeof ro.observe).toBe('function')
      expect(typeof ro.disconnect).toBe('function')
    })

    it('defines matchMedia on window', () => {
      expect(typeof window.matchMedia).toBe('function')
      expect(window.matchMedia('(min-width: 1px)').matches).toBe(false)
    })

    it('gives DOMRect-like results from getBoundingClientRect', () => {
      const el = document.createElement('div')
      const rect = el.getBoundingClientRect()
      expect(rect.width).toBeGreaterThan(0)
      expect(rect.height).toBeGreaterThan(0)
    })
  })
  ```

- [ ] **Step 2: Run the guard test and SEE IT FAIL.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/test/reactFlowMocks.test.ts 2>&1 | tail -15
  ```

  Expected: failures such as `expected "undefined" to be "function"` for `ResizeObserver`/`matchMedia`, and `expected +0 to be greater than +0` for the rect width (jsdom returns a zero-size rect by default).

- [ ] **Step 3: Add the mocks to `setup.ts` (additive — preserve the existing shim and cleanup).**

  Append the following to `/home/soron/projects/codegram/frontend/src/test/setup.ts`, AFTER the existing `afterEach(() => { cleanup() })` block (leave every existing line byte-for-byte unchanged):

  ```ts
  // --- React Flow (Plan 3b) jsdom mocks ---------------------------------------
  // @xyflow/react measures the DOM (ResizeObserver, getBoundingClientRect,
  // matchMedia) which jsdom does not implement. These minimal mocks let the
  // canvas mount and render its nodes; layout/positions are NOT asserted in
  // jsdom (those are covered by the pure layout unit test + Playwright E2E).
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }

  // jsdom returns a zero-size rect; give nodes a non-zero box so React Flow's
  // measurement step produces dimensions instead of NaN.
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 200,
      height: 120,
      top: 0,
      left: 0,
      bottom: 120,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
  }
  ```

- [ ] **Step 4: Run the guard test and SEE IT PASS, then run the full suite to confirm no regression.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/test/reactFlowMocks.test.ts 2>&1 | tail -15 && npm run test:run 2>&1 | tail -15
  ```

  Expected: the guard file shows `Tests  3 passed (3)`, and the full run ends green (all prior suites still pass — the `getBoundingClientRect` override is benign for the existing CodeMirror/parse/summary tests, which assert text content, not geometry). If any pre-existing test that asserted a specific zero/element rect breaks, scope the override behind the React Flow node class instead; none are expected.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/test/setup.ts src/test/reactFlowMocks.test.ts && git commit -m "test(erd-canvas): add jsdom ResizeObserver/matchMedia/DOMRect mocks for React Flow"
  ```

---

### Task 13: `ErdCanvas` — ReactFlow wrapper fed by a DbmlSchema

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/ErdCanvas.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx`

`ErdCanvas` takes a `schema?: DbmlSchema` prop, runs the pure `schemaToFlow` adapter then `autoLayout` (both from `@/entities/erd`) inside a `useMemo` keyed on the schema reference, registers the `nodeTypes`/`edgeTypes` for the four nodes + the relation edge, and renders `<ReactFlow>` inside a `<ReactFlowProvider>`. It imports the React Flow stylesheet here (`@xyflow/react/dist/style.css`) so the CSS ships only on the code-split editor route (D10). Nodes are draggable for viewing convenience but positions are NOT persisted (re-laid-out every render); we set `nodesConnectable={false}` and `deleteKeyCode={null}` to keep it read-only-ish. When `schema` is `undefined` (or has no tables), it shows an empty-state placeholder.

- [ ] **Step 1: Write the failing test for `ErdCanvas`.**

  The mocks from Task 12 are now in `setup.ts`, so the full `<ReactFlow>` mounts. jsdom CAN see the `.react-flow__node` elements React Flow renders from the `nodes` array and the node label text. We assert a two-table + one-ref schema yields the two table nodes and that the table names appear, plus the empty state with no schema.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/ErdCanvas.test.tsx` with EXACTLY:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import type { DbmlSchema } from '@/entities/dbml'
  import { ErdCanvas } from './ErdCanvas'

  const schema: DbmlSchema = {
    tables: [
      {
        id: 'public.users',
        name: 'users',
        schema: 'public',
        columns: [
          {
            id: 'public.users.id',
            name: 'id',
            type: 'integer',
            pk: true,
            notNull: true,
            unique: false,
            increment: true,
            isFk: false,
          },
        ],
      },
      {
        id: 'public.posts',
        name: 'posts',
        schema: 'public',
        columns: [
          {
            id: 'public.posts.user_id',
            name: 'user_id',
            type: 'integer',
            pk: false,
            notNull: true,
            unique: false,
            increment: false,
            isFk: true,
          },
        ],
      },
    ],
    refs: [
      {
        id: 'public.posts.(user_id)>public.users.(id)',
        fromTable: 'posts',
        fromSchema: 'public',
        fromColumns: ['user_id'],
        toTable: 'users',
        toSchema: 'public',
        toColumns: ['id'],
        relation: 'n-1',
      },
    ],
    enums: [],
    tableGroups: [],
    notes: [],
  }

  describe('ErdCanvas', () => {
    it('renders a React Flow node per table for a valid schema', async () => {
      const { container } = render(<ErdCanvas schema={schema} />)
      // React Flow renders each node in the `nodes` array as a
      // .react-flow__node element once mounted/measured.
      const nodes = await screen.findAllByText(/users|posts/)
      expect(nodes.length).toBeGreaterThanOrEqual(2)
      // Both table labels are present in the rendered nodes.
      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('posts')).toBeInTheDocument()
      // The canvas root mounted.
      expect(container.querySelector('.react-flow')).toBeInTheDocument()
    })

    it('shows an empty-state placeholder when no schema is provided', () => {
      render(<ErdCanvas schema={undefined} />)
      expect(screen.getByText(/no diagram yet/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run the test and SEE IT FAIL (no module yet).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx 2>&1 | tail -15
  ```

  Expected: import-resolution failure (`Failed to resolve import "./ErdCanvas"`).

- [ ] **Step 3: Implement `ErdCanvas`.**

  `nodeTypes`/`edgeTypes` are defined at module scope (stable identity — passing fresh objects each render makes React Flow warn and re-init). The adapter + layout run in `useMemo` on the `schema` reference (the parse hook returns a fresh schema object only when the parse changes, so this re-lays-out exactly per parse — D8). `schemaToFlow(schema)` returns `{ nodes, edges }`; `autoLayout(nodes, edges)` returns the positioned nodes. The empty state renders without mounting React Flow.

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/ui/ErdCanvas.tsx` with EXACTLY:

  ```tsx
  import { useMemo } from 'react'
  import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    Controls,
    type NodeTypes,
    type EdgeTypes,
  } from '@xyflow/react'
  import '@xyflow/react/dist/style.css'
  import type { DbmlSchema } from '@/entities/dbml'
  import { schemaToFlow, autoLayout } from '@/entities/erd'
  import { TableNode } from './TableNode'
  import { EnumNode } from './EnumNode'
  import { StickyNote } from './StickyNote'
  import { GroupNode } from './GroupNode'
  import { RelationEdge } from './RelationEdge'

  export interface ErdCanvasProps {
    /** The normalized schema to render (parse.schema ?? parse.lastValidSchema). */
    schema?: DbmlSchema
  }

  // Stable type maps — defined at module scope so React Flow does not warn
  // about new nodeTypes/edgeTypes object identities on every render.
  const nodeTypes: NodeTypes = {
    table: TableNode,
    enum: EnumNode,
    sticky: StickyNote,
    group: GroupNode,
  }
  const edgeTypes: EdgeTypes = {
    relation: RelationEdge,
  }

  function ErdCanvasInner({ schema }: ErdCanvasProps) {
    // Pure adapter + dagre layout, recomputed only when the schema reference
    // changes (i.e. per successful parse). No persistence in 3b — positions are
    // auto-computed every time and never saved (that is Plan 4).
    const { nodes, edges } = useMemo(() => {
      if (!schema) return { nodes: [], edges: [] }
      const flow = schemaToFlow(schema)
      return { nodes: autoLayout(flow.nodes, flow.edges), edges: flow.edges }
    }, [schema])

    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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

  /**
   * Read-only React Flow ERD canvas (Plan 3b). Maps a normalized DbmlSchema to
   * nodes/edges via the pure entities/erd adapter, positions them with dagre
   * auto-layout on every render (NO persistence — Plan 4 adds saved layout),
   * and renders custom table/enum/sticky/group nodes + crow-foot relation
   * edges. Nodes may be dragged for viewing but positions are not saved. When
   * no schema is given (initial/empty), shows a placeholder.
   * features layer: depends on shared + entities/dbml + entities/erd +
   * @xyflow/react (FSD downward imports).
   */
  export function ErdCanvas({ schema }: ErdCanvasProps) {
    if (!schema || schema.tables.length === 0) {
      return (
        <div
          data-testid="erd-canvas-empty"
          className="flex h-full w-full items-center justify-center rounded border border-dashed border-gray-300 text-sm text-gray-500"
        >
          No diagram yet — start typing DBML.
        </div>
      )
    }
    return (
      <div data-testid="erd-canvas" className="h-full w-full rounded border">
        <ReactFlowProvider>
          <ErdCanvasInner schema={schema} />
        </ReactFlowProvider>
      </div>
    )
  }
  ```

- [ ] **Step 4: Run the test and SEE IT PASS.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/erd-canvas/ui/ErdCanvas.test.tsx 2>&1 | tail -15
  ```

  Expected: `Tests  2 passed (2)`. A `[React Flow]` measurement warning may print; harmless given the Task 12 mocks. If `findAllByText` times out, confirm Task 12's mocks are present in `setup.ts` (React Flow hides unmeasured nodes; the `getBoundingClientRect` mock gives them a non-zero box so they render).

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/ui/ErdCanvas.tsx src/features/erd-canvas/ui/ErdCanvas.test.tsx && git commit -m "feat(erd-canvas): add ErdCanvas wiring schemaToFlow+autoLayout into ReactFlow"
  ```

---

### Task 14: `features/erd-canvas` barrel

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/erd-canvas/index.ts`

Public surface of the feature: only `ErdCanvas` + its props type need to cross the feature boundary (the page consumes it). The nodes/edges are internal to the canvas. This is a type-only/re-export step — a red phase is artificial, so there is no failing-test step; correctness is verified by the page import compiling in Task 15 and by `tsc`.

- [ ] **Step 1: Write the barrel.**

  Create `/home/soron/projects/codegram/frontend/src/features/erd-canvas/index.ts` with EXACTLY:

  ```ts
  export { ErdCanvas } from './ui/ErdCanvas'
  export type { ErdCanvasProps } from './ui/ErdCanvas'
  ```

- [ ] **Step 2: Verify it type-checks (no red phase — pure re-export).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run type-check 2>&1 | tail -15
  ```

  Expected: no errors / exit 0. The barrel resolves `ErdCanvas`/`ErdCanvasProps`.

- [ ] **Step 3: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/erd-canvas/index.ts && git commit -m "feat(erd-canvas): add feature barrel exporting ErdCanvas"
  ```

---

### Task 15: Wire `ErdCanvas` into the editor page (split view, autosave preserved)

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/src/pages/editor/index.tsx`
- Modify (test): `/home/soron/projects/codegram/frontend/src/pages/editor/index.test.tsx`

Per D9: editor on the LEFT, `ErdCanvas` on the RIGHT, both fed by the SAME `useDbmlParse` result; the canvas gets `parse.schema ?? parse.lastValidSchema` so it shows the last valid diagram on a transient parse error (graceful — no blanking). `ParseErrorPanel` stays. DECISION: `SchemaSummary` is KEPT but moved to a compact strip in the sidebar (small status), since the canvas is now the primary view; this preserves the existing page test assertion that the summary renders. **The autosave seam — `useProjectAutosave({ projectId: id, dbmlText, baseline })`, the `dbmlText`/`baseline` state, and the seed effect keyed on `project?.id` — is preserved BYTE-FOR-BYTE; only the import block, the page-doc comment, and the `<main>` JSX layout change.**

- [ ] **Step 1: Add a failing assertion to the page test for the canvas presence.**

  The existing page test (`index.test.tsx`) already mocks `useProject`/`useProjectAutosave` and asserts the heading, seed, autosave contract, parse panels. Add one test that the ERD canvas region renders. Because the real `useDbmlParse` runs debounced, we assert the canvas CONTAINER (`erd-canvas` or `erd-canvas-empty`) is in the DOM — the page always mounts `ErdCanvas`, which renders one of the two testids synchronously.

  Add this test to `/home/soron/projects/codegram/frontend/src/pages/editor/index.test.tsx`, inside the `describe('EditorPage', ...)` block, after the existing `'renders the parse status and schema summary panels'` test:

  ```tsx
  it('mounts the ERD canvas region in the editor split view', () => {
    vi.spyOn(project, 'useProject').mockReturnValue({
      data: {
        id: 'p-1',
        user_id: 'u-1',
        name: 'My Project',
        dbml_text: 'Table users {\n  id int [pk]\n}',
        layout: {},
        created_at: '2026-06-05T00:00:00Z',
        updated_at: '2026-06-05T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof project.useProject>)

    renderEditor()

    // The canvas is always mounted; before the debounced parse settles it
    // shows the empty-state placeholder. Either testid proves the split view
    // includes the ERD canvas region.
    const canvas =
      screen.queryByTestId('erd-canvas') ??
      screen.queryByTestId('erd-canvas-empty')
    expect(canvas).toBeInTheDocument()
  })
  ```

- [ ] **Step 2: Run the page test and SEE IT FAIL.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/pages/editor/index.test.tsx 2>&1 | tail -15
  ```

  Expected: the new test fails with `expected null to be in the document` (the page does not render the canvas yet); the other four tests still pass.

- [ ] **Step 3: Modify the editor page to add the canvas in a split view.**

  First, add the `ErdCanvas` import. In `/home/soron/projects/codegram/frontend/src/pages/editor/index.tsx`, replace:

  ```tsx
  import {
    DbmlEditor,
    ParseErrorPanel,
    SchemaSummary,
    useDbmlParse,
  } from '@/features/dbml-editor'
  ```

  with:

  ```tsx
  import {
    DbmlEditor,
    ParseErrorPanel,
    SchemaSummary,
    useDbmlParse,
  } from '@/features/dbml-editor'
  import { ErdCanvas } from '@/features/erd-canvas'
  ```

  Then update the page-doc comment. Replace:

  ```tsx
  /**
   * Editor page (Plan 3a): loads a project by :id and binds a CodeMirror 6
   * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
   * plus live debounced parsing into the normalized model shown as a read-only
   * status panel + schema summary. No diagram/canvas — that is Plan 3b.
   * pages layer: composes the project entity + the autosave and dbml-editor
   * features (FSD downward imports).
   */
  ```

  with:

  ```tsx
  /**
   * Editor page (Plan 3b): loads a project by :id and binds a CodeMirror 6
   * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
   * plus live debounced parsing into the normalized model. A split view shows
   * the editor on the left and a read-only React Flow ERD canvas on the right,
   * both fed by the same parse result; the canvas renders the last valid schema
   * (parse.schema ?? parse.lastValidSchema) so a transient parse error does not
   * blank the diagram. Auto-layout (dagre) positions nodes each parse; no
   * layout persistence (Plan 4). The parse-status panel + a compact schema
   * summary stay in a sidebar beside the canvas.
   * pages layer: composes the project entity + the autosave, dbml-editor, and
   * erd-canvas features (FSD downward imports).
   */
  ```

  Then replace the entire `<main>` block. Replace:

  ```tsx
      <main className="flex-1 p-4">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <DbmlEditor value={dbmlText} onChange={setDbmlText} height="70vh" />
          <aside className="flex flex-col gap-4">
            <ParseErrorPanel status={parse.status} errors={parse.errors} />
            <SchemaSummary
              schema={parse.schema ?? parse.lastValidSchema}
            />
          </aside>
        </div>
      </main>
  ```

  with:

  ```tsx
      <main className="flex-1 p-4">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 lg:h-[80vh] lg:flex-row">
          <div className="flex flex-col gap-4 lg:w-[40%]">
            <DbmlEditor value={dbmlText} onChange={setDbmlText} height="70vh" />
          </div>
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <div className="min-h-[60vh] flex-1">
              <ErdCanvas schema={parse.schema ?? parse.lastValidSchema} />
            </div>
            <aside className="flex flex-col gap-4 lg:w-72">
              <ParseErrorPanel status={parse.status} errors={parse.errors} />
              <SchemaSummary schema={parse.schema ?? parse.lastValidSchema} />
            </aside>
          </div>
        </div>
      </main>
  ```

  Leave everything from `useParams` through the seed `useEffect` and both early returns exactly as-is.

- [ ] **Step 4: Run the page test and SEE IT PASS, then the full suite.**

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/pages/editor/index.test.tsx 2>&1 | tail -15 && npm run test:run 2>&1 | tail -15
  ```

  Expected: the editor page suite shows `Tests  5 passed (5)` (the four originals — including `'renders the parse status and schema summary panels'`, which still passes because `SchemaSummary` is retained — plus the new canvas test). The full run is green.

- [ ] **Step 5: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/pages/editor/index.tsx src/pages/editor/index.test.tsx && git commit -m "feat(editor): add ERD canvas split view fed by the parse result (autosave preserved)"
  ```

---

### Task 16: Playwright editor E2E — DBML renders table nodes + a relationship edge

**Files:**
- Create: `/home/soron/projects/codegram/frontend/e2e/editor-erd.spec.ts`

Controller-run E2E (the agent authors the spec; the controller executes Playwright against a running stack). It registers + logs in, creates a project (reusing the exact patterns from `projects.spec.ts`), types a two-table + ref DBML into CodeMirror, and asserts the React Flow canvas renders at least two `.react-flow__node` elements and at least one relationship edge path (`.react-flow__edge`). NOT pixel-perfect — DOM presence only.

- [ ] **Step 1: Author the E2E spec.**

  This mirrors `projects.spec.ts`'s `registerAndLogin` + create-project flow, then types DBML and asserts the canvas DOM. We wait on the canvas root (`.react-flow`) then on node/edge selectors (React Flow renders these once mounted/measured in a real browser).

  Create `/home/soron/projects/codegram/frontend/e2e/editor-erd.spec.ts` with EXACTLY:

  ```ts
  import { test, expect, type Page } from '@playwright/test'

  async function registerAndLogin(page: Page, email: string, password: string) {
    await page.goto('/register')
    await page.locator('#register-email').fill(email)
    await page.locator('#register-password').fill(password)
    await page.locator('#register-confirm-password').fill(password)

    const loginResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/auth/jwt/login') && resp.status() === 204,
    )
    await page.getByRole('button', { name: 'Sign up' }).click()
    await loginResponse
    await page.waitForURL((url) => url.pathname === '/')
  }

  test.describe('Editor ERD canvas', () => {
    test.beforeEach(async ({ context }) => {
      await context.clearCookies()
    })

    test('typing DBML renders table nodes and a relationship edge', async ({
      page,
    }) => {
      const email = `erd-${Date.now()}@example.com`
      const password = 'password123'
      await registerAndLogin(page, email, password)

      // Create a project; capture its id and land in the editor.
      const createResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/projects') &&
          resp.request().method() === 'POST' &&
          resp.status() === 201,
      )
      await page.getByPlaceholder('Project name').fill('ERD Project')
      await page.getByRole('button', { name: 'Create' }).click()
      const created = await (await createResponse).json()
      const projectId = created.id as string
      await page.waitForURL((url) => url.pathname === `/editor/${projectId}`)

      // Type a two-table schema with a foreign-key relationship.
      const dbml = [
        'Table users {',
        '  id integer [pk]',
        '}',
        'Table posts {',
        '  id integer [pk]',
        '  user_id integer [ref: > users.id]',
        '}',
      ].join('\n')
      const editor = page.getByTestId('dbml-editor')
      await editor.locator('.cm-content').click()
      await page.keyboard.type(dbml)

      // The ERD canvas mounts once the debounced parse settles.
      await expect(page.locator('.react-flow')).toBeVisible()

      // At least two table nodes render (users + posts).
      await expect
        .poll(async () => page.locator('.react-flow__node').count(), {
          timeout: 5000,
        })
        .toBeGreaterThanOrEqual(2)

      // The table names appear in the rendered nodes.
      await expect(page.locator('.react-flow__node')).toContainText(['users'])
      await expect(page.locator('.react-flow__node')).toContainText(['posts'])

      // At least one relationship edge path renders.
      await expect
        .poll(async () => page.locator('.react-flow__edge').count(), {
          timeout: 5000,
        })
        .toBeGreaterThanOrEqual(1)
      await expect(
        page.locator('.react-flow__edge path').first(),
      ).toBeVisible()
    })
  })
  ```

- [ ] **Step 2: Run the E2E spec (controller-run against the running stack).**

  ```bash
  cd /home/soron/projects/codegram/frontend && npx playwright test e2e/editor-erd.spec.ts
  ```

  Expected: `1 passed`. The spec asserts ≥2 `.react-flow__node` elements, the `users`/`posts` labels, and ≥1 `.react-flow__edge` path — proving the DBML → canvas pipeline renders nodes + a crow-foot relationship edge end-to-end. (This task is controller-run; if the dev stack is not up, start it per the project's E2E runbook first.)

- [ ] **Step 3: Commit.**

  ```bash
  cd /home/soron/projects/codegram/frontend && git add e2e/editor-erd.spec.ts && git commit -m "test(e2e): editor renders ERD table nodes + relationship edge from DBML"
  ```

---

## Ship Criteria

- [ ] The editor route is lazy-loaded; the production build emits a separate editor chunk and `@dbml/core` / CodeMirror / React Flow are NOT in the login/home entry chunk.
- [ ] `@xyflow/react@^12.11.0` + `@dagrejs/dagre@^2.0.0` are in `package.json` dependencies; `type-check` is clean.
- [ ] The PURE `schemaToFlow` adapter maps a `DbmlSchema` to `{ nodes, edges }`: one `table` node per table (node id = `DbmlTable.id`, `data.columns` handle ids = `DbmlColumn.id`, pk/fk/nn/unique flags), one `enum` node per enum (id `enum:${schema}.${name}`), one `sticky` node per note (id `note:${name}`), one `group` node per table group (id `group:${name}`, members get `parentId`, group emitted before members), one relationship edge per ref COLUMN-PAIR (composite FK → one edge per pair, self-ref supported, `type: 'relation'`, per-endpoint crow-foot markers from `relation`), and dashed `column→enum` link edges — all covered by passing unit tests with NO React Flow runtime.
- [ ] The PURE dagre `autoLayout(nodes, edges)` assigns deterministic positions, clusters table-group members, and sizes each group node to its members' bounding box — covered by passing unit tests with NO React Flow runtime.
- [ ] Custom `TableNode` (colored header + per-column rows with PK/FK/NN/UQ markers + left/right handles keyed by column id), `EnumNode`, `StickyNote`, `GroupNode` (non-interactive tinted region), and crow-foot `RelationEdge` (per-endpoint markers from `relation`) each render and pass `ReactFlowProvider`-wrapped jsdom tests asserting labels/handles/markers.
- [ ] `ErdCanvas` (fed by a `schema?: DbmlSchema` prop) runs `schemaToFlow` + `autoLayout`, registers `nodeTypes`/`edgeTypes`, imports the React Flow CSS, renders nodes for a valid schema (jsdom test) and an empty-state placeholder otherwise.
- [ ] The editor page shows a split view (editor left, canvas right, compact `ParseErrorPanel` + `SchemaSummary` sidebar); the canvas is fed `parse.schema ?? parse.lastValidSchema`, so invalid DBML keeps showing the last valid diagram alongside the error panel.
- [ ] The Plan 2/3a autosave contract is preserved byte-for-byte (`useProjectAutosave({ projectId: id, dbmlText, baseline })`, the `dbmlText`/`baseline` state, and the seed effect keyed on `project?.id` are unchanged).
- [ ] Node ids are the normalized keys (ready for Plan 4 Layout persistence/reconciliation); positions are NOT persisted in 3b (auto-layout recomputes every parse).
- [ ] Vitest is green (pure adapter + pure layout + node/edge/canvas renders + the existing suites); the Playwright editor E2E asserts ≥2 `.react-flow__node` elements + ≥1 `.react-flow__edge` path from typed DBML.
