import { describe, it, expect } from 'vitest'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocDocxBlob } from './buildDocx'
import { TABLE_DOC_LABELS as LABELS } from './labels.fixture'

const full: TableDocModel = {
  tables: [
    {
      id: 'public.users', schema: 'public', name: 'users', note: 'app users',
      columns: [{ name: 'id', type: 'int', pk: true, fk: false, notNull: true, unique: false, default: '', note: 'pk' }],
      fkTargets: [{ name: 'fk_users_org_id', columns: ['org_id'], targetSchema: 'public', targetTable: 'orgs', targetColumns: ['id'] }],
      checks: [{ name: 'c', values: ['a', 'b'], expression: "kind IN ('a','b')" }],
    },
  ],
  enums: [{ id: 'public.role', schema: 'public', name: 'role', note: '', values: [{ name: 'admin', note: '' }] }],
  groups: [],
}

const empty: TableDocModel = { tables: [], enums: [], groups: [] }

describe('buildTableDocDocxBlob', () => {
  it('produces a non-empty .docx Blob for a full model (tables, checks, enums)', async () => {
    const blob = await buildTableDocDocxBlob(full, LABELS)
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toContain('word')
  })

  it('does not throw on an empty model', async () => {
    const blob = await buildTableDocDocxBlob(empty, LABELS)
    expect(blob.size).toBeGreaterThan(0)
  })
})
