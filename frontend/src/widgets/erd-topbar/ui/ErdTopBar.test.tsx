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

  it('shows "저장됨" with green dot when idle and no last-modified time', () => {
    renderTopBar({ autosaveStatus: 'idle' })
    expect(screen.getByText('저장됨')).toBeInTheDocument()
  })

  it('shows the last-modified time instead of "저장됨" when provided and saved', () => {
    renderTopBar({ autosaveStatus: 'saved', lastModified: '2026-07-08T05:32:00Z' })
    expect(screen.getByText(/최종 수정/)).toBeInTheDocument()
    expect(screen.queryByText('저장됨')).toBeNull()
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
