import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  RefreshCw,
  ChevronDown,
  History,
  Settings,
} from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/spinner'
import {
  TopbarIconButton,
  TopbarButton,
  TOPBAR_ICON_SIZE,
  TOPBAR_ICON_STROKE,
} from '@/shared/ui/topbar-control'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import { useProject, ProjectGlyph } from '@/entities/project'
import {
  useProjectAutosave,
} from '@/features/project-autosave'
import {
  DbmlEditor,
  useDbmlParse,
} from '@/features/dbml-editor'
import { ErdInfoPanel } from '@/widgets/erd-info-panel'
import { SelectionCard } from '@/widgets/selection-card'
import { TableSearch } from '@/widgets/table-search'
import { SnapshotHistoryPanel } from '@/widgets/snapshot-history'
import { useSnapshot, useRestoreSnapshot } from '@/entities/snapshot'
import { ErdCanvas, type ErdCaptureHandle } from '@/features/erd-canvas'
import type { CanvasSelection, SelectionInfo } from '@/entities/erd'
import { useLayoutPersistence } from '@/features/layout-persistence'
import { type DiagramExportContext } from '@/features/export-diagram'
import { SqlImportDialog } from '@/features/sql-import'
import { ErdTopBar } from '@/widgets/erd-topbar'
import { ExportMenu } from '@/widgets/export-menu'
import { useEditLease, LockStatusControl, BumpedDialog } from '@/features/edit-lock'
import { DbConnectDialog } from '@/features/db-import'
import {
  parseDbml,
  mergeDbml,
  previewSyncChanges,
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  moveTableToGroup,
  moveTablesToGroup,
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
  const { t } = useTranslation()
  const { data: project, isLoading, isError } = useProject(id)
  const [dbmlText, setDbmlText] = useState('')
  // The last server-seeded value; autosave skips while dbmlText still equals it.
  const [baseline, setBaseline] = useState('')
  // Live positions seeded from project.layout, re-seeded on a project switch.
  const { positions, setPositions, layout, layoutBaseline, edgePaths, setEdgePaths, reseed } =
    useLayoutPersistence({ projectId: project?.id, projectLayout: project?.layout })
  // 우측 패널은 정보/버전 기록 중 최대 하나만 표시 — null이면 영역 자체가 사라진다.
  // 두 패널은 상호배타이며, 둘 다 탑바 버튼으로 토글한다(기본 모두 hide).
  const [activePanel, setActivePanel] = useState<'info' | 'history' | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewing = previewId !== null
  // Role-based access (ADR-0015): editors/owners can edit; viewers are read-only.
  const canEdit = project?.role === 'owner' || project?.role === 'editor'
  const lease = useEditLease(id, { canEdit, isOwner: project?.role === 'owner' })
  // Read-only when the role can't edit OR the caller doesn't hold the live lock.
  const readOnly = !canEdit || lease.readOnly
  // 정보 토글: 열면 버전 기록이 자동으로 닫히고(상호배타), 재클릭하면 hide.
  const toggleInfo = () => {
    setActivePanel((p) => (p === 'info' ? null : 'info'))
    // 버전 기록을 벗어나므로 진행 중이던 미리보기는 취소한다.
    setPreviewId(null)
  }
  // 버전 기록 토글: 열면 정보가 자동으로 닫히고, 재클릭(닫기)하면 미리보기도 취소.
  const toggleHistory = () => {
    setActivePanel((p) => (p === 'history' ? null : 'history'))
    setPreviewId(null)
  }
  const { status } = useProjectAutosave({
    projectId: id,
    dbmlText,
    baseline,
    layout,
    layoutBaseline,
    // Pause autosave while previewing a snapshot, or when read-only (viewer /
    // not holding the edit lock), so nothing it shows is persisted.
    suspended: previewing || readOnly,
    version: project?.version,
    onConflict: lease.reportConflict,
  })
  // Full body of the snapshot being previewed (fetched on demand).
  const { data: previewSnapshot } = useSnapshot(id, previewId)
  const restore = useRestoreSnapshot(id)
  const previewSchema = useMemo(() => {
    if (!previewSnapshot) return undefined
    const parsed = parseDbml(previewSnapshot.dbml_text)
    return parsed.ok ? parsed.schema : undefined
  }, [previewSnapshot])
  const previewLayout = previewSnapshot?.layout as Partial<StoredLayout> | undefined

  function handleRestore() {
    if (!previewId) return
    restore.mutate(previewId, {
      onSuccess: (proj) => {
        // The seed effects key on project.id only, so a same-id restore won't
        // auto-reseed — do it imperatively (dbml + layout, live + baseline).
        setDbmlText(proj.dbml_text)
        setBaseline(proj.dbml_text)
        reseed(proj.layout)
        setPreviewId(null)
      },
    })
  }
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
    onMoveTables: (tableIds, toGroup) => {
      if (!parse.schema) return
      runGroupOp(moveTablesToGroup(dbmlText, parse.schema, tableIds, toGroup))
    },
    onMoveTablesToNewGroup: (tableIds, newName) => {
      if (!parse.schema) return
      // Create the empty group, then bulk-move into it (chained on the created
      // text; the old schema still resolves each table's from-group correctly).
      const created = createGroup(dbmlText, newName)
      if (!created.ok) {
        setGroupOpError(created.error)
        return
      }
      runGroupOp(moveTablesToGroup(created.text, parse.schema, tableIds, newName))
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
  const [pendingSync, setPendingSync] = useState<{ dbml: string; schemas: string[] } | null>(null)

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
  // 캔버스 위 플로팅 Selection 카드의 표시 여부. 새 대상이 선택되면 다시 열리고
  // (selKey 변화로 감지), X 버튼으로 닫으면 다음 선택 전까지 숨는다. 좌표만
  // 바뀌는 경우(드래그/편집)엔 selKey가 동일해 다시 열리지 않는다.
  const selKey = selectionInfo
    ? selectionInfo.kind === 'node'
      ? `n:${selectionInfo.nodeId}`
      : `e:${selectionInfo.edgeId}`
    : null
  const [selCardOpen, setSelCardOpen] = useState(true)
  useEffect(() => {
    if (selKey) setSelCardOpen(true)
  }, [selKey])
  // 레거시 이름 기반 파생값 — DbmlEditor 스크롤 + 패널 리스트 하이라이트용.
  const selected =
    selection?.kind === 'node' && selection.nodeType === 'table'
      ? selection.tableName ?? null
      : null

  // 테이블 검색 매칭 컬럼 하이라이트 — 검색 결과로 이동했을 때만 설정되고,
  // 다른 경로의 선택(캔버스 클릭/리스트 클릭)이 일어나면 비운다.
  const [searchHighlightColIds, setSearchHighlightColIds] = useState<string[]>([])

  // 캔버스 클릭 등 일반 선택 — 검색 하이라이트를 비우고 선택만 갱신.
  function handleCanvasSelect(next: CanvasSelection) {
    setSearchHighlightColIds([])
    setSelection(next)
  }

  // 테이블 하나에 "포커스" 하는 단일 동작 — 선택 설정(= DBML 스크롤 + 패널 행
  // 하이라이트 + 노드 링) + 캔버스를 그 노드로 이동/줌(centerOnNode, features/
  // erd-canvas의 단일 출처) + 매칭 컬럼 하이라이트. 검색 결과 이동(TableSearch)과
  // 패널 리스트 클릭(ErdInfoPanel)이 이 한 동작을 공유한다 — 각자 재구현하지 않는다.
  function focusTable(tableId: string, matchedColumnIds: string[] = []) {
    const t = schema?.tables.find((tb) => tb.id === tableId)
    setSelection(
      t ? { kind: 'node', nodeId: t.id, nodeType: 'table', tableName: t.name } : null,
    )
    setSearchHighlightColIds(matchedColumnIds)
    captureHandleRef.current?.centerOnNode(tableId)
  }
  // 좌측 DBML 에디터 패널 접힘 상태 (DBML 패널 헤더의 토글로 제어, 기본 펼침).
  const [dbmlOpen, setDbmlOpen] = useState(true)
  // 파싱 에러 행 클릭 → 에디터 해당 줄로 이동 요청 (nonce로 같은 줄 재클릭도 재발동).
  const [gotoError, setGotoError] = useState<{ line: number; column?: number; nonce: number } | null>(null)
  const gotoNonce = useRef(0)
  function gotoEditorLine(line: number, column?: number) {
    gotoNonce.current += 1
    setGotoError({ line, column, nonce: gotoNonce.current })
  }

  // 캔버스 로딩 게이트: 프로젝트 전환 시 캔버스가 (a) 이전 프로젝트의
  // lastValidSchema, (b) 시드 전 빈 텍스트("No diagram yet"), (c) debounce 중
  // stale 상태를 번갈아 보이던 문제를 없앤다. 현재 프로젝트의 DBML이 "처음으로
  // 파싱 완료(success/error, 또는 빈 DBML이면 idle)"될 때까지는 캔버스 위에
  // "ERD 불러오는 중" 오버레이를 덮어 일관되게 보여준다. 한 번 준비되면 같은
  // 프로젝트 내 편집(타이핑 debounce)에선 다시 닫지 않는다(깜빡임 방지).
  const [readyProjectId, setReadyProjectId] = useState<string | null>(null)
  // 캔버스가 "다 그려졌다"(모든 카드 measured + 라우팅 settle)는 ErdCanvas 신호를
  // 받은 프로젝트 id. readyProjectId(파싱 settle)와 AND되어 오버레이를 닫는다.
  const [canvasReadyId, setCanvasReadyId] = useState<string | null>(null)
  // onCanvasReady는 ErdCanvas가 1회성으로 부른다 — 최신 project.id를 ref로 읽어
  // 콜백 identity를 안정시킨다(불필요한 캔버스 재렌더 방지).
  const projectIdRef = useRef<string | undefined>(undefined)
  projectIdRef.current = project?.id
  const handleCanvasReady = useCallback(() => {
    if (projectIdRef.current) setCanvasReadyId(projectIdRef.current)
  }, [])

  // Seed the editor (and the autosave baseline) once the project loads.
  // 프로젝트 전환 시 우측 패널은 항상 '모두 hide'로 초기화한다(요구사항 4).
  useEffect(() => {
    if (project) {
      setDbmlText(project.dbml_text)
      setBaseline(project.dbml_text)
    }
    setActivePanel(null)
    setPreviewId(null)
    setReadyProjectId(null) // 전환 시 캔버스를 다시 로딩 게이트로
    setCanvasReadyId(null)
  }, [project?.id])

  // 현재 프로젝트의 DBML이 시드되고 첫 파싱이 settle되면 게이트를 연다.
  useEffect(() => {
    if (!project || readyProjectId === project.id) return
    if (dbmlText !== project.dbml_text) return // 아직 시드 전
    const settled =
      parse.status === 'success' ||
      parse.status === 'error' ||
      (parse.status === 'idle' && dbmlText === '') // 빈 DBML = no data 확정
    if (settled) setReadyProjectId(project.id)
  }, [project, dbmlText, parse.status, readyProjectId])

  // 그릴 게 있는 캔버스만 measured/라우팅 settle을 기다린다. 빈 스키마(테이블 0개)는
  // ErdCanvas가 ErdCanvasInner를 마운트하지 않아 onCanvasReady가 오지 않으므로,
  // 이 경우엔 캔버스 게이트를 즉시 통과시킨다(파싱 settle만으로 충분).
  // 캔버스에 주는 스키마: ErdCanvas는 "현재 프로젝트의 스키마"만 봐야 한다. 전환
  // 직후 dbmlText가 아직 이전 프로젝트 텍스트인 동안(시드 전)이나, 시드 후 첫 파싱
  // 이 settle되기 전(parse pending)에는 이전 프로젝트의 lastValidSchema 폴백을 주지
  // 않는다 — 빈 캔버스로 두고 오버레이가 덮는다. 파싱이 한 번 settle된 뒤
  // (readyProjectId===id)에야 폴백을 허용한다(같은 프로젝트 편집 중 일시적 파싱
  // 에러에도 마지막 유효 다이어그램 유지). 이래야 ErdCanvas가 stale 스키마로 조기
  // settle해 canvasReadyId를 엉뚱한 프로젝트에 대해 발화하는 일이 없다(전환 시
  // 재구성이 사용자 눈에 노출되던 원인).
  const settledOnce = !!project && readyProjectId === project.id
  const currentText = !!project && dbmlText === project.dbml_text
  const canvasSchema = settledOnce ? schema : currentText ? parse.schema : undefined
  const hasDrawableCanvas = !!canvasSchema && canvasSchema.tables.length > 0
  const canvasLoading =
    !project ||
    readyProjectId !== project.id ||
    (hasDrawableCanvas && canvasReadyId !== project.id)

  function applySync(incoming: string, syncedSchemas: string[]) {
    // Merge the freshly-introspected schema INTO the current DBML instead of
    // replacing it: the live DB drives structure (new/dropped tables, columns),
    // while table groups, notes, headerColor and node positions are preserved.
    const merged = mergeDbml(dbmlText, incoming, syncedSchemas)
    const parsed = parseDbml(merged)
    if (parsed.ok) {
      setPositions(computeSyncedPositions(positions, parsed.schema))
    }
    setDbmlText(merged)
    setPendingSync(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label={t('editor.loadingErd')} />
      </div>
    )
  }

  if (isError || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg">{t('editor.notFound')}</p>
        <Button onClick={() => navigate('/')}>{t('editor.backToProjects')}</Button>
      </div>
    )
  }

  // Pre-apply preview for the sync confirmation (only computed while the dialog
  // is open). Mirrors mergeDbml's scoping so it can't disagree with the merge.
  const syncPreview = pendingSync
    ? previewSyncChanges(dbmlText, pendingSync.dbml, pendingSync.schemas)
    : null
  const syncRemovalCount = syncPreview?.removedTables.length ?? 0

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ background: 'var(--erd-bg)', color: 'var(--erd-text)' }}
    >
      {/* 56px TopBar */}
      <ErdTopBar
        glyph={<ProjectGlyph glyph={project.glyph} color={project.color} bgColor={project.bg_color} size={30} />}
        projectName={project.name}
        projectMeta={projectMeta}
        autosaveStatus={status}
        lastModified={project.updated_at}
        lockStatus={<LockStatusControl canEdit={canEdit} lease={lease} />}
        searchBox={<TableSearch schema={schema} onNavigate={focusTable} />}
        infoButton={
          <TopbarIconButton
            data-testid="info-panel-button"
            aria-label={t('topbar.info')}
            title={t('topbar.info')}
            pressed={activePanel === 'info'}
            onClick={toggleInfo}
          >
            <Settings size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
          </TopbarIconButton>
        }
        historyButton={
          <TopbarIconButton
            data-testid="snapshot-history-button"
            aria-label={t('topbar.history')}
            title={t('topbar.history')}
            pressed={activePanel === 'history'}
            onClick={toggleHistory}
          >
            <History size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
          </TopbarIconButton>
        }
        importMenu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TopbarButton data-testid="import-menu-button" aria-label={t('topbar.import')}>
                <Download size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
                {t('topbar.import')}
                <ChevronDown size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
              </TopbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <Download size={15} strokeWidth={2} />
                {t('topbar.importSql')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSyncOpen(true)}>
                <RefreshCw size={15} strokeWidth={2} />
                {t('topbar.syncFromDb')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        exportMenu={
          <ExportMenu
            diagram={diagramCtx}
            schema={schema}
            dbmlText={dbmlText}
            projectName={project.name}
            disabled={exportDisabled}
          />
        }
      />

      {/* CSS grid body — 트랙은 항상 3개로 유지하고 우측 트랙 너비만 0↔패널폭으로
          전환한다. 트랙 개수가 바뀌면(2↔3) grid-template-columns가 보간되지 않아
          우측 패널만 애니메이션이 끊겼다(좌측은 같은 트랙의 너비만 바뀌어 정상). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${dbmlOpen ? '340px' : '40px'} 1fr ${
            activePanel ? '320px' : '0px'
          }`,
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
            // Read-only (snapshot preview, viewer role, or not holding the edit
            // lock): block editing the live DBML.
            pointerEvents: previewing || readOnly ? 'none' : undefined,
            opacity: previewing || readOnly ? 0.5 : 1,
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
                  {t('editor.dbmlEditor')}
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
                    {parse.status === 'success' ? t('editor.valid') : t('editor.invalid')}
                  </span>
                )}
                {/* Collapse the DBML editor itself */}
                <button
                  type="button"
                  className="erd-topbar-btn"
                  onClick={() => setDbmlOpen(false)}
                  aria-label={t('editor.collapseDbml')}
                  title={t('editor.collapseDbml')}
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
                  errors={parse.status === 'error' ? parse.errors : undefined}
                  gotoLine={gotoError}
                />
              </div>

              {/* 파싱 에러: 어느 줄에서 무엇이 틀렸는지 항상 보이게 표시
                  (에디터 안에는 거터·밑줄·툴팁으로도 표기됨). */}
              {parse.status === 'error' && parse.errors && parse.errors.length > 0 && (
                <div
                  role="alert"
                  data-testid="dbml-parse-errors"
                  style={{
                    flexShrink: 0,
                    maxHeight: 120,
                    overflowY: 'auto',
                    borderTop: '1px solid var(--erd-border)',
                    background: 'color-mix(in srgb, var(--erd-error) 8%, var(--erd-surface-2))',
                    color: 'var(--erd-error)',
                    fontSize: 12,
                    lineHeight: 1.5,
                    padding: '8px 14px',
                    fontFamily: 'var(--font-mono, ui-monospace)',
                  }}
                >
                  {parse.errors.map((e, i) =>
                    typeof e.line === 'number' ? (
                      <button
                        key={i}
                        type="button"
                        onClick={() => gotoEditorLine(e.line as number, e.column)}
                        title={t('editor.gotoLine')}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          font: 'inherit',
                          color: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        {`line ${e.line}${typeof e.column === 'number' ? `:${e.column}` : ''} — ${e.message}`}
                      </button>
                    ) : (
                      <div key={i}>{e.message}</div>
                    ),
                  )}
                </div>
              )}
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
                aria-label={t('editor.expandDbml')}
                title={t('editor.expandDbml')}
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
            key={project.id}
            schema={canvasSchema}
            savedPositions={positions}
            edgePaths={edgePaths}
            onLayoutChange={handleLayoutChange}
            onEdgePathsChange={setEdgePaths}
            onCaptureReady={handleCaptureReady}
            onCanvasReady={handleCanvasReady}
            selection={selection}
            onSelect={handleCanvasSelect}
            onSelectionInfo={setSelectionInfo}
            searchHighlightColIds={searchHighlightColIds}
          />

          {/* 프로젝트 전환 로딩 오버레이 — 현재 프로젝트 파싱이 settle될 때까지
              캔버스를 덮어 stale/부분/빈화면 플래시를 가린다(일관된 "불러오는 중"). */}
          {canvasLoading && (
            <div
              data-testid="canvas-loading-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 4,
                background: 'var(--erd-canvas)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Spinner label={t('editor.loadingErd')} />
            </div>
          )}

          {/* 캔버스 위 플로팅 Selection 카드 — DBML 에디터 바로 우측(좌상단).
              우측 패널에서 분리되어 캔버스 위에 뜬다. 미리보기 중엔 숨긴다. */}
          {selectionInfo && selCardOpen && !previewing && (
            <SelectionCard
              info={selectionInfo}
              onEditNodePosition={(nodeId, pos) =>
                captureHandleRef.current?.setNodePositionAbs(nodeId, pos)
              }
              onEditEdgeWaypoint={(edgeId, i, axis, v) =>
                captureHandleRef.current?.setEdgeWaypoint(edgeId, i, axis, v)
              }
              onResetEdgePath={(edgeId) => captureHandleRef.current?.resetEdgePath(edgeId)}
              onClose={() => setSelCardOpen(false)}
            />
          )}

          {/* Snapshot preview overlay: a read-only render of the chosen
              snapshot, isolated from autosave/persistence (no callbacks). */}
          {previewing && (
            <div
              data-testid="snapshot-preview-overlay"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                background: 'var(--erd-canvas)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--erd-border)',
                  background: 'var(--erd-surface)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--erd-text-2)', flex: 1 }}>
                  {t('editor.preview')}
                  {previewSnapshot
                    ? ` · ${new Date(previewSnapshot.created_at).toLocaleString()}`
                    : '…'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewId(null)}
                  data-testid="snapshot-preview-cancel"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleRestore}
                  disabled={restore.isPending || !previewSnapshot}
                  data-testid="snapshot-preview-restore"
                >
                  {t('editor.previewRestore')}
                </Button>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                {previewSnapshot ? (
                  <ErdCanvas
                    schema={previewSchema}
                    savedPositions={previewLayout?.positions}
                    edgePaths={previewLayout?.edges}
                    readOnly
                  />
                ) : (
                  <div
                    style={{
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 13,
                      color: 'var(--erd-text-3)',
                    }}
                  >
                    {t('common.loading')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: 정보/버전 기록 패널 — activePanel이 있을 때만 마운트(상호배타). */}
        {activePanel && (
          <div
            data-testid="info-panel-column"
            style={{
              background: 'var(--erd-surface)',
              borderLeft: '1px solid var(--erd-border)',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {activePanel === 'history' ? (
              <SnapshotHistoryPanel
                projectId={id}
                previewId={previewId}
                onPreview={setPreviewId}
                onClose={() => {
                  setActivePanel(null)
                  setPreviewId(null)
                }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {groupOpError && (
                  <div role="alert" data-testid="group-op-error" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, color: 'var(--erd-error)', borderBottom: '1px solid var(--erd-border)' }}>
                    <span style={{ flex: 1 }}>{groupOpError}</span>
                    <button aria-label="dismiss" onClick={() => setGroupOpError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
                  </div>
                )}
                <ErdInfoPanel
                  schema={schema}
                  selected={selected}
                  onSelect={focusTable}
                  dialect={dialect}
                  groupOps={groupOps}
                  mutationsEnabled={mutationsEnabled}
                  onCollapse={() => setActivePanel(null)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs / overlays — the 테이블 정의서 HTML overlay is now mounted
          once in AppLayout (opened from the sidebar's "⋯" menu). */}
      <BumpedDialog
        open={lease.bumped}
        onOpenChange={(o) => {
          if (!o) lease.clearBumped()
        }}
        dbmlText={dbmlText}
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
        onIntrospected={(dbml, _name, schemas) => {
          setSyncOpen(false)
          setPendingSync({ dbml, schemas })
        }}
      />
      <Dialog
        open={pendingSync !== null}
        onOpenChange={(o) => { if (!o) setPendingSync(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editor.syncTitle')}</DialogTitle>
            <DialogDescription>{t('editor.syncPreviewIntro')}</DialogDescription>
          </DialogHeader>
          {syncPreview && (
            <div className="flex flex-col gap-2 text-sm" data-testid="sync-preview">
              <div>{t('editor.syncAdded', { count: syncPreview.added })}</div>
              {syncPreview.preservedSchemas.length > 0 && (
                <div className="text-muted-foreground">
                  {t('editor.syncPreserved', {
                    schemas: syncPreview.preservedSchemas.join(', '),
                  })}
                </div>
              )}
              {syncRemovalCount > 0 && (
                <div
                  data-testid="sync-removals"
                  className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive"
                >
                  <div className="font-medium">
                    {t('editor.syncRemoved', { count: syncRemovalCount })}
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {syncPreview.removedTables.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingSync(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={syncRemovalCount > 0 ? 'destructive' : 'default'}
              onClick={() => { if (pendingSync) applySync(pendingSync.dbml, pendingSync.schemas) }}
            >
              {syncRemovalCount > 0
                ? t('editor.syncConfirmWithRemovals', { count: syncRemovalCount })
                : t('editor.syncConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
