import { env } from '@/shared/config/env'

/**
 * Minimal JSON fetch wrapper for the backend API.
 * shared layer: depends only on shared/config (FSD rule).
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = env.apiUrl.replace(/\/$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}
