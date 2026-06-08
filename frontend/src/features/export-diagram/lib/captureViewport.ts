import { toPng, toSvg } from 'html-to-image'
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react'

export interface CaptureOptions {
  /** Solid background painted behind the diagram. Default '#ffffff'. */
  backgroundColor?: string
  /** Output device pixel ratio. Default 2. */
  pixelRatio?: number
  /** Padding (px) added around the node bounds. Default 40. */
  padding?: number
}

type CaptureInstance = Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>

/** Computed export frame: full-diagram size + the viewport transform string. */
export interface CaptureFrame {
  imageWidth: number
  imageHeight: number
  transform: string
}

/**
 * Pure frame math shared by PNG/SVG capture and the PDF page-fit. Overriding
 * the viewport transform to translate(x,y) scale(zoom) pulls ALL nodes —
 * including off-screen ones — into the export frame. Bounds come from the
 * rf.getNodesBounds INSTANCE method (only getViewportForBounds is imported as
 * a value, to satisfy noUnusedLocals).
 */
export function computeCaptureFrame(
  rf: CaptureInstance,
  opts?: CaptureOptions,
): CaptureFrame {
  const nodes = rf.getNodes()
  const bounds = rf.getNodesBounds(nodes)
  const padding = opts?.padding ?? 40
  const imageWidth = bounds.width + padding * 2
  const imageHeight = bounds.height + padding * 2
  // v12: returns a Viewport {x, y, zoom} and takes a padding arg.
  const { x, y, zoom } = getViewportForBounds(
    bounds,
    imageWidth,
    imageHeight,
    0.5,
    2,
    0.1,
  )
  return {
    imageWidth,
    imageHeight,
    transform: `translate(${x}px, ${y}px) scale(${zoom})`,
  }
}

function captureOptions(frame: CaptureFrame, opts?: CaptureOptions) {
  return {
    backgroundColor: opts?.backgroundColor ?? '#ffffff',
    width: frame.imageWidth,
    height: frame.imageHeight,
    pixelRatio: opts?.pixelRatio ?? 2,
    style: {
      width: String(frame.imageWidth),
      height: String(frame.imageHeight),
      transform: frame.transform,
    },
    filter: (node: HTMLElement) =>
      !node?.classList?.contains('react-flow__minimap') &&
      !node?.classList?.contains('react-flow__controls') &&
      !node?.classList?.contains('react-flow__panel'),
  }
}

/**
 * Capture the FULL diagram as a PNG data URL.
 * `rf` provides getNodes/getNodesBounds; `viewport` is the
 * `.react-flow__viewport` element to snapshot.
 */
export function captureViewport(
  rf: CaptureInstance,
  viewport: HTMLElement,
  opts?: CaptureOptions,
): Promise<string> {
  const frame = computeCaptureFrame(rf, opts)
  return toPng(viewport, captureOptions(frame, opts))
}

/** Same as captureViewport but emits an SVG data URL via html-to-image. */
export function captureViewportSvg(
  rf: CaptureInstance,
  viewport: HTMLElement,
  opts?: CaptureOptions,
): Promise<string> {
  const frame = computeCaptureFrame(rf, opts)
  return toSvg(viewport, captureOptions(frame, opts))
}
