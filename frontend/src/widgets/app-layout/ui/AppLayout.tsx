import { Outlet, useLocation } from 'react-router'
import { AppSidebar } from '@/widgets/app-sidebar'
import { TableDocViewHost } from '@/widgets/table-doc-view'
import { useSidebarStore } from '@/shared/store/sidebar'

/**
 * Shell for authenticated routes: persistent sidebar + main outlet.
 * The sidebar collapse state is "auto" until the user toggles — auto resolves
 * to the icon rail on the editor (space-tight) and expanded elsewhere.
 *
 * widgets layer: composes widgets/app-sidebar + shared/store.
 */
export function AppLayout() {
  const { pathname } = useLocation()
  const isEditor = pathname.startsWith('/editor')
  const stored = useSidebarStore((s) => s.collapsed)
  const setCollapsed = useSidebarStore((s) => s.setCollapsed)
  const collapsed = stored ?? isEditor

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      {/* Single global 테이블 정의서 HTML overlay — opened from the editor or the
          sidebar's per-project "⋯" menu via useTableDocViewStore. */}
      <TableDocViewHost />
    </div>
  )
}
