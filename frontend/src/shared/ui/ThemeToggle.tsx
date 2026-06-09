import { Sun, Moon } from 'lucide-react'
import { Button } from './button'
import { useThemeStore } from '@/shared/store/theme'

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)

  const isDark = theme === 'dark'
  const title = isDark ? '라이트 모드로 전환' : '다크 모드로 전환'

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="테마 전환"
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
