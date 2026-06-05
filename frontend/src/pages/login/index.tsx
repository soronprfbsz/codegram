import { Link } from 'react-router'
import { LoginForm } from '@/features/auth'

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">ERD-DBML</h1>
        <LoginForm />
        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  )
}
