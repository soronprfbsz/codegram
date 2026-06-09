import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErdTopBar } from './ErdTopBar'

// Minimal stub for ThemeToggle used inside ErdTopBar
vi.mock('@/shared/ui/ThemeToggle', () => ({
  ThemeToggle: () => <button aria-label="테마 전환">ThemeToggle</button>,
}))

// Stub the logomark import (Vite SVG URL, jsdom doesn't resolve it)
vi.mock('@/shared/assets/logomark.svg', () => ({
  default: 'logomark.svg',
}))

function renderTopBar(overrides: Partial<Parameters<typeof ErdTopBar>[0]> = {}) {
  const defaults: Parameters<typeof ErdTopBar>[0] = {
    projectName: 'Test Project',
    autosaveStatus: 'idle',
    onImportSql: vi.fn(),
    onBack: vi.fn(),
    onSync: vi.fn(),
    exportMenu: <button>Export</button>,
    ...overrides,
  }
  return { ...render(<ErdTopBar {...defaults} />), defaults }
}

describe('ErdTopBar', () => {
  it('renders the project name as a heading', () => {
    renderTopBar({ projectName: 'My Schema' })
    expect(screen.getByRole('heading', { name: 'My Schema' })).toBeInTheDocument()
  })

  it('renders the DBML badge', () => {
    renderTopBar()
    expect(screen.getByText('DBML')).toBeInTheDocument()
  })

  it('shows the subtitle when projectMeta is provided', () => {
    renderTopBar({ projectMeta: 'release_manager' })
    expect(screen.getByText(/release_manager\s*·\s*public/)).toBeInTheDocument()
  })

  it('omits the subtitle when projectMeta is absent', () => {
    renderTopBar({ projectMeta: undefined })
    expect(screen.queryByText(/· public/)).toBeNull()
  })

  it('shows "저장됨" with green dot when idle', () => {
    renderTopBar({ autosaveStatus: 'idle' })
    expect(screen.getByText('저장됨')).toBeInTheDocument()
  })

  it('shows "Saving…" when status is saving', () => {
    renderTopBar({ autosaveStatus: 'saving' })
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('shows "Save failed" when status is error', () => {
    renderTopBar({ autosaveStatus: 'error' })
    expect(screen.getByText('Save failed')).toBeInTheDocument()
  })

  it('calls onBack when Back button is clicked', async () => {
    const onBack = vi.fn()
    renderTopBar({ onBack })
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls onImportSql when Import SQL button is clicked', async () => {
    const onImportSql = vi.fn()
    renderTopBar({ onImportSql })
    await userEvent.click(screen.getByRole('button', { name: 'Import SQL' }))
    expect(onImportSql).toHaveBeenCalledTimes(1)
  })

  it('calls onInfo when Info button is clicked', async () => {
    const onInfo = vi.fn()
    renderTopBar({ onInfo })
    await userEvent.click(screen.getByRole('button', { name: /^info$/i }))
    expect(onInfo).toHaveBeenCalledTimes(1)
  })

  it('renders the exportMenu slot', () => {
    renderTopBar({ exportMenu: <button>Export Menu</button> })
    expect(screen.getByText('Export Menu')).toBeInTheDocument()
  })

  it('renders ThemeToggle', () => {
    renderTopBar()
    expect(screen.getByRole('button', { name: '테마 전환' })).toBeInTheDocument()
  })

  it('renders a Sync from DB button and fires onSync', async () => {
    const user = userEvent.setup()
    const onSync = vi.fn()
    render(
      <ErdTopBar
        projectName="P"
        autosaveStatus="idle"
        onImportSql={vi.fn()}
        onBack={vi.fn()}
        onSync={onSync}
        exportMenu={<div />}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Sync from DB' }))
    expect(onSync).toHaveBeenCalledTimes(1)
  })
})
