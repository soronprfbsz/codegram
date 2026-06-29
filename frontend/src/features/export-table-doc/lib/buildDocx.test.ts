import { describe, it, expect } from 'vitest'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocLabels } from './labels'

const LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
  fks: 'FK 제약', fkName: 'FK명', fkColumns: '컬럼', fkRefTable: '참조 테이블', fkRefColumns: '참조 컬럼',
}

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
}

const empty: TableDocModel = { tables: [], enums: [] }

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
