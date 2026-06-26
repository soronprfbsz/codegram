import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import type { TableDocLabels } from './labels'
import { HEADER_FILL } from './tableDocStyle'

const LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  fkColumn: '컬럼', fkReference: '참조',
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
}

const model: TableDocModel = {
  tables: [
    {
      id: 'public.users', schema: 'public', name: 'users', note: 'app users',
      columns: [
        { name: 'id', type: 'integer', pk: true, fk: false, notNull: true, unique: false, default: '', note: 'pk' },
        { name: 'email', type: 'varchar', pk: false, fk: false, notNull: true, unique: true, default: '', note: '' },
      ],
      fkTargets: [], checks: [],
    },
  ],
  enums: [{ id: 'public.role', schema: 'public', name: 'role', note: '', values: [{ name: 'admin', note: '' }] }],
}

async function read(blob: Blob): Promise<ExcelJS.Workbook> {
  const buf = await blob.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

describe('buildTableDocXlsxBlob (exceljs)', () => {
  it('creates one worksheet per table plus an Enums sheet', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('users')).toBeTruthy()
    expect(wb.getWorksheet('Enums')).toBeTruthy()
  })

  it('writes the translated header row and a data row', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('users')!
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(['컬럼명', '데이터타입', '설명']))
    expect(ws.getRow(2).getCell(1).value).toBe('id')
  })

  it('styles the header row with the shared fill color', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const cell = wb.getWorksheet('users')!.getRow(1).getCell(1)
    expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(`FF${HEADER_FILL}`)
    expect(cell.font?.bold).toBe(true)
  })

  it('sets a column width on the first column', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('users')!.getColumn(1).width).toBeGreaterThan(0)
  })
})
