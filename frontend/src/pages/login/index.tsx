import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LoginForm } from '@/features/auth'

export function LoginPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl font-medium">{t('auth.brand')}</h1>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium underline">
            {t('auth.signup')}
          </Link>
        </p>
      </div>
    </main>
  )
}
