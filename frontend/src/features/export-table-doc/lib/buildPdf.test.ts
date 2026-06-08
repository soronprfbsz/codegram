import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TableDocModel } from '@/entities/table-doc'

// A fake jsPDF doc: records text() calls and advances lastAutoTable.finalY
// each time the mocked autoTable runs, so section chaining is observable.
interface FakeDoc {
  text: ReturnType<typeof vi.fn>
  output: ReturnType<typeof vi.fn>
  lastAutoTable: { finalY: number }
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } }
}

let fakeDoc: FakeDoc
const jsPDFCtor = vi.fn(() => fakeDoc)
const autoTable = vi.fn((doc: FakeDoc) => {
  // Each table advances the cursor by a fixed amount so startY strictly grows.
  doc.lastAutoTable = { finalY: doc.lastAutoTable.finalY + 50 }
})

vi.mock('jspdf', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jsPDF: function (...args: any[]) {
    return (jsPDFCtor as any)(...args)
  },
}))
vi.mock('jspdf-autotable', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (...args: any[]) => (autoTable as any)(...args),
}))

import { buildTableDocPdfBlob } from './buildPdf'

const model: TableDocModel = {
  tables: [
    {
      id: 'public.users',
      schema: 'public',
      name: 'users',
      note: 'app users',
      columns: [
        {
          name: 'id',
          type: 'integer',
          pk: true,
          fk: false,
          notNull: true,
          unique: false,
          default: '',
          note: 'primary key',
        },
        {
          name: 'org_id',
          type: 'integer',
          pk: false,
          fk: true,
          notNull: true,
          unique: false,
          default: '',
          note: '',
        },
      ],
      fkTargets: [
        {
          columns: ['org_id'],
          targetTable: 'orgs',
          targetSchema: 'public',
          targetColumns: ['id'],
        },
      ],
    },
    {
      id: 'public.orgs',
      schema: 'public',
      name: 'orgs',
      note: '',
      columns: [
        {
          name: 'id',
          type: 'integer',
          pk: true,
          fk: false,
          notNull: true,
          unique: false,
          default: '',
          note: '',
        },
      ],
      fkTargets: [],
    },
  ],
  enums: [
    {
      id: 'public.role',
      schema: 'public',
      name: 'role',
      note: '',
      values: [{ name: 'admin', note: 'super user' }],
    },
  ],
}

describe('buildTableDocPdfBlob', () => {
  beforeEach(() => {
    fakeDoc = {
      text: vi.fn(),
      output: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
      lastAutoTable: { finalY: 10 },
      internal: {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
      },
    }
    jsPDFCtor.mockClear()
    autoTable.mockClear()
  })

  it('renders one column autoTable per table with the standard header', () => {
    buildTableDocPdfBlob(model)
    // 2 tables (column tables) + 1 FK table + 1 enum table = 4 autoTable calls.
    expect(autoTable).toHaveBeenCalledTimes(4)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstOpts = (autoTable.mock.calls as any)[0][1]
    expect(firstOpts.head).toEqual([
      ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
    ])
    expect(firstOpts.body).toEqual([
      ['id', 'integer', 'Y', '', 'Y', '', '', 'primary key'],
      ['org_id', 'integer', '', 'Y', 'Y', '', '', ''],
    ])
  })

  it('renders an FK autoTable for the table that has fkTargets', () => {
    buildTableDocPdfBlob(model)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fkOpts = (autoTable.mock.calls as any)[1][1]
    expect(fkOpts.head).toEqual([['컬럼', '참조']])
    // Target columns grouped under the target table.
    expect(fkOpts.body).toEqual([['org_id', 'public.orgs(id)']])
  })

  it('chains each section below the previous one (startY grows)', () => {
    buildTableDocPdfBlob(model)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startYs = (autoTable.mock.calls as any[]).map(
      (c: any) => c[1].startY as number,
    )
    for (let i = 1; i < startYs.length; i++) {
      expect(startYs[i]).toBeGreaterThan(startYs[i - 1])
    }
  })

  it('renders a final enum autoTable', () => {
    buildTableDocPdfBlob(model)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enumOpts = ((autoTable.mock.calls as any).at(-1) as any[])[1]
    expect(enumOpts.head).toEqual([['Enum', '값', '설명']])
    expect(enumOpts.body).toEqual([['public.role', 'admin', 'super user']])
  })

  it('returns the jsPDF blob output', () => {
    const blob = buildTableDocPdfBlob(model)
    expect(fakeDoc.output).toHaveBeenCalledWith('blob')
    expect(blob).toBeInstanceOf(Blob)
  })

  it('groups composite-FK target columns under the target table', () => {
    const compositeModel: TableDocModel = {
      tables: [
        {
          id: 'public.memberships',
          schema: 'public',
          name: 'memberships',
          note: '',
          columns: [],
          fkTargets: [
            {
              columns: ['org_id', 'user_id'],
              targetTable: 'org_users',
              targetSchema: 'public',
              targetColumns: ['org_id', 'user_id'],
            },
          ],
        },
      ],
      enums: [],
    }
    buildTableDocPdfBlob(compositeModel)
    // calls: column autoTable, FK autoTable, enum autoTable
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fkOpts = (autoTable.mock.calls as any)[1][1]
    expect(fkOpts.body).toEqual([
      ['org_id, user_id', 'public.org_users(org_id, user_id)'],
    ])
  })

  it('renders an empty body for a table with zero columns', () => {
    const emptyColsModel: TableDocModel = {
      tables: [
        {
          id: 'public.blank',
          schema: 'public',
          name: 'blank',
          note: '',
          columns: [],
          fkTargets: [],
        },
      ],
      enums: [],
    }
    buildTableDocPdfBlob(emptyColsModel)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colOpts = (autoTable.mock.calls as any)[0][1]
    expect(colOpts.body).toEqual([])
  })

  it('runs only the enum autoTable when there are zero tables', () => {
    const enumOnlyModel: TableDocModel = {
      tables: [],
      enums: [
        {
          id: 'public.role',
          schema: 'public',
          name: 'role',
          note: '',
          values: [{ name: 'admin', note: '' }],
        },
      ],
    }
    buildTableDocPdfBlob(enumOnlyModel)
    expect(autoTable).toHaveBeenCalledTimes(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enumOpts = (autoTable.mock.calls as any)[0][1]
    expect(enumOpts.head).toEqual([['Enum', '값', '설명']])
    expect(enumOpts.body).toEqual([['public.role', 'admin', '']])
  })
})
