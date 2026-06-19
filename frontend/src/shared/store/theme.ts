import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

function applyClass(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function persist(theme: Theme) {
  try {
    localStorage.setItem('erd-theme', theme)
  } catch {
    // ignore
  }
}

function readStored(): Theme {
  try {
    const stored = localStorage.getItem('erd-theme')
    if (stored === 'dark') return 'dark'
  } catch {
    // ignore
  }
  // Wise light is the default theme.
  return 'light'
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readStored(),
  toggle: () =>
    set((state) => {
      const next: Theme = state.theme === 'dark' ? 'light' : 'dark'
      applyClass(next)
      persist(next)
      return { theme: next }
    }),
  setTheme: (t) =>
    set(() => {
      applyClass(t)
      persist(t)
      return { theme: t }
    }),
}))

/**
 * Apply the stored (or default-dark) theme class before React mounts.
 * Call this once at app startup so React state and the DOM agree.
 */
export function applyStoredTheme(): void {
  applyClass(readStored())
}
