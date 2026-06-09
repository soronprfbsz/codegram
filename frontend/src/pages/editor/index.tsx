import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Button } from '@/shared/ui/button'
import { downloadBlob } from '@/shared/lib/download'
import { useProject } from '@/entities/project'
import { deriveTableDoc, type TableDocModel } from '@/entities/table-doc'
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
import { ErdCanvas, type ErdCaptureHandle } from '@/features/erd-canvas'
import { useLayoutPersistence } from '@/features/layout-persistence'
import {
  ExportMenu,
  type DiagramExportContext,
} from '@/features/export-diagram'
import {
  buildTableDocXlsxBlob,
  buildTableDocPdfBlob,
} from '@/features/export-table-doc'
import { downloadSql } from '@/features/sql-export'
import { SqlImportDialog } from '@/features/sql-import'
import { TableDocView } from '@/widgets/table-doc-view'

const statusLabel: Record<AutosaveStatus, string> = {
  idle: 'All changes saved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

const EMPTY_TABLE_DOC: TableDocModel = { tables: [], enums: [] }

// Small presentational helper: wraps a floating panel with a close button.
// Module-scope so its identity is stable across renders.
function FloatingPanel({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <div className="pointer-events-auto relative">
      <button
        type="button"
        aria-label={`Close ${label} panel`}
        onClick={onClose}
        className="absolute right-2 top-2 z-10 rounded p-1 text-gray-500 hover:bg-black/5 hover:text-gray-800"
      >
        ✕
      </button>
      {children}
    </div>
  )
}

/**
 * Editor page (Plan 3b): loads a project by :id and binds a CodeMirror 6
 * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
 * plus live debounced parsing into the normalized model. A split view shows
 * the editor on the left and a read-only React Flow ERD canvas on the right,
 * both fed by the same parse result; the canvas renders the last valid schema
 * (parse.schema ?? parse.lastValidSchema) so a transient parse error does not
 * blank the diagram. Node positions seed from project.layout and reconcile by
 * name on each parse (ADR-0004) — placed tables keep their coords, new ones get
 * dagre — and round-trip through the existing debounced autosave (table drag +
 * Auto-arrange). The parse-status panel + a compact schema summary float over
 * the canvas top-right and are toggled via header buttons (T3).
 * Plan 5: the header carries an Export dropdown — diagram PNG/SVG/PDF capture
 * the canvas via a handle surfaced from ErdCanvas (onCaptureReady), and the
 * table-doc Excel/PDF builders + the in-app HTML view all consume the derived
 * TableDocModel. pages is the only layer importing both export features. Note:
 * onCaptureReady fires ONLY when the canvas has tables (ErdCanvas renders its
 * inner ReactFlow only for a non-empty schema); the ExportMenu `disabled`
 * predicate mirrors that exact gate (!schema || tables.length === 0) so the
 * diagram exporters can never run while captureHandleRef is still null.
 * pages layer: composes the project entity + the autosave, dbml-editor,
 * erd-canvas, export-diagram, export-table-doc features + table-doc-view widget
 * (FSD downward imports).
 */
export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading, isError } = useProject(id)
  const [dbmlText, setDbmlText] = useState('')
  // The last server-seeded value; autosave skips while dbmlText still equals it.
  const [baseline, setBaseline] = useState('')
  // Live positions seeded from project.layout, re-seeded on a project switch.
  // Pass the LOADED project's id (project?.id), NOT the URL param `id`: the
  // hook keys its seed effect on this so the undefined -> id transition (the
  // project finishing loading) fires the seed and restores saved positions.
  // Using the always-stable URL param would mean the seed never re-runs after
  // load, leaving saved positions unrestored. (Mirrors the dbml seed below,
  // which is also keyed on project?.id.)
  const { positions, setPositions, layout, layoutBaseline } =
    useLayoutPersistence({ projectId: project?.id, projectLayout: project?.layout })
  const { status } = useProjectAutosave({
    projectId: id,
    dbmlText,
    baseline,
    layout,
    layoutBaseline,
  })
  // Live, debounced parse of the editor text into the normalized model.
  const parse = useDbmlParse(dbmlText)
  const schema = parse.schema ?? parse.lastValidSchema

  // T3 — floating panel visibility state.
  const [showParse, setShowParse] = useState(true)
  const [showSchema, setShowSchema] = useState(false)

  // Plan 5 — Export wiring (pages layer composes both export features).
  // Capture-handle ref filled once by ErdCanvas.onCaptureReady; the canvas
  // wrapper ref reaches the live .react-flow__viewport for snapshotting.
  const captureHandleRef = useRef<ErdCaptureHandle | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const [tableDocViewOpen, setTableDocViewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  // Derive the 테이블 정의서 model once per schema change.
  const tableDoc = useMemo<TableDocModel>(
    () => (schema ? deriveTableDoc(schema) : EMPTY_TABLE_DOC),
    [schema],
  )

  // The diagram capture context: viewport from the wrapper ref, instance +
  // fitView from the handle ref. Memoized on identity-stable refs.
  const diagramCtx = useMemo<DiagramExportContext>(
    () => ({
      getViewport: () =>
        (canvasWrapperRef.current?.querySelector(
          '.react-flow__viewport',
        ) as HTMLElement | null) ?? null,
      getInstance: () => captureHandleRef.current?.getInstance() ?? null,
      fitView: () => captureHandleRef.current?.fitView(),
    }),
    [],
  )

  // Mirrors the ErdCanvas non-empty gate so the diagram capture path (which
  // needs captureHandleRef, only set for a non-empty canvas) is unreachable
  // while the handle is null. Do NOT loosen this without revisiting that gate.
  const exportDisabled = !schema || schema.tables.length === 0

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
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">{project.name}</h1>
          <div className="flex items-center gap-4">
            <Button
              size="sm"
              variant={showParse ? 'secondary' : 'outline'}
              aria-pressed={showParse}
              onClick={() => setShowParse(v => !v)}
            >
              Parse
            </Button>
            <Button
              size="sm"
              variant={showSchema ? 'secondary' : 'outline'}
              aria-pressed={showSchema}
              onClick={() => setShowSchema(v => !v)}
            >
              Schema
            </Button>
            <span className="text-sm text-gray-600">
              {statusLabel[status]}
            </span>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              Import SQL
            </Button>
            <ExportMenu
              diagram={diagramCtx}
              disabled={exportDisabled}
              onOpenTableDocView={() => setTableDocViewOpen(true)}
              onExportTableDocExcel={() =>
                downloadBlob(
                  buildTableDocXlsxBlob(tableDoc),
                  'table-definition.xlsx',
                )
              }
              onExportTableDocPdf={() =>
                downloadBlob(
                  buildTableDocPdfBlob(tableDoc),
                  'table-definition.pdf',
                )
              }
              onExportSql={(dialect) => downloadSql(dbmlText, dialect)}
            />
            <Button variant="outline" onClick={() => navigate('/')}>
              Back
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId="erd-editor-split" className="h-full w-full">
          <Panel defaultSize={35} minSize={20} className="min-w-0">
            <div className="h-full min-h-0 min-w-0">
              <DbmlEditor value={dbmlText} onChange={setDbmlText} height="100%" />
            </div>
          </Panel>
          <PanelResizeHandle className="w-1.5 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-400 data-[resize-handle-state=drag]:bg-blue-500" />
          <Panel defaultSize={65} minSize={30} className="min-w-0">
            <div ref={canvasWrapperRef} className="relative h-full min-h-0 min-w-0">
              <ErdCanvas
                schema={schema}
                savedPositions={positions}
                onLayoutChange={(next) => setPositions(next.positions)}
                onCaptureReady={(handle) => {
                  captureHandleRef.current = handle
                }}
              />
              {/* T3 — floating panels anchored to the canvas top-right, offset
                  DOWN (top-16) to clear ErdCanvas's top-right Auto-arrange button
                  so the panel never covers it. pointer-events-none on the stack so
                  the canvas stays pannable; pointer-events-auto on each
                  FloatingPanel so interactions work. */}
              <div className="pointer-events-none absolute right-3 top-16 z-10 flex w-72 max-w-[45%] flex-col gap-3">
                {showParse && (
                  <FloatingPanel label="parse status" onClose={() => setShowParse(false)}>
                    <ParseErrorPanel
                      status={parse.status}
                      errors={parse.errors}
                      className="bg-white/70 shadow-lg backdrop-blur"
                    />
                  </FloatingPanel>
                )}
                {showSchema && (
                  <FloatingPanel label="schema" onClose={() => setShowSchema(false)}>
                    <SchemaSummary
                      schema={schema}
                      className="bg-white/70 shadow-lg backdrop-blur"
                    />
                  </FloatingPanel>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </main>

      <TableDocView
        model={tableDoc}
        open={tableDocViewOpen}
        onClose={() => setTableDocViewOpen(false)}
      />
      <SqlImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        hasExistingContent={dbmlText.trim().length > 0}
        onImport={(dbml) => setDbmlText(dbml)}
      />
    </div>
  )
}
