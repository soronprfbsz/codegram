import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyText } from './copyText'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else setClipboard(undefined)
  vi.restoreAllMocks()
})

describe('copyText', () => {
  it('uses the async clipboard API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('secret')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('secret')
  })

  it('falls back to execCommand when the clipboard API is unavailable (insecure origin)', async () => {
    setClipboard(undefined)
    const exec = vi.fn().mockReturnValue(true)
    // jsdom doesn't implement execCommand, so define it before use.
    Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
    expect(await copyText('secret')).toBe(true)
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('returns false when both paths fail', async () => {
    setClipboard(undefined)
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false),
    })
    expect(await copyText('secret')).toBe(false)
  })
})
