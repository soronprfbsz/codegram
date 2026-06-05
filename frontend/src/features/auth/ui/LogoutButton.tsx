import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useLogout } from '@/features/auth/api/useLogout'

/**
 * Logout button: clears the httpOnly cookie via useLogout, then navigates
 * to /login. The session query is reset to null inside the mutation.
 */
export function LogoutButton() {
  const navigate = useNavigate()
  const logout = useLogout()

  async function handleClick() {
    try {
      await logout.mutateAsync()
    } finally {
      navigate('/login')
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={logout.isPending}
    >
      {logout.isPending ? 'Logging out…' : 'Log out'}
    </Button>
  )
}
