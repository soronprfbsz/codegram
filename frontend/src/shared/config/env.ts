/**
 * Typed access to Vite environment variables.
 * shared layer: imports nothing upward (FSD rule).
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
} as const
