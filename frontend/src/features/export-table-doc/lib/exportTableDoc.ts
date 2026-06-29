import { runWorkerJob } from '@/shared/lib/runWorkerJob'
import type { TableDocModel } from '@/entities/table-doc'
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocLabels } from './labels'

export type TableDocExportKind = 'xlsx' | 'pdf' | 'docx'

/**
 * Download filename for a table-doc export, e.g. `MyProject-table-definition.xlsx`.
 * The kind value doubles as the file extension. The project name is stripped of
 * characters illegal in filenames; when it is empty/blank the prefix is dropped
 * (`table-definition.xlsx`). Single source for both the topbar Export menu and
 * the preview overlay's download buttons.
 */
export function tableDocFilename(projectName: string, kind: TableDocExportKind): string {
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '').trim()
  return `${safe ? `${safe}-` : ''}table-definition.${kind}`
}

function spawnWorker(): Worker {
  return new Worker(new URL('./tableDoc.worker.ts', import.meta.url), { type: 'module' })
}

function buildOnMainThread(
  kind: TableDocExportKind, model: TableDocModel, labels: TableDocLabels, defaultDbName: string,
): Promise<Blob> {
  if (kind === 'pdf') return buildTableDocPdfBlob(model, labels)
  if (kind === 'docx') return buildTableDocDocxBlob(model, labels)
  return buildTableDocXlsxBlob(model, labels, defaultDbName)
}

/**
 * Build the table-doc file (xlsx/pdf/docx) in a Web Worker so a large export
 * never freezes the UI. Falls back to main-thread generation if the worker
 * can't run the job. Returns the file Blob; the caller triggers the download.
 *
 * `defaultDbName` fills the Excel "DB 명" cells that the schema string leaves
 * blank (pdf/docx have no DB-name field and ignore it).
 */
export async function buildTableDocBlob(
  kind: TableDocExportKind,
  model: TableDocModel,
  labels: TableDocLabels,
  defaultDbName = '',
): Promise<Blob> {
  try {
    return await runWorkerJob<Blob>(spawnWorker(), { kind, model, labels, defaultDbName })
  } catch {
    return buildOnMainThread(kind, model, labels, defaultDbName)
  }
}
