import { toPng, toSvg } from 'html-to-image'
import { getViewportForBounds, type ReactFlowInstance } from '@xyflow/react'

export interface CaptureOptions {
  /** Solid background painted behind the diagram. Default '#ffffff'. */
  backgroundColor?: string
  /** Output device pixel ratio. Default 2. */
  pixelRatio?: number
  /**
   * RELATIVE margin around the node bounds, as a fraction of the frame, passed
   * straight to getViewportForBounds (the SINGLE padding source). Default 0.1
   * (≈10% margin). e.g. 0.1 leaves a 10% gap so the whole diagram is visible
   * with breathing room and no clipping.
   */
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
 *
 * The frame is the node-bounds size (ceil'd) — it is NOT inflated. The margin
 * is the SINGLE relative `padding` fraction passed to getViewportForBounds,
 * which scales the content down inside the frame so the whole diagram is
 * visible with a predictable gap and no clipping.
 */
export function computeCaptureFrame(
  rf: CaptureInstance,
  opts?: CaptureOptions,
): CaptureFrame {
  const nodes = rf.getNodes()
  const bounds = rf.getNodesBounds(nodes)
  const padding = opts?.padding ?? 0.1
  const imageWidth = Math.ceil(bounds.width)
  const imageHeight = Math.ceil(bounds.height)
  // v12: returns a Viewport {x, y, zoom}; the final arg is a RELATIVE padding
  // fraction — our single margin source (the frame itself is not inflated).
  const { x, y, zoom } = getViewportForBounds(
    bounds,
    imageWidth,
    imageHeight,
    0.5,
    2,
    padding,
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
    // Top-level width/height size the capture; html-to-image stamps them as
    // `${width}px` on the clone, so the manual style only carries the transform
    // (a unitless style.width/height like "480" would be rejected by the browser).
    width: frame.imageWidth,
    height: frame.imageHeight,
    pixelRatio: opts?.pixelRatio ?? 2,
    style: {
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
