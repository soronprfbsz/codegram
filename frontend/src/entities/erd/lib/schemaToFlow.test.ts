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
    checks: [],
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

describe('schemaToFlow — edge de-dup', () => {
  it('collapses duplicate column-pair edges (single FK + same pair inside a composite)', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'tenants', [
          col('public', 'tenants', 'id', { pk: true }),
          col('public', 'tenants', 'org_id'),
        ]),
        table('public', 'users', [
          col('public', 'users', 'tenant_id', { isFk: true }),
          col('public', 'users', 'org_id', { isFk: true }),
        ]),
      ],
      refs: [
        // single FK: tenants.id < users.tenant_id (same pair as the composite #0)
        ref('tenants', ['id'], 'users', ['tenant_id'], '1-n'),
        // composite FK: id→tenant_id (DUP) + org_id→org_id (unique)
        ref('tenants', ['id', 'org_id'], 'users', ['tenant_id', 'org_id'], '1-n'),
      ],
    })
    const { edges } = schemaToFlow(schema)
    const rel = edges.filter((e) => e.type === 'relation')
    // 3 raw edges (single, composite#0, composite#1) → 2 after de-dup.
    expect(rel).toHaveLength(2)
    const pairs = rel.map((e) => `${e.sourceHandle}>${e.targetHandle}`).sort()
    expect(pairs).toEqual([
      'public.tenants.id>public.users.tenant_id',
      'public.tenants.org_id>public.users.org_id',
    ])
  })
})

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

  it('table node data carries no group styling (group identity lives on the group box)', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id')]),
      ],
      tableGroups: [
        { name: 'core', color: '#6938EF', tables: ['public.users'] },
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const usersData = nodes.find((n) => n.id === 'public.users')!.data as TableNodeData
    expect('groupColor' in usersData).toBe(false)
    expect('groupGlyph' in usersData).toBe(false)
  })

  it('propagates color onto group node data', () => {
    const schema = emptySchema({
      tables: [],
      tableGroups: [{ name: 'core', color: '#6938EF', tables: [] }],
    })
    const { nodes } = schemaToFlow(schema)
    const groupData = nodes.find((n) => n.type === 'group')!.data as {
      groupName: string
      color?: string
    }
    expect(groupData.color).toBe('#6938EF')
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
    // 그룹 노드는 라벨(.erd-group-handle)로만 드래그된다.
    expect(groupNode!.dragHandle).toBe('.erd-group-handle')
    expect(groupNode!.selectable).toBe(false)

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

describe('schemaToFlow — synthesized enum from enum-style CHECK', () => {
  it('creates an enum node + dashed link from a `col = ANY(ARRAY[...])` check', () => {
    const schema = emptySchema({
      tables: [
        table(
          'core',
          'failed_auth_attempts',
          [
            col('core', 'failed_auth_attempts', 'attempt_id', { pk: true }),
            col('core', 'failed_auth_attempts', 'failure_reason', { type: 'TEXT' }),
          ],
          {
            checks: [
              {
                name: 'fa_reason_chk',
                expression:
                  "failure_reason = ANY (ARRAY['invalid_credentials'::text, 'user_disabled'::text])",
              },
            ],
          },
        ),
      ],
    })
    const { nodes, edges } = schemaToFlow(schema)
    const enumNode = nodes.find((n) => n.id === 'enum:check:core.failed_auth_attempts.failure_reason')
    expect(enumNode).toBeDefined()
    expect(enumNode!.type).toBe('enum')
    expect((enumNode!.data as { values: string[] }).values).toEqual([
      'invalid_credentials',
      'user_disabled',
    ])
    const link = edges.find(
      (e) => (e.data as RelationEdgeData | undefined)?.isEnumLink && e.target === enumNode!.id,
    )
    expect(link).toBeDefined()
    expect(link!.source).toBe('core.failed_auth_attempts')
    expect(link!.sourceHandle).toBe('core.failed_auth_attempts.failure_reason')
  })

  it('is a TOP-LEVEL node tagged with its owner table id (not a group member)', () => {
    const schema = emptySchema({
      tables: [
        table('core', 'fa', [col('core', 'fa', 'reason', { type: 'TEXT' })], {
          checks: [{ name: 'c', expression: "reason IN ('a', 'b')" }],
        }),
      ],
      // Even when the owner table is grouped, the synthesized enum stays top-level
      // (layout parks it beside the table) — see placeSatelliteEnums.
      tableGroups: [{ name: 'auth', color: '#1570EF', tables: ['core.fa'] }],
    })
    const { nodes } = schemaToFlow(schema)
    const enumNode = nodes.find((n) => n.id === 'enum:check:core.fa.reason')!
    expect(enumNode.parentId).toBeUndefined()
    expect((enumNode.data as { ownerTableId?: string }).ownerTableId).toBe('core.fa')
  })

  it('skips non-enum checks (numeric range) — no synthesized enum node', () => {
    const schema = emptySchema({
      tables: [
        table('public', 't', [col('public', 't', 'n')], {
          checks: [{ name: 't_n_chk', expression: 'n >= 0 AND n <= 9' }],
        }),
      ],
    })
    const { nodes } = schemaToFlow(schema)
    expect(nodes.some((n) => n.type === 'enum')).toBe(false)
  })
})

describe('schemaToFlow — empty + counts', () => {
  it('returns empty arrays for an empty schema', () => {
    const { nodes, edges } = schemaToFlow(emptySchema())
    expect(nodes).toEqual([])
    expect(edges).toEqual([])
  })
})

describe('schemaToFlow — duplicate names get distinct node ids', () => {
  it('two notes named TODO produce nodes with DISTINCT ids (no collision)', () => {
    const schema = emptySchema({
      notes: [
        { name: 'TODO', content: 'first' },
        { name: 'TODO', content: 'second' },
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const sticky = nodes.filter((n) => n.type === 'sticky')
    expect(sticky).toHaveLength(2)
    const ids = sticky.map((n) => n.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('two same-named groups and two same-named enums get distinct ids; no global id collision', () => {
    const schema = emptySchema({
      tableGroups: [
        { name: 'core', tables: [] },
        { name: 'core', tables: [] },
      ],
      enums: [
        { name: 'role', schema: 'public', values: [{ name: 'a' }] },
        { name: 'role', schema: 'public', values: [{ name: 'b' }] },
      ],
    })
    const { nodes } = schemaToFlow(schema)
    const ids = nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nodes.filter((n) => n.type === 'group')).toHaveLength(2)
    expect(nodes.filter((n) => n.type === 'enum')).toHaveLength(2)
  })
})

describe('schemaToFlow — dangling refs are dropped', () => {
  it('a ref pointing at a missing table produces NO edge, while a valid ref still emits its edge', () => {
    const schema = emptySchema({
      tables: [
        table('public', 'users', [col('public', 'users', 'id', { pk: true })]),
        table('public', 'posts', [
          col('public', 'posts', 'user_id', { isFk: true }),
        ]),
      ],
      refs: [
        // dangling: 'ghost' table does not exist
        ref('users', ['id'], 'ghost', ['user_id'], '1-n'),
        // valid
        ref('users', ['id'], 'posts', ['user_id'], '1-n'),
      ],
    })
    const { edges } = schemaToFlow(schema)
    expect(edges).toHaveLength(1)
    const e = edges[0]
    expect(e.source).toBe('public.users')
    expect(e.target).toBe('public.posts')
  })
})
