import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'
import { RequireAuth, RequireGuest } from '@/app/providers/RequireAuth'
import { AppLayout } from '@/widgets/app-layout'

// Lazy-load the editor route so @dbml/core, CodeMirror and React Flow are
// code-split onto the editor chunk only — NOT shipped to login/home (Plan 3b
// D10 tidy-up). pages/editor exports a NAMED EditorPage, so map it to a
// default export for React.lazy.
const EditorPage = lazy(() =>
  import('@/pages/editor').then((m) => ({ default: m.EditorPage })),
)

const router = createBrowserRouter([
  {
    // Authenticated shell: persistent sidebar + main outlet.
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/editor/:id',
        element: (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                Loading editor…
              </div>
            }
          >
            <EditorPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/login',
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  {
    path: '/register',
    element: (
      <RequireGuest>
        <RegisterPage />
      </RequireGuest>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
