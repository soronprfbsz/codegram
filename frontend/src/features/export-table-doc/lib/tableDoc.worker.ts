/// <reference lib="webworker" />
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import type { TableDocModel } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'

/**
 * Web Worker that builds the table-doc file (xlsx/pdf) off the main thread, so
 * a large export never freezes the UI. It reuses the SAME pure builders as the
 * main thread (no duplicated logic) and reports back via the runWorkerJob
 * protocol: { type: 'done', result: Blob } or { type: 'error', message }.
 */
interface Job {
  kind: 'xlsx' | 'pdf'
  model: TableDocModel
  labels: TableDocLabels
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { kind, model, labels } = e.data
  try {
    const blob =
      kind === 'pdf'
        ? await buildTableDocPdfBlob(model, labels)
        : buildTableDocXlsxBlob(model, labels)
    self.postMessage({ type: 'done', result: blob })
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
