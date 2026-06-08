import { describe, it, expect } from 'vitest'
import { deriveTableDoc } from './deriveTableDoc'
import type {
  DbmlSchema,
  DbmlTable,
  DbmlColumn,
  DbmlRef,
  DbmlRelation,
  DbmlEnum,
} from '@/entities/dbml'

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
  return { id: `${schema}.${name}`, name, schema, columns, ...over }
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

function enumType(
  schema: string,
  name: string,
  values: { name: string; note?: string }[],
  over: Partial<DbmlEnum> = {},
): DbmlEnum {
  return { name, schema, values, ...over }
}

function emptySchema(over: Partial<DbmlSchema> = {}): DbmlSchema {
  return { tables: [], refs: [], enums: [], tableGroups: [], notes: [], ...over }
}

// --- tests ------------------------------------------------------------------

describe('deriveTableDoc — standard columns', () => {
  it('maps one table with all standard columns and id/schema/name', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true, notNull: true }),
          col('public', 'users', 'email', {
            type: 'varchar',
            unique: true,
            notNull: true,
          }),
        ]),
      ],
    })
    const model = deriveTableDoc(schema)
    expect(model.tables).toHaveLength(1)
    const t = model.tables[0]
    expect(t.id).toBe('public.users')
    expect(t.schema).toBe('public')
    expect(t.name).toBe('users')
    expect(t.columns.map((c) => c.name)).toEqual(['id', 'email'])
  })

  it('maps PK / NN / UNIQUE / type flags per column', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true, notNull: true }),
          col('public', 'users', 'email', {
            type: 'varchar',
            unique: true,
            notNull: true,
          }),
        ]),
      ],
    })
    const cols = deriveTableDoc(schema).tables[0].columns
    expect(cols[0]).toMatchObject({ name: 'id', type: 'integer', pk: true, notNull: true, unique: false })
    expect(cols[1]).toMatchObject({ name: 'email', type: 'varchar', pk: false, notNull: true, unique: true })
  })

  it("coalesces absent default / note / table-note to ''", () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true }),
          col('public', 'users', 'role', {
            type: 'varchar',
            default: "'guest'",
            note: 'user role',
          }),
        ]),
      ],
    })
    const t = deriveTableDoc(schema).tables[0]
    expect(t.note).toBe('')
    expect(t.columns[0].default).toBe('')
    expect(t.columns[0].note).toBe('')
    expect(t.columns[1].default).toBe("'guest'")
    expect(t.columns[1].note).toBe('user role')
  })

  it('carries the table-level note when present', () => {
    const schema = emptySchema({
      tables: [
        table(
          'public',
          'users',
          [col('public', 'users', 'id', { pk: true })],
          { note: 'application users' },
        ),
      ],
    })
    expect(deriveTableDoc(schema).tables[0].note).toBe('application users')
  })
})

