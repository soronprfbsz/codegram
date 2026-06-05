import { env } from '@/shared/config/env'

/**
 * Thrown when the API responds 401. The session query treats this as
 * "not authenticated" (returns null) rather than a hard error.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Minimal JSON fetch wrapper for the backend API with cookie auth support.
 * shared layer: depends only on shared/config (FSD rule).
 * Always sends credentials so the httpOnly JWT cookie is included.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = env.apiUrl.replace(/\/$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`

  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (response.status === 401) {
    throw new UnauthorizedError()
  }

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as T
}
