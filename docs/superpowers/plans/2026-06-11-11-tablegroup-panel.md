# TableGroup 패널 조작 + Info 오프캔버스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 우측 패널에서 TableGroup CRUD(생성·이동·색상·이름변경·삭제)와 접기/펼치기를 제공하고, 모든 구조 변경은 DBML 텍스트 국소 수술(ADR-0011)로 실행하며, Info 버튼으로 패널을 push 오프캔버스 토글한다.

**Architecture:** 순수 텍스트 수술 함수(`entities/dbml/lib/groupOps.ts`)가 DBML을 고치고 재파싱 가드를 통과한 결과만 반환한다. 패널(widget)은 의미 콜백(`GroupOpHandlers`)만 호출하는 표현 계층이고, EditorPage가 콜백을 groupOps + `setDbmlText`로 묶는다(기존 autosave/parse/canvas 경로 재사용 — 추가 배선 없음). DBML Invalid 동안 조작 비활성. 접힘 상태는 세션 메모리(React state)만.

**Tech Stack:** React 19, @dbml/core 8.2.5(parseDbml), shadcn DropdownMenu(기존 `shared/ui/dropdown-menu`), lucide-react, vitest + @testing-library, Playwright E2E (docker :4001 재사용).

**병렬 트랙:** Track A(Tasks 1–5, `entities/dbml`만 수정) ∥ Track B(Tasks 6–9, `widgets/erd-info-panel`만 수정) ∥ Track C-1(Task 10 오프캔버스, `pages/editor`만 수정). Track C-2(Tasks 11–13, 통합·E2E)는 A+B 완료 후. 트랙 간 파일이 겹치지 않으므로 동일 체크아웃에서 병렬 안전.

**트랙 간 인터페이스 계약 (먼저 합의, 변경 금지):**

```ts
// entities/dbml (Track A가 구현, Track C가 사용)
export type GroupOpResult = { ok: true; text: string } | { ok: false; error: string }
export function createGroup(text: string, name: string): GroupOpResult
export function renameGroup(text: string, oldName: string, newName: string): GroupOpResult
export function deleteGroup(text: string, name: string): GroupOpResult
export function setGroupColor(text: string, name: string, color: string | null): GroupOpResult
export function moveTableToGroup(text: string, schema: DbmlSchema, tableId: string, toGroup: string | null): GroupOpResult

// widgets/erd-info-panel/model/types.ts (Track B가 정의, Track C가 구현체 주입)
export interface GroupOpHandlers {
  onCreateGroup: (name: string) => void
  onRenameGroup: (oldName: string, newName: string) => void
  onDeleteGroup: (name: string) => void
  onSetGroupColor: (name: string, color: string | null) => void
  /** toGroup === null → Ungrouped로 이동(그룹에서 제거) */
  onMoveTable: (tableId: string, toGroup: string | null) => void
}
// ErdInfoPanel 추가 props: groupOps?: GroupOpHandlers; mutationsEnabled?: boolean
```

**도메인 규칙(확정, CONTEXT.md/ADR-0011):** 테이블은 최대 1그룹(파서 강제) → 이동 = 제거+추가. 그룹명은 스키마 내 유일(파서 거부). 빈 그룹 유효. Ungrouped는 파생 버킷(이름변경·색상·삭제 없음). 모든 수술은 재파싱 가드 통과 시에만 적용.

**검증 명령:**
- 유닛: `docker compose -p codegram exec -T frontend npm run test -- --run <path>`
- 타입: `docker compose -p codegram exec -T frontend npx tsc --noEmit`
- E2E: frontend/에서 임시 config(baseURL `http://localhost:4001`, `reuseExistingServer: true`)로 `npx playwright test e2e/table-groups.spec.ts`

---

## Track A — entities/dbml: groupOps (순수 텍스트 수술)

### Task 1: groupOps 골격 + findGroupBlock + createGroup

**Files:**
- Create: `frontend/src/entities/dbml/lib/groupOps.ts`
- Test: `frontend/src/entities/dbml/lib/groupOps.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성** (`groupOps.test.ts` 신규)

```ts
import { describe, it, expect } from 'vitest'
import { parseDbml } from './parse'
import { createGroup } from './groupOps'

const BASE = `// my comment
Table users {
  id integer [pk]
}

Table posts {
  id integer [pk]
}
`

