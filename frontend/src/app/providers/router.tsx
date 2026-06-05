import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { HomePage } from '@/pages/home'
import { EditorPage } from '@/pages/editor'
import { LoginPage } from '@/pages/login'
import { RegisterPage } from '@/pages/register'
import { RequireAuth, RequireGuest } from '@/app/providers/RequireAuth'

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <RequireAuth>
        <HomePage />
      </RequireAuth>
    ),
  },
  {
    path: '/editor/:id',
    element: (
      <RequireAuth>
        <EditorPage />
      </RequireAuth>
    ),
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
