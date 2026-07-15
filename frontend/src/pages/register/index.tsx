import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { RegisterForm } from '@/features/auth'

export function RegisterPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">{t('auth.brand')}</h1>
        <RegisterForm />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link to="/login" className="font-medium underline">
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </main>
  )
}
