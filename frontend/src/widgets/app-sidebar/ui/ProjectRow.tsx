import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import {
  ProjectGlyph,
  useDeleteProject,
  useUpdateProject,
  type Project,
} from '@/entities/project'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

export interface ProjectRowProps {
  project: Project
  /** True when this project's editor route is the current location. */
  active: boolean
  /** Rail (icon-only) mode hides the label + uses native title tooltips. */
  collapsed: boolean
}

/**
 * A sidebar project list row: glyph + name link, inline rename, and a hover/
 * focus "⋯" menu with Rename / Delete. Preview + all export (Diagram · Table
 * Doc · SQL) now live in the editor TopBar's Export menu for the open project,
 * so the sidebar row is purely project management.
 *
 * widgets layer: composes the project entity + shared UI only.
 */
export function ProjectRow({ project, active, collapsed }: ProjectRowProps) {
  const navigate = useNavigate()
  const updateProject = useUpdateProject(project.id)
  const deleteProject = useDeleteProject()

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleRename() {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === project.name) {
      setEditing(false)
      return
    }
    await updateProject.mutateAsync({ name: trimmed })
    setEditing(false)
  }

  async function handleDelete() {
    await deleteProject.mutateAsync(project.id)
    setConfirmOpen(false)
    // Deleting the project currently open in the editor would orphan the route.
    if (active) navigate('/')
  }

  if (editing) {
    return (
      <li className="px-0.5">
        <input
          value={draftName}
          autoFocus
          aria-label="프로젝트 이름"
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            else if (e.key === 'Escape') {
              setDraftName(project.name)
              setEditing(false)
            }
          }}
          className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground outline-none focus:border-primary"
        />
      </li>
    )
  }

  return (
    <li className="group/row relative">
      <Link
        to={`/editor/${project.id}`}
        title={project.name}
        data-testid={`sidebar-project-${project.id}`}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition',
          active
            ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60',
          collapsed ? 'justify-center px-0' : 'pr-8',
        )}
      >
        <ProjectGlyph glyph={project.glyph} color={project.color} size={20} className="opacity-90" />
        {!collapsed && <span className="truncate">{project.name}</span>}
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${project.name} 메뉴`}
            data-testid={`sidebar-project-menu-${project.id}`}
            className={cn(
              'absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-sidebar-foreground/60 transition',
              'opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100',
              collapsed && 'right-0.5',
            )}
          >
            <MoreHorizontal size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraftName(project.name)
              setEditing(true)
            }}
          >
            이름 변경
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트를 삭제할까요?</DialogTitle>
            <DialogDescription>
              «{project.name}» 을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteProject.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              삭제
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}
