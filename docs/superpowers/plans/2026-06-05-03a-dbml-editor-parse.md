# Codegram — Plan 3a: DBML Editor & Parse (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan 2 editor-shell `<textarea>` with a CodeMirror 6 editor bound to `dbml_text` (preserving the existing debounced autosave + baseline + project-switch re-arm intact), and parse the DBML text — entirely in the frontend with the official `@dbml/core` — into a normalized, framework-agnostic schema model on a debounce, surfacing parse errors and a read-only summary of the parsed model. Typing valid DBML produces a `DbmlSchema` (shown as counts + table names) within a debounce; invalid DBML shows parse errors without crashing the editor; the normalized model is the deliverable that Plan 3b (React Flow ERD rendering) will consume. **This plan STOPS at the normalized model + editor — there is NO React Flow, NO canvas/node/edge rendering, NO auto-layout (all of that is Plan 3b).**

**Architecture:** This plan honors ADR-0001 (DBML text is the single source of truth) and ADR-0002 (DBML is parsed in the FRONTEND with official `@dbml/core`; the backend NEVER parses DBML and stores `dbml_text` as opaque TEXT) — **there are NO backend changes in 3a; all parsing is client-side.** Frontend follows FSD (`app > pages > widgets > features > entities > shared`, downward imports only). A new `entities/dbml` slice owns the normalized, app-owned model (`model/types.ts` — plain TS types with ZERO `@dbml/core` imports) and the parse adapter (`lib/parse.ts` — the ONLY place `@dbml/core` is imported; it maps the library's ID-keyed normalized model into our name-based shape and NEVER throws, returning a discriminated `DbmlParseResult`). Per ADR-0004 (Layout reconciliation by name) the model uses stable, name-based keys (`schema.table`, `schema.table.column`) so Plan 3b/Plan 4 can key Layout off them. A new `features/dbml-editor` slice composes a controlled CodeMirror 6 wrapper (`DbmlEditor`), a debounced live-parse hook (`useDbmlParse`, reusing the shared `useDebouncedCallback` from Plan 2), and two read-only presentational panels (`ParseErrorPanel`, `SchemaSummary`). `pages/editor` composes these features + the project entity, replacing only the `<main>` body of the Plan 2 page while preserving the seed/baseline `useEffect` and the `useProjectAutosave({ projectId, dbmlText, baseline })` call EXACTLY. Import direction: `entities/dbml` imports only `shared` + `@dbml/core`; `features/dbml-editor` imports `entities/dbml` + `shared` + CodeMirror; `pages/editor` composes the features + entities. Downward only. NO `@xyflow`/React Flow anywhere in 3a.

**Tech Stack:** Frontend — React 19, Vite 8, TypeScript 6, TanStack Query v5, Zustand v5, React Router v7, shadcn v4.10 (Tailwind v4), Vitest 4 + Testing Library + `@testing-library/user-event` + jsdom, Playwright. New runtime deps added by this plan: `@dbml/core@8.2.5` (the official DBML parser, ESM build, no Vite/Vitest config needed) and CodeMirror 6 via `@uiw/react-codemirror@^4.25.0` + `@codemirror/state@^6.6.0` + `@codemirror/view@^6.28.0`. NO React Flow / `@xyflow` (that is Plan 3b). No backend changes. The editor lives at `frontend/src/pages/editor/index.tsx`; autosave is `frontend/src/features/project-autosave` (`useProjectAutosave` with `{ projectId, dbmlText, baseline }`); the shared debounce hook is `frontend/src/shared/hooks/useDebounce.ts` (`useDebouncedCallback` with `.cancel()`); the project entity (`useProject`) is in `frontend/src/entities/project`.

---

## File Structure

### Frontend — Create
- `frontend/src/entities/dbml/model/types.ts` — normalized `DbmlSchema`/`DbmlTable`/`DbmlColumn`/`DbmlRef`/`DbmlEnum`/`DbmlTableGroup`/`DbmlNote` types + `DbmlParseError` + the `DbmlParseResult` discriminated union (plain TS, zero `@dbml/core` imports).
- `frontend/src/entities/dbml/lib/parse.ts` — `parseDbml(text): DbmlParseResult`; wraps `@dbml/core`, calls `.normalize()`, maps the ID-keyed model into our name-based model, catches `CompilerError` and never throws.
- `frontend/src/entities/dbml/lib/parse.test.ts` — unit tests with REAL `@dbml/core`: valid schemas (all ref cardinalities, self-ref, composite FK, enums, table groups + color, headercolor, notes) + invalid/semantic/empty DBML (returns errors, no throw).
- `frontend/src/entities/dbml/index.ts` — public barrel: re-exports `parseDbml` + the model types.
- `frontend/src/entities/dbml/index.test.ts` — barrel guard test confirming the public surface.
- `frontend/src/features/dbml-editor/ui/DbmlEditor.tsx` — controlled CodeMirror 6 editor bound to `value`/`onChange` (string in/out, replacing the `<textarea>`).
- `frontend/src/features/dbml-editor/ui/DbmlEditor.test.tsx` — renders + seeds value; `onChange` is wired.
- `frontend/src/features/dbml-editor/ui/ParseErrorPanel.tsx` — read-only panel showing parse status / `DbmlParseError[]`.
- `frontend/src/features/dbml-editor/ui/ParseErrorPanel.test.tsx` — valid/pending/error display.
- `frontend/src/features/dbml-editor/ui/SchemaSummary.tsx` — read-only summary of the normalized model (counts + table names; NOT a diagram).
- `frontend/src/features/dbml-editor/ui/SchemaSummary.test.tsx` — placeholder + counts + table names.
- `frontend/src/features/dbml-editor/model/useDbmlParse.ts` — debounced `text -> DbmlParseResult` hook (reuses `useDebouncedCallback`); holds `{ status, schema?, errors?, lastValidSchema? }`.
- `frontend/src/features/dbml-editor/model/useDbmlParse.test.ts` — fake-timer debounce test against the REAL `parseDbml`.
- `frontend/src/features/dbml-editor/index.ts` — public barrel: re-exports the editor, panels, and hook.
- `frontend/src/features/dbml-editor/ui/__optional__` — (none beyond the above)
- `frontend/e2e/editor.spec.ts` — (OPTIONAL) Playwright smoke: CodeMirror renders + typing updates the summary/status (NO diagram asserted).

### Frontend — Modify
- `frontend/package.json` — add `@dbml/core@8.2.5` + `@uiw/react-codemirror`/`@codemirror/state`/`@codemirror/view`.
- `frontend/src/pages/editor/index.tsx` — replace the `<textarea>` with `<DbmlEditor>` + `useDbmlParse` + `<ParseErrorPanel>` + `<SchemaSummary>`; KEEP the seed/baseline `useEffect` and `useProjectAutosave({ projectId, dbmlText, baseline })` EXACTLY.
- `frontend/src/pages/editor/index.test.tsx` — update the page test off `getByRole('textbox')` (CodeMirror's contenteditable does not expose it) onto the editor wrapper + assert the preserved autosave contract.

> **No Vite/Vitest config change.** `@dbml/core` ships a clean ESM build and all CodeMirror packages are ESM-only; Vite/Vitest resolve them natively. `frontend/vite.config.ts` and `frontend/vitest.config.ts` are left untouched (the author verifies; do not add `optimizeDeps`/`ssr.noExternal` unless an actual resolution error appears).

---

## Tasks

### Task 1: Add @dbml/core dependency + import smoke test

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/package.json` (add `@dbml/core` dependency)
- Test: `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/smoke.test.ts` (import smoke test — deleted after this task)

This task installs `@dbml/core@8.2.5` (verified latest, published 2026-06-03) and proves it imports + parses inside the existing Vitest + jsdom setup. The research confirmed **no `optimizeDeps`/`ssr.noExternal` config is needed** — `@dbml/core` ships a clean ESM build (`./lib/index.mjs`) and all transitive deps (`@dbml/parse`, `antlr4`, `lodash-es`, `luxon`, `parsimmon`, `pluralize`) are browser-safe. So `vite.config.ts` / `vitest.config.ts` are left untouched. This is a dep-install + verification task; the smoke test IS the red→green signal.

> **VERIFIED API NOTE (do not deviate):** The package has **no default export** (`import Parser from '@dbml/core'` yields `undefined`). You MUST use the named import: `import { Parser, CompilerError } from '@dbml/core'`. Instantiate with `new Parser()` and call `.parse(text, 'dbmlv2')`, then `.normalize()` on the returned `Database`. On invalid DBML the parser **throws** a `CompilerError` whose `.diags` array holds `{ message, location: { start: { line, column } }, code }` (line/column are **1-indexed**).

- [ ] **Step 1: Install the dependency.** Run this exact command:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm install @dbml/core@8.2.5
  ```
  Expected output includes a line like `added N packages` and exit code 0. Verify the version landed:
  ```bash
  cd /home/soron/projects/codegram/frontend && node -e "console.log(require('@dbml/core/package.json').version)"
  ```
  Expected output: `8.2.5`

- [ ] **Step 2: Confirm package.json updated.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && node -e "console.log(require('./package.json').dependencies['@dbml/core'])"
  ```
  Expected output: a version string beginning `8.2.5` (e.g. `8.2.5` or `^8.2.5`). If npm wrote a caret range, leave it; the lockfile pins 8.2.5.

- [ ] **Step 3: Write the import smoke test (RED).** Create `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/smoke.test.ts` with this exact content:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { Parser, CompilerError } from '@dbml/core'

  describe('@dbml/core smoke test', () => {
    it('exposes a named Parser export (no default export)', () => {
      expect(typeof Parser).toBe('function')
      expect(typeof CompilerError).toBe('function')
    })

    it('parses valid DBML and normalizes it inside jsdom', () => {
      const dbml = 'Table users {\n  id integer [pk]\n}'
      const database = new Parser().parse(dbml, 'dbmlv2')
      const model = database.normalize()
      expect(Object.keys(model.tables)).toHaveLength(1)
    })

    it('throws CompilerError with diags on invalid DBML', () => {
      try {
        new Parser().parse('Table users { id int [pk', 'dbmlv2')
        throw new Error('expected parse to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(CompilerError)
        expect(Array.isArray((err as CompilerError).diags)).toBe(true)
        expect((err as CompilerError).diags[0].message.length).toBeGreaterThan(0)
      }
    })
  })
  ```

- [ ] **Step 4: Run the smoke test, see it PASS (GREEN).** The red phase here is artificial — the test cannot exist before the dep is installed in Step 1, and it verifies the install, so run it directly:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/dbml/lib/smoke.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` and `Tests  3 passed (3)`. If you instead see a module-resolution error (`Failed to resolve import "@dbml/core"`) or `Parser is not a function`, the install failed — re-run Step 1.

- [ ] **Step 5: Delete the smoke test.** It has served its purpose (the real adapter tests in Task 3 supersede it). Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && rm src/entities/dbml/lib/smoke.test.ts
  ```
  Expected: no output, exit code 0.

- [ ] **Step 6: Commit.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && git add package.json package-lock.json && git commit -m "build(dbml): add @dbml/core 8.2.5 dependency"
  ```
  Expected output: a commit summary listing `package.json` and `package-lock.json` changed.

---

### Task 2: Normalized DBML model types

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/dbml/model/types.ts` (normalized schema types + parse-result discriminated union)

This task defines the framework-agnostic, app-owned model that Plan 3b will consume. These are plain TS types with **zero** `@dbml/core` imports — that confinement is the whole point of D2/D7. This is a type-only step; a failing-test red phase is artificial for pure type declarations, so there is no test here. Task 3's tests and Task 4's adapter exercise these types and will fail to compile if a type is wrong, which is the real verification.

> **DESIGN NOTES (verified against the runtime):**
> - `relation` is derived from the two endpoints' `relation: "1" | "*"` flags. We capture the ordered cardinality `"1-1" | "1-n" | "n-1" | "n-n"` keyed to `[fromEndpoint, toEndpoint]` so 3b can draw crow-foot symbols. `from` = endpoint index 0, `to` = endpoint index 1 as emitted by `@dbml/core`.
> - `DbmlColumn.default` is typed `string` because the runtime exposes defaults as `dbdefault: { value, type }`; the adapter (Task 4) surfaces `String(dbdefault.value)`. Keep it simple — no union of value types.
> - Stable name-based keys (`id`) follow ADR-0004: `schema.table` for tables, `schema.table.column` for columns, and a deterministic ref id. These let Plan 4 reconcile Layout by name.
> - `DbmlParseError.line` / `.column` are **1-indexed** (verified) and optional because not every diagnostic carries a usable location.

- [ ] **Step 1: Create the types file.** Create `/home/soron/projects/codegram/frontend/src/entities/dbml/model/types.ts` with this exact content:
  ```typescript
  /**
   * Normalized, framework-agnostic DBML schema model.
   * entities layer: plain TS types only, imports nothing upward and nothing
   * from @dbml/core (those internal types are confined to lib/parse.ts).
   *
   * Plan 3b (React Flow) and Plan 4 (Layout) consume THIS shape. Keys are
   * stable and name-based per ADR-0004 so Layout reconciles by name, not by id.
   */

  /** A column within a table. */
  export interface DbmlColumn {
    /** Stable key: `${schema}.${table}.${name}`. */
    id: string
    name: string
    /** The DBML type name, e.g. "integer", "varchar", or an enum name. */
    type: string
    /** Primary key. */
    pk: boolean
    /** NOT NULL constraint. */
    notNull: boolean
    /** UNIQUE constraint. */
    unique: boolean
    /** Auto-increment / serial. */
    increment: boolean
    /** Default value rendered as a string, when present. */
    default?: string
    /** Column-level note/comment, when present. */
    note?: string
    /** True when the column participates in any relationship endpoint. */
    isFk: boolean
  }

  /** A table (entity) with its columns. */
  export interface DbmlTable {
    /** Stable key: `${schema}.${name}`. */
    id: string
    name: string
    /** Owning schema name (always set; defaults to "public"). */
    schema: string
    /** Table-level note/comment, when present. */
    note?: string
    /** Header color (hex, e.g. "#3498db"), when set via [headercolor: ...]. */
    headerColor?: string
    columns: DbmlColumn[]
  }

  /**
   * Ordered crow-foot cardinality between the two endpoints of a relationship.
   * Read as `${from}-${to}` where "1" = one side, "n" = many side.
   */
  export type DbmlRelation = '1-1' | '1-n' | 'n-1' | 'n-n'

  /** A relationship (foreign-key reference) between two tables. */
  export interface DbmlRef {
    /** Stable key derived from both endpoints. */
    id: string
    /** Relationship name, when explicitly given. */
    name?: string
    /** Source table name (endpoint index 0). */
    fromTable: string
    /** Source schema name (endpoint index 0). */
    fromSchema: string
    /** Source column names (length > 1 for composite FKs), order preserved. */
    fromColumns: string[]
    /** Target table name (endpoint index 1). */
    toTable: string
    /** Target schema name (endpoint index 1). */
    toSchema: string
    /** Target column names (length > 1 for composite FKs), order preserved. */
    toColumns: string[]
    /** Ordered cardinality `${from}-${to}`. */
    relation: DbmlRelation
  }

  /** A single value within an enum. */
  export interface DbmlEnumValue {
    name: string
    note?: string
  }

  /** An enum type. */
  export interface DbmlEnum {
    name: string
    schema: string
    values: DbmlEnumValue[]
    note?: string
  }

  /** A table group (logical cluster, colored region in 3b). */
  export interface DbmlTableGroup {
    name: string
    /** Group color (hex), when set via [color: ...]. */
    color?: string
    /** Member table names. */
    tables: string[]
    note?: string
  }

  /** A standalone sticky note. */
  export interface DbmlNote {
    name: string
    content: string
    /** Note header color, when set. */
    headerColor?: string
  }

  /** The fully normalized schema produced by a successful parse. */
  export interface DbmlSchema {
    tables: DbmlTable[]
    refs: DbmlRef[]
    enums: DbmlEnum[]
    tableGroups: DbmlTableGroup[]
    notes: DbmlNote[]
  }

  /** A single parse diagnostic. line/column are 1-indexed when present. */
  export interface DbmlParseError {
    message: string
    line?: number
    column?: number
  }

  /**
   * Discriminated result of parseDbml. The adapter NEVER throws; on invalid
   * DBML it returns { ok: false, errors }.
   */
  export type DbmlParseResult =
    | { ok: true; schema: DbmlSchema }
    | { ok: false; errors: DbmlParseError[] }
  ```

- [ ] **Step 2: Type-check the new file (GREEN).** Confirm it compiles cleanly:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run type-check
  ```
  Expected output: no errors (the command exits 0 and prints nothing). If `tsc` reports `'X' is declared but its value is never read`, that is fine for exported types — `noUnusedLocals` does not flag exported declarations.

- [ ] **Step 3: Commit.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/entities/dbml/model/types.ts && git commit -m "feat(dbml): add normalized schema model types"
  ```
  Expected output: a commit summary listing `src/entities/dbml/model/types.ts` added.

---

### Task 3: Comprehensive failing tests for parseDbml (real @dbml/core, RED)

**Files:**
- Test: `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/parse.test.ts` (unit tests with REAL @dbml/core — not mocked)

This task writes the comprehensive `parseDbml` test suite FIRST and runs it to FAIL (the adapter does not exist yet) — the genuine RED phase. Task 4 then implements the adapter to GREEN. The suite proves the adapter against representative DBML covering all six feature kinds plus error safety. Per D7 the parser is NOT mocked. Note the **verified DBML syntax gotcha**: each column, enum value, and table-group member MUST be on its own line — packing them on one line is a parse error. The fixtures below use correct multi-line DBML and were validated against `@dbml/core@8.2.5`.

> **VERIFIED EXPECTATIONS encoded below:**
> - `Ref: posts.user_id > users.id` → endpoint[0]=posts has `relation "*"`, endpoint[1]=users has `"1"` → our `relation` = `"n-1"`.
> - `Ref: a.x - b.y` (one-to-one) → both endpoints `"1"` → `"1-1"`.
> - `Ref: a.(x,y) <> b.(x,y)` (many-to-many composite) → both `"*"`, `fromColumns`/`toColumns` length 2 → `"n-n"`.
> - Self-ref: both endpoints share the same `tableName`.
> - Table `[headercolor: #3498db]` → `headerColor` = `"#3498db"` on our table (the in-table `headerColor:` line form is INVALID; only the bracket setting works).
> - `TableGroup g [color: #ff0000] { ... }` → group `color` = `"#ff0000"`.
> - Standalone `Note n { '...' }` → one entry in `schema.notes`.
> - Invalid DBML (`Table users { id int [pk`) → `{ ok: false }` with at least one error carrying a message; never throws.

- [ ] **Step 1: Write the test file (RED).** Create `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/parse.test.ts` with this exact content:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { parseDbml } from '@/entities/dbml/lib/parse'
  import type { DbmlSchema } from '@/entities/dbml/model/types'

  /** Parse and assert success, returning the schema for further assertions. */
  function parseOk(text: string): DbmlSchema {
    const result = parseDbml(text)
    if (!result.ok) {
      throw new Error(
        `expected ok, got errors: ${result.errors.map((e) => e.message).join('; ')}`,
      )
    }
    return result.schema
  }

  describe('parseDbml — tables & columns', () => {
    it('maps a table with columns, constraints, note, and header color', () => {
      const schema = parseOk(`
        Table users [headercolor: #3498db] {
          id integer [pk, increment]
          email varchar [not null, unique, note: 'user email']
          status varchar [default: 'active']
          note: 'application users'
        }
      `)
      expect(schema.tables).toHaveLength(1)
      const users = schema.tables[0]
      expect(users.name).toBe('users')
      expect(users.schema).toBe('public')
      expect(users.id).toBe('public.users')
      expect(users.note).toBe('application users')
      expect(users.headerColor).toBe('#3498db')

      const byName = Object.fromEntries(users.columns.map((c) => [c.name, c]))
      expect(byName.id.pk).toBe(true)
      expect(byName.id.increment).toBe(true)
      expect(byName.id.type).toBe('integer')
      expect(byName.email.notNull).toBe(true)
      expect(byName.email.unique).toBe(true)
      expect(byName.email.note).toBe('user email')
      expect(byName.status.default).toBe('active')
      expect(byName.id.id).toBe('public.users.id')
    })

    it('resolves non-default schema names', () => {
      const schema = parseOk(`
        Table audit.logs {
          id integer [pk]
        }
      `)
      const logs = schema.tables[0]
      expect(logs.schema).toBe('audit')
      expect(logs.id).toBe('audit.logs')
    })
  })

  describe('parseDbml — refs & cardinality', () => {
    it('maps many-to-one (>) as n-1 and flags the FK column', () => {
      const schema = parseOk(`
        Table users {
          id integer [pk]
        }
        Table posts {
          id integer [pk]
          user_id integer
        }
        Ref: posts.user_id > users.id
      `)
      expect(schema.refs).toHaveLength(1)
      const ref = schema.refs[0]
      expect(ref.fromTable).toBe('posts')
      expect(ref.fromColumns).toEqual(['user_id'])
      expect(ref.toTable).toBe('users')
      expect(ref.toColumns).toEqual(['id'])
      expect(ref.relation).toBe('n-1')

      const posts = schema.tables.find((t) => t.name === 'posts')!
      const userId = posts.columns.find((c) => c.name === 'user_id')!
      expect(userId.isFk).toBe(true)
    })

    it('maps one-to-one (-) as 1-1', () => {
      const schema = parseOk(`
        Table a {
          id integer [pk]
        }
        Table b {
          id integer [pk]
        }
        Ref: a.id - b.id
      `)
      expect(schema.refs[0].relation).toBe('1-1')
    })

    it('maps many-to-many composite (<>) as n-n with multi-column endpoints', () => {
      const schema = parseOk(`
        Table order_items {
          order_id integer
          product_id integer
        }
        Table inventory {
          order_id integer
          product_id integer
        }
        Ref: order_items.(order_id, product_id) <> inventory.(order_id, product_id)
      `)
      const ref = schema.refs[0]
      expect(ref.relation).toBe('n-n')
      expect(ref.fromColumns).toEqual(['order_id', 'product_id'])
      expect(ref.toColumns).toEqual(['order_id', 'product_id'])
    })

    it('maps a self-reference (same table on both endpoints)', () => {
      const schema = parseOk(`
        Table categories {
          id integer [pk]
          parent_id integer
        }
        Ref: categories.parent_id > categories.id
      `)
      const ref = schema.refs[0]
      expect(ref.fromTable).toBe('categories')
      expect(ref.toTable).toBe('categories')
      expect(ref.relation).toBe('n-1')
    })
  })

  describe('parseDbml — enums', () => {
    it('maps an enum with values and value notes', () => {
      const schema = parseOk(`
        Table users {
          id integer [pk]
          role user_role
        }
        Enum user_role {
          admin
          member [note: 'default role']
        }
      `)
      expect(schema.enums).toHaveLength(1)
      const e = schema.enums[0]
      expect(e.name).toBe('user_role')
      expect(e.values.map((v) => v.name)).toEqual(['admin', 'member'])
      expect(e.values[1].note).toBe('default role')

      const role = schema.tables[0].columns.find((c) => c.name === 'role')!
      expect(role.type).toBe('user_role')
    })
  })

  describe('parseDbml — table groups', () => {
    it('maps a table group with color and member table names', () => {
      const schema = parseOk(`
        Table users {
          id integer [pk]
        }
        Table posts {
          id integer [pk]
        }
        TableGroup core [color: #ff0000] {
          users
          posts
        }
      `)
      expect(schema.tableGroups).toHaveLength(1)
      const group = schema.tableGroups[0]
      expect(group.name).toBe('core')
      expect(group.color).toBe('#ff0000')
      expect(group.tables.sort()).toEqual(['posts', 'users'])
    })
  })

  describe('parseDbml — standalone notes', () => {
    it('maps a standalone sticky note', () => {
      const schema = parseOk(`
        Table users {
          id integer [pk]
        }
        Note single_note {
          'a standalone sticky note'
        }
      `)
      expect(schema.notes).toHaveLength(1)
      expect(schema.notes[0].name).toBe('single_note')
      expect(schema.notes[0].content).toBe('a standalone sticky note')
    })
  })

  describe('parseDbml — error safety', () => {
    it('returns errors (no throw) on syntactically invalid DBML', () => {
      const result = parseDbml('Table users { id int [pk')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors[0].message.length).toBeGreaterThan(0)
      }
    })

    it('carries a 1-indexed line/column when the diagnostic has a location', () => {
      const result = parseDbml('Table users { id int [pk')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        const withLoc = result.errors.find((e) => e.line !== undefined)
        expect(withLoc).toBeDefined()
        expect(withLoc!.line).toBeGreaterThanOrEqual(1)
      }
    })

    it('returns errors (no throw) on a semantic error (unknown column)', () => {
      const result = parseDbml(`
        Table users {
          id integer [pk]
        }
        Table posts {
          id integer [pk]
        }
        Ref: posts.missing_col > users.id
      `)
      expect(result.ok).toBe(false)
    })

    it('treats empty input as a valid empty schema', () => {
      const result = parseDbml('')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.schema.tables).toHaveLength(0)
        expect(result.schema.refs).toHaveLength(0)
      }
    })
  })
  ```

- [ ] **Step 2: Run the tests, see them FAIL (RED).** The adapter does not exist yet, so the suite cannot resolve its import. Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/dbml/lib/parse.test.ts
  ```
  Expected output: collection fails with `Failed to resolve import "@/entities/dbml/lib/parse"` / `Cannot find module` — because `parse.ts` does not exist yet. Exit code non-zero. This is the genuine RED phase: the adapter is implemented in Task 4 to turn it GREEN.

