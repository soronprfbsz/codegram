import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { MoreHorizontal } from 'lucide-react'
import {
  ProjectGlyph,
  useDeleteProject,
  useUpdateProject,
  type Project,
  type ProjectUpdatePayload,
} from '@/entities/project'
import {
  PROJECT_COLOR_KEYS,
  PROJECT_COLORS,
  PROJECT_GLYPH_PALETTE,
  GLYPH_MAX_LENGTH,
} from '@/entities/project/model/glyph'
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
 * A sidebar project list row: glyph + name link, plus a hover/focus "⋯" menu
 * with 편집 (name + glyph + color, in a dialog) and Delete. Export + preview
 * live in the editor TopBar's Export menu for the open project, so the sidebar
 * row is purely project management.
 *
 * widgets layer: composes the project entity + shared UI only.
 */
export function ProjectRow({ project, active, collapsed }: ProjectRowProps) {
  const navigate = useNavigate()
  const updateProject = useUpdateProject(project.id)
  const deleteProject = useDeleteProject()

  const [confirmOpen, setConfirmOpen] = useState(false)
  // Edit dialog (name + glyph + color), seeded from the project on open.
  const [editOpen, setEditOpen] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [draftGlyph, setDraftGlyph] = useState<string | null>(project.glyph)
  const [draftColor, setDraftColor] = useState<string | null>(project.color)

  function openEdit() {
    setDraftName(project.name)
    setDraftGlyph(project.glyph)
    setDraftColor(project.color)
    setEditOpen(true)
  }

  async function handleSaveEdit() {
    const payload: ProjectUpdatePayload = {}
    const trimmedName = draftName.trim()
    if (trimmedName && trimmedName !== project.name) payload.name = trimmedName
    const glyph = draftGlyph?.trim() || null
    // The API payload can't clear a glyph (glyph?: string), so only send a set value.
    if (glyph && glyph !== project.glyph) payload.glyph = glyph
    if (draftColor && draftColor !== project.color) payload.color = draftColor

    if (Object.keys(payload).length > 0) await updateProject.mutateAsync(payload)
    setEditOpen(false)
  }

  async function handleDelete() {
    await deleteProject.mutateAsync(project.id)
    setConfirmOpen(false)
    // Deleting the project currently open in the editor would orphan the route.
    if (active) navigate('/')
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
          <DropdownMenuItem onSelect={openEdit}>편집</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit dialog: name + glyph + color */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트 편집</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Live preview + name */}
            <div className="flex items-center gap-3">
              <ProjectGlyph glyph={draftGlyph} color={draftColor} size={40} />
              <input
                value={draftName}
                autoFocus
                aria-label="프로젝트 이름"
                placeholder="프로젝트 이름"
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit()
                }}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* Color */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">색상</span>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={`색상 ${key}`}
                    onClick={() => setDraftColor(key)}
                    className={cn(
                      'size-6 rounded-full border border-border',
                      draftColor === key &&
                        'ring-2 ring-ring ring-offset-1 ring-offset-background',
                    )}
                    style={{ backgroundColor: PROJECT_COLORS[key] }}
                  />
                ))}
              </div>
            </div>

            {/* Glyph */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">아이콘</span>
              <div className="grid grid-cols-8 gap-1">
                {PROJECT_GLYPH_PALETTE.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-label={`아이콘 ${g}`}
                    onClick={() => setDraftGlyph(g)}
                    className={cn(
                      'grid size-7 place-items-center rounded text-base hover:bg-muted',
                      draftGlyph === g && 'bg-muted ring-1 ring-ring',
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <input
                value={draftGlyph ?? ''}
                onChange={(e) => setDraftGlyph(e.target.value || null)}
                maxLength={GLYPH_MAX_LENGTH}
                aria-label="아이콘 직접 입력"
                placeholder="직접 입력 (이모지/문자)"
                className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateProject.isPending}>
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
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
