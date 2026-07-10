import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShareDialog } from './ShareDialog'
import * as client from '@/shared/api/client'
import { ApiError } from '@/shared/api/client'

const ROSTER = [
  { user_id: 'u-owner', email: 'alice@example.com', role: 'owner' },
  { user_id: 'u-bob', email: 'bob@example.com', role: 'editor' },
]

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ShareDialog projectId="p-1" projectName="P" open onOpenChange={() => {}} />
    </QueryClientProvider>,
  )
}

describe('ShareDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists the owner and members from the API', async () => {
    vi.spyOn(client, 'apiFetch').mockResolvedValue(ROSTER as never)
    renderDialog()
    expect(await screen.findByTestId('share-member-alice@example.com')).toHaveTextContent(
      '소유자',
    )
    expect(screen.getByTestId('share-member-bob@example.com')).toBeInTheDocument()
  })

  it('invites by email via POST and clears the field', async () => {
    const fetchSpy = vi
      .spyOn(client, 'apiFetch')
      .mockImplementation((path: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve({
            user_id: 'u-carol',
            email: 'carol@example.com',
            role: 'editor',
          } as never)
        }
        return Promise.resolve(ROSTER as never)
      })
    renderDialog()
    const input = await screen.findByTestId('share-invite-email')
    fireEvent.change(input, { target: { value: 'carol@example.com' } })
    fireEvent.click(screen.getByTestId('share-invite-submit'))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/projects/p-1/members',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('transfers ownership via POST after confirming', async () => {
    const fetchSpy = vi
      .spyOn(client, 'apiFetch')
      .mockImplementation((path: string, init?: RequestInit) => {
        if (init?.method === 'POST' && path.includes('transfer-ownership')) {
          return Promise.resolve([
            { user_id: 'u-bob', email: 'bob@example.com', role: 'owner' },
            { user_id: 'u-owner', email: 'alice@example.com', role: 'editor' },
          ] as never)
        }
        return Promise.resolve(ROSTER as never)
      })
    renderDialog()
    fireEvent.click(await screen.findByTestId('share-transfer-bob@example.com'))
    // Confirmation is required before the mutation fires.
    fireEvent.click(await screen.findByTestId('share-transfer-confirm-ok'))

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/projects/p-1/members/u-bob/transfer-ownership',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })

  it('shows a user-not-found message on a 404 invite', async () => {
    vi.spyOn(client, 'apiFetch').mockImplementation((_path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.reject(new ApiError('nope', 404))
      }
      return Promise.resolve(ROSTER as never)
    })
    renderDialog()
    const input = await screen.findByTestId('share-invite-email')
    fireEvent.change(input, { target: { value: 'ghost@example.com' } })
    fireEvent.click(screen.getByTestId('share-invite-submit'))

    expect(await screen.findByTestId('share-invite-error')).toHaveTextContent(
      '해당 이메일의 사용자가 없습니다.',
    )
  })
})
