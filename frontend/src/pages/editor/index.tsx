import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useProject } from '@/entities/project'
import { useProjectAutosave } from '@/features/project-autosave'

const statusLabel: Record<string, string> = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

/**
 * Minimal editor shell (Plan 2): loads a project by :id and binds a plain
 * <textarea> to dbml_text with debounced autosave. No CodeMirror / diagram —
 * those are later plans. pages layer: composes the project entity + the
 * autosave feature (FSD downward imports).
 */
export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading, isError } = useProject(id)
  const [dbmlText, setDbmlText] = useState('')
  const { status } = useProjectAutosave({ projectId: id, dbmlText })

  // Seed the textarea once the project loads (only when its id changes).
  useEffect(() => {
    if (project) {
      setDbmlText(project.dbml_text)
    }
  }, [project?.id])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading…
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg">Project not found</p>
        <Button onClick={() => navigate('/')}>Back to projects</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b p-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{statusLabel[status]}</span>
            <Button variant="outline" onClick={() => navigate('/')}>
              Back
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <textarea
          value={dbmlText}
          onChange={(e) => setDbmlText(e.target.value)}
          className="h-[70vh] w-full rounded border p-4 font-mono text-sm"
          placeholder="Enter DBML here…"
        />
      </main>
    </div>
  )
}
