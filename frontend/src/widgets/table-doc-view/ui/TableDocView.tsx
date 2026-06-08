import * as React from 'react'
import type { TableDocModel, TableDocTable } from '@/entities/table-doc'
import { Button } from '@/shared/ui/button'

export interface TableDocViewProps {
  model: TableDocModel
  /** Whether the view (modal/panel) is open. */
  open: boolean
  /** Close handler. */
  onClose: () => void
}

/** Standard 테이블 정의서 column header (Korean labels), FINAL order. */
const COLUMN_HEADER = [
  '컬럼명',
  '데이터타입',
  'PK',
  'FK',
  'NN',
  'UNIQUE',
  '기본값',
  '설명',
] as const

function flag(value: boolean): string {
  return value ? 'Y' : ''
}

function TableSection({ table }: { table: TableDocTable }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-lg font-semibold">{`${table.schema}.${table.name}`}</h3>
      {table.note ? (
        <p className="text-sm text-gray-600">{table.note}</p>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted">
            {COLUMN_HEADER.map((label) => (
              <th key={label} className="border px-2 py-1 text-left font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.columns.map((col) => (
            <tr key={col.name} className="border-b">
              <td className="border px-2 py-1">{col.name}</td>
              <td className="border px-2 py-1">{col.type}</td>
              <td className="border px-2 py-1 text-center">{flag(col.pk)}</td>
              <td className="border px-2 py-1 text-center">{flag(col.fk)}</td>
              <td className="border px-2 py-1 text-center">
                {flag(col.notNull)}
              </td>
              <td className="border px-2 py-1 text-center">
                {flag(col.unique)}
              </td>
              <td className="border px-2 py-1">{col.default}</td>
              <td className="border px-2 py-1">{col.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.fkTargets.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">FK 관계</h4>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="border px-2 py-1 text-left font-medium">컬럼</th>
                <th className="border px-2 py-1 text-left font-medium">참조</th>
              </tr>
            </thead>
            <tbody>
              {table.fkTargets.map((fk, i) => (
                <tr key={i} className="border-b">
                  <td className="border px-2 py-1">{fk.columns.join(', ')}</td>
                  <td className="border px-2 py-1">
                    {`${fk.targetSchema}.${fk.targetTable}.${fk.targetColumns.join(', ')}`}
                  </td>
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
}: TableDocViewProps): React.JSX.Element | null {
  if (!open) return null

  return (
    <div
      data-testid="table-doc-view"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-xl font-bold">테이블 정의서</h2>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="flex flex-1 flex-col gap-8 overflow-auto p-6">
        {model.tables.map((table) => (
          <TableSection key={table.id} table={table} />
        ))}
        {model.enums.length > 0 ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Enums</h2>
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
