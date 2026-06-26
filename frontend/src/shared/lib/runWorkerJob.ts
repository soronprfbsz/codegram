/**
 * Run a one-shot job on a Web Worker and resolve with its result, keeping the
 * heavy work off the main thread (so exporting a large file never freezes the
 * UI). The worker speaks a tiny protocol back to the main thread:
 *   { type: 'progress', percent }  → forwarded to onProgress
 *   { type: 'done', result }       → resolves the promise
 *   { type: 'error', message }     → rejects the promise
 * The worker is always terminated once the job settles (done/error/crash).
 *
 * `WorkerLike` is the minimal surface a real `Worker` exposes, so the protocol
 * is unit-testable with a controllable double (no real worker needed).
 */
export interface WorkerLike {
  postMessage(data: unknown, transfer?: Transferable[]): void
  terminate(): void
  addEventListener(type: string, cb: (ev: unknown) => void): void
  removeEventListener(type: string, cb: (ev: unknown) => void): void
}

interface WorkerMessage {
  type?: 'progress' | 'done' | 'error'
  percent?: number
  result?: unknown
  message?: string
}

export function runWorkerJob<T>(
  worker: WorkerLike,
  payload: unknown,
  opts: { onProgress?: (percent: number) => void } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (ev: unknown) => {
      const msg = (ev as { data?: WorkerMessage }).data ?? {}
      if (msg.type === 'progress') {
        if (typeof msg.percent === 'number') opts.onProgress?.(msg.percent)
        return
      }
      if (msg.type === 'done') {
        settle()
        resolve(msg.result as T)
        return
      }
      if (msg.type === 'error') {
        settle()
        reject(new Error(msg.message ?? 'export worker error'))
      }
    }
    const onError = (ev: unknown) => {
      const message = (ev as { message?: string }).message ?? 'export worker error'
      settle()
      reject(new Error(message))
    }
    const settle = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      worker.terminate()
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    worker.postMessage(payload)
  })
}