- [ ] **Step 3: Commit the failing tests.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/entities/dbml/lib/parse.test.ts && git commit -m "test(dbml): cover parseDbml with real @dbml/core fixtures (RED)"
  ```
  Expected output: a commit summary listing `src/entities/dbml/lib/parse.test.ts` added.

---

### Task 4: Implement the parseDbml adapter (@dbml/core → normalized model, error-safe, GREEN)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/parse.ts` (the adapter)

This is the core deliverable: a pure function `parseDbml(text): DbmlParseResult` that wraps `@dbml/core`, calls `.normalize()`, maps the ID-keyed normalized model into our name-based model, and **catches** `CompilerError` to return `{ ok: false, errors }` — never throwing out. Its verification is the comprehensive test suite written in Task 3, which is currently RED; implementing this adapter turns it GREEN. The mapping logic below was verified against the live `@dbml/core@8.2.5` runtime; do not change the property paths.

> **VERIFIED RUNTIME FACTS the mapping relies on (do NOT deviate):**
> - `database.normalize()` returns ID-keyed maps: `tables`, `fields`, `refs`, `endpoints`, `enums`, `enumValues`, `tableGroups`, `notes`, `schemas`.
> - `NormalizedTable`: `{ id, name, note: string|null, headerColor: string|null, schemaId, fieldIds: number[] }`. Table `name` is **unqualified**; the schema name lives at `model.schemas[schemaId].name` (default schema is `"public"`).
> - `NormalizedField`: `{ id, name, type: { type_name: string }, pk: boolean, not_null?: boolean (absent when false), unique: boolean, increment?: boolean, note: string|null, dbdefault?: { value, type }, endpointIds?: number[], tableId }`. A field is an FK participant iff `endpointIds` is non-empty.
> - `NormalizedRef`: `{ id, name: string|null, endpointIds: [number, number], schemaId }`.
> - `NormalizedEndpoint`: `{ id, schemaName: string|null, tableName: string, fieldNames: string[], relation: "1"|"*", refId }`.
> - `NormalizedEnum`: `{ id, name, note: string|null, valueIds: number[], schemaId }`; `NormalizedEnumValue`: `{ id, name, note: string|null }`.
> - `NormalizedTableGroup`: `{ id, name, note: string|null, color: string, tableIds: number[] }`.
> - `NormalizedNote`: `{ id, name, content: string, headerColor: string|null }`.
> - On error, `err instanceof CompilerError` is `true` and `err.diags` is `{ message, location: { start: { line, column } }, code }[]` (1-indexed line/column).
> - Empty string parses successfully to 0 tables (no throw).

