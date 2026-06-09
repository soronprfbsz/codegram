/**
 * CodeMirror 6 StateField that applies a `cm-active-table` line decoration to
 * every line in a given {fromLine, toLine} range (1-based, inclusive).
 *
 * Usage:
 *   1. Add `activeTableField` to the editor extensions array.
 *   2. To activate/clear: dispatch `{ effects: setActiveTableRange(range | null) }`.
 */
import { StateField, StateEffect } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

/** The payload dispatched to update the active block range. */
export interface ActiveTableRange {
  fromLine: number
  toLine: number
}

/** StateEffect that carries the new range (or null to clear). */
export const setActiveTableRange = StateEffect.define<ActiveTableRange | null>()

/** The line decoration applied to each active line. */
const activeLineDeco = Decoration.line({ class: 'cm-active-table' })

/** Build a DecorationSet from a range, clamping to the actual doc length. */
export function buildActiveDecorationSet(
  doc: { lines: number; line: (n: number) => { from: number } },
  range: ActiveTableRange,
): DecorationSet {
  const from = Math.max(1, range.fromLine)
  const to = Math.min(doc.lines, range.toLine)
  if (from > to) return Decoration.none
  const decos = []
  for (let ln = from; ln <= to; ln++) {
    decos.push(activeLineDeco.range(doc.line(ln).from))
  }
  return Decoration.set(decos)
}

/**
 * StateField that maintains the active-table decoration set.
 * Responds to `setActiveTableRange` effects; clears on null.
 */
export const activeTableField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },

  update(decos, tr) {
    // Walk effects; last setActiveTableRange wins.
    let next: ActiveTableRange | null | undefined = undefined
    for (const effect of tr.effects) {
      if (effect.is(setActiveTableRange)) {
        next = effect.value
      }
    }
    if (next === undefined) {
      // No range effect — remap existing decorations through the transaction.
      return decos.map(tr.changes)
    }
    if (next === null) {
      return Decoration.none
    }
    return buildActiveDecorationSet(tr.state.doc, next)
  },

  provide(field) {
    return EditorView.decorations.from(field)
  },
})
