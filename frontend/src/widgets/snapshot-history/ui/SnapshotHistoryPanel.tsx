import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PanelRightClose, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { SegmentedControl } from '@/shared/ui/segmented-control'
import { ApiError } from '@/shared/api/client'
import {
  useSnapshots,
  useSnapshotCalendar,
  useCreateSnapshot,
  useDeleteSnapshot,
  type CreateSnapshotInput,
  type SnapshotGroup,
  type SnapshotMeta,
} from '@/entities/snapshot'
import { SnapshotCalendar } from './SnapshotCalendar'

interface SnapshotHistoryPanelProps {
  projectId: string
  /** Currently previewed snapshot id (row highlight), or null. */
  previewId: string | null
  /** Enter preview for a snapshot (the editor renders it read-only). */
  onPreview: (snapshotId: string) => void
  onClose: () => void
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function kindBadge(kind: SnapshotMeta['kind'], t: TFunction): string {
  if (kind === 'auto_coarse') return t('snapshot.kindMonth')
  if (kind === 'auto_fine') return t('snapshot.kindHalfHour')
  return t('snapshot.kindManual')
}

export function SnapshotHistoryPanel({
  projectId,
  previewId,
  onPreview,
  onClose,
}: SnapshotHistoryPanelProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SnapshotGroup>('manual')

  return (
    <div
      data-testid="snapshot-panel"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Header */}
      <div style={panelHead}>
        <span style={panelTitle}>{t('snapshot.title')}</span>
        <button
          type="button"
          className="erd-topbar-btn"
          aria-label={t('snapshot.closePanel')}
          title={t('common.close')}
          onClick={onClose}
          style={iconBtn}
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Tabs — the same two-way switch the topbar uses for 읽기/편집, so
          "pick one of these" looks identical everywhere (F1/G1). */}
      <div style={{ padding: '8px 12px 0' }}>
        <SegmentedControl<SnapshotGroup>
          block
          testId="snapshot-tab"
          ariaLabel={t('snapshot.title')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'manual', label: t('snapshot.tabManual') },
            { value: 'auto', label: t('snapshot.tabAuto') },
          ]}
        />
      </div>

      {tab === 'manual' ? (
        <ManualTab
          projectId={projectId}
          previewId={previewId}
          onPreview={onPreview}
        />
      ) : (
        <AutoTab
          projectId={projectId}
          previewId={previewId}
          onPreview={onPreview}
        />
      )}
    </div>
  )
}

