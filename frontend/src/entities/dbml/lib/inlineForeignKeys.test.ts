import { describe, it, expect } from 'vitest'
import { inlineForeignKeys } from './inlineForeignKeys'
import { parseDbml } from './parse'
import type { DbmlRef } from '../model/types'

/** Normalize a ref into an order-independent endpoint-pair key. */
function refKey(r: DbmlRef): string {
  const a = `${r.fromSchema}.${r.fromTable}.(${[...r.fromColumns].sort().join(',')})`
  const b = `${r.toSchema}.${r.toTable}.(${[...r.toColumns].sort().join(',')})`
  return [a, b].sort().join(' <-> ')
}
const relSet = (dbml: string) => {
  const p = parseDbml(dbml)
  if (!p.ok) throw new Error('parse failed')
  return new Set(p.schema.refs.map(refKey))
}

const ORG = `Table "core"."organizations" {
  "id" UUID [pk]
}
`
const LDAP = `Table "core"."ldap_configs" {
  "id" UUID [pk]
  "org_id" UUID [not null]
}
`

describe('inlineForeignKeys', () => {
  it('inlines a single-column `<` ref onto the FK column with `>`', () => {
    const dbml =
      ORG + LDAP + `Ref "ldap_configs_org_id_fkey":"core"."organizations"."id" < "core"."ldap_configs"."org_id"\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('"org_id" UUID [not null, ref: > "core"."organizations"."id"]')
    expect(out).not.toContain('Ref "ldap_configs_org_id_fkey"')
    // The relationship is preserved (same endpoint pair) and still parses.
    expect(relSet(out)).toEqual(relSet(dbml))
  })

  it('adds a fresh [ref: …] when the FK column has no settings', () => {
    const dbml =
      ORG +
      `Table "core"."t" {\n  "x" UUID\n}\n` +
      `Ref:"core"."organizations"."id" < "core"."t"."x"\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('"x" UUID [ref: > "core"."organizations"."id"]')
  })

  it('keeps composite FKs as a top-level Ref (inline cannot express them)', () => {
    const dbml =
      `Table "core"."tenants" {\n  "id" UUID\n  "org_id" UUID\n}\n` +
      `Table "core"."users" {\n  "tenant_id" UUID\n  "org_id" UUID\n}\n` +
      `Ref "u_fk":"core"."tenants".("id", "org_id") < "core"."users".("tenant_id", "org_id")\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('Ref "u_fk":"core"."tenants".("id", "org_id")')
    expect(out).not.toContain('ref: >')
  })

  it('keeps FKs carrying delete/update actions as a top-level Ref', () => {
    const dbml =
      `Table "core"."users" {\n  "id" UUID [pk]\n}\n` +
      `Table "core"."sessions" {\n  "user_id" UUID\n}\n` +
      `Ref "s_fk":"core"."users"."id" < "core"."sessions"."user_id" [delete: cascade]\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('[delete: cascade]')
    expect(out).not.toContain('ref: >')
    expect(out).toContain('Ref "s_fk"')
  })

  it('handles the `>` operator (FK on the left endpoint)', () => {
    const dbml =
      ORG +
      `Table "core"."t" {\n  "org_id" UUID\n}\n` +
      `Ref:"core"."t"."org_id" > "core"."organizations"."id"\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('"org_id" UUID [ref: > "core"."organizations"."id"]')
  })

  it('inlines 2-part (no-schema) endpoints, preserving their 2-part target', () => {
    // MariaDB / unschemed introspection emits `"table"."col"` (no schema).
    const dbml =
      `Table "department" {\n  "department_id" BIGINT [pk]\n}\n` +
      `Table "code" {\n  "code_type_id" BIGINT\n}\n` +
      `Ref "fk_code_type":"department"."department_id" < "code"."code_type_id"\n`
    const out = inlineForeignKeys(dbml)
    expect(out).toContain('"code_type_id" BIGINT [ref: > "department"."department_id"]')
    expect(out).not.toContain('Ref "fk_code_type"')
    expect(out).not.toContain('"public".') // arity preserved, no spurious schema
    expect(relSet(out)).toEqual(relSet(dbml))
  })

  it('returns the input unchanged when there are no convertible refs', () => {
    const dbml = ORG + LDAP
    expect(inlineForeignKeys(dbml)).toBe(dbml)
  })

  it('does not confuse a nested Indexes column with a table column', () => {
    const dbml =
      ORG +
      `Table "core"."ldap_configs" {\n` +
      `  "id" UUID [pk]\n` +
      `  "org_id" UUID\n` +
      `\n` +
      `  Indexes {\n` +
      `    org_id [name: "idx_org"]\n` +
      `  }\n` +
      `}\n` +
      `Ref:"core"."organizations"."id" < "core"."ldap_configs"."org_id"\n`
    const out = inlineForeignKeys(dbml)
    // Only the real column line gets the inline ref, not the index entry.
    expect(out).toContain('"org_id" UUID [ref: > "core"."organizations"."id"]')
    expect(out).toContain('org_id [name: "idx_org"]')
    expect(relSet(out)).toEqual(relSet(dbml))
  })
})
