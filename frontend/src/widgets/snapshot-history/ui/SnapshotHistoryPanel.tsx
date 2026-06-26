import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { PanelRightClose, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { ApiError } from '@/shared/api/client'
import {
  useSnapshots,
  useSnapshotCalendar,
  useCreateSnapshot,
  useDeleteSnapshot,
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0' }}>
        <TabButton
          active={tab === 'manual'}
          onClick={() => setTab('manual')}
          testId="snapshot-tab-manual"
        >
          {t('snapshot.tabManual')}
        </TabButton>
        <TabButton
          active={tab === 'auto'}
          onClick={() => setTab('auto')}
          testId="snapshot-tab-auto"
        >
          {t('snapshot.tabAuto')}
        </TabButton>
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
  const create = useCreateSnapshot(projectId)
  const del = useDeleteSnapshot(projectId)
  const { data: rows = [], isLoading } = useSnapshots(projectId, {
    group: 'manual',
  })

  function handleCreate() {
    create.mutate(label.trim() || null, {
      onSuccess: () => {
        setLabel('')
        setError(null)
      },
      onError: (e) =>
        setError(e instanceof ApiError ? e.message : t('snapshot.saveFailed')),
    })
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
  onClick,
  onDelete,
}: {
  snapshot: SnapshotMeta
  active: boolean
  title: string
  subtitle: string
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
              fontSize: 13,
              color: 'var(--erd-text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--erd-text-3)' }}>
            {subtitle}
          </div>
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

function TabButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  testId: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      style={{
        flex: 1,
        height: 32,
        borderRadius: 6,
        border: 'none',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        background: active ? 'var(--erd-hover)' : 'transparent',
        color: active ? 'var(--erd-text)' : 'var(--erd-text-3)',
      }}
    >
      {children}
    </button>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px 14px',
        fontSize: 12,
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
  fontSize: 12,
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

const textInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 32,
  padding: '0 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid var(--erd-border-2)',
  background: 'var(--erd-surface)',
  color: 'var(--erd-text)',
  fontFamily: 'inherit',
}

const errorText: React.CSSProperties = {
  padding: '0 14px 8px',
  fontSize: 12,
  color: 'var(--erd-error)',
}
