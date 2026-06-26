import { describe, it, expect } from 'vitest'
import { deriveDisplayGroups } from './tableGroups'
import type { DbmlSchema } from '@/entities/dbml'

// Minimal helpers to build schema fixtures.
function makeTable(id: string, name: string, schema = 'public') {
  return {
    id,
    name,
    schema,
    columns: [],
  } as import('@/entities/dbml').DbmlTable
}

const EMPTY_SCHEMA: DbmlSchema = {
  tables: [],
  refs: [],
  enums: [],
  tableGroups: [],
  notes: [],
}

describe('deriveDisplayGroups', () => {
  it('returns an empty array for an empty schema', () => {
    expect(deriveDisplayGroups(EMPTY_SCHEMA)).toEqual([])
  })

  it('all tables ungrouped → single __ungrouped bucket', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [makeTable('public.users', 'users'), makeTable('public.posts', 'posts')],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('__ungrouped')
    expect(groups[0].label).toBe('Ungrouped')
    expect(groups[0].tables.map((t) => t.name)).toEqual(['users', 'posts'])
  })

  it('2 named groups + ungrouped tables → 3 buckets, ungrouped last', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [
        makeTable('public.users', 'users'),
        makeTable('public.orders', 'orders'),
        makeTable('public.audit', 'audit'), // ungrouped
      ],
      tableGroups: [
        { name: 'core', tables: ['public.users'], color: undefined, note: undefined },
        { name: 'sales', tables: ['public.orders'], color: undefined, note: undefined },
      ],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups).toHaveLength(3)
    expect(groups[0].key).toBe('core')
    expect(groups[0].tables.map((t) => t.name)).toEqual(['users'])
    expect(groups[1].key).toBe('sales')
    expect(groups[1].tables.map((t) => t.name)).toEqual(['orders'])
    expect(groups[2].key).toBe('__ungrouped')
    expect(groups[2].tables.map((t) => t.name)).toEqual(['audit'])
  })

  it('no ungrouped tables → no __ungrouped bucket', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [makeTable('public.users', 'users'), makeTable('public.orders', 'orders')],
      tableGroups: [
        { name: 'g1', tables: ['public.users', 'public.orders'], color: undefined, note: undefined },
      ],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('g1')
    expect(groups.find((g) => g.key === '__ungrouped')).toBeUndefined()
  })

  it('color cycles from palette when group.color is undefined', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [
        makeTable('public.t1', 't1'),
        makeTable('public.t2', 't2'),
        makeTable('public.t3', 't3'),
      ],
      tableGroups: [
        { name: 'g0', tables: ['public.t1'], color: undefined, note: undefined },
        { name: 'g1', tables: ['public.t2'], color: undefined, note: undefined },
        { name: 'g2', tables: ['public.t3'], color: undefined, note: undefined },
      ],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups[0].color).toBe('var(--erd-group-common)') // index 0
    expect(groups[1].color).toBe('var(--erd-group-account)') // index 1
    expect(groups[2].color).toBe('var(--erd-group-customer)') // index 2
  })

  it('color palette wraps at 5 groups', () => {
    const tables = Array.from({ length: 6 }, (_, i) =>
      makeTable(`public.t${i}`, `t${i}`),
    )
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables,
      tableGroups: tables.map((t, i) => ({
        name: `g${i}`,
        tables: [t.id],
        color: undefined,
        note: undefined,
      })),
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups[5].color).toBe('var(--erd-group-common)') // index 5 wraps to 0
  })

  it('uses group.color override when set, ignoring the palette', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [makeTable('public.users', 'users')],
      tableGroups: [
        { name: 'custom', tables: ['public.users'], color: '#ABCDEF', note: undefined },
      ],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups[0].color).toBe('#ABCDEF')
  })

  it('tables with missing ids are silently dropped from group', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [makeTable('public.users', 'users')],
      tableGroups: [
        { name: 'g', tables: ['public.users', 'public.nonexistent'], color: undefined, note: undefined },
      ],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups[0].tables).toHaveLength(1)
    expect(groups[0].tables[0].name).toBe('users')
  })

  it('ungrouped color is var(--erd-text-3)', () => {
    const schema: DbmlSchema = {
      ...EMPTY_SCHEMA,
      tables: [makeTable('public.orphan', 'orphan')],
    }
    const groups = deriveDisplayGroups(schema)
    expect(groups[0].key).toBe('__ungrouped')
    expect(groups[0].color).toBe('var(--erd-text-3)')
  })
})
