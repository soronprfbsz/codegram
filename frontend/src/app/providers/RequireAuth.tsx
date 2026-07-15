import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useCurrentUser } from '@/entities/session'
import { useMe } from '@/entities/account'

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

/**
 * Block the authenticated app until a forced password change is done
 * (ADR-0016): while GET /account/me is pending show a loading state; once
 * must_change_password is true, redirect to /force-password-change. Nest
 * inside RequireAuth (only meaningful for a logged-in session).
 */
export function RequirePasswordOk({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()

  if (isPending) {
    return <SessionLoading />
  }
  if (me?.must_change_password) {
    return <Navigate to="/force-password-change" replace />
  }
  return <>{children}</>
}

/**
 * Guest-analog for /force-password-change: only reachable while
 * must_change_password is true, otherwise redirect home (nothing left to
 * force-change).
 */
export function RequireMustChangePassword({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()

  if (isPending) {
    return <SessionLoading />
  }
  if (!me?.must_change_password) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