- [ ] **Step 1: Implement the adapter (GREEN).** The Task 3 suite (`parse.test.ts`) is currently failing because this file does not exist; implement it to turn the suite GREEN. Create `/home/soron/projects/codegram/frontend/src/entities/dbml/lib/parse.ts` with this exact content:
  ```typescript
  import { Parser, CompilerError } from '@dbml/core'
  import type {
    DbmlColumn,
    DbmlEnum,
    DbmlNote,
    DbmlParseError,
    DbmlParseResult,
    DbmlRef,
    DbmlRelation,
    DbmlSchema,
    DbmlTable,
    DbmlTableGroup,
  } from '@/entities/dbml/model/types'

  /**
   * @dbml/core normalize() returns ID-keyed maps; we treat each as a record of
   * unknown-shaped nodes and read only the verified property paths. We keep the
   * structural typing loose here (the one place @dbml/core's shape leaks) so the
   * rest of the app sees only our normalized model.
   */
  type IdMap = Record<string, Record<string, unknown>>

  interface NormalizedModel {
    schemas: IdMap
    tables: IdMap
    fields: IdMap
    refs: IdMap
    endpoints: IdMap
    enums: IdMap
    enumValues: IdMap
    tableGroups: IdMap
    notes: IdMap
  }

  /** Coerce a possibly-null/undefined string into an optional non-empty string. */
  function optStr(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  /** Map an endpoint's "1" | "*" relation flag to our "1" | "n" token. */
  function side(relation: unknown): '1' | 'n' {
    return relation === '*' ? 'n' : '1'
  }

  /** Resolve a schema name from a schemaId, defaulting to "public". */
  function schemaName(model: NormalizedModel, schemaId: unknown): string {
    const schema = model.schemas[String(schemaId)]
    const name = schema ? schema.name : undefined
    return typeof name === 'string' && name.length > 0 ? name : 'public'
  }

  function mapColumn(
    field: Record<string, unknown>,
    schema: string,
    tableName: string,
  ): DbmlColumn {
    const name = String(field.name)
    const type = field.type as { type_name?: unknown } | undefined
    const dbdefault = field.dbdefault as { value?: unknown } | undefined
    const endpointIds = field.endpointIds
    return {
      id: `${schema}.${tableName}.${name}`,
      name,
      type:
        type && typeof type.type_name === 'string' ? type.type_name : 'unknown',
      pk: field.pk === true,
      notNull: field.not_null === true,
      unique: field.unique === true,
      increment: field.increment === true,
      default:
        dbdefault && dbdefault.value !== undefined && dbdefault.value !== null
          ? String(dbdefault.value)
          : undefined,
      note: optStr(field.note),
      isFk: Array.isArray(endpointIds) && endpointIds.length > 0,
    }
  }

  function mapTable(
    model: NormalizedModel,
    table: Record<string, unknown>,
  ): DbmlTable {
    const name = String(table.name)
    const schema = schemaName(model, table.schemaId)
    const fieldIds = Array.isArray(table.fieldIds) ? table.fieldIds : []
    return {
      id: `${schema}.${name}`,
      name,
      schema,
      note: optStr(table.note),
      headerColor: optStr(table.headerColor),
      columns: fieldIds.map((fid) =>
        mapColumn(model.fields[String(fid)], schema, name),
      ),
    }
  }

  function mapRef(
    model: NormalizedModel,
    ref: Record<string, unknown>,
  ): DbmlRef {
    const endpointIds = Array.isArray(ref.endpointIds) ? ref.endpointIds : []
    const from = model.endpoints[String(endpointIds[0])] ?? {}
    const to = model.endpoints[String(endpointIds[1])] ?? {}
    const fromTable = String(from.tableName)
    const toTable = String(to.tableName)
    const fromSchema = optStr(from.schemaName) ?? 'public'
    const toSchema = optStr(to.schemaName) ?? 'public'
    const fromColumns = Array.isArray(from.fieldNames)
      ? from.fieldNames.map(String)
      : []
    const toColumns = Array.isArray(to.fieldNames)
      ? to.fieldNames.map(String)
      : []
    const relation = `${side(from.relation)}-${side(to.relation)}` as DbmlRelation
    return {
      id: `${fromSchema}.${fromTable}.(${fromColumns.join(',')})>${toSchema}.${toTable}.(${toColumns.join(',')})`,
      name: optStr(ref.name),
      fromTable,
      fromSchema,
      fromColumns,
      toTable,
      toSchema,
      toColumns,
      relation,
    }
  }

  function mapEnum(
    model: NormalizedModel,
    enumDef: Record<string, unknown>,
  ): DbmlEnum {
    const valueIds = Array.isArray(enumDef.valueIds) ? enumDef.valueIds : []
    return {
      name: String(enumDef.name),
      schema: schemaName(model, enumDef.schemaId),
      note: optStr(enumDef.note),
      values: valueIds.map((vid) => {
        const value = model.enumValues[String(vid)] ?? {}
        return { name: String(value.name), note: optStr(value.note) }
      }),
    }
  }

  function mapTableGroup(
    model: NormalizedModel,
    group: Record<string, unknown>,
  ): DbmlTableGroup {
    const tableIds = Array.isArray(group.tableIds) ? group.tableIds : []
    return {
      name: String(group.name),
      color: optStr(group.color),
      note: optStr(group.note),
      tables: tableIds.map((tid) => {
        const table = model.tables[String(tid)] ?? {}
        return String(table.name)
      }),
    }
  }

  function mapNote(note: Record<string, unknown>): DbmlNote {
    return {
      name: String(note.name),
      content: typeof note.content === 'string' ? note.content : '',
      headerColor: optStr(note.headerColor),
    }
  }

  function toSchema(model: NormalizedModel): DbmlSchema {
    return {
      tables: Object.values(model.tables).map((t) => mapTable(model, t)),
      refs: Object.values(model.refs).map((r) => mapRef(model, r)),
      enums: Object.values(model.enums).map((e) => mapEnum(model, e)),
      tableGroups: Object.values(model.tableGroups).map((g) =>
        mapTableGroup(model, g),
      ),
      notes: Object.values(model.notes).map((n) => mapNote(n)),
    }
  }

  /** Convert a CompilerError's diags into our parse-error shape. */
  function toErrors(err: CompilerError): DbmlParseError[] {
    const diags = Array.isArray(err.diags) ? err.diags : []
    if (diags.length === 0) {
      // CompilerError has no `message` property and does not extend Error;
      // its diagnostics live on `.diags`. With no diags, fall back to a literal.
      return [{ message: 'Failed to parse DBML' }]
    }
    return diags.map((diag) => {
      const start = diag.location?.start
      return {
        message: diag.message,
        line: typeof start?.line === 'number' ? start.line : undefined,
        column: typeof start?.column === 'number' ? start.column : undefined,
      }
    })
  }

  /**
   * Parse DBML text into our normalized model. Pure and error-safe: it NEVER
   * throws — on invalid DBML it returns { ok: false, errors }. entities layer:
   * the ONLY place @dbml/core is imported; everything else sees DbmlSchema.
   */
  export function parseDbml(text: string): DbmlParseResult {
    try {
      const database = new Parser().parse(text, 'dbmlv2')
      const model = database.normalize() as unknown as NormalizedModel
      return { ok: true, schema: toSchema(model) }
    } catch (err) {
      if (err instanceof CompilerError) {
        return { ok: false, errors: toErrors(err) }
      }
      return {
        ok: false,
        errors: [
          {
            message:
              err instanceof Error ? err.message : 'Failed to parse DBML',
          },
        ],
      }
    }
  }
  ```

