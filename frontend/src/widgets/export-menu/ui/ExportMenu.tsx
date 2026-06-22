import { ChevronDown, Image } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import * as diagramExport from '@/features/export-diagram'
import type { DiagramExportContext } from '@/features/export-diagram'
import { SQL_DIALECTS, SQL_DIALECT_VALUES, type DbmlSchema } from '@/entities/dbml'
import { deriveTableDoc } from '@/entities/table-doc'
import { buildTableDocXlsxBlob, buildTableDocPdfBlob } from '@/features/export-table-doc'
import { downloadSql } from '@/features/sql-export'
import { downloadBlob } from '@/shared/lib/download'
import { useTableDocViewStore } from '@/widgets/table-doc-view'

export interface ExportMenuProps {
  /** Live-canvas capture context for the diagram exporters. */
  diagram: DiagramExportContext
  /** Parsed schema of the open project (null → trigger disabled). */
  schema: DbmlSchema | null
  /** Raw DBML of the open project — source for the SQL dumps. */
  dbmlText: string
  /** Disable the trigger (no parsed schema / empty canvas). */
  disabled?: boolean
}

/**
 * The editor TopBar "Export.." dropdown — the single export hub for the open
 * project. A flat, section-labelled menu (Radix nested submenus are unreliable
 * in this app, so we keep one open surface): a 테이블 정의서 preview plus
 * Diagram (PNG/SVG/PDF, live-canvas capture), Table Doc (Excel/PDF), and SQL
 * dumps. Diagram capture needs the mounted canvas; Table Doc/SQL derive from the
 * open project's schema/dbml — so this lives in the editor, not the sidebar.
 *
 * widgets layer: composes export-diagram/export-table-doc/sql-export features,
 * the table-doc entity, and the table-doc-view overlay store.
 */
export function ExportMenu({ diagram, schema, dbmlText, disabled = false }: ExportMenuProps) {
  const openTableDoc = useTableDocViewStore((s) => s.openWith)

  function preview() {
    if (schema) openTableDoc(deriveTableDoc(schema))
  }
  function exportExcel() {
    if (schema) downloadBlob(buildTableDocXlsxBlob(deriveTableDoc(schema)), 'table-definition.xlsx')
  }
  async function exportPdf() {
    if (schema) downloadBlob(await buildTableDocPdfBlob(deriveTableDoc(schema)), 'table-definition.pdf')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="erd-topbar-btn"
          disabled={disabled}
          aria-label="Export"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1,
            background: 'var(--erd-surface)',
            border: '1px solid var(--erd-border-2)',
            color: 'var(--erd-text)',
            borderRadius: 8,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >
          <Image size={15} strokeWidth={2} />
          Export..
          <ChevronDown size={15} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={preview}>테이블 정의서 미리보기</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Diagram</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramPng(diagram)}>
          Diagram PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramSvg(diagram)}>
          Diagram SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramPdf(diagram)}>
          Diagram PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Table Doc</DropdownMenuLabel>
        <DropdownMenuItem onSelect={exportExcel}>Table Doc Excel</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportPdf()}>Table Doc PDF</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>SQL</DropdownMenuLabel>
        {SQL_DIALECT_VALUES.map((d) => (
          <DropdownMenuItem key={d} onSelect={() => downloadSql(dbmlText, d)}>
            {`SQL · ${SQL_DIALECTS[d].label}`}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
