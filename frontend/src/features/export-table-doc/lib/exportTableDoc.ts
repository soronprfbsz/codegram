import { runWorkerJob } from '@/shared/lib/runWorkerJob'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocLabels } from './labels'

export type TableDocExportKind = 'xlsx' | 'pdf' | 'docx'

function spawnWorker(): Worker {
  return new Worker(new URL('./tableDoc.worker.ts', import.meta.url), { type: 'module' })
}

function buildOnMainThread(
  kind: TableDocExportKind, model: TableDocModel, labels: TableDocLabels,
): Promise<Blob> {
  if (kind === 'pdf') return buildTableDocPdfBlob(model, labels)
  if (kind === 'docx') return buildTableDocDocxBlob(model, labels)
  return buildTableDocXlsxBlob(model, labels)
}

/**
 * Build the table-doc file (xlsx/pdf/docx) in a Web Worker so a large export
 * never freezes the UI. Falls back to main-thread generation if the worker
 * can't run the job. Returns the file Blob; the caller triggers the download.
 */
export async function buildTableDocBlob(
  kind: TableDocExportKind,
  model: TableDocModel,
  labels: TableDocLabels,
): Promise<Blob> {
  try {
    return await runWorkerJob<Blob>(spawnWorker(), { kind, model, labels })
  } catch {
    return buildOnMainThread(kind, model, labels)
  }
}
