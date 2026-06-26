import { runWorkerJob } from '@/shared/lib/runWorkerJob'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import type { TableDocLabels } from './labels'

export type TableDocExportKind = 'xlsx' | 'pdf'

/** Vite resolves this to the worker bundle; constructed per export (one-shot). */
function spawnWorker(): Worker {
  return new Worker(new URL('./tableDoc.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Build the table-doc file (xlsx/pdf) in a Web Worker so a large export never
 * freezes the UI. If the worker can't run the job (e.g. a library that isn't
 * worker-safe), fall back to main-thread generation so the export still
 * succeeds — at the cost of a brief block. Returns the file Blob; the caller
 * triggers the download.
 */
export async function buildTableDocBlob(
  kind: TableDocExportKind,
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  try {
    return await runWorkerJob<Blob>(spawnWorker(), { kind, model, labels })
  } catch {
    return kind === 'pdf'
      ? buildTableDocPdfBlob(model, labels)
      : buildTableDocXlsxBlob(model, labels)
  }
}
