import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  WidthType, ShadingType, HeadingLevel,
} from 'docx'
import {
  columnRow,
  type TableDocModel, type TableDocTable,
} from '@/entities/table-doc'
import type { TableDocLabels } from './labels'
import { HEADER_FILL, HEADER_TEXT, STANDARD_COLUMN_WIDTHS, docxColumnPercents } from './tableDocStyle'

const STD_PCT = docxColumnPercents(STANDARD_COLUMN_WIDTHS)

function headerCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: HEADER_FILL, fill: HEADER_FILL },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: HEADER_TEXT })] })],
  })
}

function bodyCell(text: string, widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    children: [new Paragraph(text)],
  })
}

/** A styled docx table: a header row + body rows, columns sized by `pcts`. */
function styledTable(headers: string[], rows: string[][], pcts: number[]): Table {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => headerCell(h, pcts[i] ?? Math.floor(100 / headers.length))),
  })
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map((c, i) => bodyCell(c, pcts[i] ?? Math.floor(100 / headers.length))),
      }),
  )
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  })
}

function evenPcts(n: number): number[] {
  return docxColumnPercents(Array.from({ length: n }, () => 1))
}

/** All docx blocks for one table: title + columns table + optional checks. */
function tableBlocks(table: TableDocTable, labels: TableDocLabels): (Paragraph | Table)[] {
  const title = table.note ? `${table.schema}.${table.name} — ${table.note}` : `${table.schema}.${table.name}`
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
    styledTable([...labels.columnHeaders], table.columns.map(columnRow), STD_PCT),
  ]
  const checks = Array.isArray(table.checks) ? table.checks : []
  if (checks.length > 0) {
    blocks.push(new Paragraph(''))
    blocks.push(new Paragraph({ children: [new TextRun({ text: labels.checks, bold: true })] }))
    blocks.push(
      styledTable(
        [labels.checkName, labels.checkValues, labels.checkExpression],
        checks.map((chk) => [chk.name, chk.values.join(', '), chk.expression]),
        evenPcts(3),
      ),
    )
  }
  blocks.push(new Paragraph(''))
  return blocks
}

/**
 * Build a styled .docx Blob from the derived table-doc model — same layout as
 * the PDF: per table a heading + a styled column table (+ an optional CHECK
 * table), then a trailing Enum table. Reuses the shared header style and
 * column widths. Korean needs no embedded font (Word resolves it). No download.
 */
export async function buildTableDocDocxBlob(
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  const children: (Paragraph | Table)[] = []
  for (const table of model.tables) children.push(...tableBlocks(table, labels))

  const enumRows = model.enums.flatMap((en) =>
    en.values.map((v) => [`${en.schema}.${en.name}`, v.name, v.note]),
  )
  children.push(new Paragraph({ text: labels.enumsSheet, heading: HeadingLevel.HEADING_2 }))
  children.push(
    styledTable(
      [labels.enumColEnum, labels.enumColValue, labels.enumColNote],
      enumRows,
      evenPcts(3),
    ),
  )

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
