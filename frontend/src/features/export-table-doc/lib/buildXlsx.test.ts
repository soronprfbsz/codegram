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
  fks: 'FK 제약', fkName: 'FK명', fkColumns: '컬럼', fkRefTable: '참조 테이블', fkRefColumns: '참조 컬럼',
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

  it('sanitizes sheet names with Excel-forbidden chars / >31 chars (no throw)', async () => {
    // Regression: exceljs throws on a worksheet name containing \ / ? * [ ] :
    // (real project had a group "탐지 룰 오버라이드/정책 제어"), aborting the whole
    // export so no file downloaded. The name must be sanitized, not rejected.
    const badModel: TableDocModel = {
      tables: [tbl('public', 'users'), tbl('public', 'roles')],
      enums: [],
      groups: [
        { name: '탐지 룰 오버라이드/정책 제어', tableIds: ['public.users'] },
        { name: 'a'.repeat(40) + '/[b]:c*?', tableIds: ['public.roles'] },
      ],
    }
    const blob = await buildTableDocXlsxBlob(badModel, LABELS)
    expect(blob).toBeInstanceOf(Blob)
    const wb = await read(blob)
    // Every worksheet name is Excel-legal: ≤31 chars, none of \ / ? * [ ] :
    for (const ws of wb.worksheets) {
      expect(ws.name.length).toBeLessThanOrEqual(31)
      expect(ws.name).not.toMatch(/[\\/?*[\]:]/)
    }
    // The two groups still produced two distinct member sheets (beyond overview/…)
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(3)
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

  it('renders the 테이블정의서 form (header grid, body header) per table', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    const firstCol: string[] = []
    ws.eachRow((r) => firstCol.push(String(r.getCell(1).value ?? '')))
    expect(firstCol).not.toContain('테이블정의서') // no repeating title row
    expect(firstCol).toContain('주제영역명') // block leads with the header grid label
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
    const wb = await read(await buildTableDocXlsxBlob(formModel, LABELS, 'hawkeye'))
    const ws = wb.getWorksheet('운영 관리')!
    const row = (n: number): string[] =>
      [1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(ws.getRow(n).getCell(c).value ?? ''))
    // Build a label->cells lookup over the header grid (rows 1..N).
    const byLabel = new Map<string, string[]>()
    ws.eachRow((r) => byLabel.set(String(r.getCell(1).value ?? ''), r.values as unknown as string[]))

    // Header grid: subjectArea = group name (left), DB명 = export-time default (right).
    const subj = byLabel.get('주제영역명')!
    expect(String(subj[2])).toBe('운영 관리') // B value
    expect(String(subj[5])).toBe('DB 명') // E label
    expect(String(subj[6])).toBe('hawkeye') // F value
    // 테이블명 leads the left column; 스키마명 = the table's own schema verbatim (right).
    const tbl = byLabel.get('테이블명')!
    expect(String(tbl[2])).toBe('user_manage')
    expect(String(tbl[5])).toBe('스키마명')
    expect(String(tbl[6])).toBe('hawkeye_core')
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

  it('leaves DB명 blank without a default and 스키마명 blank for the default public schema', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    const byLabel = new Map<string, string[]>()
    ws.eachRow((r) => byLabel.set(String(r.getCell(1).value ?? ''), r.values as unknown as string[]))
    // DB명 now sits in the right column of the 주제영역명 row; 스키마명 in the 테이블명 row.
    expect(String(byLabel.get('주제영역명')![6] ?? '')).toBe('') // DB명: no default supplied → blank
    expect(String(byLabel.get('테이블명')![6] ?? '')).toBe('') // 스키마명: public (no qualifier) → blank
  })

  it('auto-fits column width to the longest cell text (설명 grows for a long note)', async () => {
    const longNote = '데이터-플레인 토큰 폐기용 epoch (JWT tev 클레임; 비활성/전체revoke 시 +1)'
    const long: TableDocModel = {
      tables: [{
        id: 'public.u', schema: 'public', name: 'u', note: '',
        columns: [{ name: 'token_epoch', type: 'integer', pk: false, fk: false, notNull: true, unique: false, default: '0', note: longNote }],
        fkTargets: [], checks: [],
      }],
      enums: [], groups: [{ name: 'g', tableIds: ['public.u'] }],
    }
    const short: TableDocModel = {
      tables: [{
        id: 'public.u', schema: 'public', name: 'u', note: '',
        columns: [{ name: 'x', type: 'int', pk: false, fk: false, notNull: false, unique: false, default: '', note: '짧음' }],
        fkTargets: [], checks: [],
      }],
      enums: [], groups: [{ name: 'g', tableIds: ['public.u'] }],
    }
    const wLong = (await read(await buildTableDocXlsxBlob(long, LABELS))).getWorksheet('g')!
    const wShort = (await read(await buildTableDocXlsxBlob(short, LABELS))).getWorksheet('g')!
    // 설명 is column 8 — it must fit the long note (CJK counted ~2/char) …
    expect(wLong.getColumn(8).width).toBeGreaterThan(40)
    // … and shrink when the content is short (auto-fit, not a fixed width).
    expect(wShort.getColumn(8).width).toBeLessThan(wLong.getColumn(8).width)
  })

  it('does not widen a column to a merged multi-column cell (metadata values)', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    // Metadata values are merged across B:D / F:H; column A must stay label-sized,
    // not stretched to a merged value.
    expect(ws.getColumn(1).width).toBeLessThan(20)
  })

  it('every form column keeps an explicit width after serialization (exceljs drops width==9)', async () => {
    const m: TableDocModel = {
      tables: [{
        id: 'public.u', schema: 'public', name: 'u', note: 'n',
        columns: [{ name: 'id', type: 'INTEGER', pk: true, fk: false, notNull: true, unique: false, default: '', note: '설명' }],
        fkTargets: [], checks: [],
      }],
      enums: [], groups: [{ name: 'g', tableIds: ['public.u'] }],
    }
    const ws = (await read(await buildTableDocXlsxBlob(m, LABELS))).getWorksheet('g')!
    // 타입 (col 3) fits 'INTEGER' → ~9 chars; must round-trip as a real width, not
    // be silently dropped (regression: exceljs omits width exactly 9 on save).
    for (let c = 1; c <= 8; c++) expect(ws.getColumn(c).width, `col ${c}`).toBeGreaterThan(0)
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

  it('renders the FK section (title, header, row) inside a group sheet', async () => {
    const m: TableDocModel = {
      tables: [{
        id: 'public.posts', schema: 'public', name: 'posts', note: '',
        columns: [{ name: 'user_id', type: 'int', pk: false, fk: true, notNull: true, unique: false, default: '', note: '' }],
        fkTargets: [{ name: 'fk_posts_user_id', columns: ['user_id'], targetSchema: 'public', targetTable: 'users', targetColumns: ['id'] }],
        checks: [],
      }],
      enums: [],
      groups: [{ name: 'g1', tableIds: ['public.posts'] }],
    }
    const wb = await read(await buildTableDocXlsxBlob(m, LABELS))
    const ws = wb.getWorksheet('g1')!
    // FK logical columns are merged (A:B, C:D, E:G, H) → read the master cells 1·3·5·8.
    const rows: string[][] = []
    ws.eachRow((r) => rows.push([1, 3, 5, 8].map((c) => String(r.getCell(c).value ?? ''))))
    const flat = rows.map((r) => r.join('|'))
    expect(flat.some((r) => r.startsWith('FK 제약'))).toBe(true) // bold title row
    expect(flat).toContain('FK명|컬럼|참조 테이블|참조 컬럼') // header row
    expect(flat).toContain('fk_posts_user_id|user_id|public.users|id') // data row
  })

  it('boxes each table block with a medium outer border', async () => {
    const wb = await read(await buildTableDocXlsxBlob(model, LABELS))
    const ws = wb.getWorksheet('사용자관리')!
    // The 주제영역명 metadata row now leads each block — it is its top edge.
    let topRowNum = 0
    ws.eachRow((r) => {
      if (!topRowNum && String(r.getCell(1).value) === LABELS.form.subjectArea) topRowNum = r.number
    })
    expect(topRowNum).toBeGreaterThan(0)
    const topLeft = ws.getRow(topRowNum).getCell(1)
    expect(topLeft.border?.top?.style).toBe('medium')
    expect(topLeft.border?.left?.style).toBe('medium')
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