// --- Manual tab -------------------------------------------------------------
function ManualTab({
  projectId,
  previewId,
  onPreview,
}: {
  projectId: string
  previewId: string | null
  onPreview: (id: string) => void
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  // 삭제는 공통 확인 모달로 재확인(브라우저 confirm 대신). 대상 id를 담아 연다.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  // 같은 라벨 저장은 되돌릴 수 없는 덮어쓰기 — 서버가 409로 알려주면 그 라벨을
  // 담아 확인 모달을 열고, 확인 시 overwrite로 재요청한다 (ADR-0023).
  const [pendingOverwrite, setPendingOverwrite] = useState<string | null>(null)
  const create = useCreateSnapshot(projectId)
  const del = useDeleteSnapshot(projectId)
  const { data: rows = [], isLoading } = useSnapshots(projectId, {
    group: 'manual',
  })

  function save(input: CreateSnapshotInput) {
    create.mutate(input, {
      onSuccess: () => {
        setLabel('')
        setError(null)
      },
      onError: (e) => {
        if (
          e instanceof ApiError &&
          e.status === 409 &&
          e.reason === 'label_exists' &&
          input.label
        ) {
          setError(null)
          setPendingOverwrite(input.label)
          return
        }
        setError(e instanceof ApiError ? e.message : t('snapshot.saveFailed'))
      },
    })
  }

  function handleCreate() {
    save({ label: label.trim() || null })
  }

  return (
    <div style={bodyScroll}>
      <div style={{ padding: '10px 12px', display: 'flex', gap: 6 }}>
        <input
          data-testid="snapshot-name-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('snapshot.labelPlaceholder')}
          maxLength={255}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          style={textInput}
        />
        <Button
          data-testid="snapshot-create-button"
          size="sm"
          onClick={handleCreate}
          disabled={create.isPending}
        >
          <Plus size={14} />
          {t('snapshot.save')}
        </Button>
      </div>
      {error && (
        <div data-testid="snapshot-create-error" style={errorText}>
          {error}
        </div>
      )}

      {isLoading ? (
        <EmptyHint>{t('snapshot.loading')}</EmptyHint>
      ) : rows.length === 0 ? (
        <EmptyHint>{t('snapshot.empty')}</EmptyHint>
      ) : (
        <ul style={list}>
          {rows.map((s) => (
            <SnapshotRow
              key={s.id}
              snapshot={s}
              active={s.id === previewId}
              onClick={() => onPreview(s.id)}
              subtitle={fmtDateTime(s.created_at)}
              author={
                s.created_by_email
                  ? t('snapshot.author', { email: s.created_by_email })
                  : undefined
              }
              title={s.label || t('snapshot.untitled')}
              onDelete={() => setPendingDelete(s.id)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null) }}
        testId="snapshot-delete-confirm"
        title={t('snapshot.deleteConfirmTitle')}
        description={t('snapshot.deleteConfirmDesc')}
        confirmDisabled={del.isPending}
        onConfirm={() => {
          if (pendingDelete) del.mutate(pendingDelete)
          setPendingDelete(null)
        }}
      />

      <ConfirmDialog
        open={pendingOverwrite !== null}
        onOpenChange={(o) => { if (!o) setPendingOverwrite(null) }}
        testId="snapshot-overwrite-confirm"
        title={t('snapshot.overwriteConfirmTitle')}
        description={t('snapshot.overwriteConfirmDesc', {
          label: pendingOverwrite ?? '',
        })}
        confirmLabel={t('snapshot.overwrite')}
        confirmDisabled={create.isPending}
        onConfirm={() => {
          if (pendingOverwrite) {
            save({ label: pendingOverwrite, overwrite: true })
          }
          setPendingOverwrite(null)
        }}
      />
    </div>
  )
}

// --- Auto tab ---------------------------------------------------------------
function AutoTab({
  projectId,
  previewId,
  onPreview,
}: {
  projectId: string
  previewId: string | null
  onPreview: (id: string) => void
}) {
  const { t } = useTranslation()
  const [month, setMonth] = useState<string>(currentMonth)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const { data: days = [] } = useSnapshotCalendar(projectId, month, 'auto')
  const { data: rows = [], isLoading } = useSnapshots(
    projectId,
    { group: 'auto', date: selectedDate ?? undefined },
    selectedDate !== null,
  )

  const countByDate = Object.fromEntries(days.map((d) => [d.date, d.count]))

  return (
    <div style={bodyScroll}>
      <SnapshotCalendar
        month={month}
        countByDate={countByDate}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onMonthChange={(m) => {
          setMonth(m)
          setSelectedDate(null)
        }}
      />
      <div style={{ borderTop: '1px solid var(--erd-border)' }} />
      {selectedDate === null ? (
        <EmptyHint>{t('snapshot.pickDate')}</EmptyHint>
      ) : isLoading ? (
        <EmptyHint>{t('snapshot.loading')}</EmptyHint>
      ) : rows.length === 0 ? (
        <EmptyHint>{t('snapshot.emptyForDate')}</EmptyHint>
      ) : (
        <ul style={list}>
          {rows.map((s) => (
            <SnapshotRow
              key={s.id}
              snapshot={s}
              active={s.id === previewId}
              onClick={() => onPreview(s.id)}
              title={fmtTime(s.created_at)}
              subtitle={kindBadge(s.kind, t)}
              author={
                s.created_by_email
                  ? t('snapshot.author', { email: s.created_by_email })
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Shared row -------------------------------------------------------------
function SnapshotRow({
  snapshot,
  active,
  title,
  subtitle,
  author,
  onClick,
  onDelete,
}: {
  snapshot: SnapshotMeta
  active: boolean
  title: string
  subtitle: string
  /** Attributed author line (already localized); omitted when unknown. */
  author?: string
  onClick: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  return (
    <li>
      <div
        data-testid={`snapshot-row-${snapshot.id}`}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          background: active ? 'var(--erd-hover)' : 'transparent',
          borderLeft: active
            ? '2px solid var(--erd-accent)'
            : '2px solid transparent',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--erd-fs-base)',
              color: 'var(--erd-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div style={metaLine}>{subtitle}</div>
          {author && (
            <div data-testid={`snapshot-author-${snapshot.id}`} style={metaLine}>
              {author}
            </div>
          )}
        </div>
        {onDelete && (
          <button
            type="button"
            data-testid={`snapshot-delete-${snapshot.id}`}
            aria-label={t('snapshot.delete')}
            title={t('common.delete')}
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            style={iconBtn}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px 14px',
        fontSize: 'var(--erd-fs-sm)',
        color: 'var(--erd-text-3)',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

const panelHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 44,
  padding: '0 8px 0 14px',
  flexShrink: 0,
  borderBottom: '1px solid var(--erd-border)',
}

const panelTitle: React.CSSProperties = {
  fontSize: 'var(--erd-fs-sm)',
  fontWeight: 600,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  color: 'var(--erd-text-2)',
  flex: 1,
}

const iconBtn: React.CSSProperties = {
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

const bodyScroll: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
}

const list: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

// Muted secondary text inside a snapshot row (subtitle + author); ellipsizes so
// a long author email never overflows the narrow panel.
const metaLine: React.CSSProperties = {
  fontSize: 'var(--erd-fs-xs)',
  color: 'var(--erd-text-3)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const textInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  padding: '0 10px',
  fontSize: 'var(--erd-fs-base)',
  borderRadius: 6,
  border: '1px solid var(--erd-border-2)',
  background: 'var(--erd-surface)',
  color: 'var(--erd-text)',
  fontFamily: 'inherit',
}

const errorText: React.CSSProperties = {
  padding: '0 14px 8px',
  fontSize: 'var(--erd-fs-sm)',
  color: 'var(--erd-error)',
}