- [ ] **Step 2: Run the Task 3 suite, see it PASS (GREEN).** The comprehensive tests from Task 3 now have an adapter to run against. Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/dbml/lib/parse.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` and `Tests  13 passed (13)`. If any test fails, the failure message names the exact assertion — fix the adapter mapping in `parse.ts` (NOT the test fixtures, which are verified-correct DBML), then re-run. Do not weaken assertions to make them pass.

- [ ] **Step 3: Type-check.** Confirm the adapter compiles under strict mode:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run type-check
  ```
  Expected output: no errors, exit 0. `CompilerError` exposes `.diags` (typed) but NO `.message` and does NOT extend `Error` — the adapter above is written to never read `err.message` on a `CompilerError`, so it type-checks under `strict`. If `tsc` complains that `CompilerError` has no `diags` member, the `@dbml/core` type defs are looser than the runtime — narrow with `(err as CompilerError & { diags?: ... })`. Do NOT change the runtime logic, and do NOT reintroduce `err.message` on the `CompilerError` branch.

- [ ] **Step 4: Commit.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/entities/dbml/lib/parse.ts && git commit -m "feat(dbml): add parseDbml adapter over @dbml/core (GREEN)"
  ```
  Expected output: a commit summary listing `src/entities/dbml/lib/parse.ts` added.

---

### Task 5: entities/dbml barrel (public re-exports)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/entities/dbml/index.ts` (public API of the entity)
- Test: `/home/soron/projects/codegram/frontend/src/entities/dbml/index.test.ts` (barrel guard test)

This task exposes the entity's public surface so `features/dbml-editor` and `pages/editor` import from `@/entities/dbml` (not deep paths), honoring FSD. The barrel itself is a re-export-only artifact; its verification is a guard test confirming the barrel exposes `parseDbml` (and, by type-check, the model types) plus a whole-project type-check.

- [ ] **Step 1: Create the barrel.** Create `/home/soron/projects/codegram/frontend/src/entities/dbml/index.ts` with this exact content:
  ```typescript
  export { parseDbml } from './lib/parse'
  export type {
    DbmlColumn,
    DbmlEnum,
    DbmlEnumValue,
    DbmlNote,
    DbmlParseError,
    DbmlParseResult,
    DbmlRef,
    DbmlRelation,
    DbmlSchema,
    DbmlTable,
    DbmlTableGroup,
  } from './model/types'
  ```

- [ ] **Step 2: Write a barrel guard test (RED then GREEN).** Create `/home/soron/projects/codegram/frontend/src/entities/dbml/index.test.ts` with this exact content:
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { parseDbml } from '@/entities/dbml'

  describe('entities/dbml barrel', () => {
    it('re-exports parseDbml as the public entry point', () => {
      expect(typeof parseDbml).toBe('function')
      const result = parseDbml('Table users {\n  id integer [pk]\n}')
      expect(result.ok).toBe(true)
    })
  })
  ```
  This test cannot pass before the barrel exists, giving a genuine red→green. Run it:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/entities/dbml/index.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` and `Tests  1 passed (1)`. (Before Step 1, the same command would fail with `Failed to resolve import "@/entities/dbml"`.)

- [ ] **Step 3: Type-check the whole project.** Confirm nothing downstream broke and the barrel resolves:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run type-check
  ```
  Expected output: no errors, exit 0.

- [ ] **Step 4: Run the full Vitest suite once** to confirm the new entity coexists with the Plan 0/1/2 tests:
  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run
  ```
  Expected output: all test files pass, including `src/entities/dbml/lib/parse.test.ts` (13) and `src/entities/dbml/index.test.ts` (1). No failures.

- [ ] **Step 5: Commit.** Run:
  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/entities/dbml/index.ts src/entities/dbml/index.test.ts && git commit -m "feat(dbml): expose entities/dbml public barrel"
  ```
  Expected output: a commit summary listing `src/entities/dbml/index.ts` and `src/entities/dbml/index.test.ts` added.

---

### Task 6: Add CodeMirror 6 dependencies

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/package.json`

This is a dependency-install task; a red (failing-test) phase is artificial, so there is no test here. Verification is that the packages install cleanly, resolve under Vite/Vitest's ESM resolution (no extra config — the research confirmed `@codemirror/*` and `@uiw/react-codemirror` are ESM-only and Vite resolves them natively), and the existing test suite still passes.

