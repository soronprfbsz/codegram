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
