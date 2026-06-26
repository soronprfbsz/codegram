import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildTableDocBlob,
  tableDocLabels,
  type TableDocExportKind,
} from '@/features/export-table-doc'
import { downloadBlob } from '@/shared/lib/download'
import { ExportProgressDialog } from '@/shared/ui/export-progress-dialog'
import { TableDocView } from './TableDocView'
import { useTableDocViewStore } from '../model/store'

const EMPTY = { tables: [], enums: [] }

/**
 * Mounts the 테이블 정의서 HTML overlay once at the app shell, driven by
 * {@link useTableDocViewStore}. Any surface opens it via `openWith(model)`; this
 * host owns the single render + close wiring plus the Excel/PDF/Word download actions.
 * Downloads build the file in a Web Worker (with a progress overlay) so a large
 * table-doc export never freezes the UI — same path as the topbar Export menu.
 */
export function TableDocViewHost() {
  const { t } = useTranslation()
  const model = useTableDocViewStore((s) => s.model)
  const close = useTableDocViewStore((s) => s.close)
  const [busy, setBusy] = useState(false)

  async function download(kind: TableDocExportKind, filename: string): Promise<void> {
    if (!model) return
    setBusy(true)
    try {
      downloadBlob(await buildTableDocBlob(kind, model, tableDocLabels(t)), filename)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TableDocView
        model={model ?? EMPTY}
        open={model !== null}
        onClose={close}
        onDownloadExcel={
          model ? () => void download('xlsx', 'table-definition.xlsx') : undefined
        }
        onDownloadPdf={
          model ? () => void download('pdf', 'table-definition.pdf') : undefined
        }
        onDownloadDocx={
          model ? () => void download('docx', 'table-definition.docx') : undefined
        }
      />
      <ExportProgressDialog open={busy} label={t('exportMenu.generating')} />
    </>
  )
}