- [ ] **Step 1: Install the CodeMirror wrapper and its peer packages.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm install @uiw/react-codemirror@^4.25.0 @codemirror/state@^6.6.0 @codemirror/view@^6.28.0
  ```

  Expected output: npm prints `added N packages` (where N includes `@uiw/react-codemirror`, `@codemirror/state`, `@codemirror/view`, and their transitive `@codemirror/*` deps) with no `ERESOLVE` peer-dependency errors. `@uiw/react-codemirror` pulls `codemirror` and the `@codemirror/commands`, `@codemirror/language`, `@codemirror/search` bundle transitively; `@codemirror/state` and `@codemirror/view` are pinned explicitly so the editor component can import them directly if needed.

- [ ] **Step 2: Verify the dependency block records the new packages.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && node -e "const p=require('./package.json'); const need=['@uiw/react-codemirror','@codemirror/state','@codemirror/view']; const miss=need.filter(k=>!p.dependencies[k]); if(miss.length){console.error('MISSING',miss); process.exit(1)} console.log('deps ok', need.map(k=>k+'@'+p.dependencies[k]).join(' '))"
  ```

  Expected output: a single line, e.g. `deps ok @uiw/react-codemirror@^4.25.0 @codemirror/state@^6.6.0 @codemirror/view@^6.28.0`, and exit code 0. (Exact patch carets may differ; the assertion only requires the three keys to be present.)

  The `dependencies` block of `package.json` after this task (note `@dbml/core` was added by Task 1 and is shown here for context — do NOT remove it):

  ```json
  {
    "name": "codegram-frontend",
    "private": true,
    "version": "0.1.0",
    "type": "module",
    "scripts": {
      "dev": "vite",
      "build": "tsc -b && vite build",
      "preview": "vite preview",
      "test": "vitest",
      "test:run": "vitest --run",
      "type-check": "tsc --noEmit",
      "e2e": "playwright test"
    },
    "dependencies": {
      "@codemirror/state": "^6.6.0",
      "@codemirror/view": "^6.28.0",
      "@dbml/core": "8.2.5",
      "@fontsource-variable/inter": "^5.2.8",
      "@tailwindcss/vite": "^4.3.0",
      "@tanstack/react-query": "5.101.0",
      "@uiw/react-codemirror": "^4.25.0",
      "class-variance-authority": "^0.7.1",
      "clsx": "^2.1.1",
      "lucide-react": "^1.17.0",
      "radix-ui": "^1.4.3",
      "react": "19.2.7",
      "react-dom": "19.2.7",
      "react-router": "7.17.0",
      "shadcn": "^4.10.0",
      "tailwind-merge": "^3.6.0",
      "tailwindcss": "^4.3.0",
      "tslib": "^2.8.1",
      "tw-animate-css": "^1.4.0",
      "zustand": "5.0.14"
    },
    "devDependencies": {
      "@playwright/test": "1.60.0",
      "@testing-library/dom": "^10.4.1",
      "@testing-library/jest-dom": "6.9.1",
      "@testing-library/react": "16.3.2",
      "@testing-library/user-event": "^14.6.1",
      "@types/node": "^22.12.0",
      "@types/react": "19.2.0",
      "@types/react-dom": "19.2.0",
      "@vitejs/plugin-react": "6.0.2",
      "jsdom": "29.1.1",
      "typescript": "6.0.3",
      "vite": "8.0.16",
      "vitest": "4.1.8"
    }
  }
  ```

  > **Do NOT hand-edit** the exact version strings if `npm install` wrote different patch versions — `npm install` is the source of truth. The JSON above is the expected shape; the only hard requirement is that the three CodeMirror keys (and the pre-existing `@dbml/core`) are present.

- [ ] **Step 3: Confirm the existing suite still passes after the install.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run
  ```

  Expected output: Vitest runs all existing test files (Plan 0/1/2 + the parse adapter + barrel tests from Tasks 3–5) and ends with `Test Files  N passed (N)` / `Tests  M passed (M)`, exit code 0. The editor page test (`src/pages/editor/index.test.tsx`) is still green at this point because the page still renders the `<textarea>` — it is replaced in Task 12.

- [ ] **Step 4: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add package.json package-lock.json && git commit -m "build(frontend): add CodeMirror 6 deps for DBML editor"
  ```

---

### Task 7: DbmlEditor — controlled CodeMirror 6 component

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/DbmlEditor.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/DbmlEditor.test.tsx`

`DbmlEditor` is a thin controlled wrapper over `@uiw/react-codemirror`: it takes `value` + `onChange` (string in/out, mirroring the `<textarea>` contract it replaces) so the existing seed/baseline/autosave wiring in the page is untouched. `@uiw/react-codemirror` already applies external `value` changes via a minimal transaction (not a full state swap), so an external re-seed does not jump the cursor — we rely on that documented behaviour rather than reimplementing it.

> **jsdom limit (per research):** CodeMirror's contenteditable surface does not behave like a real DOM in jsdom — it does not expose an ARIA `textbox` role usefully, and key/IME/selection/synthetic-`input` events do not drive edits (CodeMirror's DOM observer needs a real layout jsdom lacks). So the component test asserts only: (1) it renders (non-empty DOM) and seeds the document text into the DOM, and (2) `onChange` is invoked when a real doc-change transaction runs — exercised deterministically via `ReactCodeMirrorRef.view.dispatch(...)`, the EditorView transaction API. Real typing-through-the-editor is covered by the optional Playwright smoke (Task 13). We add a `data-testid="dbml-editor"` wrapper so both the unit test and Playwright can locate it, and forward a `ref` to the underlying `@uiw/react-codemirror` so the test can drive a transaction.

- [ ] **Step 1: Write the failing test.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/DbmlEditor.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
  import { DbmlEditor } from './DbmlEditor'

  describe('DbmlEditor', () => {
    it('renders a non-empty editor seeded with the value', () => {
      render(<DbmlEditor value="Table users { id int }" onChange={() => {}} />)

      const wrapper = screen.getByTestId('dbml-editor')
      expect(wrapper).not.toBeEmptyDOMElement()
      // CodeMirror renders the document text into the contenteditable lines.
      expect(wrapper.textContent).toContain('Table users')
    })

    it('calls onChange when the document content changes', () => {
      const onChange = vi.fn()
      let cmRef: ReactCodeMirrorRef | null = null
      render(
        <DbmlEditor
          value=""
          onChange={onChange}
          ref={(r) => {
            cmRef = r
          }}
        />,
      )

      // Drive a real CodeMirror edit through the EditorView's transaction API.
      // This is the deterministic path that fires onChange under jsdom (a
      // synthetic 'input' event on .cm-content does NOT — CodeMirror's DOM
      // observer needs a real layout that jsdom does not provide).
      cmRef!.view!.dispatch({ changes: { from: 0, insert: 'Table x' } })

      expect(onChange).toHaveBeenCalled()
      expect(onChange.mock.calls.at(-1)?.[0]).toContain('Table x')
    })
  })
  ```

  > **Why `view.dispatch`, not a synthetic input event:** the `onChange`-wiring test drives the edit through `ReactCodeMirrorRef.view.dispatch(...)`, the deterministic transaction API. A synthetic `new InputEvent('input', …)` on `.cm-content` does NOT fire `onChange` under jsdom — CodeMirror 6's DOM/mutation observer needs a real layout that jsdom does not provide (verified: `onChange` is called 0 times that way). `view.dispatch` produces a genuine doc-change transaction that flows through the component's `onChange`, so this stays a real behavioural test, not a mock. Forwarding the `ref` to `@uiw/react-codemirror` (which exposes `ReactCodeMirrorRef`) is the only addition this requires to `DbmlEditor` (Step 3 handles it). Real typing-through-the-UI is covered by the optional Playwright smoke (Task 13).

- [ ] **Step 2: Run the test and see it FAIL.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/DbmlEditor.test.tsx
  ```

  Expected output: the run fails to even collect the suite, printing an error like `Failed to resolve import "./DbmlEditor"` / `Error: Cannot find module './DbmlEditor'` — because `DbmlEditor.tsx` does not exist yet. Exit code non-zero.

- [ ] **Step 3: Implement `DbmlEditor.tsx`.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/DbmlEditor.tsx`:

  ```tsx
  import { forwardRef, useCallback } from 'react'
  import CodeMirror, {
    type ReactCodeMirrorRef,
  } from '@uiw/react-codemirror'

  export interface DbmlEditorProps {
    /** Editor document text (the project's dbml_text). Controlled value. */
    value: string
    /** Called with the full document text on every edit. */
    onChange: (text: string) => void
    /** CSS height of the editor surface. */
    height?: string
  }

  /**
   * Controlled CodeMirror 6 editor bound to a string value/onChange — a drop-in
   * replacement for the Plan 2 <textarea>. @uiw/react-codemirror applies an
   * external `value` change via a minimal doc transaction, so re-seeding on a
   * project switch does not jump the cursor. Plain text only: DBML syntax
   * highlighting is out of scope for Plan 3a (no Lezer/StreamLanguage). The ref
   * is forwarded to the underlying CodeMirror (ReactCodeMirrorRef) so callers/
   * tests can reach the EditorView (e.g. view.dispatch).
   * features layer: depends on shared + CodeMirror (FSD downward imports).
   */
  export const DbmlEditor = forwardRef<ReactCodeMirrorRef, DbmlEditorProps>(
    function DbmlEditor({ value, onChange, height = '70vh' }, ref) {
      const handleChange = useCallback(
        (val: string) => onChange(val),
        [onChange],
      )

      return (
        <div data-testid="dbml-editor" className="rounded border">
          <CodeMirror
            ref={ref}
            value={value}
            onChange={handleChange}
            height={height}
            width="100%"
            theme="light"
            extensions={[]}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: false,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: false,
              closeBrackets: false,
              autocompletion: false,
              rectangularSelection: true,
              highlightSelectionMatches: false,
              searchKeymap: false,
            }}
          />
        </div>
      )
    },
  )
  ```

- [ ] **Step 4: Run the test and see it PASS.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/DbmlEditor.test.tsx
  ```

  Expected output: `Test Files  1 passed (1)` / `Tests  2 passed (2)`, exit code 0.

- [ ] **Step 5: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/dbml-editor/ui/DbmlEditor.tsx src/features/dbml-editor/ui/DbmlEditor.test.tsx && git commit -m "feat(dbml-editor): controlled CodeMirror 6 DbmlEditor component"
  ```

---

### Task 8: useDbmlParse — debounced live-parse hook

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/model/useDbmlParse.ts`
- Test: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/model/useDbmlParse.test.ts`

`useDbmlParse(text, delayMs?)` debounces the editor text (reusing the existing `useDebouncedCallback` from `shared/hooks/useDebounce`) and runs the pure `parseDbml` adapter from `entities/dbml`. It holds `{ status, schema?, errors?, lastValidSchema? }`. Empty text → `idle`. On a non-empty change it goes `pending`, then after the debounce settles to `success` (with `schema` + cached `lastValidSchema`) or `error` (with `errors`; `lastValidSchema` retained so the summary can keep showing the last good model — the D4 choice). Default delay is 300ms (within the D6 300–500ms range).

> **Fake-timer test (per research):** no CodeMirror involved. The test drives the hook with `renderHook` + `vi.useFakeTimers()`, asserts `pending` immediately after a text change, advances past the debounce, and asserts the settled state. `parseDbml` is the REAL adapter (not mocked) so this also integration-checks the seam. The repo's `src/test/setup.ts` already shims `globalThis.jest.advanceTimersByTime` so Testing Library's `waitFor` pumps Vitest's fake clock — use `waitFor` for the post-advance assertion.

- [ ] **Step 1: Write the failing test.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/model/useDbmlParse.test.ts`:

  ```ts
  import { describe, it, expect, vi, afterEach } from 'vitest'
  import { renderHook, act, waitFor } from '@testing-library/react'
  import { useDbmlParse } from './useDbmlParse'

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('useDbmlParse', () => {
    it('starts idle for empty text', () => {
      const { result } = renderHook(({ text }) => useDbmlParse(text), {
        initialProps: { text: '' },
      })
      expect(result.current.status).toBe('idle')
      expect(result.current.schema).toBeUndefined()
    })

    it('goes pending then success after the debounce for valid DBML', async () => {
      vi.useFakeTimers()
      const { result, rerender } = renderHook(
        ({ text }) => useDbmlParse(text, 300),
        { initialProps: { text: '' } },
      )

      rerender({ text: 'Table users {\n  id int [pk]\n}' })
      expect(result.current.status).toBe('pending')

      act(() => {
        vi.advanceTimersByTime(300)
      })

      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })
      expect(result.current.schema?.tables).toHaveLength(1)
      expect(result.current.schema?.tables[0]?.name).toBe('users')
      expect(result.current.errors).toBeUndefined()
    })

    it('reports errors without throwing and keeps the last valid schema', async () => {
      vi.useFakeTimers()
      const { result, rerender } = renderHook(
        ({ text }) => useDbmlParse(text, 300),
        { initialProps: { text: '' } },
      )

      // First settle on a valid schema.
      rerender({ text: 'Table users {\n  id int [pk]\n}' })
      act(() => {
        vi.advanceTimersByTime(300)
      })
      await waitFor(() => {
        expect(result.current.status).toBe('success')
      })

      // Then feed invalid DBML.
      rerender({ text: 'Table users {' })
      act(() => {
        vi.advanceTimersByTime(300)
      })
      await waitFor(() => {
        expect(result.current.status).toBe('error')
      })
      expect(result.current.errors?.length).toBeGreaterThan(0)
      // last good schema retained for the summary (D4 choice)
      expect(result.current.lastValidSchema?.tables).toHaveLength(1)
    })
  })
  ```

