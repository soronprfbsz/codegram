import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  Download,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import { useProject } from '@/entities/project'
import {
  useProjectAutosave,
} from '@/features/project-autosave'
import {
  DbmlEditor,
  useDbmlParse,
} from '@/features/dbml-editor'
import { ErdInfoPanel } from '@/widgets/erd-info-panel'
import { ErdCanvas, type ErdCaptureHandle } from '@/features/erd-canvas'
import type { CanvasSelection, SelectionInfo } from '@/entities/erd'
import { useLayoutPersistence } from '@/features/layout-persistence'
import { type DiagramExportContext } from '@/features/export-diagram'
import { SqlImportDialog } from '@/features/sql-import'
import { ErdTopBar } from '@/widgets/erd-topbar'
import { ExportMenu } from '@/widgets/export-menu'
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
import { computeSyncedPositions, type StoredLayout } from '@/entities/layout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'

/** Icon-button style for the DBML editor collapse/expand toggle. */
const DBML_TOGGLE_BTN: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: 'var(--erd-text-3)',
  cursor: 'pointer',
}

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
  const { positions, setPositions, layout, layoutBaseline, edgePaths, setEdgePaths } =
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
  const handleLayoutChange = useCallback(
    (next: StoredLayout) => setPositions(next.positions),
    [setPositions],
  )
  const handleCaptureReady = useCallback((handle: ErdCaptureHandle) => {
    captureHandleRef.current = handle
  }, [])
  const canvasWrapperRef = useRef<HTMLDivElement>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [pendingSyncDbml, setPendingSyncDbml] = useState<string | null>(null)

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
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
  // 레거시 이름 기반 파생값 — DbmlEditor 스크롤 + 패널 리스트 하이라이트용.
  const selected =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null

  // 테이블 검색 매칭 컬럼 하이라이트 — 검색 결과로 이동했을 때만 설정되고,
  // 다른 경로의 선택(캔버스 클릭/리스트 클릭)이 일어나면 비운다.
  const [searchHighlightColIds, setSearchHighlightColIds] = useState<string[]>([])

  // 패널의 Table names 리스트는 schema-qualified table id로 선택한다 → 노드 선택으로 변환.
  function selectTableById(tableId: string) {
    setSearchHighlightColIds([])
    const t = schema?.tables.find((tb) => tb.id === tableId)
    setSelection(
      t ? { kind: 'node', nodeId: t.id, nodeType: 'table', tableName: t.name } : null,
    )
  }

  // 캔버스 클릭 등 일반 선택 — 검색 하이라이트를 비우고 선택만 갱신.
  function handleCanvasSelect(next: CanvasSelection) {
    setSearchHighlightColIds([])
    setSelection(next)
  }

  // 검색 결과 선택 → 선택 설정(= DBML 스크롤 + 패널 행 + 노드 링) + 캔버스 중앙 이동
  // + 매칭 컬럼 하이라이트.
  function navigateToTable(tableId: string, matchedColumnIds: string[]) {
    const t = schema?.tables.find((tb) => tb.id === tableId)
    setSelection(
      t ? { kind: 'node', nodeId: t.id, nodeType: 'table', tableName: t.name } : null,
    )
    setSearchHighlightColIds(matchedColumnIds)
    captureHandleRef.current?.centerOnNode(tableId)
  }
  // Info 버튼이 토글하는 우측 패널 표시 상태 (세션 메모리만, 기본 보임).
  const [panelOpen, setPanelOpen] = useState(true)
  // 좌측 DBML 에디터 패널 접힘 상태 (DBML 패널 헤더의 토글로 제어, 기본 펼침).
  const [dbmlOpen, setDbmlOpen] = useState(true)

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
      <div className="flex h-full items-center justify-center">
        Loading…
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg">Project not found</p>
        <Button onClick={() => navigate('/')}>Back to projects</Button>
      </div>
    )
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'var(--erd-bg)', color: 'var(--erd-text)' }}
    >
      {/* 56px TopBar */}
      <ErdTopBar
        projectName={project.name}
        projectMeta={projectMeta}
        autosaveStatus={status}
        exportMenu={
          <ExportMenu
            diagram={diagramCtx}
            schema={schema}
            dbmlText={dbmlText}
            disabled={exportDisabled}
          />
        }
      />

      {/* 3-zone CSS grid body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${dbmlOpen ? '340px' : '40px'} 1fr ${panelOpen ? '316px' : '40px'}`,
          transition: 'grid-template-columns 200ms ease',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left: DBML editor — collapsible to a 40px rail via its own header toggle. */}
        <div
          style={{
            background: 'var(--erd-surface-2)',
            borderRight: '1px solid var(--erd-border)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {dbmlOpen ? (
            <>
              {/* Panel header — 44px */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 44,
                  padding: '0 8px 0 14px',
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
                {/* Import source menu: SQL paste / DB sync both replace the
                    DBML being edited, so they live with the DBML source. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="erd-topbar-btn"
                      aria-label="가져오기"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        height: 28,
                        padding: '0 8px',
                        fontSize: 12,
                        fontWeight: 500,
                        borderRadius: 6,
                        border: '1px solid var(--erd-border-2)',
                        background: 'var(--erd-surface)',
                        color: 'var(--erd-text-2)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <Download size={14} strokeWidth={2} />
                      가져오기
                      <ChevronDown size={13} strokeWidth={2} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                      <Download size={15} strokeWidth={2} />
                      Import SQL
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSyncOpen(true)}>
                      <RefreshCw size={15} strokeWidth={2} />
                      DB에서 동기화
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Collapse the DBML editor itself */}
                <button
                  type="button"
                  className="erd-topbar-btn"
                  onClick={() => setDbmlOpen(false)}
                  aria-label="Collapse DBML editor"
                  title="DBML 에디터 접기"
                  style={DBML_TOGGLE_BTN}
                >
                  <PanelLeftClose size={16} strokeWidth={2} />
                </button>
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
            </>
          ) : (
            /* Collapsed rail: expand button + vertical label */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                paddingTop: 8,
                height: '100%',
              }}
            >
              <button
                type="button"
                className="erd-topbar-btn"
                onClick={() => setDbmlOpen(true)}
                aria-label="Expand DBML editor"
                title="DBML 에디터 펼치기"
                style={DBML_TOGGLE_BTN}
              >
                <PanelLeftOpen size={16} strokeWidth={2} />
              </button>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--erd-text-3)',
                  fontFamily: 'var(--font-mono, ui-monospace)',
                }}
              >
                DBML
              </span>
            </div>
          )}
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
            onLayoutChange={handleLayoutChange}
            onEdgePathsChange={setEdgePaths}
            onCaptureReady={handleCaptureReady}
            selection={selection}
            onSelect={handleCanvasSelect}
            onSelectionInfo={setSelectionInfo}
            searchHighlightColIds={searchHighlightColIds}
          />
        </div>

        {/* Right: ErdInfoPanel (316px) — collapsible to a 40px rail via its own
            header toggle (mirrors the DBML editor's left rail). */}
        <div
          data-testid="info-panel-column"
          style={{
            background: 'var(--erd-surface)',
            borderLeft: '1px solid var(--erd-border)',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {panelOpen ? (
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
                onSelect={selectTableById}
                onNavigateToTable={navigateToTable}
                dialect={dialect}
                groupOps={groupOps}
                mutationsEnabled={mutationsEnabled}
                selectionInfo={selectionInfo}
                onEditNodePosition={(nodeId, pos) =>
                  captureHandleRef.current?.setNodePositionAbs(nodeId, pos)
                }
                onEditEdgeWaypoint={(edgeId, i, axis, v) =>
                  captureHandleRef.current?.setEdgeWaypoint(edgeId, i, axis, v)
                }
                onResetEdgePath={(edgeId) =>
                  captureHandleRef.current?.resetEdgePath(edgeId)
                }
                onCollapse={() => setPanelOpen(false)}
              />
            </div>
          ) : (
            /* Collapsed rail: expand button + vertical label */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                paddingTop: 8,
                height: '100%',
              }}
            >
              <button
                type="button"
                className="erd-topbar-btn"
                onClick={() => setPanelOpen(true)}
                aria-label="Expand info panel"
                title="정보 패널 펼치기"
                style={DBML_TOGGLE_BTN}
              >
                <PanelRightOpen size={16} strokeWidth={2} />
              </button>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: 'var(--erd-text-3)',
                  fontFamily: 'var(--font-mono, ui-monospace)',
                }}
              >
                정보
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs / overlays — the 테이블 정의서 HTML overlay is now mounted
          once in AppLayout (opened from the sidebar's "⋯" menu). */}
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
