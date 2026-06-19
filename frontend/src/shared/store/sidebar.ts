import { create } from 'zustand'

const KEY = 'codegram-sidebar'

/**
 * Sidebar collapse state.
 * `collapsed === null` means "auto" — the AppLayout resolves it per route
 * (editor defaults to the icon rail, everything else expanded). Once the user
 * toggles, an explicit boolean is stored and wins on every route.
 */
interface SidebarState {
  collapsed: boolean | null
  setCollapsed: (c: boolean) => void
}

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'true') return true
    if (v === 'false') return false
  } catch {
    // ignore
  }
  return null
}

function persist(c: boolean) {
  try {
    localStorage.setItem(KEY, String(c))
  } catch {
    // ignore
  }
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: readStored(),
  setCollapsed: (c) =>
    set(() => {
      persist(c)
      return { collapsed: c }
    }),
}))