- [ ] **Step 2: Run the test and see it FAIL.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/model/useDbmlParse.test.ts
  ```

  Expected output: collection fails with `Failed to resolve import "./useDbmlParse"` / `Cannot find module './useDbmlParse'` — the hook does not exist yet. Exit code non-zero.

- [ ] **Step 3: Implement `useDbmlParse.ts`.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/model/useDbmlParse.ts`:

  ```ts
  import { useCallback, useEffect, useState } from 'react'
  import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
  import { parseDbml } from '@/entities/dbml'
  import type { DbmlSchema, DbmlParseError } from '@/entities/dbml'

  export type DbmlParseStatus = 'idle' | 'pending' | 'success' | 'error'

  export interface DbmlParseState {
    /** Lifecycle of the latest parse. */
    status: DbmlParseStatus
    /** Set when the latest parse succeeded. */
    schema?: DbmlSchema
    /** Set when the latest parse failed. */
    errors?: DbmlParseError[]
    /** The most recent successful schema, retained across a failed parse so
     *  the summary keeps showing the last good model (D4 choice). */
    lastValidSchema?: DbmlSchema
  }

  /**
   * Debounced live parse of DBML text into the normalized model + errors.
   * Reuses the shared useDebouncedCallback (Plan 2). Empty text is `idle`; a
   * non-empty change goes `pending` immediately, then settles to `success`
   * (schema + lastValidSchema) or `error` (errors; lastValidSchema retained)
   * after `delayMs` of quiet. parseDbml never throws (returns a result), so
   * this hook never crashes the editor.
   * features layer: depends on entities/dbml + shared (FSD downward imports).
   */
  export function useDbmlParse(text: string, delayMs = 300): DbmlParseState {
    const [state, setState] = useState<DbmlParseState>({ status: 'idle' })

    const performParse = useCallback((source: string) => {
      const result = parseDbml(source)
      if (result.ok) {
        setState({
          status: 'success',
          schema: result.schema,
          lastValidSchema: result.schema,
        })
      } else {
        setState((prev) => ({
          status: 'error',
          errors: result.errors,
          lastValidSchema: prev.lastValidSchema,
        }))
      }
    }, [])

    const debouncedParse = useDebouncedCallback(performParse, delayMs)

    useEffect(() => {
      if (text === '') {
        debouncedParse.cancel()
        setState((prev) => ({ status: 'idle', lastValidSchema: prev.lastValidSchema }))
        return
      }
      setState((prev) => ({ ...prev, status: 'pending' }))
      debouncedParse(text)
      return () => {
        debouncedParse.cancel()
      }
    }, [text, debouncedParse])

    return state
  }
  ```

- [ ] **Step 4: Run the test and see it PASS.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/model/useDbmlParse.test.ts
  ```

  Expected output: `Test Files  1 passed (1)` / `Tests  3 passed (3)`, exit code 0.

- [ ] **Step 5: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/dbml-editor/model/useDbmlParse.ts src/features/dbml-editor/model/useDbmlParse.test.ts && git commit -m "feat(dbml-editor): debounced useDbmlParse hook over the parse adapter"
  ```

---

### Task 9: ParseErrorPanel — error/valid status display

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/ParseErrorPanel.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/ParseErrorPanel.test.tsx`

A read-only panel that shows the parse status: a "valid" affordance when there are no errors, or a list of `DbmlParseError`s (message + line/column when present) when there are. It takes the discriminated parse state as simple props (`status` + optional `errors`) so it is a pure presentational component with no parsing of its own.

- [ ] **Step 1: Write the failing test.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/ParseErrorPanel.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { ParseErrorPanel } from './ParseErrorPanel'

  describe('ParseErrorPanel', () => {
    it('shows a valid status when there are no errors', () => {
      render(<ParseErrorPanel status="success" />)
      expect(screen.getByText(/valid dbml/i)).toBeInTheDocument()
    })

    it('shows a parsing status while pending', () => {
      render(<ParseErrorPanel status="pending" />)
      expect(screen.getByText(/parsing/i)).toBeInTheDocument()
    })

    it('lists errors with line/column when present', () => {
      render(
        <ParseErrorPanel
          status="error"
          errors={[
            { message: 'Unexpected end of input', line: 3, column: 1 },
            { message: 'Expected a closing brace' },
          ]}
        />,
      )
      expect(
        screen.getByText(/unexpected end of input/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/line 3, column 1/i)).toBeInTheDocument()
      expect(
        screen.getByText(/expected a closing brace/i),
      ).toBeInTheDocument()
    })
  })
  ```

  > Uses the `DbmlParseError` shape from `entities/dbml` (`{ message: string; line?: number; column?: number }`) — only `message` is guaranteed; `line`/`column` are optional, hence the second error in the test omits them.

