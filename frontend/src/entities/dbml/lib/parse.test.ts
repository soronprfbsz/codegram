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

  // A PK referenced BY other tables must NOT be flagged as a FK (only the
  // referencing child column is the FK).
  it('does not flag a referenced PK as a FK (only the referencing column is)', () => {
    const schema = parseOk(`
      Table organization {
        id integer [pk]
        name varchar
      }
      Table users {
        id integer [pk]
        org_id integer [ref: > organization.id]
      }
    `)
    const orgId = schema.tables
      .find((t) => t.name === 'organization')!
      .columns.find((c) => c.name === 'id')!
    expect(orgId.pk).toBe(true)
    expect(orgId.isFk).toBe(false) // referenced PK, NOT a FK

    const fk = schema.tables
      .find((t) => t.name === 'users')!
      .columns.find((c) => c.name === 'org_id')!
    expect(fk.isFk).toBe(true)
  })

  it('flags the FK side regardless of operator direction (<)', () => {
    const schema = parseOk(`
      Table a { id integer [pk] }
      Table b {
        id integer [pk]
        a_id integer
      }
      Ref: a.id < b.a_id
    `)
    const aId = schema.tables.find((t) => t.name === 'a')!.columns[0]
    const aFk = schema.tables
      .find((t) => t.name === 'b')!
      .columns.find((c) => c.name === 'a_id')!
    expect(aId.isFk).toBe(false)
    expect(aFk.isFk).toBe(true)
  })
})

describe('parseDbml — table CHECK constraints', () => {
  it('maps named and unnamed checks from a Checks block', () => {
    const schema = parseOk(`
      Table failed_auth_attempts {
        attempt_id integer [pk]
        http_status integer
        retries integer
        Checks {
          \`http_status >= 100 AND http_status <= 599\` [name: 'fa_status_chk']
          \`retries >= 0\`
        }
      }
    `)
    const t = schema.tables[0]
    expect(t.checks).toHaveLength(2)
    expect(t.checks[0]).toEqual({
      expression: 'http_status >= 100 AND http_status <= 599',
      name: 'fa_status_chk',
    })
    expect(t.checks[1]).toEqual({ expression: 'retries >= 0', name: undefined })
  })

  it('gives a table with no checks an empty checks array', () => {
    const schema = parseOk(`Table t { id integer [pk] }`)
    expect(schema.tables[0].checks).toEqual([])
  })
})

describe('parseDbml — primary keys via index blocks', () => {
  it('marks a single-column PK declared in an indexes block', () => {
    const schema = parseOk(`
      Table failed_auth_attempts {
        attempt_id integer
        ip varchar
        indexes {
          attempt_id [pk]
        }
      }
    `)
    const cols = schema.tables[0].columns
    expect(cols.find((c) => c.name === 'attempt_id')!.pk).toBe(true)
    expect(cols.find((c) => c.name === 'ip')!.pk).toBe(false)
  })

  it('marks every column of a composite PK declared in an indexes block', () => {
    const schema = parseOk(`
      Table membership {
        user_id integer
        group_id integer
        joined_at timestamp
        indexes {
          (user_id, group_id) [pk]
        }
      }
    `)
    const cols = schema.tables[0].columns
    expect(cols.find((c) => c.name === 'user_id')!.pk).toBe(true)
    expect(cols.find((c) => c.name === 'group_id')!.pk).toBe(true)
    expect(cols.find((c) => c.name === 'joined_at')!.pk).toBe(false)
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
    // Members are qualified `schema.table` keys matching DbmlTable.id.
    expect(group.tables.sort()).toEqual(['public.posts', 'public.users'])
    const ids = schema.tables.map((t) => t.id).sort()
    expect(group.tables.sort()).toEqual(ids)
  })

  it('qualifies members so same-named tables in different schemas stay distinct', () => {
    const schema = parseOk(`
      Table public.users {
        id integer [pk]
      }
      Table audit.users {
        id integer [pk]
      }
      TableGroup core {
        public.users
        audit.users
      }
    `)
    const group = schema.tableGroups[0]
    // Without schema qualification both would collapse to "users"; the keys
    // must match each table's unique id.
    expect(group.tables.sort()).toEqual(['audit.users', 'public.users'])
    const ids = schema.tables.map((t) => t.id).sort()
    expect(group.tables.sort()).toEqual(ids)
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
