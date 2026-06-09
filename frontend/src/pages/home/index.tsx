import { useCurrentUser } from '@/entities/session'
import { LogoutButton } from '@/features/auth'
import { ProjectList } from '@/features/project-list'
import { DbImportButton } from '@/features/db-import'

export function HomePage() {
  const { data: user } = useCurrentUser()

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-2xl font-bold">ERD-DBML</h1>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-gray-600">
                Logged in as <strong>{user.email}</strong>
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex justify-end">
          <DbImportButton />
        </div>
        <ProjectList />
      </main>
    </div>
  )
}
