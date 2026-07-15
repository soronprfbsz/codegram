import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Select } from '@/shared/ui/select'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { copyText } from '@/shared/lib/copyText'
import { ApiError } from '@/shared/api/client'
import {
  useAccounts,
  useMe,
  useUpdateAccountRole,
  useResetPassword,
  useRoles,
  useUpdateRolePermissions,
  type Account,
  type RoleName,
  type Role,
} from '@/entities/account'

const ROLE_OPTIONS: RoleName[] = ['admin', 'user']

const PERMISSION_LABEL_KEYS: Record<string, string> = {
  'user:read': 'accounts.permissionUserRead',
  'user:manage': 'accounts.permissionUserManage',
}

function permissionLabel(t: (key: string) => string, code: string): string {
  const key = PERMISSION_LABEL_KEYS[code]
  return key ? t(key) : code
}

/** One account row: read-only email/role, or (with user:manage) an editable
 * role select + a reset-password button that reveals the one-time temp
 * password in a copyable modal. */
function AccountRow({
  account,
  canManage,
}: {
  account: Account
  canManage: boolean
}) {
  const { t } = useTranslation()
  const updateRole = useUpdateAccountRole()
  const resetPassword = useResetPassword()
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function handleReset() {
    const result = await resetPassword.mutateAsync(account.id)
    setTempPassword(result.temp_password)
    setCopyState('idle')
  }

  async function handleCopy() {
    if (!tempPassword) return
    const ok = await copyText(tempPassword)
    setCopyState(ok ? 'copied' : 'failed')
  }

  const copyLabel =
    copyState === 'copied'
      ? t('accounts.copied')
      : copyState === 'failed'
        ? t('accounts.copyFailed')
        : t('accounts.copy')

  return (
    <li
      data-testid={`account-row-${account.id}`}
      className={
        canManage
          ? 'grid grid-cols-[1fr_160px_140px] items-center gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0'
          : 'grid grid-cols-[1fr_160px] items-center gap-4 border-b border-border px-4 py-2.5 text-sm last:border-b-0'
      }
    >
      <span className="truncate">{account.email}</span>
      {canManage ? (
        <Select
          aria-label={t('accounts.roleSelectAria', { email: account.email })}
          data-testid={`account-role-select-${account.id}`}
          value={account.role_name ?? 'user'}
          disabled={updateRole.isPending}
          onChange={(e) =>
            updateRole.mutate({
              accountId: account.id,
              roleName: e.target.value,
            })
          }
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {t(`accounts.role${role === 'admin' ? 'Admin' : 'User'}`)}
            </option>
          ))}
        </Select>
      ) : (
        <span>
          {account.role_name === 'admin'
            ? t('accounts.roleAdmin')
            : account.role_name === 'user'
              ? t('accounts.roleUser')
              : t('accounts.roleUnknown')}
        </span>
      )}
      {canManage && (
        <Button
          variant="outline"
          size="sm"
          data-testid={`account-reset-button-${account.id}`}
          aria-label={t('accounts.resetPasswordAria', {
            email: account.email,
          })}
          disabled={resetPassword.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {resetPassword.isPending
            ? t('accounts.resetPasswordPending')
            : t('accounts.resetPassword')}
        </Button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        testId={`account-reset-confirm-${account.id}`}
        title={t('accounts.resetConfirmTitle')}
        description={t('accounts.resetConfirmDesc', { email: account.email })}
        confirmLabel={t('accounts.resetPassword')}
        confirmDisabled={resetPassword.isPending}
        onConfirm={handleReset}
      />

      <Dialog
        open={tempPassword !== null}
        onOpenChange={(open) => !open && setTempPassword(null)}
      >
        <DialogContent data-testid="account-reset-modal">
          <DialogHeader>
            <DialogTitle>{t('accounts.resetModalTitle')}</DialogTitle>
            <DialogDescription>
              {t('accounts.resetModalDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-2.5 py-1.5 font-mono text-sm">
            <span
              data-testid="account-reset-temp-password"
              className="flex-1 select-all"
            >
              {tempPassword}
            </span>
            <Button
              size="sm"
              variant="outline"
              data-testid="account-reset-copy"
              onClick={handleCopy}
            >
              {copyLabel}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setTempPassword(null)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  )
}

/** One role row of the permission matrix: a checkbox per permission code,
 * saved immediately on toggle (mirrors AccountRow's role-select pattern —
 * no separate "save" step). Surfaces a 409 admin_manage_required rejection
 * as an inline error row instead of crashing. */
function RoleRow({
  role,
  permissionCodes,
}: {
  role: Role
  permissionCodes: string[]
}) {
  const { t } = useTranslation()
  const updatePermissions = useUpdateRolePermissions()

  function handleToggle(code: string, checked: boolean) {
    const next = checked
      ? [...role.permissions, code]
      : role.permissions.filter((c) => c !== code)
    updatePermissions.mutate({ roleId: role.id, permissionCodes: next })
  }

  const error = updatePermissions.error as ApiError | null
  const errorMessage = updatePermissions.isError
    ? error?.reason === 'admin_manage_required'
      ? t('accounts.permissionsAdminManageRequiredError')
      : t('accounts.permissionsUpdateError')
    : null

  return (
    <>
      <tr data-testid={`role-row-${role.name}`}>
        <td className="px-4 py-2.5 text-sm">
          {t(`accounts.role${role.name === 'admin' ? 'Admin' : 'User'}`)}
        </td>
        {permissionCodes.map((code) => (
          <td key={code} className="px-4 py-2.5 text-center">
            <Checkbox
              data-testid={`role-permission-${role.name}-${code}`}
              aria-label={t('accounts.permissionCheckboxAria', {
                role: t(
                  `accounts.role${role.name === 'admin' ? 'Admin' : 'User'}`,
                ),
                permission: permissionLabel(t, code),
              })}
              checked={role.permissions.includes(code)}
              disabled={updatePermissions.isPending}
              onCheckedChange={(checked) => handleToggle(code, checked === true)}
            />
          </td>
        ))}
      </tr>
      {errorMessage && (
        <tr>
          <td
            colSpan={permissionCodes.length + 1}
            data-testid={`role-permission-error-${role.name}`}
            className="px-4 pb-2.5 text-xs text-destructive"
          >
            {errorMessage}
          </td>
        </tr>
      )}
    </>
  )
}

/** Role x permission matrix (ADR-0016 Task 11): rows = roles, columns =
 * every permission code in the fixed catalog (PERMISSION_LABEL_KEYS), so a
 * permission not yet granted to any role still shows up as grantable. */
function RolePermissionsMatrix() {
  const { t } = useTranslation()
  const { data: roles } = useRoles()
  const permissionCodes = Object.keys(PERMISSION_LABEL_KEYS)

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      data-testid="role-permission-matrix"
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 text-left">
              {t('accounts.columnRole')}
            </th>
            {permissionCodes.map((code) => (
              <th key={code} className="px-4 py-2 text-center">
                {permissionLabel(t, code)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(roles ?? []).map((role) => (
            <RoleRow key={role.id} role={role} permissionCodes={permissionCodes} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Account management page: everyone with user:read sees the list; only
 * user:manage additionally sees the role select + reset-password controls,
 * plus a second "권한 관리" tab with the role/permission matrix (ADR-0016). */
export function AccountsPage() {
  const { t } = useTranslation()
  const { data: accounts } = useAccounts()
  const { data: me } = useMe()
  const canManage = me?.permissions.includes('user:manage') ?? false
  const [tab, setTab] = useState<'accounts' | 'permissions'>('accounts')

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-medium">
            {t('accounts.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('accounts.subtitle')}
          </p>
        </div>
        {canManage && (
          <div className="mb-4 flex gap-2">
            <Button
              variant={tab === 'accounts' ? 'default' : 'outline'}
              size="sm"
              data-testid="accounts-tab-accounts"
              onClick={() => setTab('accounts')}
            >
              {t('accounts.tabAccounts')}
            </Button>
            <Button
              variant={tab === 'permissions' ? 'default' : 'outline'}
              size="sm"
              data-testid="accounts-tab-permissions"
              onClick={() => setTab('permissions')}
            >
              {t('accounts.tabPermissions')}
            </Button>
          </div>
        )}
        {canManage && tab === 'permissions' ? (
          <RolePermissionsMatrix />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div
              className={
                canManage
                  ? 'grid grid-cols-[1fr_160px_140px] gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'
                  : 'grid grid-cols-[1fr_160px] gap-4 border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground'
              }
            >
              <span>{t('accounts.columnEmail')}</span>
              <span>{t('accounts.columnRole')}</span>
            </div>
            <ul>
              {(accounts ?? []).map((a) => (
                <AccountRow key={a.id} account={a} canManage={canManage} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