- [ ] **Step 2: Run the test and see it FAIL.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/ParseErrorPanel.test.tsx
  ```

  Expected output: collection fails with `Failed to resolve import "./ParseErrorPanel"` / `Cannot find module './ParseErrorPanel'`. Exit code non-zero.

- [ ] **Step 3: Implement `ParseErrorPanel.tsx`.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/ParseErrorPanel.tsx`:

  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
  import type { DbmlParseError } from '@/entities/dbml'
  import type { DbmlParseStatus } from '../model/useDbmlParse'

  export interface ParseErrorPanelProps {
    /** Current parse lifecycle. */
    status: DbmlParseStatus
    /** Parse errors, present only when status is "error". */
    errors?: DbmlParseError[]
  }

  /**
   * Read-only parse-status panel: a "valid" affordance when parsing succeeds,
   * a "parsing…" hint while pending, or a list of errors (message + line/column
   * when available) when parsing fails. Purely presentational — it receives the
   * parse state as props and does no parsing itself.
   * features layer: depends on shared + entities/dbml (FSD downward imports).
   */
  export function ParseErrorPanel({ status, errors }: ParseErrorPanelProps) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Parse status</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'pending' && (
            <p className="text-sm text-gray-600">Parsing…</p>
          )}
          {status === 'idle' && (
            <p className="text-sm text-gray-600">Start typing DBML…</p>
          )}
          {status === 'success' && (
            <p className="text-sm text-green-700">Valid DBML</p>
          )}
          {status === 'error' && (
            <ul className="flex flex-col gap-1">
              {(errors ?? []).map((err, i) => (
                <li key={i} className="text-sm text-red-700">
                  {err.message}
                  {typeof err.line === 'number' &&
                    typeof err.column === 'number' && (
                      <span className="ml-2 text-xs text-red-500">
                        (line {err.line}, column {err.column})
                      </span>
                    )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    )
  }
  ```

- [ ] **Step 4: Run the test and see it PASS.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/ParseErrorPanel.test.tsx
  ```

  Expected output: `Test Files  1 passed (1)` / `Tests  3 passed (3)`, exit code 0.

- [ ] **Step 5: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/dbml-editor/ui/ParseErrorPanel.tsx src/features/dbml-editor/ui/ParseErrorPanel.test.tsx && git commit -m "feat(dbml-editor): ParseErrorPanel for parse status + errors"
  ```

---

### Task 10: SchemaSummary — read-only model summary (NOT a diagram)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/SchemaSummary.tsx`
- Test: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/SchemaSummary.test.tsx`

A read-only summary of the normalized `DbmlSchema`: counts (tables / refs / enums / table groups / notes) and the list of table names. This is explicitly NOT a diagram — no canvas, nodes, or edges (that is Plan 3b). It proves the parse produced a consumable model and gives a verifiable target for the Playwright smoke. When no schema is available it shows a neutral placeholder.

> **Test-fixture note:** the `DbmlSchema` test fixture below intentionally provides only a subset of each interface's fields (e.g. `DbmlTable` without `id`/`schema`, `DbmlColumn` without `pk`/`notNull` flags). To keep the fixture terse without fighting the strict types, the test casts the literal `as DbmlSchema`. `SchemaSummary` only reads `length` counts and `t.name`, so the partial fixture exercises everything the component touches.

- [ ] **Step 1: Write the failing test.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/SchemaSummary.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { SchemaSummary } from './SchemaSummary'
  import type { DbmlSchema } from '@/entities/dbml'

  const schema = {
    tables: [
      { name: 'users', schema: 'public', columns: [] },
      { name: 'posts', schema: 'public', columns: [] },
    ],
    refs: [
      {
        fromTable: 'posts',
        fromColumns: ['user_id'],
        toTable: 'users',
        toColumns: ['id'],
        relation: 'n-1',
      },
    ],
    enums: [{ name: 'role', values: [{ name: 'admin' }, { name: 'user' }] }],
    tableGroups: [{ name: 'core', tables: ['users', 'posts'] }],
    notes: [],
  } as unknown as DbmlSchema

  describe('SchemaSummary', () => {
    it('shows a placeholder when there is no schema', () => {
      render(<SchemaSummary schema={undefined} />)
      expect(screen.getByText(/no parsed schema/i)).toBeInTheDocument()
    })

    it('shows counts and table names for a parsed schema', () => {
      render(<SchemaSummary schema={schema} />)

      expect(screen.getByTestId('summary-tables')).toHaveTextContent('2')
      expect(screen.getByTestId('summary-refs')).toHaveTextContent('1')
      expect(screen.getByTestId('summary-enums')).toHaveTextContent('1')
      expect(screen.getByTestId('summary-groups')).toHaveTextContent('1')
      expect(screen.getByTestId('summary-notes')).toHaveTextContent('0')

      expect(screen.getByText('users')).toBeInTheDocument()
      expect(screen.getByText('posts')).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run the test and see it FAIL.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/SchemaSummary.test.tsx
  ```

  Expected output: collection fails with `Failed to resolve import "./SchemaSummary"` / `Cannot find module './SchemaSummary'`. Exit code non-zero.

- [ ] **Step 3: Implement `SchemaSummary.tsx`.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/ui/SchemaSummary.tsx`:

  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
  import type { DbmlSchema } from '@/entities/dbml'

  export interface SchemaSummaryProps {
    /** The latest normalized schema to summarize (undefined → placeholder). */
    schema?: DbmlSchema
  }

  /**
   * Read-only summary of the normalized DBML model: entity counts and the list
   * of table names. NOT a diagram — there is no canvas/node/edge rendering
   * (that is Plan 3b). It exists to prove the parse produced a consumable model
   * and to give the editor page (and Playwright) a verifiable target.
   * features layer: depends on shared + entities/dbml (FSD downward imports).
   */
  export function SchemaSummary({ schema }: SchemaSummaryProps) {
    if (!schema) {
      return (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm">Schema summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600">No parsed schema yet.</p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Schema summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-600">Tables</dt>
            <dd data-testid="summary-tables">{schema.tables.length}</dd>
            <dt className="text-gray-600">Refs</dt>
            <dd data-testid="summary-refs">{schema.refs.length}</dd>
            <dt className="text-gray-600">Enums</dt>
            <dd data-testid="summary-enums">{schema.enums.length}</dd>
            <dt className="text-gray-600">Table groups</dt>
            <dd data-testid="summary-groups">{schema.tableGroups.length}</dd>
            <dt className="text-gray-600">Notes</dt>
            <dd data-testid="summary-notes">{schema.notes.length}</dd>
          </dl>
          {schema.tables.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                Table names
              </p>
              <ul className="flex flex-col gap-0.5 text-sm">
                {schema.tables.map((t) => (
                  <li key={t.schema ? `${t.schema}.${t.name}` : t.name}>
                    {t.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
  ```

- [ ] **Step 4: Run the test and see it PASS.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/features/dbml-editor/ui/SchemaSummary.test.tsx
  ```

  Expected output: `Test Files  1 passed (1)` / `Tests  2 passed (2)`, exit code 0.

- [ ] **Step 5: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/dbml-editor/ui/SchemaSummary.tsx src/features/dbml-editor/ui/SchemaSummary.test.tsx && git commit -m "feat(dbml-editor): read-only SchemaSummary of the normalized model"
  ```

---

### Task 11: features/dbml-editor barrel

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/features/dbml-editor/index.ts`

Public re-exports of the feature. This is a re-export/scaffolding step — a red phase is artificial. Verification is that the barrel type-checks and the importing page (Task 12) can resolve everything from `@/features/dbml-editor`.

- [ ] **Step 1: Create the barrel.**

  Create `/home/soron/projects/codegram/frontend/src/features/dbml-editor/index.ts`:

  ```ts
  export { DbmlEditor } from './ui/DbmlEditor'
  export type { DbmlEditorProps } from './ui/DbmlEditor'
  export { ParseErrorPanel } from './ui/ParseErrorPanel'
  export type { ParseErrorPanelProps } from './ui/ParseErrorPanel'
  export { SchemaSummary } from './ui/SchemaSummary'
  export type { SchemaSummaryProps } from './ui/SchemaSummary'
  export { useDbmlParse } from './model/useDbmlParse'
  export type {
    DbmlParseState,
    DbmlParseStatus,
  } from './model/useDbmlParse'
  ```

- [ ] **Step 2: Type-check the barrel and feature.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run type-check
  ```

  Expected output: `tsc --noEmit` prints nothing and exits 0 (no type errors). This confirms every re-exported symbol exists and the FSD imports resolve.

- [ ] **Step 3: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/features/dbml-editor/index.ts && git commit -m "feat(dbml-editor): public barrel exports"
  ```

---

### Task 12: Wire the editor page — replace `<textarea>` with `<DbmlEditor>` + live parse

**Files:**
- Modify: `/home/soron/projects/codegram/frontend/src/pages/editor/index.tsx`
- Modify (test): `/home/soron/projects/codegram/frontend/src/pages/editor/index.test.tsx`
- Modify (e2e): `/home/soron/projects/codegram/frontend/e2e/projects.spec.ts` (the Plan 2 spec drives the editor via `getByRole('textbox')`, which CodeMirror no longer exposes — Step 5 updates it)

Replace the `<textarea>` with `<DbmlEditor value={dbmlText} onChange={setDbmlText} />`, and add `useDbmlParse(dbmlText)` driving `<ParseErrorPanel>` + `<SchemaSummary>` beside it. The seed/baseline `useEffect`, the `useProjectAutosave({ projectId: id, dbmlText, baseline })` call, and the status-label header are PRESERVED EXACTLY — only the `<main>` body changes. The existing page test asserts `getByRole('textbox')`, which CodeMirror's contenteditable does not expose, so that test is updated to assert on the editor wrapper (`data-testid="dbml-editor"`) and that autosave is still called with the exact `{ projectId, dbmlText, baseline }` contract. The existing Plan 2 e2e spec `e2e/projects.spec.ts` ALSO drives the editor via `getByRole('textbox').fill(...)` / `toHaveValue(...)` — those break against CodeMirror's contenteditable and MUST be updated too (Step 5), or Playwright will fail when run.

> **Why the page test changes:** CodeMirror does not render a `<textarea>`/`role=textbox`, so the two `getByRole('textbox')` assertions can no longer hold. We keep the same intent — page renders, seeds the editor, shows the project name, handles not-found — but assert against the editor wrapper and the summary, and we add a guard that `useProjectAutosave` is invoked with the preserved contract (the load-bearing Plan 2 invariant). Real typing-drives-parse is covered by Task 13 (Playwright). This is a legitimate test update (the UI element changed), not weakening coverage.

- [ ] **Step 1: Update the page test to the CodeMirror contract (this is the red phase).**

  Replace the ENTIRE contents of `/home/soron/projects/codegram/frontend/src/pages/editor/index.test.tsx` with:

  ```tsx
  import { describe, it, expect, beforeEach, vi } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { createMemoryRouter, RouterProvider } from 'react-router'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { EditorPage } from './index'
  import * as project from '@/entities/project'
  import * as autosave from '@/features/project-autosave'

  function renderEditor() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const router = createMemoryRouter(
      [{ path: '/editor/:id', element: <EditorPage /> }],
      { initialEntries: ['/editor/p-1'] },
    )
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  describe('EditorPage', () => {
    let autosaveSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      vi.restoreAllMocks()
      autosaveSpy = vi
        .spyOn(autosave, 'useProjectAutosave')
        .mockReturnValue({ status: 'idle' })
    })

    it('shows the project name and seeds the editor with dbml_text', () => {
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

      expect(
        screen.getByRole('heading', { name: 'My Project' }),
      ).toBeInTheDocument()

      // CodeMirror replaces the textarea: assert on the editor wrapper and
      // that it seeded the document text into the DOM.
      const editor = screen.getByTestId('dbml-editor')
      expect(editor).not.toBeEmptyDOMElement()
      expect(editor.textContent).toContain('Table users')
    })

    it('passes the preserved autosave contract { projectId, dbmlText, baseline }', () => {
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

      // The seed effect runs after first render; the latest autosave call must
      // carry the exact Plan 2 contract with the seeded text + baseline.
      const lastCall = autosaveSpy.mock.calls.at(-1)?.[0] as {
        projectId: string
        dbmlText: string
        baseline?: string
      }
      expect(lastCall.projectId).toBe('p-1')
      expect(lastCall.dbmlText).toBe('Table users {\n  id int [pk]\n}')
      expect(lastCall.baseline).toBe('Table users {\n  id int [pk]\n}')
    })

    it('renders the parse status and schema summary panels', () => {
      vi.spyOn(project, 'useProject').mockReturnValue({
        data: {
          id: 'p-1',
          user_id: 'u-1',
          name: 'My Project',
          dbml_text: '',
          layout: {},
          created_at: '2026-06-05T00:00:00Z',
          updated_at: '2026-06-05T00:00:00Z',
        },
        isLoading: false,
        isError: false,
      } as ReturnType<typeof project.useProject>)

      renderEditor()

      expect(screen.getByText(/parse status/i)).toBeInTheDocument()
      expect(screen.getByText(/schema summary/i)).toBeInTheDocument()
    })

    it('shows a not-found message when the project query errors', () => {
      vi.spyOn(project, 'useProject').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
      } as ReturnType<typeof project.useProject>)

      renderEditor()
      expect(screen.getByText(/project not found/i)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run the page test and see it FAIL.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/pages/editor/index.test.tsx
  ```

  Expected output: failures because the page still renders a `<textarea>` (no `data-testid="dbml-editor"`, no "Parse status"/"Schema summary"). Messages like `Unable to find an element by: [data-testid="dbml-editor"]` and `Unable to find an element with the text: /parse status/i`. Exit code non-zero. (The not-found test may still pass; the new editor/summary assertions fail.)

- [ ] **Step 3: Replace the editor page body.**

  Replace the ENTIRE contents of `/home/soron/projects/codegram/frontend/src/pages/editor/index.tsx` with:

  ```tsx
  import { useEffect, useState } from 'react'
  import { useNavigate, useParams } from 'react-router'
  import { Button } from '@/shared/ui/button'
  import { useProject } from '@/entities/project'
  import {
    useProjectAutosave,
    type AutosaveStatus,
  } from '@/features/project-autosave'
  import {
    DbmlEditor,
    ParseErrorPanel,
    SchemaSummary,
    useDbmlParse,
  } from '@/features/dbml-editor'

  const statusLabel: Record<AutosaveStatus, string> = {
    idle: 'All changes saved',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }

  /**
   * Editor page (Plan 3a): loads a project by :id and binds a CodeMirror 6
   * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
   * plus live debounced parsing into the normalized model shown as a read-only
   * status panel + schema summary. No diagram/canvas — that is Plan 3b.
   * pages layer: composes the project entity + the autosave and dbml-editor
   * features (FSD downward imports).
   */
  export function EditorPage() {
    const { id = '' } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data: project, isLoading, isError } = useProject(id)
    const [dbmlText, setDbmlText] = useState('')
    // The last server-seeded value; autosave skips while dbmlText still equals it.
    const [baseline, setBaseline] = useState('')
    const { status } = useProjectAutosave({ projectId: id, dbmlText, baseline })
    // Live, debounced parse of the editor text into the normalized model.
    const parse = useDbmlParse(dbmlText)

    // Seed the editor (and the autosave baseline) once the project loads, and
    // re-seed when its id changes. Keying on project?.id avoids clobbering the
    // user's in-progress text on each autosave-driven cache update.
    useEffect(() => {
      if (project) {
        setDbmlText(project.dbml_text)
        setBaseline(project.dbml_text)
      }
    }, [project?.id])

    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          Loading…
        </div>
      )
    }

    if (isError || !project) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <p className="text-lg">Project not found</p>
          <Button onClick={() => navigate('/')}>Back to projects</Button>
        </div>
      )
    }

    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b p-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <h1 className="text-xl font-bold">{project.name}</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {statusLabel[status]}
              </span>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back
              </Button>
            </div>
          </div>
        </header>

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
      </div>
    )
  }
  ```

  > **Preserved exactly from Plan 2:** the `dbmlText`/`baseline` state, the seed `useEffect` keyed on `project?.id`, the `useProjectAutosave({ projectId: id, dbmlText, baseline })` call, the `statusLabel` map, the header status label, the loading/not-found branches. The ONLY change is the `<main>` body: the `<textarea>` becomes `<DbmlEditor>` plus the parse panels. `SchemaSummary` is fed `parse.schema ?? parse.lastValidSchema` so a transient parse error still shows the last good model (D4).

- [ ] **Step 4: Run the page test and see it PASS.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run -- src/pages/editor/index.test.tsx
  ```

  Expected output: `Test Files  1 passed (1)` / `Tests  4 passed (4)`, exit code 0.

