import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { apiFetch, UnauthorizedError } from './client'

describe('apiFetch', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends credentials: "include" so the httpOnly cookie is forwarded', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await apiFetch('/health')

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.credentials).toBe('include')
  })

  it('throws UnauthorizedError on a 401 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }))

    await expect(apiFetch('/users/me')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('throws a generic Error on other non-ok responses', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 500, statusText: 'Server Error' }),
    )

    await expect(apiFetch('/users/me')).rejects.toThrow(
      'API request failed: 500 Server Error',
    )
  })

  it('extracts the {detail} field from a JSON error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiFetch('/projects/missing')).rejects.toThrow(
      'Project not found',
    )
  })

  it('attaches the HTTP status to the thrown error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(apiFetch('/projects/missing')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('extracts the reason from a structured {detail:{reason}} error body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { reason: 'must_change_password' } }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    await expect(apiFetch('/projects')).rejects.toMatchObject({
      status: 403,
      reason: 'must_change_password',
    })
  })
})
