import { describe, it, expect } from 'vitest'
import { previewSyncChanges } from './mergeDbml'

const CORE_PROJECT = `Table "core"."users" {
  id uuid [pk]
}
Table "core"."orgs" {
  id uuid [pk]
}
`

describe('previewSyncChanges', () => {
  it('additive case: syncing public into a core-only project adds public, keeps core, removes nothing', () => {
    const incoming = `Table "public"."accounts" {
  id uuid [pk]
}
Table "public"."sessions" {
  id uuid [pk]
}
`
    const p = previewSyncChanges(CORE_PROJECT, incoming, ['public'])
    expect(p.added).toBe(2)
    expect(p.removedTables).toEqual([])
    expect(p.preservedSchemas).toEqual(['core'])
  })

  it('removal case: a synced-schema table absent from the live DB is reported as removed (by qualified name)', () => {
    const current = `Table "public"."a" { id int [pk] }
Table "public"."b" { id int [pk] }
`
    const incoming = `Table "public"."a" { id int [pk] }`
    const p = previewSyncChanges(current, incoming, ['public'])
    expect(p.added).toBe(0)
    expect(p.removedTables).toEqual(['public.b'])
    expect(p.preservedSchemas).toEqual([])
  })

  it('mixed: counts only the synced schema; non-synced schema is preserved, not removed', () => {
    const current = `Table "public"."x" { id int [pk] }
Table "sales"."y" { id int [pk] }
`
    const incoming = `Table "public"."x" { id int [pk] }
Table "public"."z" { id int [pk] }
`
    const p = previewSyncChanges(current, incoming, ['public'])
    expect(p.added).toBe(1) // public.z
    expect(p.removedTables).toEqual([]) // public.x still present; sales.y not synced
    expect(p.preservedSchemas).toEqual(['sales'])
  })

  it('falls back to an empty (no-op) preview when a side is unparseable', () => {
    const p = previewSyncChanges('this is :: not valid {{{', `Table "public"."a" { id int [pk] }`, [
      'public',
    ])
    expect(p).toEqual({ added: 0, removedTables: [], preservedSchemas: [] })
  })
})
