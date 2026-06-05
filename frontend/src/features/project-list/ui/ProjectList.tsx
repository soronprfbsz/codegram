import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import {
  useProjectList,
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
  type Project,
} from '@/entities/project'

/**
 * A single project row with open / rename (inline) / delete controls.
 * Split into its own component so useUpdateProject(project.id) is a per-row
 * hook call (hooks cannot be called inside a map callback).
 */
function ProjectRow({
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

  return (
    <li className="flex items-center justify-between rounded border p-4">
      {editing ? (
        <Input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSave()
            }
          }}
          className="mr-2"
        />
      ) : (
        <span className="font-medium">{project.name}</span>
      )}
      <div className="flex gap-2">
        {editing ? (
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={updateProject.isPending}
          >
            {updateProject.isPending ? 'Saving…' : 'Save'}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setDraftName(project.name)
              setEditing(true)
            }}
          >
            Rename
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(`/editor/${project.id}`)}>
          Open
        </Button>
        <Button
          variant="outline"
          onClick={() => onDelete(project.id)}
          disabled={deletePending}
        >
          Delete
        </Button>
      </div>
    </li>
  )
}

/**
 * Project dashboard list: shows the user's projects with create / rename /
 * delete / open actions. features layer: composes project entity hooks +
 * shared UI (FSD downward imports). On create it navigates straight into the
 * editor.
 */
export function ProjectList() {
  const navigate = useNavigate()
  const { data: projects, isLoading } = useProjectList()
  const createProject = useCreateProject()
  const deleteProject = useDeleteProject()
  const [name, setName] = useState('')

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    const created = await createProject.mutateAsync({ name: trimmed })
    setName('')
    navigate(`/editor/${created.id}`)
  }

  async function handleDelete(id: string) {
    await deleteProject.mutateAsync(id)
  }

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">Your projects</h2>

      <div className="mb-6 flex gap-2">
        <Input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleCreate()
            }
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
        <p className="text-gray-600">Loading projects…</p>
      ) : (projects?.length ?? 0) === 0 ? (
        <p className="text-gray-600">No projects yet. Create one above.</p>
      ) : (
        <ul className="space-y-2">
          {projects?.map((project) => (
            <ProjectRow
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
