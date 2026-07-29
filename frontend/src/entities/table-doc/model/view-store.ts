import { create } from 'zustand'
import type { TableDocModel } from './types'

/**
 * Global open-state for the in-app 테이블 정의서 HTML overlay.
 *
 * The overlay is opened from two unrelated places — the editor and the
 * sidebar's per-project "⋯" menu (which can target a project that isn't the
 * one being edited) — so its model + open flag live in a small store and the
 * view itself is mounted once in the app shell.
 *
 * It lives on the entity, not on the widget that renders it: the openers and
 * the view are different widgets, and a widget may not reach across to another
 * (F3). What they genuinely share is this entity's model, so the handle to it
 * belongs here.
 */
interface TableDocViewState {
  /** The model to render; null means closed. */
  model: TableDocModel | null
  /** Owning project name — used to name the download files. */
  projectName: string
  /** Open the overlay with a derived 테이블 정의서 model + its project name. */
  openWith: (model: TableDocModel, projectName: string) => void
  /** Close the overlay. */
  close: () => void
}

export const useTableDocViewStore = create<TableDocViewState>((set) => ({
  model: null,
  projectName: '',
  openWith: (model, projectName) => set({ model, projectName }),
  close: () => set({ model: null }),
}))
