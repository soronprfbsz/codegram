import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/shared/ui/button'
import { useProject } from '@/entities/project'
import {
  useProjectAutosave,
  type AutosaveStatus,
} from '@/features/project-autosave'
import {
  DbmlEditor,
  ParseErrorPanel,
  SchemaSummary,
  useDbmlParse,
} from '@/features/dbml-editor'
import { ErdCanvas } from '@/features/erd-canvas'

const statusLabel: Record<AutosaveStatus, string> = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

/**
 * Editor page (Plan 3b): loads a project by :id and binds a CodeMirror 6
 * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
 * plus live debounced parsing into the normalized model. A split view shows
 * the editor on the left and a read-only React Flow ERD canvas on the right,
 * both fed by the same parse result; the canvas renders the last valid schema
 * (parse.schema ?? parse.lastValidSchema) so a transient parse error does not
 * blank the diagram. Auto-layout (dagre) positions nodes each parse; no
 * layout persistence (Plan 4). The parse-status panel + a compact schema
 * summary stay in a sidebar beside the canvas.
 * pages layer: composes the project entity + the autosave, dbml-editor, and
 * erd-canvas features (FSD downward imports).
 */
export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading, isError } = useProject(id)
  const [dbmlText, setDbmlText] = useState('')
  // The last server-seeded value; autosave skips while dbmlText still equals it.
  const [baseline, setBaseline] = useState('')
  const { status } = useProjectAutosave({ projectId: id, dbmlText, baseline })
  // Live, debounced parse of the editor text into the normalized model.
  const parse = useDbmlParse(dbmlText)

  // Seed the editor (and the autosave baseline) once the project loads, and
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
            <span className="text-sm text-gray-600">
              {statusLabel[status]}
            </span>
            <Button variant="outline" onClick={() => navigate('/')}>
              Back
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 lg:h-[80vh] lg:flex-row">
          <div className="flex flex-col gap-4 lg:w-[40%]">
            <DbmlEditor value={dbmlText} onChange={setDbmlText} height="70vh" />
          </div>
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            <div className="h-[60vh] flex-1">
              <ErdCanvas schema={parse.schema ?? parse.lastValidSchema} />
            </div>
            <aside className="flex flex-col gap-4 lg:w-72">
              <ParseErrorPanel status={parse.status} errors={parse.errors} />
              <SchemaSummary schema={parse.schema ?? parse.lastValidSchema} />
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}
