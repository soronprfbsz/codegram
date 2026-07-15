import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
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
import { PasswordResetHelp } from './PasswordResetHelp'

/**
 * Login form: controlled email + password inputs wired to the useLogin
 * mutation. On success the session is invalidated and we navigate home,
 * where the route guard confirms the authenticated state.
 */
export function LoginForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const login = useLogin()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!email || !password) {
      setError(t('auth.emailPasswordRequired'))
      return
    }

    try {
      await login.mutateAsync({ email, password })
      navigate('/')
    } catch {
      setError(t('auth.loginFailed'))
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle asChild>
          <h2>{t('auth.login')}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-email">{t('auth.email')}</Label>
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
            <Label htmlFor="login-password">{t('auth.password')}</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={login.isPending}
            />
            <PasswordResetHelp />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={login.isPending}
          >
            {login.isPending ? t('auth.loggingIn') : t('auth.login')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
