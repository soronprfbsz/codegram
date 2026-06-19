import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Database } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
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
  const navigate = useNavigate()
  const updateProject = useUpdateProject(project.id)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)

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
          {editing ? (
            <Input
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                else if (e.key === 'Escape') setEditing(false)
              }}
              className="h-8"
            />
          ) : (
            <>
              <Link
                to={`/editor/${project.id}`}
                className="block w-full truncate font-medium hover:text-primary"
              >
                {project.name}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {tableCount} {tableCount === 1 ? 'table' : 'tables'} ·{' '}
                {formatUpdated(project.updated_at)}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {editing ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? 'Saving…' : 'Save'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraftName(project.name)
              setEditing(true)
            }}
          >
            Rename
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/editor/${project.id}`)}
        >
          Open
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(project.id)}
          disabled={deletePending}
          className="text-muted-foreground hover:text-destructive"
        >
          Delete
        </Button>
      </div>
    </li>
  )
}

/**
 * Projects dashboard: create bar + card gallery (complements the sidebar's
 * compact quick-switch list). features layer: composes project entity hooks +
 * shared UI. On create it navigates straight into the editor.
 */
export function ProjectList() {
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
          placeholder="Project name"
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
          {createProject.isPending ? 'Creating…' : 'Create'}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Database size={20} />
          </span>
          <p className="text-sm text-muted-foreground">
            No projects yet. Create one above.
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