- [ ] **Step 5: Update the Plan 2 e2e spec for CodeMirror.**

  The existing `frontend/e2e/projects.spec.ts` drives and asserts the editor through `getByRole('textbox')`, which CodeMirror's contenteditable does NOT expose: `.fill()` won't target the CM surface and `.toHaveValue()` has no value on a contenteditable. Apply two surgical edits to the `'create a project, edit, autosave, reload, and persist'` test. Replace the type-into-editor line (currently `await page.getByRole('textbox').fill(dbml)`):

  ```ts
  const editor = page.getByTestId('dbml-editor')
  await editor.locator('.cm-content').click()
  await page.keyboard.type(dbml)
  ```

  And replace the post-reload value assertion (currently `await expect(page.getByRole('textbox')).toHaveValue(dbml)`) with a contenteditable-aware check:

  ```ts
  await expect(
    page.getByTestId('dbml-editor').locator('.cm-content'),
  ).toContainText('table users')
  ```

  Leave the rename test's `getByRole('listitem').getByRole('textbox')` untouched — it targets the project-name input inside a list item, not the editor, so CodeMirror does not affect it. (If you cannot run Playwright in this environment, you MUST still apply these edits — leaving them is a latent break that fails the next e2e run; the Ship Criteria gate Playwright as optional, but the spec must be correct when it IS run.)

- [ ] **Step 6: Run the full suite + type-check.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run test:run && npm run type-check
  ```

  Expected output: Vitest ends with `Test Files  N passed (N)` / `Tests  M passed (M)` (all Plan 0/1/2/3a tests green), then `tsc --noEmit` exits 0 with no output. Exit code 0 overall. (Vitest does not run `e2e/*.spec.ts`; if Playwright is available, also run `npm run e2e` to confirm the updated `projects.spec.ts` is green.)

- [ ] **Step 7: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add src/pages/editor/index.tsx src/pages/editor/index.test.tsx e2e/projects.spec.ts && git commit -m "feat(editor): replace textarea with CodeMirror DbmlEditor + live parse panels"
  ```

---

### Task 13 (OPTIONAL): Playwright editor smoke — CodeMirror renders, typing updates the summary

**Files:**
- Create: `/home/soron/projects/codegram/frontend/e2e/editor.spec.ts`

A real-browser smoke that the editor mounts and live parsing updates the summary/status. This is OPTIONAL (it requires a running backend + an authenticated session + a seeded project, matching the existing `projects.spec.ts` flow). It asserts the CodeMirror editor renders and that typing valid DBML updates the parse status to "Valid DBML" and the table count to 1 — it does NOT assert any diagram.

> **Prerequisite & skip rule:** the editor route is behind `RequireAuth`; this spec must follow the same login/seed pattern that `frontend/e2e/projects.spec.ts` already uses to reach an authenticated project. If that harness is not available in CI, mark this task done-as-skipped and rely on the unit/hook tests (Tasks 7–12) for coverage — the editor's parse wiring is fully unit-tested, so the Playwright smoke is a bonus, not a gate. The author MUST read `frontend/e2e/projects.spec.ts` first and reuse its auth/navigation helpers; the snippet below assumes a helper that logs in and ends on an editor URL — adapt it to the actual helpers in that file.

- [ ] **Step 1: Read the existing e2e auth/project flow.**

  Run (exact command):

  ```bash
  cat /home/soron/projects/codegram/frontend/e2e/projects.spec.ts
  ```

  Expected: prints the existing project spec so its login + create-project + navigate-to-editor steps can be reused verbatim. Note the exact helper/setup calls it uses (the next step references them as `<reuse projects.spec.ts auth+seed>`).

- [ ] **Step 2: Write the smoke spec.**

  Create `/home/soron/projects/codegram/frontend/e2e/editor.spec.ts` (adapt the marked auth/seed block to the helpers found in Step 1):

  ```ts
  import { test, expect } from '@playwright/test'

  // NOTE: reach an authenticated editor URL using the SAME login + create
  // -project + navigate pattern as e2e/projects.spec.ts. Replace the body of
  // gotoEditor() with that file's verified auth/seed steps (read in Step 1).
  async function gotoEditor(page: import('@playwright/test').Page) {
    // <reuse projects.spec.ts auth+seed>: log in, create a project, and end on
    // its /editor/:id URL. Must leave `page` on the editor route.
    throw new Error('replace with projects.spec.ts auth+seed flow')
  }

  test('editor: CodeMirror renders and typing valid DBML updates the summary', async ({
    page,
  }) => {
    await gotoEditor(page)

    const editor = page.getByTestId('dbml-editor')
    await expect(editor).toBeVisible()

    // Focus the CodeMirror content surface and type valid DBML.
    const content = editor.locator('.cm-content')
    await content.click()
    await page.keyboard.type('Table users {\n  id int [pk]\n}')

    // Live parse settles within the debounce: status flips to valid and the
    // table count reaches 1. No diagram is asserted (that is Plan 3b).
    await expect(page.getByText(/valid dbml/i)).toBeVisible()
    await expect(page.getByTestId('summary-tables')).toHaveText('1')
    await expect(page.getByText('users')).toBeVisible()
  })
  ```

- [ ] **Step 3: Run the smoke.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && npm run e2e -- editor.spec.ts
  ```

  Expected output: Playwright boots the dev server (per `playwright.config.ts`) and reports `1 passed`. If the auth/seed harness is unavailable, the spec fails fast at `gotoEditor` — in that case mark this OPTIONAL task skipped (do NOT block the plan on it) and note it in the commit/PR.

- [ ] **Step 4: Commit.**

  Run (exact command):

  ```bash
  cd /home/soron/projects/codegram/frontend && git add e2e/editor.spec.ts && git commit -m "test(e2e): editor smoke — CodeMirror renders, typing updates summary"
  ```

---

## Ship Criteria

- [ ] `@dbml/core@8.2.5` and the CodeMirror packages (`@uiw/react-codemirror`, `@codemirror/state`, `@codemirror/view`) are installed; `npm run test:run` and `npm run type-check` are green; no Vite/Vitest config change was needed.
- [ ] The normalized, app-owned model lives in `entities/dbml/model/types.ts` (`DbmlSchema`/`DbmlTable`/`DbmlColumn`/`DbmlRef`/`DbmlEnum`/`DbmlTableGroup`/`DbmlNote` + `DbmlParseError` + the `DbmlParseResult` discriminated union) with ZERO `@dbml/core` imports, using stable name-based keys per ADR-0004.
- [ ] `parseDbml(text): DbmlParseResult` in `entities/dbml/lib/parse.ts` wraps the official `@dbml/core` (the ONLY place it is imported), maps its `.normalize()` model into our shape, and NEVER throws — invalid DBML returns `{ ok: false, errors }`.
- [ ] The adapter is unit-tested with REAL `@dbml/core` (not mocked) across all six feature kinds (tables, refs with all four cardinalities + self-ref + composite FK, enums, table groups + color, header color, notes) and invalid/semantic/empty inputs — `parse.test.ts` is green (13 tests).
- [ ] `entities/dbml/index.ts` exposes a clean public barrel (`parseDbml` + the model types); `features/dbml-editor/index.ts` exposes `DbmlEditor`, `ParseErrorPanel`, `SchemaSummary`, `useDbmlParse`. Imports are downward only (entities → shared + @dbml/core; features → entities + shared + CodeMirror; pages → features + entities).
- [ ] The editor page shows a CodeMirror 6 editor bound to `dbml_text` with the Plan 2 autosave contract preserved EXACTLY — the seed/baseline `useEffect` and `useProjectAutosave({ projectId, dbmlText, baseline })` are unchanged; the page test guards that contract.
- [ ] Typing valid DBML produces a normalized schema model shown as a read-only summary (counts + table names) within a debounce (~300ms); invalid DBML shows parse errors in the `ParseErrorPanel` without crashing; the last good schema is retained across a transient error (D4).
- [ ] There is NO React Flow / `@xyflow`, NO diagram/canvas/node/edge rendering, NO auto-layout, NO Layout persistence of node positions, and NO custom Lezer DBML grammar anywhere in this plan — those are Plan 3b/later. No backend changes.
- [ ] (OPTIONAL) The Playwright editor smoke asserts CodeMirror renders and typing updates the summary/status (no diagram); skippable if the auth/seed harness is unavailable, since the parse wiring is fully unit-tested.
- [ ] The Plan 2 e2e spec `e2e/projects.spec.ts` is updated off `getByRole('textbox')` (which CodeMirror no longer exposes) onto the `dbml-editor`/`.cm-content` contract (Task 12 Step 5), so it stays green if Playwright is run.
- [ ] Vitest (and, if run, Playwright — including the updated `projects.spec.ts`) green; the normalized model is ready for Plan 3b to render.
