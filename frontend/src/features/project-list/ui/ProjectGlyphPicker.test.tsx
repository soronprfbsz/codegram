import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as client from '@/shared/api/client'
import { ProjectGlyphPicker } from './ProjectGlyphPicker'
import type { Project } from '@/entities/project'

const project: Project = {
  id: 'p-1',
  user_id: 'u-1',
  name: 'P',
  dbml_text: '',
  layout: {},
  glyph: null,
  color: null,
  bg_color: null,
  created_at: '2026-06-19T00:00:00Z',
  updated_at: '2026-06-19T00:00:00Z',
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('ProjectGlyphPicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('PATCHes color when a swatch is clicked', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockResolvedValue({ ...project, color: 'blue' })
    const user = setup()
    render(<ProjectGlyphPicker project={project} />, { wrapper })

    await user.click(screen.getByLabelText('프로젝트 아이콘 변경'))
    await user.click(screen.getByLabelText('아이콘·글씨색 blue'))

    expect(spy).toHaveBeenCalledWith(
      '/projects/p-1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      color: 'blue',
    })
  })

  it('shows ring on the currently selected color swatch', async () => {
    const user = setup()
    render(<ProjectGlyphPicker project={{ ...project, color: 'blue' }} />, { wrapper })

    await user.click(screen.getByLabelText('프로젝트 아이콘 변경'))

    expect(screen.getByLabelText('아이콘·글씨색 blue')).toHaveClass('ring-2')
    expect(screen.getByLabelText('아이콘·글씨색 red')).not.toHaveClass('ring-2')
  })

  it('PATCHes glyph when an icon is clicked', async () => {
    const spy = vi
      .spyOn(client, 'apiFetch')
      .mockResolvedValue({ ...project, glyph: '@db' })
    const user = setup()
    render(<ProjectGlyphPicker project={project} />, { wrapper })

    await user.click(screen.getByLabelText('프로젝트 아이콘 변경'))
    await user.click(screen.getByTestId('glyph-option-db'))

    expect(JSON.parse(spy.mock.calls[0][1]!.body as string)).toEqual({
      glyph: '@db',
    })
  })
})
