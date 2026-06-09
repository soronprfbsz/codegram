import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function renderToggle() {
    // Fresh module import so zustand store re-initializes
    const { ThemeToggle } = await import('./ThemeToggle')
    return render(<ThemeToggle />)
  }

  it('renders Sun icon when theme is dark (default)', async () => {
    await renderToggle()
    // Sun icon should be present; Moon should not
    const btn = screen.getByRole('button', { name: '테마 전환' })
    expect(btn).toBeInTheDocument()
    expect(btn.title).toBe('라이트 모드로 전환')
    // lucide renders an svg; check the title attribute for mode
    expect(screen.queryByTitle('moon')).toBeNull()
  })

  it('renders Moon icon when theme is light', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('light')
    await renderToggle()
    const btn = screen.getByRole('button', { name: '테마 전환' })
    expect(btn.title).toBe('다크 모드로 전환')
  })

  it('clicking calls toggle: dark → light, button title flips', async () => {
    const user = userEvent.setup()
    await renderToggle()

    const btn = screen.getByRole('button', { name: '테마 전환' })
    expect(btn.title).toBe('라이트 모드로 전환')

    await user.click(btn)

    // After toggle to light, title changes
    expect(btn.title).toBe('다크 모드로 전환')
    // DOM class should no longer have 'dark'
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
