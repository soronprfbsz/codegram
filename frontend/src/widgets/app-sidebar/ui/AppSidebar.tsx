import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { PanelLeft, FolderKanban, LogOut, Settings } from 'lucide-react'
import { useProjectList } from '@/entities/project'
import { useCurrentUser } from '@/entities/session'
import { useLogout } from '@/features/auth'
import { AccountSettingsDialog } from '@/features/account-settings'
import { ThemeToggle } from '@/shared/ui/ThemeToggle'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import logomarkUrl from '@/shared/assets/logomark.svg'
import { ProjectRow } from './ProjectRow'

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
  const { t } = useTranslation()
  const { data: projects } = useProjectList()
  const { data: user } = useCurrentUser()
  const logout = useLogout()
  const [settingsOpen, setSettingsOpen] = useState(false)

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
            <Link to="/" title={t('sidebar.home')} className="flex min-w-0 items-center gap-2">
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
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={t('sidebar.toggle')}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <PanelLeft size={17} />
        </button>
      </div>

      {/* Primary nav menu (standard app-shell menu rows, not a filled button) */}
      <nav className="px-2.5 pb-1">
        <Link
          to="/"
          title={t('sidebar.manageProjects')}
          data-testid="sidebar-manage-projects"
          aria-current={pathname === '/' ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition',
            pathname === '/'
              ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
            collapsed && 'justify-center px-0',
          )}
        >
          <FolderKanban size={18} className="shrink-0" />
          {!collapsed && <span className="truncate">{t('sidebar.manageProjects')}</span>}
        </Link>
      </nav>

      {/* Project list */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1">
        {!collapsed && (
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {t('sidebar.projects')}
          </div>
        )}
        <ul className="flex flex-col gap-0.5">
          {(projects ?? []).map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              active={pathname === `/editor/${p.id}`}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      {/* Footer: account(설정 메뉴) · theme · logout */}
      <div className="border-t border-sidebar-border p-2.5">
        <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
          {/* 계정 영역 클릭 → 컨텍스트 메뉴(계정 설정). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="account-menu-trigger"
                aria-label={t('account.menuSettings')}
                title={user?.email}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg outline-none transition hover:bg-sidebar-accent',
                  collapsed ? 'justify-center p-0' : 'flex-1 p-1',
                )}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {user?.email?.[0]?.toUpperCase() ?? '?'}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1 truncate text-left text-xs text-sidebar-foreground/70">
                    {user?.email}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top">
              <DropdownMenuItem
                data-testid="account-settings-item"
                onSelect={() => setSettingsOpen(true)}
              >
                <Settings size={15} strokeWidth={2} />
                {t('account.menuSettings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            aria-label={t('sidebar.logout')}
            title={t('sidebar.logout')}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <AccountSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
