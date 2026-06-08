import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from './download'

describe('downloadBlob', () => {
  const createObjectURL = vi.fn(() => 'blob:mock-url')
  const revokeObjectURL = vi.fn()
  let clickSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    // jsdom does not implement these; stub them on the URL constructor.
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    // Spy the anchor click so jsdom does not attempt a real navigation.
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clickSpy.mockRestore()
  })

  it('creates an object URL from the blob and clicks a download anchor', () => {
    const blob = new Blob(['hello'], { type: 'text/plain' })

    downloadBlob(blob, 'diagram.png')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)

    // The clicked anchor carried the object URL + the filename.
    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement
    expect(anchor.getAttribute('href')).toBe('blob:mock-url')
    expect(anchor.getAttribute('download')).toBe('diagram.png')
  })

  it('revokes the object URL after clicking', () => {
    downloadBlob(new Blob(['x']), 'file.txt')

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
