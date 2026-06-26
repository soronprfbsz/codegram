import { ChevronDown, Image } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import { TopbarButton, TOPBAR_ICON_SIZE, TOPBAR_ICON_STROKE } from '@/shared/ui/topbar-control'
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
  const { t } = useTranslation()
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
        <TopbarButton disabled={disabled} aria-label={t('exportMenu.export')}>
          <Image size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
          {t('exportMenu.export')}
          <ChevronDown size={TOPBAR_ICON_SIZE} strokeWidth={TOPBAR_ICON_STROKE} />
        </TopbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={preview}>{t('exportMenu.tableDocPreview')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('exportMenu.diagram')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramPng(diagram)}>
          {t('exportMenu.diagramPng')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramSvg(diagram)}>
          {t('exportMenu.diagramSvg')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void diagramExport.exportDiagramPdf(diagram)}>
          {t('exportMenu.diagramPdf')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('exportMenu.tableDoc')}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={exportExcel}>{t('exportMenu.tableDocExcel')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportPdf()}>{t('exportMenu.tableDocPdf')}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('exportMenu.sql')}</DropdownMenuLabel>
        {SQL_DIALECT_VALUES.map((d) => (
          <DropdownMenuItem key={d} onSelect={() => downloadSql(dbmlText, d)}>
            {`SQL · ${SQL_DIALECTS[d].label}`}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
