import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/shared/ui/dropdown-menu'
import {
  exportDiagramPng,
  exportDiagramSvg,
  exportDiagramPdf,
} from '../lib/exportDiagram'
import type { DiagramExportContext } from '../lib/exportDiagram'

export interface ExportMenuProps {
  /** The capture context used by the three diagram exporters. */
  diagram: DiagramExportContext
  /** Open the in-app HTML table-definition view. */
  onOpenTableDocView: () => void
  /** Build + download the table-definition Excel workbook. */
  onExportTableDocExcel: () => void
  /** Build + download the table-definition PDF. */
  onExportTableDocPdf: () => void
  /** Disable the whole trigger (e.g. no schema / empty schema). */
  disabled?: boolean
}

/**
 * The single Plan 5 Export dropdown. Diagram items capture the live canvas via
 * the passed DiagramExportContext; table-doc items delegate to page-supplied
 * callbacks (this feature never imports export-table-doc — FSD). Radix Items
 * activate via onSelect.
 * features layer: depends on shared/ui + this feature's own model.
 */
export function ExportMenu({
  diagram,
  onOpenTableDocView,
  onExportTableDocExcel,
  onExportTableDocPdf,
  disabled = false,
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Diagram</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void exportDiagramPng(diagram)}>
          Diagram PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportDiagramSvg(diagram)}>
          Diagram SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exportDiagramPdf(diagram)}>
          Diagram PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Table Doc</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onOpenTableDocView()}>
          Table Doc HTML
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExportTableDocExcel()}>
          Table Doc Excel
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExportTableDocPdf()}>
          Table Doc PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
