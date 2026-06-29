import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import type { TableDocLabels } from './labels'
import { HEADER_FILL } from './tableDocStyle'

const LABELS: TableDocLabels = {
  columnHeaders: ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
  enumColEnum: 'Enum', enumColValue: '값', enumColNote: '설명', enumsSheet: 'Enums',
  checks: 'CHECK 제약', checkName: '이름', checkValues: '허용값', checkExpression: '표현식',
  overviewSheet: '테이블 목록', overviewNo: 'No', overviewGroup: '그룹',
  overviewTable: '테이블', overviewDesc: '설명', ungroupedSheet: '미분류',
  form: {
    title: '테이블정의서', subjectArea: '주제영역명', dbName: 'DB 명', schemaName: '스키마명',
    tableName: '테이블명', tableDesc: '테이블설명', no: 'No', colId: '컬럼ID', type: '타입',
    length: '길이', nullable: 'NULL', key: 'KEY', defaultVal: 'DEFAULT', desc: '설명', etc: '기타',
  },
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

  it('renders the 테이블정의서 form (title, header grid, body header) per table', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    const firstCol: string[] = []
    ws.eachRow((r) => firstCol.push(String(r.getCell(1).value ?? '')))
    expect(firstCol).toContain('테이블정의서') // merged title row
    expect(firstCol).toContain('주제영역명') // header grid label
    expect(firstCol).toContain('테이블설명')
    expect(firstCol).toContain('No') // body column header row (first cell)
    expect(firstCol).toContain('기타') // trailing 기타 row
  })

  it('keeps the shared header fill color on the body column-header row', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    let filled = false
    ws.eachRow((r) => {
      if (String(r.getCell(1).value) === LABELS.form.no && String(r.getCell(2).value) === LABELS.form.colId) {
        const fill = r.getCell(1).fill as ExcelJS.FillPattern
        if (fill?.fgColor?.argb === `FF${HEADER_FILL}`) filled = true
      }
    })
    expect(filled).toBe(true)
  })

  it('maps header metadata and body cells per the 테이블정의서 spec', async () => {
    const formModel: TableDocModel = {
      tables: [{
        id: 'hawkeye_core.user_manage', schema: 'hawkeye_core', name: 'user_manage', note: '사용자 관리 테이블',
        columns: [
          { name: 'id', type: 'bigint(20)', pk: true, fk: false, notNull: true, unique: false, default: '', note: '기본키' },
          { name: 'user_id', type: 'varchar(50)', pk: false, fk: false, notNull: true, unique: true, default: '', note: '사용자 아이디' },
          { name: 'auth_fk', type: 'bigint', pk: false, fk: true, notNull: false, unique: false, default: '0', note: '권한 외래키' },
        ],
        fkTargets: [], checks: [],
      }],
      enums: [],
      groups: [{ name: '운영 관리', tableIds: ['hawkeye_core.user_manage'] }],
    }
    const wb = await read(await buildTableDocXlsxBlob(formModel, LABELS))
    const ws = wb.getWorksheet('운영 관리')!
    const row = (n: number): string[] =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(ws.getRow(n).getCell(c).value ?? ''))
    // Build a label->cells lookup over the header grid (rows 1..N).
    const byLabel = new Map<string, string[]>()
    ws.eachRow((r) => byLabel.set(String(r.getCell(1).value ?? ''), r.values as unknown as string[]))

    // Header grid: subjectArea = group name, tableName = technical name.
    const subj = byLabel.get('주제영역명')!
    expect(String(subj[2])).toBe('운영 관리') // B value
    expect(String(subj[5])).toBe('테이블명') // E label
    expect(String(subj[6])).toBe('user_manage') // F value
    // DB명 = before first '_', 스키마명 = after.
    const db = byLabel.get('DB 명')!
    expect(String(db[2])).toBe('hawkeye')
    expect(String(db[5])).toBe('스키마명')
    expect(String(db[6])).toBe('core')
    // 테이블설명 = table.note.
    expect(String(byLabel.get('테이블설명')![2])).toBe('사용자 관리 테이블')

    // Find the body header row (first cell = No, second = 컬럼ID), then read 3 body rows.
    let headerRowNum = 0
    ws.eachRow((r) => {
      if (String(r.getCell(1).value) === 'No' && String(r.getCell(2).value) === '컬럼ID') headerRowNum = r.number
    })
    expect(headerRowNum).toBeGreaterThan(0)
    expect(row(headerRowNum)).toEqual(['No', '컬럼ID', '타입', '길이', 'NULL', 'KEY', 'DEFAULT', '설명'])
    expect(row(headerRowNum + 1)).toEqual(['1', 'id', 'bigint', '20', 'NOT NULL', 'PK', '', '기본키'])
    expect(row(headerRowNum + 2)).toEqual(['2', 'user_id', 'varchar', '50', 'NOT NULL', 'UK', '', '사용자 아이디'])
    expect(row(headerRowNum + 3)).toEqual(['3', 'auth_fk', 'bigint', '', '', 'FK', '0', '권한 외래키'])
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
