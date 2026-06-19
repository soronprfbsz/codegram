import { Link, useLocation, useNavigate } from 'react-router'
import { PanelLeft, Plus, LogOut } from 'lucide-react'
import { useProjectList, ProjectGlyph } from '@/entities/project'
import { useCurrentUser } from '@/entities/session'
import { useLogout } from '@/features/auth'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'
import { cn } from '@/shared/lib/utils'
import logomarkUrl from '@/shared/assets/logomark.svg'

export interface AppSidebarProps {
  /** Collapsed = icon rail (~56px); expanded = ~260px with labels. */
  collapsed: boolean
  /** Toggle between rail and expanded. */
  onToggle: () => void
}

/**
 * Persistent app sidebar (ChatGPT-style) shown on every authenticated page.
 * Header (logo + collapse) → New project → scrollable project list → footer
 * (account · theme · logout). In rail mode only icons show; labels move to
 * native `title` tooltips. Uses the `--sidebar-*` design tokens.
 *
 * widgets layer: composes entities/project + entities/session + features/auth
 * + shared/ui (FSD downward imports only).
 */
export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: projects } = useProjectList()
  const { data: user } = useCurrentUser()
  const logout = useLogout()

  async function handleLogout() {
    try {
      await logout.mutateAsync()
    } finally {
      navigate('/login')
    }
  }

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed}
      className="flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? 56 : 260 }}
    >
      {/* Header: expanded = logo(→home) + brand + toggle; collapsed = toggle
          only, centered in the rail. */}
      <div
        className={cn(
          'flex h-14 items-center px-2.5',
          collapsed ? 'justify-center' : 'gap-2',
        )}
      >
        {!collapsed && (
          <>
            <Link to="/" title="Codegram 홈" className="flex min-w-0 items-center gap-2">
              <img src={logomarkUrl} alt="" className="size-7 shrink-0 rounded-md" />
              <span className="truncate font-display text-[15px] font-medium">
                Codegram
              </span>
            </Link>
            <div className="flex-1" />
          </>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title="사이드바 접기/펼치기"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeft size={17} />
        </button>
      </div>

      {/* New project */}
      <div className="px-2.5 pb-2">
        <Link
          to="/"
          title="새 프로젝트"
          data-testid="sidebar-new-project"
          className={cn(
            'flex h-9 items-center gap-2 rounded-xl bg-primary px-3 font-medium text-primary-foreground transition hover:brightness-95',
            collapsed && 'justify-center px-0',
          )}
        >
          <Plus size={17} className="shrink-0" />
          {!collapsed && <span className="truncate text-sm">새 프로젝트</span>}
        </Link>
      </div>

      {/* Project list */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1">
        {!collapsed && (
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Projects
          </div>
        )}
        <ul className="flex flex-col gap-0.5">
          {(projects ?? []).map((p) => {
            const active = pathname === `/editor/${p.id}`
            return (
              <li key={p.id}>
                <Link
                  to={`/editor/${p.id}`}
                  title={p.name}
                  data-testid={`sidebar-project-${p.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition',
                    active
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <ProjectGlyph
                    glyph={p.glyph}
                    color={p.color}
                    size={20}
                    className="opacity-90"
                  />
                  {!collapsed && <span className="truncate">{p.name}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer: account · theme · logout */}
      <div className="border-t border-sidebar-border p-2.5">
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          <div
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            title={user?.email}
          >
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/70">
              {user?.email}
            </span>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            aria-label="Log out"
            title="로그아웃"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
