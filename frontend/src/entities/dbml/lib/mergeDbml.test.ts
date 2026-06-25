import { describe, it, expect } from 'vitest'
import { mergeDbml } from './mergeDbml'
import { parseDbml } from './parse'

/** Parse helper: assert ok and return the schema for assertions. */
function schema(dbml: string) {
  const r = parseDbml(dbml)
  if (!r.ok) throw new Error('test DBML failed to parse: ' + JSON.stringify(r.errors))
  return r.schema
}

const CURRENT = `Table users {
  id int [pk]
  org_id int
  Note: 'users note'
}

Table orgs {
  id int [pk]
}

Table legacy {
  id int [pk]
}

Ref: users.org_id > orgs.id

TableGroup auth [color: #1570EF] {
  users
  orgs
  legacy
}

Note sticky {
  'keep me'
}
`

// Live DB: legacy dropped, devices added, users gains an email column.
const INCOMING = `Table users {
  id int [pk]
  org_id int
  email varchar
}

Table orgs {
  id int [pk]
}

Table devices {
  id int [pk]
}

Ref: users.org_id > orgs.id
`

describe('mergeDbml', () => {
  it('adds new tables from the live DB (devices)', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    expect(merged.tables.map((t) => t.name).sort()).toContain('devices')
  })

  it('removes tables dropped from the live DB (legacy)', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    expect(merged.tables.map((t) => t.name)).not.toContain('legacy')
  })

  it('updates existing-table columns from the live DB (users gains email)', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    const users = merged.tables.find((t) => t.name === 'users')!
    expect(users.columns.map((c) => c.name)).toContain('email')
  })

  it('preserves the table group, dropping members removed from the DB', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    expect(merged.tableGroups).toHaveLength(1)
    const auth = merged.tableGroups[0]
    expect(auth.name).toBe('auth')
    expect(auth.color).toBe('#1570EF')
    // legacy was dropped from the DB → no longer a member; users/orgs remain.
    const members = auth.tables.map((id) => id.split('.').pop())
    expect(members.sort()).toEqual(['orgs', 'users'])
  })

  it('preserves the standalone sticky note', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    expect(merged.notes.map((n) => n.name)).toContain('sticky')
  })

  it('preserves a table-level note on a surviving table', () => {
    const merged = schema(mergeDbml(CURRENT, INCOMING, ['public']))
    const users = merged.tables.find((t) => t.name === 'users')!
    expect(users.note).toBe('users note')
  })

  it('falls back to incoming when current DBML is unparseable', () => {
    const merged = mergeDbml('this is :: not valid dbml {{{', INCOMING, ['public'])
    expect(schema(merged).tables.map((t) => t.name).sort()).toEqual([
      'devices',
      'orgs',
      'users',
    ])
    // no group survives an unparseable current
    expect(schema(merged).tableGroups).toHaveLength(0)
  })

  it('drops a group entirely when all its members were removed', () => {
    const current = `Table gone_a { id int [pk] }
Table gone_b { id int [pk] }
TableGroup ghosts [color: #B42318] {
  gone_a
  gone_b
}
`
    const incoming = `Table survivor { id int [pk] }`
    const merged = schema(mergeDbml(current, incoming, ['public']))
    expect(merged.tableGroups).toHaveLength(0)
  })
})

const CURRENT_MULTI = `Table "public"."users" {
  id int [pk]
}

Table "sales"."orders" {
  id int [pk]
  user_id int
}

Ref: "sales"."orders".user_id > "public"."users".id
`

// Re-sync ONLY public: incoming carries just the public schema.
const INCOMING_PUBLIC = `Table "public"."users" {
  id int [pk]
  email varchar
}

Table "public"."accounts" {
  id int [pk]
}
`

describe('mergeDbml multi-schema', () => {
  it('preserves tables of schemas not being synced', () => {
    const merged = schema(mergeDbml(CURRENT_MULTI, INCOMING_PUBLIC, ['public']))
    const ids = merged.tables.map((t) => t.id).sort()
    expect(ids).toContain('sales.orders') // preserved (not synced)
    expect(ids).toContain('public.users') // updated from DB
    expect(ids).toContain('public.accounts') // added from DB
  })

  it('still drops tables removed from a synced schema', () => {
    const merged = schema(mergeDbml(CURRENT_MULTI, INCOMING_PUBLIC, ['public']))
    // public had only `users`; nothing public was dropped here, but a public
    // table absent from incoming must not survive:
    const current2 = CURRENT_MULTI + '\nTable "public"."stale" {\n  id int [pk]\n}\n'
    const merged2 = schema(mergeDbml(current2, INCOMING_PUBLIC, ['public']))
    expect(merged2.tables.map((t) => t.id)).not.toContain('public.stale')
    expect(merged2.tables.map((t) => t.id)).toContain('sales.orders')
  })
})
