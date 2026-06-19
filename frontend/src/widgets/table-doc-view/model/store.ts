import { create } from 'zustand'
import type { TableDocModel } from '@/entities/table-doc'

/**
 * Global open-state for the in-app 테이블 정의서 HTML overlay.
 *
 * The overlay is opened from two unrelated places — the editor and the
 * sidebar's per-project "⋯" menu (which can target a project that isn't the
 * one being edited) — so its model + open flag live in a small shared store and
 * the view itself is mounted once in the AppLayout shell.
 */
interface TableDocViewState {
  /** The model to render; null means closed. */
  model: TableDocModel | null
  /** Open the overlay with a derived 테이블 정의서 model. */
  openWith: (model: TableDocModel) => void
  /** Close the overlay. */
  close: () => void
}

export const useTableDocViewStore = create<TableDocViewState>((set) => ({
  model: null,
  openWith: (model) => set({ model }),
  close: () => set({ model: null }),
}))
