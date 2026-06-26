import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, FolderPlus } from 'lucide-react'
import type { DbmlSchema } from '@/entities/dbml'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import { Button } from '@/shared/ui/button'
import type { GroupOpHandlers } from '../model/types'

export interface ManageGroupsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current schema (tables + groups). When absent, nothing to manage. */
  schema?: DbmlSchema
  groupOps: GroupOpHandlers
}

/**
 * Bulk table↔group organizer. Filter the table list, multi-select rows, then
 * move them all into a group (existing / Ungrouped / a newly-named one) in one
 * action — the convenient alternative to the per-row "⋯ → Move to" menu.
 *
 * widgets layer: composes entities/dbml schema + shared UI + the panel's
 * GroupOpHandlers (the page wires those to the batch DBML ops).
 */
export function ManageGroupsDialog({ open, onOpenChange, schema, groupOps }: ManageGroupsDialogProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  // 분류 보기 필터: 전체 / 미분류 / 특정 그룹명.
  const [groupFilter, setGroupFilter] = useState<'__all__' | '__ungrouped__' | string>('__all__')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // When the user picks "＋ 새 그룹", the action bar swaps to a name input.
  const [newGroupMode, setNewGroupMode] = useState(false)
  const [newName, setNewName] = useState('')

  const tables = schema?.tables ?? []
  const groups = schema?.tableGroups ?? []

  // tableId → its current group (name + color), absent ⇒ Ungrouped.
  const groupOf = useMemo(() => {
    const m = new Map<string, { name: string; color?: string }>()
    for (const g of groups) for (const tid of g.tables) m.set(tid, { name: g.name, color: g.color })
    return m
  }, [groups])

  const q = filter.trim().toLowerCase()
  const visible = useMemo(
    () =>
      tables.filter((t) => {
        if (q && !t.name.toLowerCase().includes(q)) return false
        if (groupFilter === '__all__') return true
        const g = groupOf.get(t.id)
        if (groupFilter === '__ungrouped__') return !g
        return g?.name === groupFilter
      }),
    [tables, q, groupFilter, groupOf],
  )
  const filterActive = q.length > 0 || groupFilter !== '__all__'
  const groupFilterLabel =
    groupFilter === '__all__'
      ? t('manageGroups.all')
      : groupFilter === '__ungrouped__'
        ? t('manageGroups.ungrouped')
        : groupFilter
  const visibleIds = visible.map((t) => t.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  function resetActionState() {
    setSelected(new Set())
    setNewGroupMode(false)
    setNewName('')
  }

  function moveTo(toGroup: string | null) {
    groupOps.onMoveTables([...selected], toGroup)
    resetActionState()
  }

  function confirmNewGroup() {
    const name = newName.trim()
    if (!name) return
    groupOps.onMoveTablesToNewGroup([...selected], name)
    resetActionState()
  }

  const count = selected.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="manage-groups-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manageGroups.title')}</DialogTitle>
          <DialogDescription>{t('manageGroups.desc')}</DialogDescription>
        </DialogHeader>

        {/* Filter */}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="mg-filter"
          aria-label={t('manageGroups.searchAria')}
          placeholder={t('manageGroups.searchPlaceholder')}
          className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
        />

        {/* Group (category) filter — view only Ungrouped / a specific group. */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                data-testid="mg-groupfilter-trigger"
                className="h-8 gap-1.5"
              >
                <span className="text-muted-foreground">{t('manageGroups.category')}</span>
                {groupFilter !== '__all__' && groupFilter !== '__ungrouped__' && (
                  <span
                    className="size-2 rounded-full"
                    style={{ background: groups.find((g) => g.name === groupFilter)?.color ?? 'var(--erd-border-2, #d0d1d2)' }}
                  />
                )}
                {groupFilterLabel}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              <DropdownMenuItem data-testid="mg-groupfilter-all" onSelect={() => setGroupFilter('__all__')}>
                {t('manageGroups.all')}
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="mg-groupfilter-ungrouped"
                onSelect={() => setGroupFilter('__ungrouped__')}
              >
                {t('manageGroups.ungrouped')}
              </DropdownMenuItem>
              {groups.length > 0 && <DropdownMenuSeparator />}
              {groups.map((g) => (
                <DropdownMenuItem
                  key={g.name}
                  data-testid={`mg-groupfilter-${g.name}`}
                  onSelect={() => setGroupFilter(g.name)}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ background: g.color ?? 'var(--erd-border-2, #d0d1d2)' }}
                  />
                  {g.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">
            {filterActive
              ? t('manageGroups.shownOf', { shown: visible.length, total: tables.length })
              : t('manageGroups.tableCount', { count: tables.length })}
          </span>
        </div>

        {/* Select-all + count */}
        <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              data-testid="mg-select-all"
              checked={allVisibleSelected}
              onChange={toggleAllVisible}
            />
            {filterActive
              ? t('manageGroups.selectAllShown', { count: visible.length })
              : t('manageGroups.selectAll')}
          </label>
          <span>{count > 0 ? t('manageGroups.selectedCount', { count }) : ''}</span>
        </div>

        {/* Table list */}
        <ul className="max-h-[48vh] min-h-24 overflow-y-auto rounded-lg border border-border">
          {visible.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {tables.length === 0 ? t('manageGroups.noTables') : t('manageGroups.noResults')}
            </li>
          )}
          {visible.map((tbl) => {
            const g = groupOf.get(tbl.id)
            return (
              <li key={tbl.id}>
                <label
                  data-testid={`mg-row-${tbl.name}`}
                  className="flex cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(tbl.id)}
                    onChange={() => toggle(tbl.id)}
                    aria-label={t('manageGroups.selectAria', { name: tbl.name })}
                  />
                  <span className="flex-1 truncate font-mono text-[13px]">{tbl.name}</span>
                  {/* Current-group chip */}
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: g?.color ?? 'var(--erd-border-2, #d0d1d2)' }}
                    />
                    {g?.name ?? t('manageGroups.ungrouped')}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {/* Action bar */}
        <div className="flex min-h-9 items-center justify-end gap-2">
          {count === 0 ? (
            <span className="text-xs text-muted-foreground">{t('manageGroups.selectToMove')}</span>
          ) : newGroupMode ? (
            <>
              <input
                value={newName}
                autoFocus
                data-testid="mg-newgroup-input"
                aria-label={t('manageGroups.newGroupName')}
                placeholder={t('manageGroups.newGroupName')}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmNewGroup()
                  else if (e.key === 'Escape') setNewGroupMode(false)
                }}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
              <Button variant="outline" onClick={() => setNewGroupMode(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                data-testid="mg-newgroup-confirm"
                onClick={confirmNewGroup}
                disabled={!newName.trim()}
              >
                {t('manageGroups.makeAndMove')}
              </Button>
            </>
          ) : (
            <>
              <span className="mr-auto text-xs text-muted-foreground">{t('manageGroups.selectedCount', { count })}</span>
              <Button variant="ghost" data-testid="mg-clear" onClick={() => setSelected(new Set())}>
                {t('manageGroups.clearSelection')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="mg-move-trigger">
                    {t('manageGroups.moveToGroup')}
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t('manageGroups.moveTarget')}</DropdownMenuLabel>
                  {groups.map((g) => (
                    <DropdownMenuItem
                      key={g.name}
                      data-testid={`mg-move-to-${g.name}`}
                      onSelect={() => moveTo(g.name)}
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: g.color ?? 'var(--erd-border-2, #d0d1d2)' }}
                      />
                      {g.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem data-testid="mg-move-ungrouped" onSelect={() => moveTo(null)}>
                    {t('manageGroups.ungrouped')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="mg-move-new"
                    onSelect={() => {
                      setNewName('')
                      setNewGroupMode(true)
                    }}
                  >
                    <FolderPlus />
                    {t('manageGroups.newGroupMake')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
