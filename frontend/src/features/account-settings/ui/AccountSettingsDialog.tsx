import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { cn } from '@/shared/lib/utils'
import { useThemeStore } from '@/shared/store/theme'
import { SUPPORTED_LANGUAGES, getLanguage, setLanguage } from '@/shared/i18n'
import { useChangePassword } from '@/entities/account'

export interface AccountSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ThemeChoice = 'light' | 'dark'
const THEME_CHOICES: ThemeChoice[] = ['light', 'dark']

/** A segmented two-button selector (shared shape for language + theme). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  testIdOf,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labelOf: (v: T) => string
  testIdOf: (v: T) => string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          data-testid={testIdOf(opt)}
          aria-pressed={value === opt}
          onClick={() => onChange(opt)}
          className={cn(
            'h-9 rounded-lg border text-sm transition',
            value === opt
              ? 'border-primary bg-primary/10 font-medium text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {labelOf(opt)}
        </button>
      ))}
    </div>
  )
}

/**
 * Voluntary password-change form (ADR-0016): current + new + confirm, min 8,
 * confirm must match. Reports success/error feedback inline; does not close
 * the dialog on success.
 */
function PasswordChangeSection() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const changePassword = useChangePassword()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordsNoMatch'))
      return
    }
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'))
      return
    }

    try {
      await changePassword.mutateAsync({
        current_password: currentPassword,
        new_password: newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch {
      setError(t('account.currentPasswordWrong'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <div className="text-sm font-medium">{t('account.passwordSectionTitle')}</div>

      <div className="space-y-2">
        <Label htmlFor="account-current-password">{t('account.currentPassword')}</Label>
        <Input
          id="account-current-password"
          data-testid="account-current-password-input"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={changePassword.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-new-password">{t('account.newPassword')}</Label>
        <Input
          id="account-new-password"
          data-testid="account-new-password-input"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={changePassword.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-confirm-password">{t('account.confirmNewPassword')}</Label>
        <Input
          id="account-confirm-password"
          data-testid="account-confirm-password-input"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={changePassword.isPending}
        />
      </div>

      {error && (
        <p role="alert" data-testid="account-change-password-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p data-testid="account-change-password-success" className="text-sm text-success">
          {t('account.passwordChanged')}
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        data-testid="account-change-password-submit"
        disabled={changePassword.isPending}
      >
        {changePassword.isPending
          ? t('account.changingPassword')
          : t('account.changePassword')}
      </Button>
    </form>
  )
}

/**
 * 계정 설정 다이얼로그 — 이 계정의 환경설정(인터페이스 언어 + 테마)과 비밀번호
 * 변경을 모아서 관리한다. 언어·테마는 선택하는 즉시 반영된다(드래프트/적용
 * 버튼 없음). 값은 localStorage에 저장된다(shared/i18n.setLanguage,
 * shared/store/theme.setTheme). 언어는 useTranslation 구독으로, 테마는
 * 스토어 구독으로 리렌더되어 현재 선택이 표시된다. 비밀번호 변경(ADR-0016)은
 * 현재+새 비밀번호를 서버에 검증받는 자발적(voluntary) 변경 플로우다.
 *
 * features layer: shared/ui + shared/i18n + shared/store + entities/account만
 * 의존(FSD).
 */
export function AccountSettingsDialog({ open, onOpenChange }: AccountSettingsDialogProps) {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="account-settings-dialog" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('account.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('account.settingsDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('account.language')}</div>
            <Segmented
              options={SUPPORTED_LANGUAGES}
              value={getLanguage()}
              onChange={setLanguage}
              labelOf={(l) => t(`account.${l}`)}
              testIdOf={(l) => `lang-option-${l}`}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">{t('account.theme')}</div>
            <Segmented
              options={THEME_CHOICES}
              value={theme}
              onChange={setTheme}
              labelOf={(c) => (c === 'light' ? t('account.themeLight') : t('account.themeDark'))}
              testIdOf={(c) => `theme-option-${c}`}
            />
          </div>

          <PasswordChangeSection />
        </div>
      </DialogContent>
    </Dialog>
  )
}
