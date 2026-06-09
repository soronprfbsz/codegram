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
})
