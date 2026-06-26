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
  overviewSheet: '테이블 목록', overviewNo: 'No', overviewGroup: '그룹',
  overviewTable: '테이블', overviewDesc: '설명', ungroupedSheet: '미분류',
}

function tbl(schema: string, name: string, note = ''): TableDocModel['tables'][number] {
  return {
    id: `${schema}.${name}`, schema, name, note,
    columns: [{ name: 'id', type: 'int', pk: true, fk: false, notNull: true, unique: false, default: '', note: '' }],
    fkTargets: [], checks: [],
  }
}

const model: TableDocModel = {
  tables: [tbl('public', 'users', 'app users'), tbl('public', 'roles'), tbl('public', 'loose')],
  enums: [{ id: 'public.k', schema: 'public', name: 'k', note: '', values: [{ name: 'a', note: '' }] }],
  groups: [{ name: '사용자관리', tableIds: ['public.users', 'public.roles'] }],
}

async function read(blob: Blob): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await blob.arrayBuffer())
  return wb
}

describe('buildTableDocXlsxBlob (grouped)', () => {
  it('creates an overview sheet, a sheet per group, an Ungrouped sheet, and Enums', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    expect(wb.getWorksheet('테이블 목록')).toBeTruthy()
    expect(wb.getWorksheet('사용자관리')).toBeTruthy()
    expect(wb.getWorksheet('미분류')).toBeTruthy()
    expect(wb.getWorksheet('Enums')).toBeTruthy()
  })

  it('overview lists every table with its group name', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ov = wb.getWorksheet('테이블 목록')!
    const rows: string[][] = []
    ov.eachRow((r) => rows.push((r.values as unknown[]).slice(1).map(String)))
    const flat = rows.map((r) => r.join('|')).join('\n')
    expect(flat).toContain('사용자관리|public.users')
    expect(flat).toContain('미분류|public.loose')
  })

  it('a group sheet stacks a bold title row + the standard column header per table', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    const firstCol: string[] = []
    ws.eachRow((r) => firstCol.push(String(r.getCell(1).value ?? '')))
    expect(firstCol).toContain('public.users — app users') // title block
    expect(firstCol).toContain('컬럼명') // column header row
  })

  it('keeps the shared header fill color on a column header row', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    // find a row whose first cell is the column header, assert its fill
    let filled = false
    ws.eachRow((r) => {
      if (String(r.getCell(1).value) === '컬럼명') {
        const fill = r.getCell(1).fill as ExcelJS.FillPattern
        if (fill?.fgColor?.argb === `FF${HEADER_FILL}`) filled = true
      }
    })
    expect(filled).toBe(true)
  })

  it('renders the CHECK section inside a group sheet', async () => {
    const m: TableDocModel = {
      tables: [{
        id: 'public.u', schema: 'public', name: 'u', note: '',
        columns: [{ name: 'id', type: 'int', pk: true, fk: false, notNull: true, unique: false, default: '', note: '' }],
        fkTargets: [],
        checks: [{ name: 'c_kind', values: ['a', 'b'], expression: "kind IN ('a','b')" }],
      }],
      enums: [],
      groups: [{ name: 'g1', tableIds: ['public.u'] }],
    }
    const wb = await read(await buildTableDocXlsxBlob(m, LABELS))
    const ws = wb.getWorksheet('g1')!
    const firstCol: string[] = []
    ws.eachRow((r) => firstCol.push(String(r.getCell(1).value ?? '')))
    expect(firstCol).toContain('CHECK 제약')
  })

  it('overview header row carries the shared fill color', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ov = wb.getWorksheet('테이블 목록')!
    let filled = false
    ov.eachRow((r) => {
      if (String(r.getCell(1).value) === LABELS.overviewNo) {
        const fill = r.getCell(1).fill as ExcelJS.FillPattern
        if (fill?.fgColor?.argb === `FF${HEADER_FILL}`) filled = true
      }
    })
    expect(filled).toBe(true)
  })
})
