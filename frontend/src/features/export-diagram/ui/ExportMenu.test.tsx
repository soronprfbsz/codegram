import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { ExportMenu } from './ExportMenu'
import * as exporters from '../lib/exportDiagram'
import type { DiagramExportContext } from '../lib/exportDiagram'

// ExportMenu calls the feature's own orchestrators (same module it re-exports).
// Spy them on the module that defines them; ExportMenu imports from there too.
const diagram: DiagramExportContext = {
  getViewport: () => null,
  getInstance: () => null,
  fitView: () => {},
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('ExportMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an Export trigger and reveals all six items', async () => {
    const user = setup()
    render(
      <ExportMenu
        diagram={diagram}
        onOpenTableDocView={() => {}}
        onExportTableDocExcel={() => {}}
        onExportTableDocPdf={() => {}}
        onExportSql={() => {}}
      />,
    )
    await user.click(screen.getByRole('button', { name: /export/i }))
    for (const name of [
      'Diagram PNG',
      'Diagram SVG',
      'Diagram PDF',
      'Table Doc HTML',
      'Table Doc Excel',
      'Table Doc PDF',
    ]) {
      expect(
        await screen.findByRole('menuitem', { name }),
      ).toBeInTheDocument()
    }
  })

  it('diagram items call the matching exporter with the diagram context', async () => {
    const epng = vi.spyOn(exporters, 'exportDiagramPng').mockResolvedValue()
    const esvg = vi.spyOn(exporters, 'exportDiagramSvg').mockResolvedValue()
    const epdf = vi.spyOn(exporters, 'exportDiagramPdf').mockResolvedValue()
    const user = setup()
    render(
      <ExportMenu
        diagram={diagram}
        onOpenTableDocView={() => {}}
        onExportTableDocExcel={() => {}}
        onExportTableDocPdf={() => {}}
        onExportSql={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PNG' }))
    expect(epng).toHaveBeenCalledWith(diagram)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram SVG' }))
    expect(esvg).toHaveBeenCalledWith(diagram)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PDF' }))
    expect(epdf).toHaveBeenCalledWith(diagram)
  })

  it('table-doc items fire the supplied callbacks', async () => {
    const onOpen = vi.fn()
    const onXlsx = vi.fn()
    const onPdf = vi.fn()
    const user = setup()
    render(
      <ExportMenu
        diagram={diagram}
        onOpenTableDocView={onOpen}
        onExportTableDocExcel={onXlsx}
        onExportTableDocPdf={onPdf}
        onExportSql={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Table Doc HTML' }))
    expect(onOpen).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Table Doc Excel' }))
    expect(onXlsx).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Table Doc PDF' }))
    expect(onPdf).toHaveBeenCalledTimes(1)
  })

  it('SQL items fire onExportSql with the matching dialect', async () => {
    const onExportSql = vi.fn()
    const user = setup()
    render(
      <ExportMenu
        diagram={diagram}
        onOpenTableDocView={() => {}}
        onExportTableDocExcel={() => {}}
        onExportTableDocPdf={() => {}}
        onExportSql={onExportSql}
      />,
    )

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'SQL · PostgreSQL' }),
    )
    expect(onExportSql).toHaveBeenLastCalledWith('postgres')

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'SQL · MySQL' }),
    )
    expect(onExportSql).toHaveBeenLastCalledWith('mysql')

    await user.click(screen.getByRole('button', { name: /export/i }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'SQL · MS SQL Server' }),
    )
    expect(onExportSql).toHaveBeenLastCalledWith('mssql')
  })
})
