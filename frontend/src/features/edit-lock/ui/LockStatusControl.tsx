import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
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

/**
 * Topbar edit-lock indicator (ADR-0015): read-only badge for viewers, "○○ is
 * editing" + force for the owner, or a "take over" button when the lock is free
 * but the caller isn't holding it. Renders nothing while the caller holds it.
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

  // The caller holds it (or it's free and they may edit) → no indicator needed;
  // a first save auto-acquires the lease.
  return null
}
