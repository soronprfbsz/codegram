import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { useChangePassword, meQueryKey } from '@/entities/account'

/**
 * Forced password-change screen (ADR-0016): reached via RequirePasswordOk
 * (client-side guard) or the global 403 must_change_password intercept
 * (query.tsx). current_password is intentionally null — the forced path
 * doesn't require/verify it (server enforces this too). On success,
 * invalidate account/me so the guard sees must_change_password=false and
 * lets the caller back into the app.
 */
export function ForcePasswordChangePage() {
  const { t } = useTranslation()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const changePassword = useChangePassword()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsNoMatch'))
      return
    }
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }

    try {
      await changePassword.mutateAsync({
        current_password: null,
        new_password: newPassword,
      })
      await queryClient.invalidateQueries({ queryKey: meQueryKey })
      navigate('/')
    } catch {
      setError(t('account.currentPasswordWrong'))
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle asChild>
            <h1>{t('forcePasswordChange.title')}</h1>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('forcePasswordChange.description')}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="force-new-password">
                {t('account.newPassword')}
              </Label>
              <Input
                id="force-new-password"
                data-testid="force-new-password-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                disabled={changePassword.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="force-confirm-password">
                {t('account.confirmNewPassword')}
              </Label>
              <Input
                id="force-confirm-password"
                data-testid="force-confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={changePassword.isPending}
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
              disabled={changePassword.isPending}
              data-testid="force-password-submit"
            >
              {changePassword.isPending
                ? t('forcePasswordChange.submitting')
                : t('forcePasswordChange.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
