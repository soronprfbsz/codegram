import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so mock vars are available in vi.mock factories (which are hoisted).
const { toPng, toSvg, getViewportForBounds } = vi.hoisted(() => ({
  toPng: vi.fn(async () => 'data:image/png;base64,PNG'),
  // Real toSvg (html-to-image v1.11.11) returns charset=utf-8 + encodeURIComponent,
  // NOT base64 — mirror that shape so the fixture matches reality.
  toSvg: vi.fn(async () => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'),
  getViewportForBounds: vi.fn(() => ({ x: 10, y: 20, zoom: 0.5 })),
}))

// Mock html-to-image (no real canvas in jsdom) and the xyflow util.
vi.mock('html-to-image', () => ({ toPng, toSvg }))
vi.mock('@xyflow/react', () => ({ getViewportForBounds }))

import {
  captureViewport,
  captureViewportSvg,
  computeCaptureFrame,
} from './captureViewport'
import type { ReactFlowInstance } from '@xyflow/react'

type CaptureInstance = Pick<ReactFlowInstance, 'getNodes' | 'getNodesBounds'>

function makeInstance(): CaptureInstance {
  return {
    getNodes: vi.fn(() => []) as CaptureInstance['getNodes'],
    getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 400, height: 200 })) as CaptureInstance['getNodesBounds'],
  }
}

describe('captureViewport', () => {
  beforeEach(() => {
    toPng.mockClear()
    toSvg.mockClear()
    getViewportForBounds.mockClear()
  })

  it('captures a PNG data URL with the contract options + transform override', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    const dataUrl = await captureViewport(rf, el)

    expect(dataUrl).toBe('data:image/png;base64,PNG')

    // Frame is the (ceil'd) node-bounds size — NOT inflated. The margin is the
    // single relative padding fraction (default 0.1) passed to getViewportForBounds.
    expect(getViewportForBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 400, height: 200 },
      400,
      200,
      0.5,
      2,
      0.1,
    )

    expect(toPng).toHaveBeenCalledTimes(1)
    const [calledEl, opts] = toPng.mock.calls[0] as unknown as [
      HTMLElement,
      Record<string, unknown>,
    ]
    expect(calledEl).toBe(el)
    expect(opts.width).toBe(400)
    expect(opts.height).toBe(200)
    expect(opts.pixelRatio).toBe(2)
    expect(opts.backgroundColor).toBe('#ffffff')
    // Only the transform lives in the manual style (no unitless width/height).
    expect(opts.style).toEqual({ transform: 'translate(10px, 20px) scale(0.5)' })
  })

  it('honors CaptureOptions overrides (background, pixelRatio, relative padding)', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    await captureViewport(rf, el, {
      backgroundColor: '#000000',
      pixelRatio: 3,
      padding: 0.25,
    })

    // Frame stays at the bounds size; the override padding fraction is forwarded.
    expect(getViewportForBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 400, height: 200 },
      400,
      200,
      0.5,
      2,
      0.25,
    )
    const [, opts] = toPng.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>]
    expect(opts.backgroundColor).toBe('#000000')
    expect(opts.pixelRatio).toBe(3)
    expect(opts.width).toBe(400)
  })

  it('captureViewportSvg delegates to toSvg, not toPng', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    const dataUrl = await captureViewportSvg(rf, el)

    expect(dataUrl).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E')
    expect(toSvg).toHaveBeenCalledTimes(1)
    expect(toPng).not.toHaveBeenCalled()
  })

  it('filter excludes React Flow chrome (minimap/controls/panel) and keeps the rest', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    await captureViewport(rf, el)

    const [, opts] = toPng.mock.calls[0] as unknown as [
      HTMLElement,
      { filter: (node: HTMLElement) => boolean },
    ]

    function nodeWith(...classes: string[]): HTMLElement {
      const n = document.createElement('div')
      n.classList.add(...classes)
      return n
    }

    // Chrome is filtered out.
    expect(opts.filter(nodeWith('react-flow__minimap'))).toBe(false)
    expect(opts.filter(nodeWith('react-flow__controls'))).toBe(false)
    expect(opts.filter(nodeWith('react-flow__panel'))).toBe(false)
    // Diagram content is kept.
    expect(opts.filter(nodeWith('react-flow__node'))).toBe(true)
    expect(opts.filter(nodeWith())).toBe(true)
  })
})

describe('computeCaptureFrame', () => {
  it('sizes the frame to the (ceil) bounds and builds the translate/scale transform', () => {
    getViewportForBounds.mockReturnValueOnce({ x: 5, y: 7, zoom: 0.75 })
    const rf: CaptureInstance = {
      getNodes: vi.fn(() => []) as CaptureInstance['getNodes'],
      getNodesBounds: vi.fn(() => ({
        x: 0,
        y: 0,
        width: 399.2,
        height: 199.6,
      })) as CaptureInstance['getNodesBounds'],
    }

    const frame = computeCaptureFrame(rf)

    // Frame = ceil(bounds), not inflated.
    expect(frame.imageWidth).toBe(400)
    expect(frame.imageHeight).toBe(200)
    expect(frame.transform).toBe('translate(5px, 7px) scale(0.75)')

    // Default relative padding 0.1 forwarded; frame dims are the bounds size.
    expect(getViewportForBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 399.2, height: 199.6 },
      400,
      200,
      0.5,
      2,
      0.1,
    )
  })
})
