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
 * An API error carrying the server's {detail} message and the HTTP status.
 * Callers (e.g. CRUD forms) can show err.message and branch on err.status.
 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Read a FastAPI-style {detail} string from a non-ok response body.
 * Falls back to the status line when the body is missing or not JSON.
 * Clones the response so the body can still be consumed elsewhere.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `API request failed: ${response.status} ${response.statusText}`
  try {
    const body = (await response.clone().json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail.length > 0) {
      return body.detail
    }
    return fallback
  } catch {
    return fallback
  }
}

/**
 * Minimal JSON fetch wrapper for the backend API with cookie auth support.
 * shared layer: depends only on shared/config (FSD rule).
 * Always sends credentials so the httpOnly JWT cookie is included.
 * On non-ok responses it throws an ApiError carrying the server {detail}.
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
    const message = await readErrorMessage(response)
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}
