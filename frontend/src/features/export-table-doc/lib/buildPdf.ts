import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { TableDocModel, TableDocColumn } from '@/entities/table-doc'

/** Standard 테이블 정의서 column header, FINAL order (mirrors the xlsx builder). */
const COLUMN_HEAD = [
  ['컬럼명', '데이터타입', 'PK', 'FK', 'NN', 'UNIQUE', '기본값', '설명'],
]
const FK_HEAD = [['컬럼', '참조 테이블', '참조 컬럼']]
const ENUM_HEAD = [['Enum', '값', '설명']]

/** Page margin (mm) and the gap between stacked sections. */
const MARGIN = 14
const SECTION_GAP = 8

function flag(value: boolean): string {
  return value ? 'Y' : ''
}

function columnRow(col: TableDocColumn): string[] {
  return [
    col.name,
    col.type,
    flag(col.pk),
    flag(col.fk),
    flag(col.notNull),
    flag(col.unique),
    col.default,
    col.note,
  ]
}

/** jspdf-autotable writes `lastAutoTable.finalY` on the doc; jspdf 4.x does
 *  not type it, so read it through this narrow accessor. */
function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY
}

/**
 * Pure: build a table-definition PDF Blob from the derived model. Per table:
 * a title line, the standard column autoTable, then (when present) an
 * FK-targets autoTable; the document ends with an enum-list autoTable. Each
 * section starts below the previous one's finalY so autoTable paginates.
 * No download, no React.
 */
export function buildTableDocPdfBlob(model: TableDocModel): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let cursorY = MARGIN

  for (const table of model.tables) {
    const titleParts = [`${table.schema}.${table.name}`]
    if (table.note) titleParts.push(`— ${table.note}`)
    doc.text(titleParts.join(' '), MARGIN, cursorY)
    cursorY += 4

    autoTable(doc, {
      startY: cursorY,
      head: COLUMN_HEAD,
      body: table.columns.map(columnRow),
    })
    cursorY = finalY(doc) + SECTION_GAP

    if (table.fkTargets.length > 0) {
      const fkBody = table.fkTargets.map((fk) => [
        fk.columns.join(', '),
        `${fk.targetSchema}.${fk.targetTable}`,
        fk.targetColumns.join(', '),
      ])
      autoTable(doc, { startY: cursorY, head: FK_HEAD, body: fkBody })
      cursorY = finalY(doc) + SECTION_GAP
    }
  }

  const enumBody = model.enums.flatMap((en) =>
    en.values.map((value) => [
      `${en.schema}.${en.name}`,
      value.name,
      value.note,
    ]),
  )
  autoTable(doc, { startY: cursorY, head: ENUM_HEAD, body: enumBody })

  return doc.output('blob')
}
