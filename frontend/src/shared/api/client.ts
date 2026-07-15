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
 * `reason` surfaces a structured {detail: {reason}} body (e.g. ADR-0016's
 * 403 must_change_password) for callers that need to branch on it.
 */
export class ApiError extends Error {
  status: number
  reason?: string

  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.reason = reason
  }
}

/**
 * Read a FastAPI-style error body from a non-ok response: either a plain
 * {detail} string, or a structured {detail: {reason}} object. Falls back to
 * the status line when the body is missing or not JSON. Clones the response
 * so the body can still be consumed elsewhere.
 */
async function readError(
  response: Response,
): Promise<{ message: string; reason?: string }> {
  const fallback = `API request failed: ${response.status} ${response.statusText}`
  try {
    const body = (await response.clone().json()) as { detail?: unknown }
    if (typeof body.detail === 'string' && body.detail.length > 0) {
      return { message: body.detail }
    }
    if (body.detail && typeof body.detail === 'object' && 'reason' in body.detail) {
      const reason = (body.detail as { reason?: unknown }).reason
      if (typeof reason === 'string') {
        return { message: fallback, reason }
      }
    }
    return { message: fallback }
  } catch {
    return { message: fallback }
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
    const { message, reason } = await readError(response)
    throw new ApiError(message, response.status, reason)
  }

  return (await response.json()) as T
}
