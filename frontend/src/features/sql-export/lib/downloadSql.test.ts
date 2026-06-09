import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadSql } from './downloadSql'
import * as dbml from '@/entities/dbml'
import * as download from '@/shared/lib/download'

vi.mock('@/entities/dbml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/entities/dbml')>()
  return { ...actual, exportDbmlToSql: vi.fn() }
})

describe('downloadSql', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads a text/plain SQL blob named schema.<dialect>.sql on success', async () => {
    vi.spyOn(dbml, 'exportDbmlToSql').mockReturnValue({
      ok: true,
      sql: 'CREATE TABLE "users" (...);',
    })
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})

    const ok = downloadSql('Table users { id int [pk] }', 'postgres')

    expect(ok).toBe(true)
    expect(dbml.exportDbmlToSql).toHaveBeenCalledWith(
      'Table users { id int [pk] }',
      'postgres',
    )
    expect(dl).toHaveBeenCalledTimes(1)
    const [blob, filename] = dl.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect((blob as Blob).type).toBe('text/plain')
    expect(await (blob as Blob).text()).toBe('CREATE TABLE "users" (...);')
    expect(filename).toBe('schema.postgres.sql')
  })

  it('uses the dialect in the filename for mysql and mssql', () => {
    vi.spyOn(dbml, 'exportDbmlToSql').mockReturnValue({ ok: true, sql: 'X;' })
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})

    downloadSql('Table t { id int }', 'mysql')
    expect(dl.mock.calls[0][1]).toBe('schema.mysql.sql')

    downloadSql('Table t { id int }', 'mssql')
    expect(dl.mock.calls[1][1]).toBe('schema.mssql.sql')
  })

  it('returns false and downloads nothing when export fails', () => {
    vi.spyOn(dbml, 'exportDbmlToSql').mockReturnValue({
      ok: false,
      errors: [{ message: 'Failed to export DBML' }],
    })
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})

    const ok = downloadSql('not valid dbml', 'postgres')

    expect(ok).toBe(false)
    expect(dl).not.toHaveBeenCalled()
  })
})
