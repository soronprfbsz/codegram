import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import i18n from '@/shared/i18n'
import { render, screen } from '@testing-library/react'

// 이 스위트는 영어 라벨/문구를 단언하므로 인터페이스 언어를 en으로 고정한다.
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { DbImportButton } from './DbImportButton'

const navigate = vi.fn()
vi.mock('react-router', () => ({ useNavigate: () => navigate }))

const mutateAsync = vi.fn()
vi.mock('@/entities/project', () => ({
  useCreateProject: () => ({ mutateAsync, isPending: false }),
}))

// Stub the dialog: expose a button that fires onIntrospected with canned data.
vi.mock('./DbConnectDialog', () => ({
  DbConnectDialog: ({
    open,
    onIntrospected,
  }: {
    open: boolean
    onIntrospected: (dbml: string, name: string) => void
  }) =>
    open ? (
      <button onClick={() => onIntrospected('Table users {\n  id int\n}', 'mydb')}>
        fire-introspected
      </button>
    ) : null,
}))

const setup = () =>
  userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })

describe('DbImportButton', () => {
  beforeEach(() => {
    navigate.mockReset()
    mutateAsync.mockReset()
  })

  it('opens the dialog and creates a project + navigates on introspected', async () => {
    const user = setup()
    mutateAsync.mockResolvedValueOnce({ id: 'p-9' })
    render(<DbImportButton />)

    await user.click(screen.getByRole('button', { name: 'Connect to Database' }))
    await user.click(screen.getByRole('button', { name: 'fire-introspected' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'mydb',
      dbml_text: 'Table users {\n  id int\n}',
    })
    expect(navigate).toHaveBeenCalledWith('/editor/p-9')
  })
})
