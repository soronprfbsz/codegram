import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so mock vars are available in vi.mock factories (which are hoisted).
const {
  captureViewport,
  captureViewportSvg,
  computeCaptureFrame,
  addImage,
  output,
  jsPDFCtor,
  downloadBlob,
} = vi.hoisted(() => {
  const addImage = vi.fn()
  const output = vi.fn(() => new Blob(['%PDF'], { type: 'application/pdf' }))
  return {
    // Mock the capture core, jsPDF, and the download helper. Orchestration only.
    captureViewport: vi.fn(async () => 'data:image/png;base64,PNG'),
    // SVG capture returns the real toSvg shape (charset=utf-8 + encodeURIComponent);
    // exportDiagramSvg decodeURIComponent-round-trips it into the Blob.
    captureViewportSvg: vi.fn(
      async () => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E',
    ),
    computeCaptureFrame: vi.fn(() => ({
      imageWidth: 480,
      imageHeight: 280,
      transform: 'translate(0px, 0px) scale(1)',
    })),
    addImage,
    output,
    // Use a regular function (not arrow) so it can be called with `new jsPDF(...)`.
    jsPDFCtor: vi.fn(function () { return { addImage, output } }),
    downloadBlob: vi.fn(),
  }
})

vi.mock('./captureViewport', () => ({
  captureViewport,
  captureViewportSvg,
  computeCaptureFrame,
}))

vi.mock('jspdf', () => ({ jsPDF: jsPDFCtor }))

vi.mock('@/shared/lib/download', () => ({ downloadBlob }))

import {
  exportDiagramPng,
  exportDiagramSvg,
  exportDiagramPdf,
  type DiagramExportContext,
} from './exportDiagram'
import type { ReactFlowInstance } from '@xyflow/react'

type ExportInstance = Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>

function makeCtx(): DiagramExportContext {
  const el = document.createElement('div')
  const instance: ExportInstance = {
    getNodes: vi.fn(() => []) as ExportInstance['getNodes'],
    getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 400, height: 200 })) as ExportInstance['getNodesBounds'],
  }
  return {
    getViewport: () => el,
    getInstance: () => instance,
    fitView: vi.fn(),
  }
}

describe('exportDiagram orchestrators', () => {
  beforeEach(() => {
    captureViewport.mockClear()
    captureViewportSvg.mockClear()
    addImage.mockClear()
    output.mockClear()
    jsPDFCtor.mockClear()
    downloadBlob.mockClear()
    // Make the two-rAF settle resolve synchronously.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  it('exportDiagramPng: fitView -> toPng capture -> downloadBlob(PNG, diagram.png)', async () => {
    const ctx = makeCtx()
    await exportDiagramPng(ctx)

    expect(ctx.fitView).toHaveBeenCalled()
    expect(captureViewport).toHaveBeenCalledTimes(1)
    expect(captureViewportSvg).not.toHaveBeenCalled()
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(filename).toBe('diagram.png')
  })

  it('exportDiagramSvg: capture via toSvg (not toPng) -> downloadBlob(SVG, diagram.svg)', async () => {
    const ctx = makeCtx()
    await exportDiagramSvg(ctx)

    expect(captureViewportSvg).toHaveBeenCalledTimes(1)
    expect(captureViewport).not.toHaveBeenCalled()
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/svg+xml')
    expect(filename).toBe('diagram.svg')
  })

  it('exportDiagramPdf: toPng capture -> jsPDF.addImage -> downloadBlob(PDF, diagram.pdf)', async () => {
    const ctx = makeCtx()
    await exportDiagramPdf(ctx)

    expect(captureViewport).toHaveBeenCalledTimes(1)
    expect(captureViewportSvg).not.toHaveBeenCalled()
    expect(jsPDFCtor).toHaveBeenCalledTimes(1)
    // 480 >= 280 => landscape a4.
    expect(jsPDFCtor).toHaveBeenCalledWith(
      expect.objectContaining({ orientation: 'landscape', format: 'a4' }),
    )
    expect(addImage).toHaveBeenCalledTimes(1)
    const addImageArgs = addImage.mock.calls[0] as unknown[]
    expect(addImageArgs[0]).toBe('data:image/png;base64,PNG')
    expect(addImageArgs[1]).toBe('PNG')
    expect(output).toHaveBeenCalledWith('blob')
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string]
    expect(blob).toBeInstanceOf(Blob)
    expect(filename).toBe('diagram.pdf')
  })

  it('no-ops when the viewport or instance is missing', async () => {
    const ctx: DiagramExportContext = {
      getViewport: () => null,
      getInstance: () => null,
      fitView: vi.fn(),
    }
    await exportDiagramPng(ctx)
    expect(captureViewport).not.toHaveBeenCalled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })
})
