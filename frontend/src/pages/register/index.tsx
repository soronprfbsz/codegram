import { Link } from 'react-router'
import { RegisterForm } from '@/features/auth'

export function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">ERD-DBML</h1>
        <RegisterForm />
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  )
}
