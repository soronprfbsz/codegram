import { describe, it, expect } from 'vitest'
import { parseDbml } from './parse'
import { createGroup, deleteGroup, renameGroup, setGroupColor, moveTableToGroup } from './groupOps'
import type { DbmlSchema } from '../model/types'

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
    expect(r.text).toContain('TableGroup "auth" {\n}')
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
    expect(r.text).toBe('TableGroup "g" {\n}\n')
  })
})

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
    expect(r.text).toContain('TableGroup "identity" [color: #1570EF] {')
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

  it('finds a block whose Note string ends with an escaped backslash', () => {
    const text = `Table a { id int }\nTableGroup g {\n  a\n  Note: 'path\\\\'\n}\n`
    const r = setGroupColor(text, 'g', '#1570EF')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('TableGroup g [color: #1570EF] {')
  })
})

/** Parse helper: schema of a valid doc (throws on invalid fixture). */
function schemaOf(text: string): DbmlSchema {
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
    expect(r.text).toContain('TableGroup content {\n  "posts"\n}')
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
    // The existing bare member is preserved verbatim; the new one is quoted.
    expect(r.text).toContain('TableGroup g {\n  a\n  "b"\n}')
  })

  it('non-public schema member is written qualified', () => {
    const text = `Table app.users { id int }\nTableGroup g {\n}\n`
    const r = moveTableToGroup(text, schemaOf(text), 'app.users', 'g')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.text).toContain('"app"."users"')
  })
})

import { moveTablesToGroup } from './groupOps'

const MULTI = `Table a { id int }
Table b { id int }
Table c { id int }

TableGroup g1 {
  a
}

TableGroup g2 {
  b
}
`

describe('moveTablesToGroup (bulk)', () => {
  it('moves several tables (from different groups + ungrouped) into one group', () => {
    // a(g1), b(g2), c(ungrouped) → g2
    const r = moveTablesToGroup(MULTI, schemaOf(MULTI), ['public.a', 'public.b', 'public.c'], 'g2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = parseDbml(r.text)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.schema.tableGroups.find((g) => g.name === 'g1')?.tables).toEqual([])
    expect(p.schema.tableGroups.find((g) => g.name === 'g2')?.tables).toEqual([
      'public.b',
      'public.a',
      'public.c',
    ])
  })

  it('moves several tables to Ungrouped (null)', () => {
    const r = moveTablesToGroup(MULTI, schemaOf(MULTI), ['public.a', 'public.b'], null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = parseDbml(r.text)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    expect(p.schema.tableGroups.find((g) => g.name === 'g1')?.tables).toEqual([])
    expect(p.schema.tableGroups.find((g) => g.name === 'g2')?.tables).toEqual([])
  })

  it('skips tables already in the target group', () => {
    // b is already in g2; a moves in. Result g2 = [b, a].
    const r = moveTablesToGroup(MULTI, schemaOf(MULTI), ['public.a', 'public.b'], 'g2')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = parseDbml(r.text)
    expect(p.ok && p.schema.tableGroups.find((g) => g.name === 'g2')?.tables).toEqual([
      'public.b',
      'public.a',
    ])
  })

  it('empty id list is a no-op (returns valid text)', () => {
    const r = moveTablesToGroup(MULTI, schemaOf(MULTI), [], 'g1')
    expect(r.ok && r.text).toBe(MULTI)
  })
})
