import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { ExportMenu } from './ExportMenu'
import * as tableDocEntity from '@/entities/table-doc'
import * as exportTableDoc from '@/features/export-table-doc'
import * as sqlExport from '@/features/sql-export'
import * as download from '@/shared/lib/download'
import { useTableDocViewStore } from '@/widgets/table-doc-view'
import type { DbmlSchema } from '@/entities/dbml'
import type { DiagramExportContext } from '@/features/export-diagram'
import type { TableDocModel } from '@/entities/table-doc'

const DIAGRAM: DiagramExportContext = {
  getViewport: () => null,
  getInstance: () => null,
  fitView: () => {},
}
// Only truthiness + .tables.length matter to the widget; deriveTableDoc is mocked.
const SCHEMA = { tables: [{ id: 'public.users' }], enums: [] } as unknown as DbmlSchema
const MODEL = { tables: [{ id: 'public.users', name: 'users' }], enums: [] } as unknown as TableDocModel

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

function renderMenu(props: Partial<Parameters<typeof ExportMenu>[0]> = {}) {
  return render(
    <ExportMenu diagram={DIAGRAM} schema={SCHEMA} dbmlText="DBML" disabled={false} {...props} />,
  )
}

async function openMenu(user: ReturnType<typeof setup>) {
  await user.click(screen.getByRole('button', { name: '내보내기' }))
}

describe('ExportMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useTableDocViewStore.setState({ model: null })
    vi.spyOn(tableDocEntity, 'deriveTableDoc').mockReturnValue(MODEL)
    vi.spyOn(exportTableDoc, 'buildTableDocBlob').mockResolvedValue(new Blob(['x']))
  })

  it('renders the unified sections: preview + Diagram + Table Doc + SQL', async () => {
    const user = setup()
    renderMenu()
    await openMenu(user)
    for (const name of [
      '테이블 정의서 미리보기',
      '다이어그램 PNG',
      '다이어그램 SVG',
      '다이어그램 PDF',
      '테이블 정의서 Excel',
      '테이블 정의서 PDF',
      '테이블 정의서 Word',
      'SQL · PostgreSQL',
      'SQL · MySQL',
      'SQL · MS SQL Server',
    ]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('preview opens the global overlay with the derived model', async () => {
    const user = setup()
    renderMenu()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: '테이블 정의서 미리보기' }))
    expect(useTableDocViewStore.getState().model).toBe(MODEL)
  })

  it('Table Doc Excel builds the blob via the worker wrapper and downloads it', async () => {
    const build = vi.spyOn(exportTableDoc, 'buildTableDocBlob').mockResolvedValue(new Blob(['x']))
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
    const user = setup()
    renderMenu()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: '테이블 정의서 Excel' }))
    await waitFor(() => expect(dl).toHaveBeenCalledWith(expect.any(Blob), 'table-definition.xlsx'))
    expect(build).toHaveBeenCalledWith('xlsx', expect.anything(), expect.anything())
  })

  it('Table Doc Word builds the blob via the worker wrapper and downloads it', async () => {
    const build = vi.spyOn(exportTableDoc, 'buildTableDocBlob').mockResolvedValue(new Blob(['x']))
    const dl = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {})
    const user = setup()
    renderMenu()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: '테이블 정의서 Word' }))
    await waitFor(() => expect(dl).toHaveBeenCalledWith(expect.any(Blob), 'table-definition.docx'))
    expect(build).toHaveBeenCalledWith('docx', expect.anything(), expect.anything())
  })

  it('SQL · PostgreSQL downloads from the dbml text', async () => {
    const dl = vi.spyOn(sqlExport, 'downloadSql').mockReturnValue(true)
    const user = setup()
    renderMenu()
    await openMenu(user)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'SQL · PostgreSQL' }))
    expect(dl).toHaveBeenCalledWith('DBML', 'postgres')
  })

  it('disables the trigger when disabled', () => {
    renderMenu({ disabled: true })
    expect(screen.getByRole('button', { name: '내보내기' })).toBeDisabled()
  })
})
