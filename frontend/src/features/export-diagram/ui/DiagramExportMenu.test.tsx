import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { DiagramExportMenu } from './DiagramExportMenu'
import * as exporters from '../lib/exportDiagram'
import type { DiagramExportContext } from '../lib/exportDiagram'

const diagram: DiagramExportContext = {
  getViewport: () => null,
  getInstance: () => null,
  fitView: () => {},
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('DiagramExportMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a Diagram trigger and reveals PNG/SVG/PDF', async () => {
    const user = setup()
    render(<DiagramExportMenu diagram={diagram} />)
    await user.click(screen.getByRole('button', { name: 'Export' }))
    for (const name of ['Diagram PNG', 'Diagram SVG', 'Diagram PDF']) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('items call the matching exporter with the diagram context', async () => {
    const epng = vi.spyOn(exporters, 'exportDiagramPng').mockResolvedValue()
    const esvg = vi.spyOn(exporters, 'exportDiagramSvg').mockResolvedValue()
    const epdf = vi.spyOn(exporters, 'exportDiagramPdf').mockResolvedValue()
    const user = setup()
    render(<DiagramExportMenu diagram={diagram} />)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PNG' }))
    expect(epng).toHaveBeenCalledWith(diagram)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram SVG' }))
    expect(esvg).toHaveBeenCalledWith(diagram)

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Diagram PDF' }))
    expect(epdf).toHaveBeenCalledWith(diagram)
  })

  it('disables the trigger when disabled', () => {
    render(<DiagramExportMenu diagram={diagram} disabled />)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
  })
})
