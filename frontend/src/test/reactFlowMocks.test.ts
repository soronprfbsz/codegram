import { describe, it, expect } from 'vitest'

describe('jsdom mocks for React Flow', () => {
  it('defines ResizeObserver globally', () => {
    expect(typeof globalThis.ResizeObserver).toBe('function')
    const ro = new globalThis.ResizeObserver(() => {})
    expect(typeof ro.observe).toBe('function')
    expect(typeof ro.disconnect).toBe('function')
  })

  it('defines matchMedia on window', () => {
    expect(typeof window.matchMedia).toBe('function')
    expect(window.matchMedia('(min-width: 1px)').matches).toBe(false)
  })

  it('gives DOMRect-like results from getBoundingClientRect', () => {
    const el = document.createElement('div')
    const rect = el.getBoundingClientRect()
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  })
})
