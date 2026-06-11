import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '@/shared/ui/button'
import { downloadBlob } from '@/shared/lib/download'
import { useProject } from '@/entities/project'
import { deriveTableDoc, type TableDocModel } from '@/entities/table-doc'
import {
  useProjectAutosave,
} from '@/features/project-autosave'
import {
  DbmlEditor,
  useDbmlParse,
} from '@/features/dbml-editor'
import { ErdInfoPanel } from '@/widgets/erd-info-panel'
import { ErdCanvas, type ErdCaptureHandle } from '@/features/erd-canvas'
import type { CanvasSelection } from '@/entities/erd'
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
import { ErdTopBar } from '@/widgets/erd-topbar'
import { DbConnectDialog } from '@/features/db-import'
import {
  parseDbml,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  moveTableToGroup,
  type GroupOpResult,
} from '@/entities/dbml'
import type { GroupOpHandlers } from '@/widgets/erd-info-panel'
import { computeSyncedPositions } from '@/entities/layout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'

const EMPTY_TABLE_DOC: TableDocModel = { tables: [], enums: [] }

/**
 * Extract the `Project` block name from raw DBML text via a simple regex.
 * Returns undefined if no Project block is present.
 */
function extractProjectMeta(dbml: string): string | undefined {
  const m = /^\s*Project\s+([^\s{]+)/m.exec(dbml)
  return m ? m[1] : undefined
}

/**
 * Extract the `database_type` value from a DBML `Project` block.
 * Returns undefined if not present.
 */
function extractDialect(dbml: string): string | undefined {
  const m = /database_type\s*:\s*['"]?([^'"\n\r}]+?)['"]?\s*[\n\r}]/m.exec(dbml)
  return m ? m[1].trim() : undefined
}

/**
 * Editor page (Phase 2): loads a project by :id and binds a CodeMirror 6
 * editor to dbml_text with debounced autosave (Plan 2 contract preserved),
 * plus live debounced parsing into the normalized model.
 *
 * Layout: 56px ErdTopBar + fixed 3-zone CSS grid (340px / 1fr / 316px).
 *   Left (340px): DbmlEditor with panel header
 *   Center (1fr):  ErdCanvas
 *   Right (316px): SchemaSummary stopgap (Phase 3 rebuilds this)
 *
 * All existing functionality is preserved:
 *   - useProject, useLayoutPersistence, useProjectAutosave, useDbmlParse
 *   - ErdCanvas with savedPositions/onLayoutChange/onCaptureReady
 *   - ExportMenu (diagram PNG/SVG/PDF + table-doc Excel/PDF + SQL)
 *   - SqlImportDialog (Import SQL → setDbmlText)
 *   - TableDocView (open/close)
 *   - Editor seed effect + exportDisabled gate
 *   - data-testid="dbml-editor", "erd-canvas", etc.
 *
 * The floating Info panel + react-resizable-panels split are REMOVED. The
 * Info button in TopBar is an affordance (no-op in Phase 2); SchemaSummary
 * now lives permanently in the right column (Phase 3 will rebuild it).
 */
