import { ChevronDown, Image } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/dropdown-menu'
import * as exporters from '../lib/exportDiagram'
import type { DiagramExportContext } from '../lib/exportDiagram'

export interface DiagramExportMenuProps {
  /** The capture context used by the three diagram exporters. */
  diagram: DiagramExportContext
  /** Disable the trigger (e.g. no parsed schema / empty canvas). */
  disabled?: boolean
}

/**
 * The editor TopBar "Diagram ▾" dropdown — PNG/SVG/PDF captures of the live ERD
 * canvas. Diagram export stays in the editor (unlike Table Doc/SQL, which move
 * to the sidebar's per-project menu) because it captures the mounted React Flow
 * viewport via the passed DiagramExportContext — only available for the project
 * currently open in the editor (ADR-0013). Radix Items activate via onSelect.
 * features layer: depends on shared/ui + this feature's own model.
 */
export function DiagramExportMenu({ diagram, disabled = false }: DiagramExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="erd-topbar-btn"
          disabled={disabled}
          aria-label="Diagram"
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
          Diagram
          <ChevronDown size={15} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => void exporters.exportDiagramPng(diagram)}>
          Diagram PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exporters.exportDiagramSvg(diagram)}>
          Diagram SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void exporters.exportDiagramPdf(diagram)}>
          Diagram PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
