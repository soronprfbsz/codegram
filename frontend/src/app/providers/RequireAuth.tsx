import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useCurrentUser } from '@/entities/session'

function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      Loading…
    </div>
  )
}

/**
 * Protect a route for authenticated users. While the session is loading,
 * show a loading state; if logged out (user === null), redirect to /login,
 * preserving the intended location in router state.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser()
  const location = useLocation()

  if (isPending) {
    return <SessionLoading />
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

/**
 * Guest-only routes (login/register). Authenticated users are redirected to
 * home so they cannot see the auth forms while logged in.
 */
export function RequireGuest({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser()

  if (isPending) {
    return <SessionLoading />
  }
  if (user) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
