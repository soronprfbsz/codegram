import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card'
import { useLogin } from '@/features/auth/api/useLogin'

/**
 * Login form: controlled email + password inputs wired to the useLogin
 * mutation. On success the session is invalidated and we navigate home,
 * where the route guard confirms the authenticated state.
 */
export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const login = useLogin()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    try {
      await login.mutateAsync({ email, password })
      navigate('/')
    } catch {
      setError('Login failed. Check your email and password.')
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={login.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={login.isPending}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending}
          >
            {login.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
