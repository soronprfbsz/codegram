import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TableDocModel } from '@/entities/table-doc'

// Mock SheetJS: capture every util call so we can assert the rows/sheet names
// the builder feeds it, without decoding a real workbook.
const aoaToSheet = vi.fn(() => ({ __sheet: true }))
const bookNew = vi.fn(() => ({ SheetNames: [] as string[], Sheets: {} }))
const bookAppendSheet = vi.fn()
const write = vi.fn(() => new Uint8Array([1, 2, 3]))

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: (...args: unknown[]) => aoaToSheet(...args),
    book_new: (...args: unknown[]) => bookNew(...args),
    book_append_sheet: (...args: unknown[]) => bookAppendSheet(...args),
  },
  write: (...args: unknown[]) => write(...args),
}))

import { buildTableDocXlsxBlob } from './buildXlsx'

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
      id: 'public.a_table_with_a_really_long_name_over_limit',
      schema: 'public',
      name: 'a_table_with_a_really_long_name_over_limit',
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
      values: [
        { name: 'admin', note: 'super user' },
        { name: 'member', note: '' },
      ],
    },
  ],
}

describe('buildTableDocXlsxBlob', () => {
  beforeEach(() => {
    aoaToSheet.mockClear()
    bookNew.mockClear()
    bookAppendSheet.mockClear()
    write.mockClear()
  })

  it('creates one workbook', () => {
    buildTableDocXlsxBlob(model)
    expect(bookNew).toHaveBeenCalledTimes(1)
  })

  it('feeds the standard column header + one row per column to aoa_to_sheet', () => {
    buildTableDocXlsxBlob(model)
    // First table sheet: header row then 2 column rows.
    const firstCall = aoaToSheet.mock.calls[0][0] as unknown[][]
    expect(firstCall[0]).toEqual([
      '컬럼명',
      '데이터타입',
      'PK',
      'FK',
      'NN',
      'UNIQUE',
      '기본값',
      '설명',
    ])
    expect(firstCall[1]).toEqual([
      'id',
      'integer',
      'Y',
      '',
      'Y',
      '',
      '',
      'primary key',
    ])
    expect(firstCall[2]).toEqual([
      'org_id',
      'integer',
      '',
      'Y',
      'Y',
      '',
      '',
      '',
    ])
  })

  it('appends one sheet per table plus an Enums sheet, clamping names to 31 chars', () => {
    buildTableDocXlsxBlob(model)
    const sheetNames = bookAppendSheet.mock.calls.map((c) => c[2] as string)
    expect(sheetNames).toEqual([
      'users',
      'a_table_with_a_really_long_name', // 42 chars clamped to 31
      'Enums',
    ])
    expect(sheetNames[1]).toHaveLength(31)
  })

  it('builds the Enums sheet rows from enum values', () => {
    buildTableDocXlsxBlob(model)
    // The Enums sheet is the LAST aoa_to_sheet call.
    const enumAoa = aoaToSheet.mock.calls.at(-1)![0] as unknown[][]
    expect(enumAoa[0]).toEqual(['Enum', '값', '설명'])
    expect(enumAoa[1]).toEqual(['public.role', 'admin', 'super user'])
    expect(enumAoa[2]).toEqual(['public.role', 'member', ''])
  })

  it('writes an xlsx array buffer and returns a Blob', () => {
    const blob = buildTableDocXlsxBlob(model)
    expect(write).toHaveBeenCalledWith(expect.anything(), {
      bookType: 'xlsx',
      type: 'array',
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})
