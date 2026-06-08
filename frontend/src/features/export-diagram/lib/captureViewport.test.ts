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

import { captureViewport, captureViewportSvg } from './captureViewport'

function makeInstance() {
  return {
    getNodes: vi.fn(() => [{ id: 'public.users' }]),
    getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 400, height: 200 })),
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

    // Image frame = bounds + 2 * default padding (40) => 480 x 280.
    expect(getViewportForBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 400, height: 200 },
      480,
      280,
      0.5,
      2,
      0.1,
    )

    expect(toPng).toHaveBeenCalledTimes(1)
    const [calledEl, opts] = toPng.mock.calls[0] as [
      HTMLElement,
      Record<string, unknown>,
    ]
    expect(calledEl).toBe(el)
    expect(opts.width).toBe(480)
    expect(opts.height).toBe(280)
    expect(opts.pixelRatio).toBe(2)
    expect(opts.backgroundColor).toBe('#ffffff')
    expect((opts.style as Record<string, string>).transform).toBe(
      'translate(10px, 20px) scale(0.5)',
    )
  })

  it('honors CaptureOptions overrides (background, pixelRatio, padding)', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    await captureViewport(rf, el, {
      backgroundColor: '#000000',
      pixelRatio: 3,
      padding: 10,
    })

    // padding 10 => 400 + 20 = 420 x 220.
    expect(getViewportForBounds).toHaveBeenCalledWith(
      { x: 0, y: 0, width: 400, height: 200 },
      420,
      220,
      0.5,
      2,
      0.1,
    )
    const [, opts] = toPng.mock.calls[0] as [HTMLElement, Record<string, unknown>]
    expect(opts.backgroundColor).toBe('#000000')
    expect(opts.pixelRatio).toBe(3)
    expect(opts.width).toBe(420)
  })

  it('captureViewportSvg delegates to toSvg, not toPng', async () => {
    const rf = makeInstance()
    const el = document.createElement('div')

    const dataUrl = await captureViewportSvg(rf, el)

    expect(dataUrl).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E')
    expect(toSvg).toHaveBeenCalledTimes(1)
    expect(toPng).not.toHaveBeenCalled()
  })
})
