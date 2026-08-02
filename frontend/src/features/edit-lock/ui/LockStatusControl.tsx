import { useTranslation } from 'react-i18next'
import { Eye, Pencil } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { SegmentedControl } from '@/shared/ui/segmented-control'
import { TOPBAR_ICON_SIZE, TOPBAR_ICON_STROKE } from '@/shared/ui/topbar-control'
import { shortEmail } from '@/shared/lib/email'
import type { EditLease } from '../api/useEditLease'

export interface LockStatusControlProps {
  /** False for viewers — the 편집 side of the switch is never reachable. */
  canEdit: boolean
  lease: EditLease
}

type Mode = 'read' | 'edit'

/**
 * Quiet one-line note beside the switch. No pill, no fill: the switch is the
 * only filled thing in the bar and this must not compete with it. It is the
 * only shrinking item in the row, so a long name eats into the sentence and
 * never into the button next to it.
 */
const noteStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--erd-fs-sm)',
  color: 'var(--erd-text-3)',
}

const alertNoteStyle: React.CSSProperties = {
  ...noteStyle,
  color: 'var(--erd-error)',
}

/**
 * Topbar mode switch: 읽기 ⇄ 편집.
 *
 * Opening a project reads it; editing is a mode you step into (ADR-0025). One
 * two-way switch carries that — it shows the state you are in AND the one you
 * can move to, which the previous badge-plus-button pair could not: those said
 * one thing twice and left the reader to work out which was label and which was
 * action. Everything that blocks or interrupts the move rides alongside as a
 * plain sentence: a viewer's lack of access, another user holding the lease
 * (the owner may force it), and losing a lease you held, which is announced
 * here rather than by a failing save (ADR-0024).
 */
export function LockStatusControl({ canEdit, lease }: LockStatusControlProps) {
  const { t } = useTranslation()

  const mode: Mode = lease.editMode ? 'edit' : 'read'
  const holder = lease.holderEmail ?? ''
  // Why the 편집 side is closed, in one sentence. The tooltip spells the whole
  // address out; the bar shows only as much as it can without truncating.
  const blockedReason = !canEdit
    ? t('editLock.viewerReadOnly')
    : lease.lockedByOther
      ? t('editLock.editing', { email: shortEmail(holder) })
      : null
  const blockedTitle =
    canEdit && lease.lockedByOther ? t('editLock.editing', { email: holder }) : blockedReason

  const forceButton = lease.canForce ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      data-testid="lock-force"
      onClick={lease.force}
    >
      {t('editLock.forceTakeover')}
    </Button>
  ) : null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <SegmentedControl<Mode>
        testId="mode-switch"
        ariaLabel={t('editLock.modeSwitch')}
        value={mode}
        onChange={(next) => {
          if (next === 'edit') lease.enterEditMode()
          else void lease.exitEditMode()
        }}
        options={[
          {
            value: 'read',
            label: t('editLock.modeRead'),
            icon: <Eye size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />,
            disabled: lease.exiting,
          },
          {
            value: 'edit',
            label: t('editLock.modeEdit'),
            icon: <Pencil size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />,
            disabled: Boolean(blockedReason) || lease.entering || lease.exiting,
            title: blockedTitle ?? undefined,
          },
        ]}
      />

      {/* Losing a lease you held is the one state that earns a colour. */}
      {lease.lostLease ? (
        <span
          style={alertNoteStyle}
          data-testid="lock-lost"
          title={lease.lockedByOther ? t('editLock.tookOver', { email: holder }) : undefined}
        >
          {lease.lockedByOther
            ? t('editLock.tookOver', { email: shortEmail(holder) })
            : t('editLock.leaseLost')}
        </span>
      ) : blockedReason ? (
        <span
          style={noteStyle}
          title={blockedTitle ?? undefined}
          data-testid={canEdit ? 'lock-editing-by' : 'lock-readonly-viewer'}
        >
          {blockedReason}
        </span>
      ) : null}
      {forceButton}
    </div>
  )
}