describe('createGroup', () => {
  it('appends an empty TableGroup block and preserves existing text verbatim', () => {
    const r = createGroup(BASE, 'auth')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text.startsWith(BASE.trimEnd())).toBe(true)
    expect(r.text).toContain('TableGroup auth {\n}')
    const parsed = parseDbml(r.text)
    expect(parsed.ok && parsed.schema.tableGroups.length).toBe(1)
  })

  it('quotes names that are not bare identifiers (Korean, spaces)', () => {
    const r = createGroup(BASE, '인증 그룹')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup "인증 그룹" {')
    const parsed = parseDbml(r.text)
    expect(parsed.ok && parsed.schema.tableGroups[0].name).toBe('인증 그룹')
  })

  it('rejects a duplicate group name', () => {
    const withGroup = BASE + '\nTableGroup auth {\n  users\n}\n'
    const r = createGroup(withGroup, 'auth')
    expect(r.ok).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(createGroup(BASE, '  ').ok).toBe(false)
  })

  it('guard: a name that breaks DBML syntax is rejected, text untouched', () => {
    const r = createGroup(BASE, 'a"b')
    expect(r.ok).toBe(false)
  })

  it('works on an empty document', () => {
    const r = createGroup('', 'g')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toBe('TableGroup g {\n}\n')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/entities/dbml/lib/groupOps.test.ts`
Expected: FAIL — `Cannot find module './groupOps'`

- [ ] **Step 3: 최소 구현** (`groupOps.ts` 신규 — 이후 Task가 이 파일에 함수를 추가한다)

```ts
/**
 * PURE surgical DBML text operations for TableGroup manipulation (ADR-0011).
 * Each op locates the affected TableGroup block (or member line) in the RAW
 * text and rewrites only that region — comments, formatting and declaration
 * order elsewhere are untouched. Every op re-parses its result (parse guard):
 * on failure it returns { ok: false } and the caller must keep the original.
 *
 * entities layer: imports only the local parse adapter + types (FSD).
 */
import { parseDbml } from './parse'
import type { DbmlSchema } from '../model/types'

export type GroupOpResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

/** Quote a DBML identifier unless it is a bare word. */
function quoteName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `"${name}"`
}

/** Parse guard: the rewritten text must still be valid DBML. */
function guarded(next: string): GroupOpResult {
  const parsed = parseDbml(next)
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.errors[0]?.message ?? 'Rewritten DBML failed to parse',
    }
  }
  return { ok: true, text: next }
}

interface GroupBlock {
  /** Index of the `T` of the `TableGroup` keyword. */
  headerStart: number
  /** Index of the opening `{`. */
  braceOpen: number
  /** Index of the matching closing `}`. */
  braceClose: number
}

/** Find the matching `}` for the `{` at openIdx, skipping strings/comments. */
function matchBrace(text: string, openIdx: number): number {
  let depth = 0
  let i = openIdx
  while (i < text.length) {
    if (text.startsWith("'''", i)) {
      const end = text.indexOf("'''", i + 3)
      i = end === -1 ? text.length : end + 3
      continue
    }
    const ch = text[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < text.length && (text[j] !== ch || text[j - 1] === '\\')) j++
      i = j + 1
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

/** Locate the TableGroup block (bare or quoted name) in raw text. */
function findGroupBlock(text: string, name: string): GroupBlock | null {
  const headerRe =
    /(?:^|\n)[ \t]*TableGroup\s+("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_.]*)\s*(?:\[[^\]]*\])?\s*\{/g
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(text)) !== null) {
    const raw = m[1]
    const candidate = raw.startsWith('"') ? raw.slice(1, -1) : raw
    if (candidate !== name) continue
    const headerStart = m.index + m[0].indexOf('TableGroup')
    const braceOpen = m.index + m[0].length - 1
    const braceClose = matchBrace(text, braceOpen)
    if (braceClose === -1) return null
    return { headerStart, braceOpen, braceClose }
  }
  return null
}

/** Append a new empty TableGroup at the end of the document. */
export function createGroup(text: string, name: string): GroupOpResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Group name is empty' }
  if (findGroupBlock(text, trimmed)) {
    return { ok: false, error: `TableGroup '${trimmed}' already exists` }
  }
  const block = `TableGroup ${quoteName(trimmed)} {\n}\n`
  const base = text.trim().length === 0 ? '' : text.replace(/\n*$/, '\n\n')
  return guarded(base + block)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/entities/dbml/lib/groupOps.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/entities/dbml/lib/groupOps.ts frontend/src/entities/dbml/lib/groupOps.test.ts
git commit -m "feat(dbml): createGroup — surgical TableGroup append with parse guard (ADR-0011)"
```

### Task 2: deleteGroup + renameGroup

**Files:**
- Modify: `frontend/src/entities/dbml/lib/groupOps.ts` (함수 추가)
- Test: `frontend/src/entities/dbml/lib/groupOps.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
import { createGroup, deleteGroup, renameGroup } from './groupOps'

const GROUPED = `Table users {
  id integer [pk]
}

Table posts {
  id integer [pk]
}

// keep me
TableGroup auth [color: #1570EF] {
  users
  Note: 'auth tables'
}

TableGroup content {
  posts
}
`

describe('deleteGroup', () => {
  it('removes only the named block; members become ungrouped; comments survive', () => {
    const r = deleteGroup(GROUPED, 'auth')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).not.toContain('TableGroup auth')
    expect(r.text).toContain('// keep me')
    expect(r.text).toContain('TableGroup content')
    const parsed = parseDbml(r.text)
    expect(parsed.ok && parsed.schema.tableGroups.map((g) => g.name)).toEqual(['content'])
  })

  it('errors when the group does not exist', () => {
    expect(deleteGroup(GROUPED, 'nope').ok).toBe(false)
  })
})

describe('renameGroup', () => {
  it('renames in place, preserving the color setting and body', () => {
    const r = renameGroup(GROUPED, 'auth', 'identity')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup identity [color: #1570EF] {')
    expect(r.text).toContain("Note: 'auth tables'")
  })

  it('quotes the new name when needed', () => {
    const r = renameGroup(GROUPED, 'auth', '인증')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup "인증" [color: #1570EF] {')
  })

  it('rejects renaming to an existing group name', () => {
    expect(renameGroup(GROUPED, 'auth', 'content').ok).toBe(false)
  })

  it('no-ops when the name is unchanged', () => {
    const r = renameGroup(GROUPED, 'auth', 'auth')
    expect(r.ok && r.text).toBe(GROUPED)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run 위와 동일. Expected: FAIL (`deleteGroup is not a function`)

- [ ] **Step 3: 구현 추가**

```ts
/** Remove the whole TableGroup block (its tables become ungrouped). */
export function deleteGroup(text: string, name: string): GroupOpResult {
  const block = findGroupBlock(text, name)
  if (!block) return { ok: false, error: `TableGroup '${name}' not found` }
  const lineStart = text.lastIndexOf('\n', block.headerStart - 1) + 1
  let end = block.braceClose + 1
  while (end < text.length && text[end] !== '\n') end++
  if (end < text.length) end++ // the closing-brace line's newline
  while (end < text.length && text[end] === '\n') end++ // blank lines after
  let out = text.slice(0, lineStart) + text.slice(end)
  out = out.replace(/\n+$/, '\n')
  return guarded(out)
}

/** Rename the group, preserving its settings and body untouched. */
export function renameGroup(
  text: string,
  oldName: string,
  newName: string,
): GroupOpResult {
  const trimmed = newName.trim()
  if (!trimmed) return { ok: false, error: 'Group name is empty' }
  if (trimmed === oldName) return { ok: true, text }
  const block = findGroupBlock(text, oldName)
  if (!block) return { ok: false, error: `TableGroup '${oldName}' not found` }
  if (findGroupBlock(text, trimmed)) {
    return { ok: false, error: `TableGroup '${trimmed}' already exists` }
  }
  const header = text.slice(block.headerStart, block.braceOpen)
  const newHeader = header.replace(
    /^(TableGroup\s+)("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_.]*)/,
    (_, kw: string) => `${kw}${quoteName(trimmed)}`,
  )
  return guarded(
    text.slice(0, block.headerStart) + newHeader + text.slice(block.braceOpen),
  )
}
```

- [ ] **Step 4: 통과 확인** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(dbml): deleteGroup + renameGroup surgical ops"`

### Task 3: setGroupColor

**Files:** 위와 동일 (함수/테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
import { setGroupColor } from './groupOps'

describe('setGroupColor', () => {
  it('adds [color: …] to a settings-less header', () => {
    const r = setGroupColor(GROUPED, 'content', '#EA4A8B')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup content [color: #EA4A8B] {')
    const parsed = parseDbml(r.text)
    expect(parsed.ok && parsed.schema.tableGroups.find((g) => g.name === 'content')?.color).toBe('#EA4A8B')
  })

  it('replaces an existing color value', () => {
    const r = setGroupColor(GROUPED, 'auth', '#B42318')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup auth [color: #B42318] {')
    expect(r.text).not.toContain('#1570EF')
  })

  it('color=null removes the setting and the empty brackets', () => {
    const r = setGroupColor(GROUPED, 'auth', null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup auth {')
    expect(r.text).not.toContain('[color')
  })

  it('color=null on a group with no settings is a no-op', () => {
    const r = setGroupColor(GROUPED, 'content', null)
    expect(r.ok && r.text).toBe(GROUPED)
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL
- [ ] **Step 3: 구현 추가**

```ts
/** Set ([color: #hex]) or clear (null) the group's color setting. */
export function setGroupColor(
  text: string,
  name: string,
  color: string | null,
): GroupOpResult {
  const block = findGroupBlock(text, name)
  if (!block) return { ok: false, error: `TableGroup '${name}' not found` }
  const header = text.slice(block.headerStart, block.braceOpen)
  const settings = /\[([^\]]*)\]/.exec(header)
  let newHeader: string
  if (color === null) {
    if (!settings) return { ok: true, text }
    const rest = settings[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !/^color\s*:/i.test(s))
    newHeader =
      rest.length === 0
        ? header.replace(/\s*\[[^\]]*\]/, '')
        : header.replace(/\[[^\]]*\]/, `[${rest.join(', ')}]`)
  } else if (settings) {
    newHeader = /color\s*:/i.test(settings[1])
      ? header.replace(/(color\s*:\s*)[^,\]]+/i, `$1${color}`)
      : header.replace(/\[/, `[color: ${color}, `)
  } else {
    newHeader = header.replace(/\s*$/, '') + ` [color: ${color}] `
  }
  return guarded(
    text.slice(0, block.headerStart) + newHeader + text.slice(block.braceOpen),
  )
}
```

- [ ] **Step 4: 통과 확인** — Expected: PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(dbml): setGroupColor surgical op"`

### Task 4: moveTableToGroup

**Files:** 위와 동일 (함수/테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
import { moveTableToGroup } from './groupOps'

/** Parse helper: schema of a valid doc (throws on invalid fixture). */
function schemaOf(text: string) {
  const p = parseDbml(text)
  if (!p.ok) throw new Error('fixture must parse')
  return p.schema
}

describe('moveTableToGroup', () => {
  it('ungrouped → group: inserts a member line with the block indentation', () => {
    const text = GROUPED.replace('TableGroup content {\n  posts\n}\n', 'TableGroup content {\n}\n')
    const r = moveTableToGroup(text, schemaOf(text), 'public.posts', 'content')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup content {\n  posts\n}')
  })

  it('group → group: removes from the old block and adds to the new', () => {
    const r = moveTableToGroup(GROUPED, schemaOf(GROUPED), 'public.users', 'content')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const parsed = parseDbml(r.text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.schema.tableGroups.find((g) => g.name === 'auth')?.tables).toEqual([])
    expect(parsed.schema.tableGroups.find((g) => g.name === 'content')?.tables)
      .toEqual(['public.posts', 'public.users'])
    expect(r.text).toContain("Note: 'auth tables'") // Note 줄 보존
  })

  it('group → Ungrouped(null): removes only', () => {
    const r = moveTableToGroup(GROUPED, schemaOf(GROUPED), 'public.users', null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const parsed = parseDbml(r.text)
    expect(parsed.ok && parsed.schema.tableGroups.find((g) => g.name === 'auth')?.tables).toEqual([])
  })

  it('no-op when already in the target group', () => {
    const r = moveTableToGroup(GROUPED, schemaOf(GROUPED), 'public.users', 'auth')
    expect(r.ok && r.text).toBe(GROUPED)
  })

  it('single-line block `{ posts }` gets rewritten multi-line on insert', () => {
    const text = `Table a { id int }\nTable b { id int }\nTableGroup g { a }\n`
    const r = moveTableToGroup(text, schemaOf(text), 'public.b', 'g')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup g {\n  a\n  b\n}')
  })

  it('non-public schema member is written qualified', () => {
    const text = `Table app.users { id int }\nTableGroup g {\n}\n`
    const r = moveTableToGroup(text, schemaOf(text), 'app.users', 'g')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('app.users')
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL
- [ ] **Step 3: 구현 추가**

```ts
/** `${schema}.${table}` id → member token written into a group body. */
function memberToken(tableId: string): string {
  const dot = tableId.indexOf('.')
  const schema = tableId.slice(0, dot)
  const table = tableId.slice(dot + 1)
  return schema === 'public'
    ? quoteName(table)
    : `${quoteName(schema)}.${quoteName(table)}`
}

/** Member line token → normalized `${schema}.${table}` id (null if not a member token). */
function tokenToId(token: string): string | null {
  const re =
    /^("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)(?:\.("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*))?$/
  const m = re.exec(token)
  if (!m) return null
  const unq = (s: string) => (s.startsWith('"') ? s.slice(1, -1) : s)
  return m[2] !== undefined
    ? `${unq(m[1])}.${unq(m[2])}`
    : `public.${unq(m[1])}`
}

function removeMember(text: string, group: string, tableId: string): GroupOpResult {
  const block = findGroupBlock(text, group)
  if (!block) return { ok: false, error: `TableGroup '${group}' not found` }
  const body = text.slice(block.braceOpen + 1, block.braceClose)
  const lines = body.split('\n')
  const idx = lines.findIndex(
    (line) => tokenToId(line.replace(/\/\/.*$/, '').trim()) === tableId,
  )
  if (idx === -1) {
    return { ok: false, error: `'${tableId}' is not a member of '${group}'` }
  }
  lines.splice(idx, 1)
  return {
    ok: true,
    text:
      text.slice(0, block.braceOpen + 1) +
      lines.join('\n') +
      text.slice(block.braceClose),
  }
}

function addMember(text: string, group: string, tableId: string): GroupOpResult {
  const block = findGroupBlock(text, group)
  if (!block) return { ok: false, error: `TableGroup '${group}' not found` }
  const body = text.slice(block.braceOpen + 1, block.braceClose)
  const indentMatch = /\n([ \t]+)\S/.exec('\n' + body)
  const indent = indentMatch ? indentMatch[1] : '  '
  const token = memberToken(tableId)
  let newBody: string
  if (!body.includes('\n')) {
    // Single-line `{ }` / `{ a }` → rewrite the body multi-line.
    const existing = body.trim().length > 0 ? body.trim().split(/\s+/) : []
    newBody =
      '\n' + [...existing, token].map((l) => indent + l).join('\n') + '\n'
  } else {
    const closeLineStart = body.lastIndexOf('\n') + 1
    newBody =
      body.slice(0, closeLineStart) +
      indent +
      token +
      '\n' +
      body.slice(closeLineStart)
  }
  return {
    ok: true,
    text:
      text.slice(0, block.braceOpen + 1) + newBody + text.slice(block.braceClose),
  }
}

/**
 * Move a table between groups. toGroup === null → just remove (Ungrouped).
 * The schema (current parse) tells which group currently holds the table.
 */
export function moveTableToGroup(
  text: string,
  schema: DbmlSchema,
  tableId: string,
  toGroup: string | null,
): GroupOpResult {
  const fromGroup =
    schema.tableGroups.find((g) => g.tables.includes(tableId))?.name ?? null
  if (fromGroup === toGroup) return { ok: true, text }
  let out = text
  if (fromGroup !== null) {
    const removed = removeMember(out, fromGroup, tableId)
    if (!removed.ok) return removed
    out = removed.text
  }
  if (toGroup !== null) {
    const added = addMember(out, toGroup, tableId)
    if (!added.ok) return added
    out = added.text
  }
  return guarded(out)
}
```

- [ ] **Step 4: 통과 확인** — Expected: PASS (전체 groupOps 스위트)
- [ ] **Step 5: Commit** — `git commit -m "feat(dbml): moveTableToGroup surgical op (remove+add, parse-guarded)"`

### Task 5: entities/dbml 공개 export

**Files:**
- Modify: `frontend/src/entities/dbml/index.ts`

- [ ] **Step 1: export 추가** (기존 export 목록 아래)

```ts
export {
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  moveTableToGroup,
} from './lib/groupOps'
export type { GroupOpResult } from './lib/groupOps'
```

- [ ] **Step 2: 검증** — `docker compose -p codegram exec -T frontend npx tsc --noEmit` → 에러 0; entities 테스트 전체 PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(dbml): export TableGroup surgical ops"`

---

## Track B — widgets/erd-info-panel: 패널 UI

> Track B는 콜백(`GroupOpHandlers`)만 호출한다. groupOps 구현과 독립 — mock으로 테스트.

### Task 6: GroupOpHandlers 타입 + GroupSection 분리 + 접기/펼치기

**Files:**
- Create: `frontend/src/widgets/erd-info-panel/model/types.ts`
- Create: `frontend/src/widgets/erd-info-panel/ui/GroupSection.tsx`
- Test: `frontend/src/widgets/erd-info-panel/ui/GroupSection.test.tsx`
- Modify: `frontend/src/widgets/erd-info-panel/ui/ErdInfoPanel.tsx` (그룹 렌더를 GroupSection으로 위임 + collapsed state)
- Modify: `frontend/src/widgets/erd-info-panel/index.ts` (GroupOpHandlers 재export)

`model/types.ts`:

```ts
/** Semantic group-mutation callbacks the page wires to entities/dbml groupOps. */
export interface GroupOpHandlers {
  onCreateGroup: (name: string) => void
  onRenameGroup: (oldName: string, newName: string) => void
  onDeleteGroup: (name: string) => void
  onSetGroupColor: (name: string, color: string | null) => void
  /** toGroup === null → Ungrouped로 이동(그룹에서 제거) */
  onMoveTable: (tableId: string, toGroup: string | null) => void
}
```

- [ ] **Step 1: 실패하는 테스트 작성** (`GroupSection.test.tsx`) — 핵심 동작: 접기 토글로 행 숨김/표시, Ungrouped는 헤더 ⋯ 메뉴 없음. (픽스처는 ErdInfoPanel.test.tsx의 `baseSchema` 스타일을 따라 `DisplayGroup`을 직접 구성)

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupSection } from './GroupSection'
import type { DisplayGroup } from '@/entities/erd'

const usersTable = {
  id: 'public.users', name: 'users', schema: 'public',
  columns: [{ id: 'public.users.id', name: 'id', type: 'integer', pk: true, notNull: true, unique: false, increment: false, isFk: false }],
}
const group: DisplayGroup = {
  key: 'auth', label: 'auth', color: '#1570EF', glyph: '{ }', tables: [usersTable],
}
const handlers = {
  onCreateGroup: vi.fn(), onRenameGroup: vi.fn(), onDeleteGroup: vi.fn(),
  onSetGroupColor: vi.fn(), onMoveTable: vi.fn(),
}
const base = {
  group, groupNames: ['auth', 'content'], selected: null,
  onSelect: () => {}, collapsed: false, onToggleCollapse: vi.fn(),
  groupOps: handlers, mutationsEnabled: true,
}

describe('GroupSection — collapse', () => {
  it('shows rows when expanded, hides them when collapsed', () => {
    const { rerender } = render(<GroupSection {...base} />)
    expect(screen.getByTestId('tablelist-row-users')).toBeTruthy()
    rerender(<GroupSection {...base} collapsed={true} />)
    expect(screen.queryByTestId('tablelist-row-users')).toBeNull()
  })

  it('clicking the toggle calls onToggleCollapse', () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-toggle-auth'))
    expect(base.onToggleCollapse).toHaveBeenCalled()
  })

  it('Ungrouped section renders no group menu', () => {
    const ungrouped: DisplayGroup = { ...group, key: '__ungrouped', label: 'Ungrouped' }
    render(<GroupSection {...base} group={ungrouped} />)
    expect(screen.queryByTestId('group-menu-__ungrouped')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `docker compose -p codegram exec -T frontend npm run test -- --run src/widgets/erd-info-panel` → FAIL
- [ ] **Step 3: 구현** — `GroupSection.tsx`: 기존 ErdInfoPanel의 그룹 섹션 JSX(섹션 라벨 + 행 map)를 그대로 옮기고 추가: 라벨 왼쪽에 chevron 버튼(`data-testid={'group-toggle-' + group.key}`, lucide `ChevronDown`/`ChevronRight`, 클릭 → `onToggleCollapse()`), `collapsed`면 행 렌더 생략. 시그니처:

```tsx
export interface GroupSectionProps {
  group: DisplayGroup
  /** 모든 명명 그룹 이름 (Move to 대상 목록). */
  groupNames: string[]
  selected: string | null
  onSelect: (tableName: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  groupOps?: GroupOpHandlers
  mutationsEnabled: boolean
}
```

ErdInfoPanel은 `const [collapsed, setCollapsed] = useState<Set<string>>(new Set())`를 들고 각 GroupSection에 `collapsed={collapsed.has(g.key)}`/`onToggleCollapse`(Set 토글)를 내려준다. 기존 props(schema/selected/onSelect/dialect)는 불변, 신규 props `groupOps?`/`mutationsEnabled?`(기본 true)를 GroupSection에 중계. **기존 data-testid 전부 보존** (`tablelist-row-${name}` 등 — 기존 테스트가 깨지면 안 됨).
참고: `DisplayGroup` 타입이 `@/entities/erd` index에서 re-export되지 않았다면 `frontend/src/entities/erd/index.ts`에 `export type { DisplayGroup } from './lib/tableGroups'` 추가.

- [ ] **Step 4: 통과 확인** — 신규 + 기존 ErdInfoPanel 테스트 모두 PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(info-panel): GroupSection split + collapse/expand (session-only state)"`

### Task 7: + New group 인라인 입력

**Files:**
- Modify: `frontend/src/widgets/erd-info-panel/ui/ErdInfoPanel.tsx`
- Test: `frontend/src/widgets/erd-info-panel/ui/ErdInfoPanel.test.tsx` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```tsx
describe('ErdInfoPanel — create group', () => {
  const handlers = {
    onCreateGroup: vi.fn(), onRenameGroup: vi.fn(), onDeleteGroup: vi.fn(),
    onSetGroupColor: vi.fn(), onMoveTable: vi.fn(),
  }

  it('+ button reveals an inline input; Enter commits a valid name', () => {
    render(<ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} groupOps={handlers} mutationsEnabled />)
    fireEvent.click(screen.getByTestId('group-create-button'))
    const input = screen.getByTestId('group-create-input')
    fireEvent.change(input, { target: { value: 'auth' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handlers.onCreateGroup).toHaveBeenCalledWith('auth')
  })

  it('duplicate name shows an inline error and does not call back', () => {
    render(<ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} groupOps={handlers} mutationsEnabled />)
    fireEvent.click(screen.getByTestId('group-create-button'))
    const input = screen.getByTestId('group-create-input')
    fireEvent.change(input, { target: { value: 'core' } }) // baseSchema의 기존 그룹
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByTestId('group-create-error')).toBeTruthy()
    expect(handlers.onCreateGroup).not.toHaveBeenCalledWith('core')
  })

  it('+ button is disabled while mutations are disabled', () => {
    render(<ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} groupOps={handlers} mutationsEnabled={false} />)
    expect((screen.getByTestId('group-create-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders no + button without groupOps (read-only mode)', () => {
    render(<ErdInfoPanel schema={baseSchema} selected={null} onSelect={() => {}} />)
    expect(screen.queryByTestId('group-create-button')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 'Table names' PanelHead에 + 버튼(`data-testid="group-create-button"`, lucide `Plus`, `disabled={!mutationsEnabled}`, `title={mutationsEnabled ? 'New group' : 'Fix DBML errors first'}`). 클릭 → 리스트 맨 위 인라인 입력행(`group-create-input`): Enter → trim 후 비어있지 않고 `schema.tableGroups.some(g => g.name === v)` 아닐 때 `groupOps.onCreateGroup(v)` + 입력 닫기; 중복/공백이면 `group-create-error` 표시. Esc → 닫기.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(info-panel): inline create-group input (+ invalid-DBML disable)"`

### Task 8: 그룹 헤더 ⋯ 메뉴 — 색상 스와치 / Rename / Delete

**Files:**
- Modify: `frontend/src/widgets/erd-info-panel/ui/GroupSection.tsx`
- Test: `frontend/src/widgets/erd-info-panel/ui/GroupSection.test.tsx` (describe 추가)

색상 프리셋 (GroupSection.tsx에 export — 앞 5색은 디자인 팔레트와 동일):

```ts
export const GROUP_COLOR_PRESETS = [
  '#6938EF', '#1570EF', '#0E9384', '#DC6803', '#B42318',
  '#EA4A8B', '#099250', '#E04F16', '#7839EE', '#475467',
] as const
```

- [ ] **Step 1: 실패하는 테스트 추가** (radix 메뉴: trigger 클릭 후 `await screen.findByText(...)` 패턴 — 기존 `shared/ui/dropdown-menu.test.tsx` 참고)

```tsx
describe('GroupSection — group menu', () => {
  it('clicking a color swatch calls onSetGroupColor with the hex', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-menu-auth'))
    const swatch = await screen.findByTestId('swatch-#EA4A8B')
    fireEvent.click(swatch)
    expect(handlers.onSetGroupColor).toHaveBeenCalledWith('auth', '#EA4A8B')
  })

  it('Default color calls onSetGroupColor(name, null)', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-menu-auth'))
    fireEvent.click(await screen.findByText('Default color'))
    expect(handlers.onSetGroupColor).toHaveBeenCalledWith('auth', null)
  })

  it('Delete calls onDeleteGroup', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-menu-auth'))
    fireEvent.click(await screen.findByText('Delete'))
    expect(handlers.onDeleteGroup).toHaveBeenCalledWith('auth')
  })

  it('Rename switches the label to an input; Enter commits', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('group-menu-auth'))
    fireEvent.click(await screen.findByText('Rename'))
    const input = screen.getByTestId('group-rename-input')
    fireEvent.change(input, { target: { value: 'identity' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handlers.onRenameGroup).toHaveBeenCalledWith('auth', 'identity')
  })

  it('menu trigger is disabled while mutations are disabled', () => {
    render(<GroupSection {...base} mutationsEnabled={false} />)
    expect((screen.getByTestId('group-menu-auth') as HTMLButtonElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 명명 그룹 헤더 우측에 ⋯ 트리거(`data-testid={'group-menu-' + group.key}`, lucide `MoreHorizontal`, `disabled={!mutationsEnabled}`). `DropdownMenuContent`(shared/ui) 구성:

```tsx
<DropdownMenuLabel>Color</DropdownMenuLabel>
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 10px', maxWidth: 150 }}>
  {GROUP_COLOR_PRESETS.map((c) => (
    <button
      key={c}
      data-testid={`swatch-${c}`}
      aria-label={`Set color ${c}`}
      onClick={() => groupOps?.onSetGroupColor(group.label, c)}
      style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: '1px solid var(--erd-border)', cursor: 'pointer' }}
    />
  ))}
</div>
<DropdownMenuItem onClick={() => groupOps?.onSetGroupColor(group.label, null)}>Default color</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
<DropdownMenuItem onClick={() => groupOps?.onDeleteGroup(group.label)}>Delete</DropdownMenuItem>
```

Rename 상태: `renaming`이면 라벨 자리에 input(`group-rename-input`, 초기값 group.label) — Enter: trim 비어있지 않으면 `onRenameGroup(group.label, v)` + 종료, Esc: 취소.

- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(info-panel): group menu — color swatches, rename, delete"`

### Task 9: 테이블 행 Move to… 메뉴

**Files:**
- Modify: `frontend/src/widgets/erd-info-panel/ui/GroupSection.tsx`
- Test: `frontend/src/widgets/erd-info-panel/ui/GroupSection.test.tsx` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

```tsx
describe('GroupSection — move menu', () => {
  it('lists other groups + Ungrouped; clicking calls onMoveTable', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('table-move-users'))
    fireEvent.click(await screen.findByText('content'))
    expect(handlers.onMoveTable).toHaveBeenCalledWith('public.users', 'content')
  })

  it('Ungrouped target passes null', async () => {
    render(<GroupSection {...base} />)
    fireEvent.click(screen.getByTestId('table-move-users'))
    fireEvent.click(await screen.findByText('Ungrouped'))
    expect(handlers.onMoveTable).toHaveBeenCalledWith('public.users', null)
  })

  it('a table already in Ungrouped gets no Ungrouped item', async () => {
    const ungrouped: DisplayGroup = { ...group, key: '__ungrouped', label: 'Ungrouped' }
    render(<GroupSection {...base} group={ungrouped} />)
    fireEvent.click(screen.getByTestId('table-move-users'))
    await screen.findByText('auth') // 메뉴 열림 대기
    expect(screen.queryByText('Move to')).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Ungrouped' })).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 각 테이블 행 우측(필드 수 옆)에 ⋯ 트리거(`data-testid={'table-move-' + table.name}`, `disabled={!mutationsEnabled}`, 행 onClick(select)과 이벤트 충돌 방지 위해 `onClick={(e) => e.stopPropagation()}` 트리거 래핑). 메뉴:

```tsx
const currentGroup = group.key === '__ungrouped' ? null : group.label
…
<DropdownMenuLabel>Move to</DropdownMenuLabel>
{groupNames.filter((n) => n !== currentGroup).map((n) => (
  <DropdownMenuItem key={n} onClick={() => groupOps?.onMoveTable(table.id, n)}>{n}</DropdownMenuItem>
))}
{currentGroup !== null && (
  <DropdownMenuItem onClick={() => groupOps?.onMoveTable(table.id, null)}>Ungrouped</DropdownMenuItem>
)}
```

- [ ] **Step 4: 통과 확인** → PASS (widgets 스위트 전체)
- [ ] **Step 5: Commit** — `git commit -m "feat(info-panel): per-table Move to… menu (groups + Ungrouped)"`

---

## Track C — pages/editor: 통합

### Task 10: Info 오프캔버스 (push) — Track A/B와 병렬 가능

**Files:**
- Modify: `frontend/src/pages/editor/index.tsx`

- [ ] **Step 1: 구현** — `EditorPage`에:

```tsx
// Info 버튼이 토글하는 우측 패널 표시 상태 (세션 메모리만, 기본 보임).
const [panelOpen, setPanelOpen] = useState(true)
```

`<ErdTopBar …>`에 `onInfo={() => setPanelOpen((o) => !o)}` 추가. 3-zone grid div를:

```tsx
<div
  style={{
    display: 'grid',
    gridTemplateColumns: `340px 1fr ${panelOpen ? '316px' : '0px'}`,
    transition: 'grid-template-columns 200ms ease',
    flex: 1,
    minHeight: 0,
  }}
>
```

우측 컬럼 div: `overflow: 'hidden'` 추가, `borderLeft: panelOpen ? '1px solid var(--erd-border)' : 'none'`, 내부에 `width: 316` 고정 래퍼(접히는 동안 내용 찌그러짐 방지):

```tsx
<div data-testid="info-panel-column" style={{ background: 'var(--erd-surface)', borderLeft: panelOpen ? '1px solid var(--erd-border)' : 'none', overflow: 'hidden', minHeight: 0 }}>
  <div style={{ width: 316, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <ErdInfoPanel … />
  </div>
</div>
```

- [ ] **Step 2: 검증** — `tsc --noEmit` 0 에러. 동작 검증은 Task 12 E2E에서.
- [ ] **Step 3: Commit** — `git commit -m "feat(editor): Info button toggles right panel as push offcanvas"`

### Task 11: groupOps 배선 + Invalid 가드 + 에러 스트립 (A+B 완료 후)

**Files:**
- Modify: `frontend/src/pages/editor/index.tsx`

- [ ] **Step 1: 구현**

```tsx
import {
  createGroup, renameGroup, deleteGroup, setGroupColor, moveTableToGroup,
  type GroupOpResult,
} from '@/entities/dbml'
import type { GroupOpHandlers } from '@/widgets/erd-info-panel'

// EditorPage 본문:
const mutationsEnabled = parse.status === 'success' && !!parse.schema
const [groupOpError, setGroupOpError] = useState<string | null>(null)

function runGroupOp(result: GroupOpResult) {
  if (result.ok) {
    setDbmlText(result.text)
    setGroupOpError(null)
  } else {
    setGroupOpError(result.error)
  }
}

const groupOps: GroupOpHandlers = {
  onCreateGroup: (name) => runGroupOp(createGroup(dbmlText, name)),
  onRenameGroup: (oldName, newName) => runGroupOp(renameGroup(dbmlText, oldName, newName)),
  onDeleteGroup: (name) => runGroupOp(deleteGroup(dbmlText, name)),
  onSetGroupColor: (name, color) => runGroupOp(setGroupColor(dbmlText, name, color)),
  onMoveTable: (tableId, toGroup) => {
    if (!parse.schema) return
    runGroupOp(moveTableToGroup(dbmlText, parse.schema, tableId, toGroup))
  },
}
```

패널 컬럼 내부, ErdInfoPanel 위에 에러 스트립:

```tsx
{groupOpError && (
  <div role="alert" data-testid="group-op-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, color: 'var(--erd-error)', borderBottom: '1px solid var(--erd-border)' }}>
    <span style={{ flex: 1 }}>{groupOpError}</span>
    <button aria-label="dismiss" onClick={() => setGroupOpError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
  </div>
)}
<ErdInfoPanel schema={schema} selected={selected} onSelect={setSelected} dialect={dialect} groupOps={groupOps} mutationsEnabled={mutationsEnabled} />
```

- [ ] **Step 2: 검증** — `tsc --noEmit` + frontend 유닛 전체 PASS
- [ ] **Step 3: Commit** — `git commit -m "feat(editor): wire panel group ops to surgical DBML rewrites (invalid-gated)"`

### Task 12: E2E — 패널 조작 → DBML/캔버스 반영 + 오프캔버스

**Files:**
- Create: `frontend/e2e/table-groups.spec.ts`

- [ ] **Step 1: 스펙 작성** — `editor-erd.spec.ts`의 registerAndLogin/프로젝트 생성 패턴 복사. 시나리오(한 test로 직렬 — 상태 공유):

```ts
// 1) DBML 입력: Table users / Table posts (각 id integer [pk])
// 2) group-create-button → 'auth' Enter
//    → editor text(.cm-content)에 'TableGroup auth {' 포함 (expect.poll)
// 3) table-move-users → menu 'auth' 클릭
//    → /TableGroup auth \{[^}]*users/s 매치
// 4) group-menu-auth → swatch-#EA4A8B 클릭 → '[color: #EA4A8B]' 포함
// 5) group-toggle-auth 클릭 → tablelist-row-users 안 보임; 다시 클릭 → 보임
// 6) group-menu-auth → Rename → 'core' Enter → 'TableGroup core' 포함
// 7) group-menu-core → Delete → 'TableGroup' 미포함, tablelist-row-users는 Ungrouped 섹션에 존재
// 8) TopBar 'Info' 클릭 → schema-summary-grid 비가시(toBeHidden) → 再클릭 → 가시
```

에디터 텍스트 읽기: `await page.getByTestId('dbml-editor').locator('.cm-content').textContent()`. 패널 클릭 전 `expect.poll`로 파스 settle(Valid 배지 `text=Valid` visible) 대기 — Invalid 동안 버튼이 disabled이므로 누르기 전 반드시 대기.

- [ ] **Step 2: 실행** — docker 스택 가동 상태에서, frontend/에 임시 config(`baseURL: 'http://localhost:4001'`, `webServer.command: 'true'`, `reuseExistingServer: true`)로:
`npx playwright test e2e/table-groups.spec.ts --config=<임시 config>` → PASS
(주의: 로컬 `npm run dev`는 @fontsource 미설치로 불가 — 반드시 docker 서버 재사용)
- [ ] **Step 3: Commit** — `git commit -m "test(e2e): table-group panel ops reflect into DBML + offcanvas toggle"`

### Task 13: 최종 검증

- [ ] frontend 유닛 전체: `docker compose -p codegram exec -T frontend npm run test -- --run` → 전부 PASS (기존 353 + 신규)
- [ ] `npx tsc --noEmit` → 0 에러
- [ ] E2E `table-groups.spec.ts` PASS
- [ ] 수동 스모크: :4001에서 생성→이동→색→접기→rename→delete→Info 토글 확인 (스크린샷)
- [ ] 임시 파일(임시 playwright config 등) 정리 후 잔여 변경 커밋

---

## Self-Review 결과

- 스펙 커버리지: 생성(T1,T7), 이동/빼기/Ungrouped(T4,T9), 접기(T6), 색상(T3,T8), 에디터 즉시 반영(T11 — setDbmlText 단일 경로), Info 오프캔버스(T10), Invalid 가드(T7/T8/T9 disabled + T11 gate + groupOps 내 guard) — 전부 task 존재.
- 타입 일관성: `GroupOpResult`/`GroupOpHandlers`/`GroupSectionProps` 시그니처가 T1·T5·T6·T11에서 동일.
- 알려진 리스크: radix DropdownMenu jsdom 인터랙션(기존 dropdown-menu.test.tsx 패턴 따를 것), `DisplayGroup` re-export 누락 가능(T6에 처리 명시).
