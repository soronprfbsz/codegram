import { useTranslation } from 'react-i18next'
import {
  buildTableDocXlsxBlob,
  buildTableDocPdfBlob,
  tableDocLabels,
} from '@/features/export-table-doc'
import { downloadBlob } from '@/shared/lib/download'
import { TableDocView } from './TableDocView'
import { useTableDocViewStore } from '../model/store'

const EMPTY = { tables: [], enums: [] }

/**
 * Mounts the 테이블 정의서 HTML overlay once at the app shell, driven by
 * {@link useTableDocViewStore}. Any surface (editor, sidebar "⋯" menu) opens it
 * via `openWith(model)`; this host owns the single render + close wiring plus
 * the Excel/PDF download actions (reusing the export-table-doc builders).
 */
export function TableDocViewHost() {
  const { t } = useTranslation()
  const model = useTableDocViewStore((s) => s.model)
  const close = useTableDocViewStore((s) => s.close)
  return (
    <TableDocView
      model={model ?? EMPTY}
      open={model !== null}
      onClose={close}
      onDownloadExcel={
        model
          ? () =>
              downloadBlob(
                buildTableDocXlsxBlob(model, tableDocLabels(t)),
                'table-definition.xlsx',
              )
          : undefined
      }
      onDownloadPdf={
        model
          ? async () =>
              downloadBlob(
                await buildTableDocPdfBlob(model, tableDocLabels(t)),
                'table-definition.pdf',
              )
          : undefined
      }
    />
  )
}
