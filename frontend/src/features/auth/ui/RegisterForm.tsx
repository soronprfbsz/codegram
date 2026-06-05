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
import { useRegister } from '@/features/auth/api/useRegister'
import { useLogin } from '@/features/auth/api/useLogin'

/**
 * Register form: controlled inputs wired to useRegister. fastapi-users'
 * register endpoint does not issue an auth cookie, so on success we log the
 * user in with the same credentials, then navigate home.
 */
export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const register = useRegister()
  const login = useLogin()

  const isPending = register.isPending || login.isPending

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email || !password || !confirmPassword) {
      setError('All fields are required')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    try {
      await register.mutateAsync({ email, password })
      await login.mutateAsync({ email, password })
      navigate('/')
    } catch {
      setError('Registration failed. The email may already be in use.')
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="register-email">Email</Label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-confirm-password">
              Confirm password
            </Label>
            <Input
              id="register-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
