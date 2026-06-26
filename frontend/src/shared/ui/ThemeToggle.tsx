import { Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { useThemeStore } from '@/shared/store/theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)

  const isDark = theme === 'dark'
  const title = isDark ? t('theme.toLight') : t('theme.toDark')

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('theme.toggle')}
      title={title}
      onClick={toggle}
    >
      {isDark ? (
        <Sun className="size-[17px]" strokeWidth={2} />
      ) : (
        <Moon className="size-[17px]" strokeWidth={2} />
      )}
    </Button>
  )
}
