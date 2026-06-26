import { describe, it, expect } from 'vitest'
import { parseDbml } from '@/entities/dbml'
import { computeSyncedPositions } from './placeNewTables'

function schemaOf(dbml: string) {
  const r = parseDbml(dbml)
  if (!r.ok) throw new Error('parse failed: ' + JSON.stringify(r.errors))
  return r.schema
}

const A_B = `Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}`
const A_ONLY = `Table a {\n  id int [pk]\n}`
const A_B_C = `Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}\nTable c {\n  id int [pk]\n}`

describe('computeSyncedPositions', () => {
  it('keeps surviving table positions unchanged', () => {
    const current = { 'public.a': { x: 10, y: 20 }, 'public.b': { x: 300, y: 40 } }
    const out = computeSyncedPositions(current, schemaOf(A_B))
    expect(out['public.a']).toEqual({ x: 10, y: 20 })
    expect(out['public.b']).toEqual({ x: 300, y: 40 })
  })

  it('prunes removed tables from the result', () => {
    const current = { 'public.a': { x: 0, y: 0 }, 'public.b': { x: 300, y: 0 } }
    const out = computeSyncedPositions(current, schemaOf(A_ONLY))
    expect(out['public.a']).toEqual({ x: 0, y: 0 })
    expect(out['public.b']).toBeUndefined()
  })

  it('places a new table below the existing bounding box, leaving existing positions intact', () => {
    const current = { 'public.a': { x: 0, y: 0 } }
    const out = computeSyncedPositions(current, schemaOf(A_B))
    expect(out['public.a']).toEqual({ x: 0, y: 0 })
    expect(out['public.b']).toBeDefined()
    expect(out['public.b'].y).toBeGreaterThanOrEqual(66 + 80)
  })

  it('returns empty when there are no existing positions (all new -> reconcile dagre handles it)', () => {
    const out = computeSyncedPositions({}, schemaOf(A_B))
    expect(out).toEqual({})
  })

  it('places multiple new tables (sub-layout) all below the existing box', () => {
    const current = { 'public.a': { x: 0, y: 0 } }
    const out = computeSyncedPositions(current, schemaOf(A_B_C))
    expect(out['public.b'].y).toBeGreaterThanOrEqual(66 + 80)
    expect(out['public.c'].y).toBeGreaterThanOrEqual(66 + 80)
  })

  // Grouped survivors: a preserved group keeps its members' relative frame and
  // the group box position, instead of scrambling them to absolute (the bug the
  // merge-sync change fixes).
  const GROUPED_A_B = `Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}\nTableGroup g [color: #1570EF] {\n  a\n  b\n}`
  const GROUPED_A_B_NEW = `${GROUPED_A_B}\nTable c {\n  id int [pk]\n}`

  it('preserves a grouped member verbatim (relative coords + parentId)', () => {
    const current = {
      'group:g': { x: 500, y: 500 },
      'public.a': { x: 12, y: 20, parentId: 'group:g' },
      'public.b': { x: 12, y: 120, parentId: 'group:g' },
    }
    const out = computeSyncedPositions(current, schemaOf(GROUPED_A_B))
    expect(out['public.a']).toEqual({ x: 12, y: 20, parentId: 'group:g' })
    expect(out['public.b']).toEqual({ x: 12, y: 120, parentId: 'group:g' })
    expect(out['group:g']).toEqual({ x: 500, y: 500 })
  })

  it('places a new table below grouped members using ABSOLUTE positions', () => {
    const current = {
      'group:g': { x: 500, y: 500 },
      'public.a': { x: 12, y: 20, parentId: 'group:g' },
      'public.b': { x: 12, y: 120, parentId: 'group:g' },
    }
    const out = computeSyncedPositions(current, schemaOf(GROUPED_A_B_NEW))
    // member b absolute bottom = 500 + 120 + 66 = 686; new c must sit below + gap.
    expect(out['public.c']).toBeDefined()
    expect(out['public.c'].parentId).toBeUndefined()
    expect(out['public.c'].y).toBeGreaterThanOrEqual(686 + 80)
  })
})
