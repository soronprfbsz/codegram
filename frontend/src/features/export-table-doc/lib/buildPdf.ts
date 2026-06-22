import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  STANDARD_COLUMN_HEADER,
  columnRow,
  fkLocalCell,
  fkTargetCell,
  type TableDocModel,
} from '@/entities/table-doc'

/** Standard 테이블 정의서 column header, FINAL order (shared descriptor). */
const COLUMN_HEAD = [[...STANDARD_COLUMN_HEADER]]
/** FK section header — aligned with the HTML view (`컬럼` / `참조`). */
const FK_HEAD = [['컬럼', '참조']]
const ENUM_HEAD = [['Enum', '값', '설명']]

/** Page margin (mm) and the gap between stacked sections. */
const MARGIN = 14
const SECTION_GAP = 8

/**
 * Korean-capable embedded font. jsPDF's standard fonts are WinAnsi-only, so
 * Hangul renders as mojibake; we register NanumGothic (OFL) as a TTF. The file
 * is served as a static asset and fetched on first export only — it stays out
 * of the main bundle — then cached in-module so later exports skip the fetch.
 */
const FONT_NAME = 'NanumGothic'
const FONT_URL = `${import.meta.env.BASE_URL}fonts/NanumGothic-Regular.ttf`
let fontBase64: string | null = null

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function ensureKoreanFont(doc: jsPDF): Promise<void> {
  if (fontBase64 === null) {
    const res = await fetch(FONT_URL)
    if (!res.ok) throw new Error(`Failed to load PDF font: ${res.status}`)
    fontBase64 = arrayBufferToBase64(await res.arrayBuffer())
  }
  doc.addFileToVFS('NanumGothic-Regular.ttf', fontBase64)
  doc.addFont('NanumGothic-Regular.ttf', FONT_NAME, 'normal')
  doc.setFont(FONT_NAME)
}

/** jspdf-autotable writes `lastAutoTable.finalY` on the doc; jspdf 4.x does
 *  not type it, so read it through this narrow accessor. */
function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY
}

/**
 * Build a table-definition PDF Blob from the derived model. Per table:
 * a title line, the standard column autoTable, then (when present) an
 * FK-targets autoTable; the document ends with an enum-list autoTable. Each
 * section starts below the previous one's finalY so autoTable paginates.
 *
 * Async because it embeds a Korean TTF (fetched lazily). No download, no React.
 */
export async function buildTableDocPdfBlob(model: TableDocModel): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await ensureKoreanFont(doc)
  // Embedded font applies to autoTable cells too (header + body carry Hangul).
  const tableStyles = { font: FONT_NAME, fontStyle: 'normal' as const }
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
      styles: tableStyles,
    })
    cursorY = finalY(doc) + SECTION_GAP

    if (table.fkTargets.length > 0) {
      const fkBody = table.fkTargets.map((fk) => [
        fkLocalCell(fk),
        fkTargetCell(fk),
      ])
      autoTable(doc, { startY: cursorY, head: FK_HEAD, body: fkBody, styles: tableStyles })
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
  autoTable(doc, { startY: cursorY, head: ENUM_HEAD, body: enumBody, styles: tableStyles })

  return doc.output('blob')
}
