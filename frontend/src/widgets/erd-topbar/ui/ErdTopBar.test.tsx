import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErdTopBar } from './ErdTopBar'

function renderTopBar(overrides: Partial<Parameters<typeof ErdTopBar>[0]> = {}) {
  const defaults: Parameters<typeof ErdTopBar>[0] = {
    projectName: 'Test Project',
    autosaveStatus: 'idle',
    ...overrides,
  }
  return { ...render(<ErdTopBar {...defaults} />), defaults }
}

describe('ErdTopBar', () => {
  it('renders the project name as a heading', () => {
    renderTopBar({ projectName: 'My Schema' })
    expect(screen.getByRole('heading', { name: 'My Schema' })).toBeInTheDocument()
  })

  it('shows the subtitle when projectMeta is provided', () => {
    renderTopBar({ projectMeta: 'release_manager' })
    expect(screen.getByText(/release_manager\s*·\s*public/)).toBeInTheDocument()
  })

  it('omits the subtitle when projectMeta is absent', () => {
    renderTopBar({ projectMeta: undefined })
    expect(screen.queryByText(/· public/)).toBeNull()
  })

  it('shows "저장됨" with the dot when idle and no last-modified time', () => {
    renderTopBar({ autosaveStatus: 'idle' })
    expect(screen.getByText('저장됨')).toBeInTheDocument()
    expect(screen.getByTestId('save-dot')).toBeInTheDocument()
  })

  it('spells the last save out under the title', () => {
    renderTopBar({ autosaveStatus: 'saved', lastModified: '2026-07-08T05:32:00Z' })
    // Under the title the stamp reads as a property of the project, so it can
    // say what it is rather than hiding the sentence in a tooltip.
    expect(screen.getByText(/^마지막 저장 /)).toBeInTheDocument()
    expect(screen.queryByText('저장됨')).toBeNull()
  })

  it('names who saved, shortened, with the full address in the tooltip', () => {
    renderTopBar({
      autosaveStatus: 'saved',
      lastModified: '2026-07-08T05:32:00Z',
      lastEditedBy: 'hawkeye@example.com',
    })
    // Shared document: the time alone cannot say whose version you are reading.
    const line = screen.getByText(/· hawkeye$/)
    expect(line).toBeInTheDocument()
    expect(line.closest('[title]')).toHaveAttribute(
      'title',
      expect.stringContaining('hawkeye@example.com'),
    )
  })

  it('falls back to the bare time when nobody is attributed', () => {
    renderTopBar({ autosaveStatus: 'saved', lastModified: '2026-07-08T05:32:00Z' })
    expect(screen.queryByText(/·\s*$/)).toBeNull()
    expect(screen.getByText(/^마지막 저장 /)).toBeInTheDocument()
  })

  it('does not name a saver while saving or after a failure', () => {
    renderTopBar({ autosaveStatus: 'saving', lastEditedBy: 'hawkeye@example.com' })
    expect(screen.queryByText(/hawkeye/)).toBeNull()
  })

  it('still shows "저장 중…" (not the time) while saving', () => {
    renderTopBar({ autosaveStatus: 'saving', lastModified: '2026-07-08T05:32:00Z' })
    expect(screen.getByText('저장 중…')).toBeInTheDocument()
  })

  it('shows "Saving…" when status is saving', () => {
    renderTopBar({ autosaveStatus: 'saving' })
    expect(screen.getByText('저장 중…')).toBeInTheDocument()
  })

  it('shows "Save failed" when status is error', () => {
    renderTopBar({ autosaveStatus: 'error' })
    expect(screen.getByText('저장 실패')).toBeInTheDocument()
  })

  it('is slim: no Actions dropdown, no Import/panel-toggle (those moved out)', () => {
    renderTopBar()
    expect(screen.queryByRole('button', { name: 'Actions' })).toBeNull()
    expect(screen.queryByText('Import SQL')).toBeNull()
    expect(screen.queryByText(/정보 패널/)).toBeNull()
  })

  it('renders the exportMenu slot on the right', () => {
    renderTopBar({ exportMenu: <button>EXPORT_SLOT</button> })
    expect(screen.getByRole('button', { name: 'EXPORT_SLOT' })).toBeInTheDocument()
  })

  it('does not render the theme toggle (it lives in the sidebar now)', () => {
    renderTopBar()
    expect(screen.queryByRole('button', { name: '테마 전환' })).toBeNull()
  })
})
