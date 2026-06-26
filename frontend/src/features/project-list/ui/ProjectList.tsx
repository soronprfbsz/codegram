import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Database } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import {
  useProjectList,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  type Project,
} from '@/entities/project'
import { ProjectGlyphPicker } from './ProjectGlyphPicker'

/** Count `Table ...` blocks in the DBML for a light table-count meta. */
function countTables(dbml: string): number {
  return (dbml.match(/^\s*Table\s/gim) ?? []).length
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return ''
  }
}

/**
 * A single project card with open / rename (inline) / delete controls.
 * Kept as a list item (role=listitem) so the inline rename input is reachable.
 */
function ProjectCard({
  project,
  onDelete,
  deletePending,
}: {
  project: Project
  onDelete: (id: string) => void
  deletePending: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateProject = useUpdateProject(project.id)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  // 삭제는 되돌릴 수 없으므로 확인 다이얼로그를 거친다.
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function handleSave() {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === project.name) {
      setEditing(false)
      return
    }
    await updateProject.mutateAsync({ name: trimmed })
    setEditing(false)
  }

  const tableCount = countTables(project.dbml_text)

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/25">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="mt-0.5">
          <ProjectGlyphPicker project={project} />
        </div>
        <div className="min-w-0 flex-1">
          {/* 이름/입력 슬롯은 두 모드에서 같은 높이(h-8)로 고정 + 메타는 항상
              표시 → 편집 진입 시 카드 높이가 변하지 않아 아래 버튼 행이 안 밀린다. */}
          <div className="flex h-8 items-center gap-2">
            {editing ? (
              <>
                <Input
                  value={draftName}
                  autoFocus
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    else if (e.key === 'Escape') setEditing(false)
                  }}
                  className="h-8 flex-1"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="shrink-0"
                  onClick={handleSave}
                  disabled={updateProject.isPending}
                >
                  {updateProject.isPending ? t('projectList.saving') : t('projectList.save')}
                </Button>
              </>
            ) : (
              // 이름은 표시 전용 — 진입은 '열기' 버튼으로만(이름 클릭/hover 제거).
              <span className="block w-full truncate font-medium">
                {project.name}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t('projectList.tableCount', { count: tableCount })} ·{' '}
            {formatUpdated(project.updated_at)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* 첫 액션 버튼 슬롯은 고정폭 → 라벨 폭 차이(이름 변경↔취소)에도 '열기'가
            가로로 밀리지 않는다. */}
        {editing ? (
          // 편집 모드: 이름변경 자리에 취소(보조 액션) 버튼.
          <Button variant="outline" size="sm" className="min-w-[72px] justify-center" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="min-w-[72px] justify-center"
            onClick={() => {
              setDraftName(project.name)
              setEditing(true)
            }}
          >
            {t('projectList.rename')}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/editor/${project.id}`)}
        >
          {t('projectList.open')}
        </Button>
        <div className="flex-1" />
        <Button
          variant="destructiveGhost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={deletePending}
        >
          {t('projectList.delete')}
        </Button>
      </div>

      {/* 삭제 확인 — 공통 모달, 되돌릴 수 없음 경고 */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        testId="project-delete-confirm"
        title={t('projectRow.deleteTitle')}
        description={t('projectRow.deleteDesc', { name: project.name })}
        confirmDisabled={deletePending}
        onConfirm={() => onDelete(project.id)}
      />
    </li>
  )
}

/**
 * Projects dashboard: create bar + card gallery (complements the sidebar's
 * compact quick-switch list). features layer: composes project entity hooks +
 * shared UI. On create it navigates straight into the editor.
 */
export function ProjectList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjectList()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const [name, setName] = useState('')

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) return
    const created = await createProject.mutateAsync({ name: trimmed })
    setName('')
    navigate(`/editor/${created.id}`)
  }

  async function handleDelete(id: string) {
    await deleteProject.mutateAsync(id)
  }

  const isEmpty = !isLoading && (projects?.length ?? 0) === 0

  return (
    <section>
      {/* Create bar */}
      <div className="mb-8 flex max-w-xl gap-2">
        <Input
          placeholder={t('projectList.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
        />
        <Button
          onClick={handleCreate}
          disabled={createProject.isPending || name.trim().length === 0}
        >
          {createProject.isPending ? t('projectList.creating') : t('projectList.create')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('projectList.loadingProjects')}</p>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Database size={20} />
          </span>
          <p className="text-sm text-muted-foreground">
            {t('projectList.emptyHint')}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              deletePending={deleteProject.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
