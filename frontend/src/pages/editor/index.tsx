import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useProject } from '@/entities/project'
import {
  useProjectAutosave,
  type AutosaveStatus,
} from '@/features/project-autosave'

const statusLabel: Record<AutosaveStatus, string> = {
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
  // The last server-seeded value; autosave skips while dbmlText still equals it.
  const [baseline, setBaseline] = useState('')
  const { status } = useProjectAutosave({ projectId: id, dbmlText, baseline })

  // Seed the textarea (and the autosave baseline) once the project loads, and
  // re-seed when its id changes. Keying on project?.id avoids clobbering the
  // user's in-progress text on each autosave-driven cache update.
  useEffect(() => {
    if (project) {
      setDbmlText(project.dbml_text)
      setBaseline(project.dbml_text)
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
