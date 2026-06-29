import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import {
  ProjectGlyph,
  useDeleteProject,
  useUpdateProject,
  type Project,
  type ProjectUpdatePayload,
} from '@/entities/project'
import {
  PROJECT_BG_COLOR_KEYS,
  PROJECT_ICON_COLOR_KEYS,
  PROJECT_FG_COLORS,
  PROJECT_BG_COLORS,
  PROJECT_GLYPH_PALETTE,
  GLYPH_MAX_LENGTH,
  resolveGlyphIcon,
  CHECKER_SWATCH,
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
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { ShareDialog, useLeaveProject } from '@/features/project-sharing'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateProject = useUpdateProject(project.id)
  const deleteProject = useDeleteProject()
  const leaveProject = useLeaveProject()

  // Role on this project (null defensively → treat as owner-less; menus hide).
  const isOwner = project.role === 'owner'
  const isShared = project.role === 'editor' || project.role === 'viewer'
  const canEditMeta = isOwner || project.role === 'editor'

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  // Edit dialog (name + glyph + color), seeded from the project on open.
  const [editOpen, setEditOpen] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [draftGlyph, setDraftGlyph] = useState<string | null>(project.glyph)
  const [draftColor, setDraftColor] = useState<string | null>(project.color)
  const [draftBgColor, setDraftBgColor] = useState<string | null>(project.bg_color)

  function openEdit() {
    setDraftName(project.name)
    setDraftGlyph(project.glyph)
    setDraftColor(project.color)
    setDraftBgColor(project.bg_color)
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
    if (draftBgColor && draftBgColor !== project.bg_color) payload.bg_color = draftBgColor

    if (Object.keys(payload).length > 0) await updateProject.mutateAsync(payload)
    setEditOpen(false)
  }

  async function handleDelete() {
    await deleteProject.mutateAsync(project.id)
    setConfirmOpen(false)
    // Deleting the project currently open in the editor would orphan the route.
    if (active) navigate('/')
  }

  async function handleLeave() {
    await leaveProject.mutateAsync(project.id)
    setLeaveOpen(false)
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
        <ProjectGlyph glyph={project.glyph} color={project.color} bgColor={project.bg_color} size={20} className="opacity-90" />
        {!collapsed && <span className="truncate">{project.name}</span>}
        {!collapsed && isShared ? (
          <span
            data-testid={`sidebar-project-shared-${project.id}`}
            title={
              project.owner_email
                ? t('projectRow.sharedBy', { email: project.owner_email })
                : undefined
            }
            className="shrink-0 rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] text-sidebar-foreground/70"
          >
            {t(`sharing.role_${project.role}`)}
          </span>
        ) : null}
      </Link>

      {/* Management menu (편집/삭제) only in the expanded sidebar. In the
          collapsed icon rail it would overlap the glyph in the narrow row —
          stealing the project's click, hiding the glyph on hover, and lingering
          (focus 복귀) after close — so the rail is navigation-only. */}
      {!collapsed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('projectRow.menu', { name: project.name })}
              data-testid={`sidebar-project-menu-${project.id}`}
              className={cn(
                'absolute top-1/2 right-1 grid size-6 -translate-y-1/2 place-items-center rounded-md text-sidebar-foreground/60 transition',
                'opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100',
              )}
            >
              <MoreHorizontal size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEditMeta ? (
              <DropdownMenuItem onSelect={openEdit}>{t('projectRow.edit')}</DropdownMenuItem>
            ) : null}
            {isOwner ? (
              <DropdownMenuItem
                data-testid={`sidebar-project-share-${project.id}`}
                onSelect={() => setShareOpen(true)}
              >
                {t('projectRow.share')}
              </DropdownMenuItem>
            ) : null}
            {isOwner ? (
              <DropdownMenuItem
                onSelect={() => setConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                {t('projectRow.delete')}
              </DropdownMenuItem>
            ) : null}
            {isShared ? (
              <DropdownMenuItem
                data-testid={`sidebar-project-leave-${project.id}`}
                onSelect={() => setLeaveOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                {t('projectRow.leave')}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Edit dialog: name + glyph + color */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projectRow.editTitle')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Live preview + name */}
            <div className="flex items-center gap-3">
              <ProjectGlyph glyph={draftGlyph} color={draftColor} bgColor={draftBgColor} size={40} />
              <input
                value={draftName}
                autoFocus
                aria-label={t('projectRow.name')}
                placeholder={t('projectRow.name')}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit()
                }}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
            </div>

            {/* 아이콘·글씨색 (투명 제외) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('glyph.iconColorLabel')}</span>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_ICON_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={t('glyph.iconColorAria', { key })}
                    onClick={() => setDraftColor(key)}
                    className={cn(
                      'size-6 rounded-full border border-border',
                      draftColor === key &&
                        'ring-2 ring-ring ring-offset-1 ring-offset-background',
                    )}
                    style={{ backgroundColor: PROJECT_FG_COLORS[key] }}
                  />
                ))}
              </div>
            </div>

            {/* 배경색 (투명 포함) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('glyph.bgColorLabel')}</span>
              <div className="flex flex-wrap gap-1.5">
                {PROJECT_BG_COLOR_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={t('glyph.bgColorAria', { key })}
                    onClick={() => setDraftBgColor(key)}
                    className={cn(
                      'size-6 rounded-full border border-border',
                      draftBgColor === key &&
                        'ring-2 ring-ring ring-offset-1 ring-offset-background',
                    )}
                    style={
                      key === 'transparent'
                        ? CHECKER_SWATCH
                        : { backgroundColor: PROJECT_BG_COLORS[key] }
                    }
                  />
                ))}
              </div>
            </div>

            {/* Glyph */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t('projectRow.icon')}</span>
              <div className="grid grid-cols-8 gap-1">
                {PROJECT_GLYPH_PALETTE.map((g) => {
                  const Icon = resolveGlyphIcon(g)
                  const name = g.slice(1)
                  return (
                    <button
                      key={g}
                      type="button"
                      data-testid={`glyph-option-${name}`}
                      aria-label={t('glyph.iconAria', { name })}
                      onClick={() => setDraftGlyph(g)}
                      className={cn(
                        'grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
                        draftGlyph === g && 'bg-muted text-foreground ring-1 ring-ring',
                      )}
                    >
                      {Icon ? <Icon size={17} /> : <span className="text-base">{g}</span>}
                    </button>
                  )
                })}
              </div>
              <input
                value={draftGlyph ?? ''}
                onChange={(e) => setDraftGlyph(e.target.value || null)}
                maxLength={GLYPH_MAX_LENGTH}
                aria-label={t('projectRow.iconCustomAria')}
                placeholder={t('projectRow.iconCustomPlaceholder')}
                className="mt-1 h-8 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateProject.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — 공통 모달 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        testId="project-row-delete-confirm"
        title={t('projectRow.deleteTitle')}
        description={t('projectRow.deleteDesc', { name: project.name })}
        confirmDisabled={deleteProject.isPending}
        onConfirm={handleDelete}
      />

      {/* Owner-only share / members modal */}
      {isOwner ? (
        <ShareDialog
          projectId={project.id}
          projectName={project.name}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      ) : null}

      {/* Leave confirmation (members only) */}
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        testId="project-row-leave-confirm"
        title={t('projectRow.leaveTitle')}
        description={t('projectRow.leaveDesc', { name: project.name })}
        confirmLabel={t('projectRow.leave')}
        confirmDisabled={leaveProject.isPending}
        onConfirm={handleLeave}
      />
    </li>
  )
}