export function EditorPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: project, isLoading, isError } = useProject(id)
  const [dbmlText, setDbmlText] = useState('')
  // The last server-seeded value; autosave skips while dbmlText still equals it.
  const [baseline, setBaseline] = useState('')
  // Live positions seeded from project.layout, re-seeded on a project switch.
  const { positions, setPositions, layout, layoutBaseline, edgePaths } =
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

  const mutationsEnabled = parse.status === 'success' && !!parse.schema
  const [groupOpError, setGroupOpError] = useState<string | null>(null)

  function runGroupOp(result: GroupOpResult) {
    if (result.ok) {
      setDbmlText(result.text)
      setGroupOpError(null)
    } else {
      setGroupOpError(result.error)
    }
  }

  const groupOps: GroupOpHandlers = {
    onCreateGroup: (name) => runGroupOp(createGroup(dbmlText, name)),
    onRenameGroup: (oldName, newName) => runGroupOp(renameGroup(dbmlText, oldName, newName)),
    onDeleteGroup: (name) => runGroupOp(deleteGroup(dbmlText, name)),
    onSetGroupColor: (name, color) => runGroupOp(setGroupColor(dbmlText, name, color)),
    onMoveTable: (tableId, toGroup) => {
      if (!parse.schema) return
      runGroupOp(moveTableToGroup(dbmlText, parse.schema, tableId, toGroup))
    },
  }

  // Plan 5 — Export wiring (pages layer composes both export features).
  const captureHandleRef = useRef<ErdCaptureHandle | null>(null)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const [tableDocViewOpen, setTableDocViewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [pendingSyncDbml, setPendingSyncDbml] = useState<string | null>(null)

  // Derive the 테이블 정의서 model once per schema change.
  const tableDoc = useMemo<TableDocModel>(
    () => (schema ? deriveTableDoc(schema) : EMPTY_TABLE_DOC),
    [schema],
  )

  // The diagram capture context.
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

  // Mirrors the ErdCanvas non-empty gate so the diagram capture path
  // (which needs captureHandleRef, only set for a non-empty canvas) is
  // unreachable while the handle is null.
  const exportDisabled = !schema || schema.tables.length === 0

  // Extract the DBML `Project` block name for the TopBar subtitle.
  const projectMeta = useMemo(() => extractProjectMeta(dbmlText), [dbmlText])

  // Extract the `database_type` from the DBML Project block for the info panel.
  const dialect = useMemo(() => extractDialect(dbmlText), [dbmlText])

  // 단일 선택 모델: 노드(테이블/Enum/스티키) 또는 엣지 하나만 선택된다.
  const [selection, setSelection] = useState<CanvasSelection>(null)
  // 레거시 이름 기반 파생값 — DbmlEditor 스크롤 + 패널 리스트 하이라이트용.
  const selected =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null

  // 패널의 Table names 리스트는 이름으로 선택한다 → 노드 선택으로 변환.
  function selectTableByName(name: string) {
    const t = schema?.tables.find((tb) => tb.name === name)
    setSelection(
      t ? { kind: 'node', nodeId: t.id, nodeType: 'table', tableName: t.name } : null,
    )
  }
  // Info 버튼이 토글하는 우측 패널 표시 상태 (세션 메모리만, 기본 보임).
  const [panelOpen, setPanelOpen] = useState(true)

  // Seed the editor (and the autosave baseline) once the project loads.
  useEffect(() => {
    if (project) {
      setDbmlText(project.dbml_text)
      setBaseline(project.dbml_text)
    }
  }, [project?.id])

  function applySync(dbml: string) {
    const parsed = parseDbml(dbml)
    if (parsed.ok) {
      setPositions(computeSyncedPositions(positions, parsed.schema))
    }
    setDbmlText(dbml)
    setPendingSyncDbml(null)
  }

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
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{ background: 'var(--erd-bg)', color: 'var(--erd-text)' }}
    >
      {/* 56px TopBar */}
      <ErdTopBar
        projectName={project.name}
        projectMeta={projectMeta}
        autosaveStatus={status}
        onImportSql={() => setImportOpen(true)}
        onBack={() => navigate('/')}
        onSync={() => setSyncOpen(true)}
        onInfo={() => setPanelOpen((o) => !o)}
        exportMenu={
          <ExportMenu
            diagram={diagramCtx}
            disabled={exportDisabled}
            triggerClassName="erd-btn-secondary"
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
        }
      />

      {/* 3-zone CSS grid body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `340px 1fr ${panelOpen ? '316px' : '0px'}`,
          transition: 'grid-template-columns 200ms ease',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left (340px): DBML editor */}
        <div
          style={{
            background: 'var(--erd-surface-2)',
            borderRight: '1px solid var(--erd-border)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {/* Panel header — 44px */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 44,
              padding: '0 14px',
              flexShrink: 0,
              borderBottom: '1px solid var(--erd-border)',
            }}
          >
            <span
              style={{ fontSize: 15, color: 'var(--erd-text-2)', fontFamily: 'var(--font-mono, ui-monospace)' }}
              aria-hidden
            >
              {'</>'}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '.04em',
                textTransform: 'uppercase',
                color: 'var(--erd-text-2)',
                flex: 1,
              }}
            >
              DBML 에디터
            </span>
            {/* Valid/Invalid badge driven by parse.status */}
            {(parse.status === 'success' || parse.status === 'error') && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: '18px',
                  background:
                    parse.status === 'success'
                      ? 'color-mix(in srgb, var(--erd-success) 14%, transparent)'
                      : 'color-mix(in srgb, var(--erd-error) 14%, transparent)',
                  color:
                    parse.status === 'success' ? 'var(--erd-success)' : 'var(--erd-error)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'currentColor',
                  }}
                />
                {parse.status === 'success' ? 'Valid' : 'Invalid'}
              </span>
            )}
          </div>

          {/* CodeMirror editor fills the rest */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <DbmlEditor
              value={dbmlText}
              onChange={setDbmlText}
              height="100%"
              selectedTable={selected}
            />
          </div>
        </div>

        {/* Center (1fr): ERD canvas */}
        <div
          ref={canvasWrapperRef}
          style={{ position: 'relative', minWidth: 0, minHeight: 0 }}
        >
          <ErdCanvas
            schema={schema}
            savedPositions={positions}
            edgePaths={edgePaths}
            onLayoutChange={(next) => setPositions(next.positions)}
            onCaptureReady={(handle) => {
              captureHandleRef.current = handle
            }}
            selection={selection}
            onSelect={setSelection}
          />
        </div>

        {/* Right (316px): ErdInfoPanel — schema summary + table names list */}
        <div
          data-testid="info-panel-column"
          style={{
            background: 'var(--erd-surface)',
            borderLeft: panelOpen ? '1px solid var(--erd-border)' : 'none',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <div style={{ width: 316, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {groupOpError && (
              <div role="alert" data-testid="group-op-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, color: 'var(--erd-error)', borderBottom: '1px solid var(--erd-border)' }}>
                <span style={{ flex: 1 }}>{groupOpError}</span>
                <button aria-label="dismiss" onClick={() => setGroupOpError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
              </div>
            )}
            <ErdInfoPanel
              schema={schema}
              selected={selected}
              onSelect={selectTableByName}
              dialect={dialect}
              groupOps={groupOps}
              mutationsEnabled={mutationsEnabled}
            />
          </div>
        </div>
      </div>

      {/* Dialogs / overlays — mounted unconditionally (same as before) */}
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
      <DbConnectDialog
        open={syncOpen}
        onOpenChange={setSyncOpen}
        onIntrospected={(dbml) => {
          setSyncOpen(false)
          setPendingSyncDbml(dbml)
        }}
      />
      <Dialog
        open={pendingSyncDbml !== null}
        onOpenChange={(o) => { if (!o) setPendingSyncDbml(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync from database?</DialogTitle>
            <DialogDescription>
              This replaces the current DBML with the database's schema. Table
              positions are preserved and new tables are placed in empty space,
              but manual notes, table groups, and colors not in the database
              will be lost.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingSyncDbml(null)}>
              Cancel
            </Button>
            <Button onClick={() => { if (pendingSyncDbml) applySync(pendingSyncDbml) }}>
              Replace
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
