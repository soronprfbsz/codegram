import { createBrowserRouter, RouterProvider } from 'react-router'
import { HomePage } from '@/pages/home'

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