describe('deriveTableDoc — FK derivation by relation (NOT by endpoint order)', () => {
  it('n-1 ref: the FROM endpoint holds the FK', () => {
    // posts.user_id (n) -> users.id (1):  relation n-1, FROM = FK side
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [
          col('public', 'posts', 'id', { pk: true }),
          col('public', 'posts', 'user_id', { type: 'integer' }),
        ]),
      ],
      refs: [ref('posts', ['user_id'], 'users', ['id'], 'n-1')],
    })
    const model = deriveTableDoc(schema)
    const posts = model.tables.find((t) => t.name === 'posts')!
    const users = model.tables.find((t) => t.name === 'users')!

    // posts.user_id is the FK column; posts.id is not.
    expect(posts.columns.find((c) => c.name === 'user_id')!.fk).toBe(true)
    expect(posts.columns.find((c) => c.name === 'id')!.fk).toBe(false)
    // users holds no FK (it is the PK/target side).
    expect(users.columns.find((c) => c.name === 'id')!.fk).toBe(false)

    // posts gets one fkTarget pointing at users.id; users gets none.
    expect(posts.fkTargets).toEqual([
      { columns: ['user_id'], targetTable: 'users', targetSchema: 'public', targetColumns: ['id'] },
    ])
    expect(users.fkTargets).toEqual([])
  })

  it('REVERSED 1-n ref: the TO endpoint holds the FK (fromTable is the PK side)', () => {
    // Endpoints parsed reversed: from = users.id (1), to = posts.user_id (n).
    // relation 1-n => the TO side (posts.user_id) holds the FK.
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [
          col('public', 'posts', 'id', { pk: true }),
          col('public', 'posts', 'user_id', { type: 'integer' }),
        ]),
      ],
      refs: [ref('users', ['id'], 'posts', ['user_id'], '1-n')],
    })
    const model = deriveTableDoc(schema)
    const posts = model.tables.find((t) => t.name === 'posts')!
    const users = model.tables.find((t) => t.name === 'users')!

    // FK lives on posts.user_id (the TO endpoint), NOT on users (the FROM endpoint).
    expect(posts.columns.find((c) => c.name === 'user_id')!.fk).toBe(true)
    expect(users.columns.find((c) => c.name === 'id')!.fk).toBe(false)

    // The fkTarget is attached to posts and points back at users.id.
    expect(posts.fkTargets).toEqual([
      { columns: ['user_id'], targetTable: 'users', targetSchema: 'public', targetColumns: ['id'] },
    ])
    expect(users.fkTargets).toEqual([])
  })

  it('1-1 / n-n refs mark BOTH endpoints as FK-holding', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [
          col('public', 'users', 'id', { pk: true }),
          col('public', 'users', 'profile_id', { type: 'integer' }),
        ]),
        table('public', 'profiles', [
          col('public', 'profiles', 'id', { pk: true }),
          col('public', 'profiles', 'user_id', { type: 'integer' }),
        ]),
      ],
      refs: [ref('users', ['profile_id'], 'profiles', ['id'], '1-1')],
    })
    const model = deriveTableDoc(schema)
    const users = model.tables.find((t) => t.name === 'users')!
    const profiles = model.tables.find((t) => t.name === 'profiles')!

    expect(users.columns.find((c) => c.name === 'profile_id')!.fk).toBe(true)
    expect(profiles.columns.find((c) => c.name === 'id')!.fk).toBe(true)
    // Both sides emit an fkTarget pointing at the other endpoint.
    expect(users.fkTargets).toEqual([
      { columns: ['profile_id'], targetTable: 'profiles', targetSchema: 'public', targetColumns: ['id'] },
    ])
    expect(profiles.fkTargets).toEqual([
      { columns: ['id'], targetTable: 'users', targetSchema: 'public', targetColumns: ['profile_id'] },
    ])
  })

  it('composite (multi-column) FK zips columns/targetColumns by index', () => {
    // order_items.(order_id, product_id) (n) -> stock.(order_id, product_id) (1)
    const schema = emptySchema({
      tables: [
        table('public', 'stock', [
          col('public', 'stock', 'order_id', { pk: true }),
          col('public', 'stock', 'product_id', { pk: true }),
        ]),
        table('public', 'order_items', [
          col('public', 'order_items', 'id', { pk: true }),
          col('public', 'order_items', 'order_id', { type: 'integer' }),
          col('public', 'order_items', 'product_id', { type: 'integer' }),
        ]),
      ],
      refs: [
        ref('order_items', ['order_id', 'product_id'], 'stock', ['order_id', 'product_id'], 'n-1'),
      ],
    })
    const model = deriveTableDoc(schema)
    const items = model.tables.find((t) => t.name === 'order_items')!

    expect(items.columns.find((c) => c.name === 'order_id')!.fk).toBe(true)
    expect(items.columns.find((c) => c.name === 'product_id')!.fk).toBe(true)
    expect(items.columns.find((c) => c.name === 'id')!.fk).toBe(false)
    expect(items.fkTargets).toEqual([
      {
        columns: ['order_id', 'product_id'],
        targetTable: 'stock',
        targetSchema: 'public',
        targetColumns: ['order_id', 'product_id'],
      },
    ])
  })

  it('marks a column that is BOTH pk and fk (flags are independent)', () => {
    // tenants.id is both the PK of tenants AND the FK side of a ref to orgs.
    const schema = emptySchema({
      tables: [
        table('public', 'orgs', [col('public', 'orgs', 'id', { pk: true })]),
        table('public', 'tenants', [
          col('public', 'tenants', 'id', { pk: true }),
        ]),
      ],
      refs: [ref('tenants', ['id'], 'orgs', ['id'], 'n-1')],
    })
    const model = deriveTableDoc(schema)
    const tenants = model.tables.find((t) => t.name === 'tenants')!
    const idCol = tenants.columns.find((c) => c.name === 'id')!

    // pk comes from the column; fk comes from the ref-derived set — both true.
    expect(idCol.pk).toBe(true)
    expect(idCol.fk).toBe(true)
  })

  it('dedupes the fk flag but emits one fkTarget per ref for a shared column', () => {
    // posts.author_id is the FK side of TWO refs (to users and to admins).
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'admins', [col('public', 'admins', 'id', { pk: true })]),
        table('public', 'posts', [
          col('public', 'posts', 'id', { pk: true }),
          col('public', 'posts', 'author_id', { type: 'integer' }),
        ]),
      ],
      refs: [
        ref('posts', ['author_id'], 'users', ['id'], 'n-1'),
        ref('posts', ['author_id'], 'admins', ['id'], 'n-1'),
      ],
    })
    const model = deriveTableDoc(schema)
    const posts = model.tables.find((t) => t.name === 'posts')!

    // A single fk flag on the shared column...
    expect(posts.columns.find((c) => c.name === 'author_id')!.fk).toBe(true)
    // ...but one fkTarget entry per ref (no dedupe of targets).
    expect(posts.fkTargets).toEqual([
      { columns: ['author_id'], targetTable: 'users', targetSchema: 'public', targetColumns: ['id'] },
      { columns: ['author_id'], targetTable: 'admins', targetSchema: 'public', targetColumns: ['id'] },
    ])
  })
})

describe('deriveTableDoc — enums and empty schema', () => {
  it('maps the enum list with values and note coalescing', () => {
    const schema = emptySchema({
      enums: [
        enumType(
          'public',
          'order_status',
          [
            { name: 'pending', note: 'awaiting payment' },
            { name: 'shipped' },
          ],
          { note: 'order lifecycle' },
        ),
      ],
    })
    const model = deriveTableDoc(schema)
    expect(model.enums).toHaveLength(1)
    const e = model.enums[0]
    expect(e).toMatchObject({
      id: 'public.order_status',
      schema: 'public',
      name: 'order_status',
      note: 'order lifecycle',
    })
    expect(e.values).toEqual([
      { name: 'pending', note: 'awaiting payment' },
      { name: 'shipped', note: '' },
    ])
  })

  it('returns empty tables and enums for an empty schema', () => {
    expect(deriveTableDoc(emptySchema())).toEqual({ tables: [], enums: [] })
  })
})
