/// <reference lib="webworker" />
import { buildTableDocXlsxBlob } from './buildXlsx'
import { buildTableDocPdfBlob } from './buildPdf'
import { buildTableDocDocxBlob } from './buildDocx'
import type { TableDocModel } from '@/entities/table-doc'
import type { TableDocLabels } from './labels'

interface Job {
  kind: 'xlsx' | 'pdf' | 'docx'
  model: TableDocModel
  labels: TableDocLabels
  /** Excel-only: default DB name filling blank "DB 명" cells. */
  defaultDbName?: string
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { kind, model, labels, defaultDbName } = e.data
  try {
    const blob =
      kind === 'pdf'
        ? await buildTableDocPdfBlob(model, labels)
        : kind === 'docx'
          ? await buildTableDocDocxBlob(model, labels)
          : await buildTableDocXlsxBlob(model, labels, defaultDbName)
    self.postMessage({ type: 'done', result: blob })
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
