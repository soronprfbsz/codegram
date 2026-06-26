import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  STANDARD_COLUMNS,
  fkLocalCell,
  fkTargetCell,
  type TableDocModel,
  type TableDocTable,
} from '@/entities/table-doc'
import { Button } from '@/shared/ui/button'

export interface TableDocViewProps {
  model: TableDocModel
  /** Whether the view (modal/panel) is open. */
  open: boolean
  /** Close handler. */
  onClose: () => void
  /** Download the current model as an Excel 테이블 정의서. */
  onDownloadExcel?: () => void
  /** Download the current model as a PDF 테이블 정의서. */
  onDownloadPdf?: () => void
  /** Download the current model as a Word 테이블 정의서. */
  onDownloadDocx?: () => void
}

function TableSection({ table }: { table: TableDocTable }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{`${table.schema}.${table.name}`}</h3>
      {table.note ? (
        <p className="text-sm text-gray-600">{table.note}</p>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted">
            {STANDARD_COLUMNS.map((c) => (
              <th
                key={c.header}
                scope="col"
                className="border px-2 py-1 text-left font-medium"
              >
                {t(c.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.columns.map((col) => (
            <tr key={col.name} className="border-b">
              {STANDARD_COLUMNS.map((c) => (
                <td key={c.header} className="border px-2 py-1">
                  {c.value(col)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.fkTargets.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">{t('tableDoc.fkRelations')}</h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th scope="col" className="border px-2 py-1 text-left font-medium">
                  {t('tableDoc.column')}
                </th>
                <th scope="col" className="border px-2 py-1 text-left font-medium">
                  {t('tableDoc.reference')}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.fkTargets.map((fk, i) => (
                <tr key={i} className="border-b">
                  <td className="border px-2 py-1">{fkLocalCell(fk)}</td>
                  <td className="border px-2 py-1">{fkTargetCell(fk)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {table.checks.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">{t('tableDoc.checks')}</h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th scope="col" className="border px-2 py-1 text-left font-medium">
                  {t('tableDoc.checkName')}
                </th>
                <th scope="col" className="border px-2 py-1 text-left font-medium">
                  {t('tableDoc.checkValues')}
                </th>
                <th scope="col" className="border px-2 py-1 text-left font-medium">
                  {t('tableDoc.checkExpression')}
                </th>
              </tr>
            </thead>
            <tbody>
              {table.checks.map((chk, i) => (
                <tr key={i} className="border-b">
                  <td className="border px-2 py-1">{chk.name}</td>
                  <td className="border px-2 py-1">
                    {chk.values.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {chk.values.map((v) => (
                          <span
                            key={v}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="border px-2 py-1 font-mono text-xs">{chk.expression}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Read-only HTML 테이블 정의서 view rendered entirely from the derived model
 * (ADR-0005: client-side). Returns null when closed.
 * widgets layer: imports entities + shared only.
 */
export function TableDocView({
  model,
  open,
  onClose,
  onDownloadExcel,
  onDownloadPdf,
  onDownloadDocx,
}: TableDocViewProps): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div
      data-testid="table-doc-view"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-xl font-bold">{t('tableDoc.title')}</h2>
        <div className="flex items-center gap-2">
          {onDownloadExcel ? (
            <Button
              variant="outline"
              data-testid="table-doc-download-excel"
              onClick={onDownloadExcel}
            >
              {t('tableDoc.downloadExcel')}
            </Button>
          ) : null}
          {onDownloadPdf ? (
            <Button
              variant="outline"
              data-testid="table-doc-download-pdf"
              onClick={onDownloadPdf}
            >
              {t('tableDoc.downloadPdf')}
            </Button>
          ) : null}
          {onDownloadDocx ? (
            <Button
              variant="outline"
              data-testid="table-doc-download-word"
              onClick={onDownloadDocx}
            >
              {t('tableDoc.downloadWord')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-8 overflow-auto p-6">
        {model.tables.map((table) => (
          <TableSection key={table.id} table={table} />
        ))}
        {model.enums.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{t('tableDoc.enums')}</h2>
            {model.enums.map((en) => (
              <div key={en.id} className="flex flex-col gap-1">
                <h3 className="text-base font-medium">{`${en.schema}.${en.name}`}</h3>
                <ul className="list-disc pl-5 text-sm">
                  {en.values.map((value) => (
                    <li key={value.name}>
                      <span>{value.name}</span>
                      {value.note ? <span className="text-gray-500"> — {value.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}
