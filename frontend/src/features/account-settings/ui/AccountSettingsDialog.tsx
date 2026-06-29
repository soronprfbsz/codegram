import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/shared/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { useThemeStore } from '@/shared/store/theme'
import { SUPPORTED_LANGUAGES, getLanguage, setLanguage } from '@/shared/i18n'

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
 * 계정 설정 다이얼로그 — 이 계정의 환경설정(인터페이스 언어 + 테마)을 모아서
 * 관리한다. 언어·테마는 선택하는 즉시 반영된다(드래프트/적용 버튼 없음).
 * 값은 localStorage에 저장된다(shared/i18n.setLanguage,
 * shared/store/theme.setTheme). 언어는 useTranslation 구독으로, 테마는
 * 스토어 구독으로 리렌더되어 현재 선택이 표시된다.
 *
 * features layer: shared/ui + shared/i18n + shared/store만 의존(FSD).
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
