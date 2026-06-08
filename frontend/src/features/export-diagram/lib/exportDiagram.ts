import { jsPDF } from 'jspdf'
import type { ReactFlowInstance } from '@xyflow/react'
import { downloadBlob } from '@/shared/lib/download'
import {
  captureViewport,
  captureViewportSvg,
  computeCaptureFrame,
  type CaptureOptions,
} from './captureViewport'

export interface DiagramExportContext {
  /** () => the `.react-flow__viewport` element, or null if the canvas is empty. */
  getViewport: () => HTMLElement | null
  /** The React Flow instance (getNodes/getNodesBounds), or null if not mounted. */
  getInstance: () => Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'> | null
  /** fitView callback surfaced from ErdCanvas; called + awaited (rAF) before capture. */
  fitView: () => void
}

export type { CaptureOptions }

/** Wait two animation frames so node measurement + the transform settle. */
function nextFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/** A4 in millimetres. */
const A4 = { width: 210, height: 297 }
const PDF_MARGIN = 10

function dataUrlToBlob(dataUrl: string, type: string): Blob {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function exportDiagramPng(
  ctx: DiagramExportContext,
  filename = 'diagram.png',
): Promise<void> {
  ctx.fitView()
  await nextFrames()
  const viewport = ctx.getViewport()
  const rf = ctx.getInstance()
  if (!viewport || !rf) return
  const dataUrl = await captureViewport(rf, viewport)
  downloadBlob(dataUrlToBlob(dataUrl, 'image/png'), filename)
}

export async function exportDiagramSvg(
  ctx: DiagramExportContext,
  filename = 'diagram.svg',
): Promise<void> {
  ctx.fitView()
  await nextFrames()
  const viewport = ctx.getViewport()
  const rf = ctx.getInstance()
  if (!viewport || !rf) return
  const dataUrl = await captureViewportSvg(rf, viewport)
  const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1))
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), filename)
}

export async function exportDiagramPdf(
  ctx: DiagramExportContext,
  filename = 'diagram.pdf',
): Promise<void> {
  ctx.fitView()
  await nextFrames()
  const viewport = ctx.getViewport()
  const rf = ctx.getInstance()
  if (!viewport || !rf) return

  const frame = computeCaptureFrame(rf)
  const dataUrl = await captureViewport(rf, viewport)

  const landscape = frame.imageWidth >= frame.imageHeight
  const doc = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Page dimensions depend on orientation; fit the image inside the margins.
  const pageW = landscape ? A4.height : A4.width
  const pageH = landscape ? A4.width : A4.height
  const maxW = pageW - PDF_MARGIN * 2
  const maxH = pageH - PDF_MARGIN * 2
  const ratio = Math.min(maxW / frame.imageWidth, maxH / frame.imageHeight)
  const drawW = frame.imageWidth * ratio
  const drawH = frame.imageHeight * ratio
  const x = (pageW - drawW) / 2
  const y = (pageH - drawH) / 2

  doc.addImage(dataUrl, 'PNG', x, y, drawW, drawH)
  downloadBlob(doc.output('blob'), filename)
}
