import { TableDocView } from './TableDocView'
import { useTableDocViewStore } from '../model/store'

const EMPTY = { tables: [], enums: [] }

/**
 * Mounts the 테이블 정의서 HTML overlay once at the app shell, driven by
 * {@link useTableDocViewStore}. Any surface (editor, sidebar "⋯" menu) opens it
 * via `openWith(model)`; this host owns the single render + close wiring.
 */
export function TableDocViewHost() {
  const model = useTableDocViewStore((s) => s.model)
  const close = useTableDocViewStore((s) => s.close)
  return <TableDocView model={model ?? EMPTY} open={model !== null} onClose={close} />
}
