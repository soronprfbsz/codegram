import { Spinner } from './spinner'

export interface ExportProgressDialogProps {
  /** Whether the export is in progress (renders the overlay). */
  open: boolean
  /** What is being generated, e.g. "Excel 내보내기 생성 중…". */
  label: string
  /** Optional 0–100 progress; omitted → indeterminate (spinner only). */
  percent?: number
}

/**
 * Non-dismissable progress overlay shown while an export is being generated.
 * Client-side exports build the whole file in memory (no HTTP stream, so no
 * native browser progress bar); this gives the user clear "작업 중" feedback so
 * a large export never looks frozen. Heavy generation runs in a Web Worker, so
 * this overlay keeps animating. Single source for export feedback (F1/G1).
 */
export function ExportProgressDialog({ open, label, percent }: ExportProgressDialogProps) {
  if (!open) return null
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background px-8 py-6 shadow-lg">
        <Spinner label={label} />
        {typeof percent === 'number' && (
          <span className="text-sm font-medium tabular-nums">{Math.round(percent)}%</span>
        )}
      </div>
    </div>
  )
}
