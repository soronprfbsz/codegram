import { QueryProvider } from '@/app/providers/query'
import { AppRouter } from '@/app/providers/router'
import { ToastProvider } from '@/shared/ui/toast'

export function App() {
  return (
    <QueryProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </QueryProvider>
  )
}
