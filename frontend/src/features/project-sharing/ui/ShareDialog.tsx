import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ApiError } from '@/shared/api/client'
import { useMembers } from '../api/useMembers'
import {
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
} from '../api/useShareMutations'
import type { MemberRole } from '../model/types'

export interface ShareDialogProps {
  projectId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ASSIGNABLE: MemberRole[] = ['editor', 'viewer']

/** Owner-only "공유 / 멤버 관리" modal: invite by email, change role, remove. */
export function ShareDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const { t } = useTranslation()
  const members = useMembers(projectId, open)
  const invite = useInviteMember(projectId)
  const updateRole = useUpdateMemberRole(projectId)
  const remove = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [error, setError] = useState<string | null>(null)

  const roleLabel = (r: string) => t(`sharing.role_${r}`)

  function submitInvite() {
    setError(null)
    invite.mutate(
      { email: email.trim(), role },
      {
        onSuccess: () => setEmail(''),
        onError: (e) => {
          const status = e instanceof ApiError ? e.status : 0
          setError(
            status === 404
              ? t('sharing.errorUserNotFound')
              : status === 409
                ? t('sharing.errorAlreadyMember')
                : t('sharing.errorGeneric'),
          )
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>{t('sharing.title', { name: projectName })}</DialogTitle>
        </DialogHeader>

        {/* Invite form */}
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submitInvite()
          }}
        >
          <Label htmlFor="share-invite-email">{t('sharing.inviteLabel')}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="share-invite-email"
              data-testid="share-invite-email"
              type="email"
              required
              value={email}
              placeholder={t('sharing.inviteEmailPlaceholder')}
              onChange={(e) => setEmail(e.target.value)}
            />
            <RolePicker value={role} onChange={setRole} label={roleLabel} />
            <Button type="submit" data-testid="share-invite-submit" disabled={invite.isPending}>
              {t('sharing.invite')}
            </Button>
          </div>
          {error ? (
            <p data-testid="share-invite-error" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>

        {/* Roster */}
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">{t('sharing.membersTitle')}</div>
          <ul className="flex flex-col divide-y">
            {(members.data ?? []).map((m) => (
              <li
                key={m.user_id}
                data-testid={`share-member-${m.email}`}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="truncate text-sm">{m.email}</span>
                {m.role === 'owner' ? (
                  <span className="text-xs text-muted-foreground">
                    {roleLabel('owner')}
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <RolePicker
                      value={m.role as MemberRole}
                      onChange={(r) =>
                        updateRole.mutate({ userId: m.user_id, role: r })
                      }
                      label={roleLabel}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('sharing.remove')}
                      data-testid={`share-remove-${m.email}`}
                      onClick={() => remove.mutate(m.user_id)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A small role dropdown (editor/viewer) built on the shared dropdown-menu. */
function RolePicker({
  value,
  onChange,
  label,
}: {
  value: MemberRole
  onChange: (role: MemberRole) => void
  label: (role: string) => string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label(value)}
          <ChevronDown size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ASSIGNABLE.map((r) => (
          <DropdownMenuItem key={r} onSelect={() => onChange(r)}>
            {label(r)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
