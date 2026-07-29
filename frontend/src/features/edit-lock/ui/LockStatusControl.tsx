import { useTranslation } from 'react-i18next'
import { Lock, Pencil } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import type { EditLease } from '../api/useEditLease'

export interface LockStatusControlProps {
  /** False for viewers — shows a plain read-only badge (no takeover). */
  canEdit: boolean
  lease: EditLease
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 'var(--erd-fs-sm)',
  color: 'var(--erd-text-2)',
  padding: '4px 10px',
  borderRadius: 9999,
}

// Same badge, accent-toned: being IN edit mode is a state worth noticing.
const editingStyle: React.CSSProperties = {
  ...badgeStyle,
  color: 'var(--erd-accent)',
  background: 'color-mix(in srgb, var(--erd-accent) 12%, transparent)',
}

// Same badge, alert-toned: losing the lease is news, not ambient status.
const lostStyle: React.CSSProperties = {
  ...badgeStyle,
  color: 'var(--erd-error)',
  background: 'color-mix(in srgb, var(--erd-error) 12%, transparent)',
}

/**
 * Topbar edit-mode switch and lock indicator.
 *
 * Opening a project reads it; editing is a mode you step into (ADR-0025), so
 * this is where that step happens: "편집 모드" to take the lease, "편집 종료" to
 * hand it back. It also carries the states that block entering — a viewer's
 * read-only badge, someone else holding the lease (owner may force), and losing
 * a lease you held, which is announced here rather than by a failing save
 * (ADR-0024).
 */
export function LockStatusControl({ canEdit, lease }: LockStatusControlProps) {
  const { t } = useTranslation()

  if (!canEdit) {
    return (
      <span style={badgeStyle} data-testid="lock-readonly-viewer">
        <Lock size={13} /> {t('editLock.viewerReadOnly')}
      </span>
    )
  }
  // The caller lost a lease they were holding — say it plainly, and offer the
  // way back: resume when it is free again, force when they own the project.
  if (lease.lostLease) {
    return (
      <span style={lostStyle} data-testid="lock-lost">
        <Lock size={13} />
        {lease.lockedByOther
          ? t('editLock.tookOver', { email: lease.holderEmail ?? '' })
          : t('editLock.leaseLost')}
        {lease.canForce ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="lock-force"
            onClick={lease.force}
          >
            {t('editLock.forceTakeover')}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="lock-resume"
            disabled={lease.lockedByOther}
            onClick={lease.takeover}
          >
            {t('editLock.takeover')}
          </Button>
        )}
      </span>
    )
  }
  // In edit mode → say so, and offer the way back out. Handing the lease back
  // is a deliberate act, same as taking it.
  if (lease.editMode) {
    return (
      <span style={editingStyle} data-testid="lock-editing-mode">
        <Pencil size={13} />
        {t('editLock.editingNow')}
        <Button
          type="button"
          variant="outline"
          size="xs"
          data-testid="lock-exit-edit"
          onClick={lease.exitEditMode}
        >
          {t('editLock.exitEdit')}
        </Button>
      </span>
    )
  }
  // Another user holds the live lock → read-only banner; the owner may force.
  if (lease.lockedByOther) {
    return (
      <span style={badgeStyle} data-testid="lock-editing-by">
        <Lock size={13} />
        {t('editLock.editing', { email: lease.holderEmail ?? '' })}
        {lease.canForce ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="lock-force"
            onClick={lease.force}
          >
            {t('editLock.forceTakeover')}
          </Button>
        ) : null}
      </span>
    )
  }

  // Free, and the caller may edit → the entry point into edit mode.
  return (
    <span style={badgeStyle} data-testid="lock-readonly-editor">
      {t('editLock.readingNow')}
      <Button
        type="button"
        size="xs"
        data-testid="lock-enter-edit"
        disabled={lease.entering}
        onClick={lease.enterEditMode}
      >
        <Pencil size={13} />
        {t('editLock.enterEdit')}
      </Button>
    </span>
  )
}
