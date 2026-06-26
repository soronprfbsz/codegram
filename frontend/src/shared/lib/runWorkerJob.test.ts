import { describe, it, expect, vi } from 'vitest'
import { runWorkerJob, type WorkerLike } from './runWorkerJob'

/**
 * Controllable Worker double: records postMessage/terminate and lets the test
 * drive 'message'/'error' events synchronously. Not a mock of the unit under
 * test — it stands in for the real Worker so we can exercise the async protocol.
 */
function fakeWorker() {
  const listeners: Record<string, Array<(ev: unknown) => void>> = {}
  const posted: unknown[] = []
  let terminated = false
  const worker: WorkerLike = {
    postMessage: (data: unknown) => {
      posted.push(data)
    },
    terminate: () => {
      terminated = true
    },
    addEventListener: (type: string, cb: (ev: unknown) => void) => {
      ;(listeners[type] ??= []).push(cb)
    },
    removeEventListener: (type: string, cb: (ev: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== cb)
    },
  }
  return {
    worker,
    posted,
    isTerminated: () => terminated,
    emit: (type: string, ev: unknown) =>
      (listeners[type] ?? []).forEach((l) => l(ev)),
  }
}

describe('runWorkerJob', () => {
  it('posts the payload to the worker', () => {
    const f = fakeWorker()
    void runWorkerJob(f.worker, { kind: 'xlsx', n: 1 })
    expect(f.posted).toEqual([{ kind: 'xlsx', n: 1 }])
  })

  it('resolves with the result and terminates on a done message', async () => {
    const f = fakeWorker()
    const promise = runWorkerJob<string>(f.worker, {})
    f.emit('message', { data: { type: 'done', result: 'BLOB' } })
    await expect(promise).resolves.toBe('BLOB')
    expect(f.isTerminated()).toBe(true)
  })

  it('forwards progress percents to onProgress without resolving', async () => {
    const f = fakeWorker()
    const onProgress = vi.fn()
    const promise = runWorkerJob(f.worker, {}, { onProgress })
    f.emit('message', { data: { type: 'progress', percent: 25 } })
    f.emit('message', { data: { type: 'progress', percent: 70 } })
    expect(onProgress).toHaveBeenNthCalledWith(1, 25)
    expect(onProgress).toHaveBeenNthCalledWith(2, 70)
    expect(f.isTerminated()).toBe(false)
    f.emit('message', { data: { type: 'done', result: 1 } })
    await expect(promise).resolves.toBe(1)
  })

  it('rejects with the message and terminates on an error message', async () => {
    const f = fakeWorker()
    const promise = runWorkerJob(f.worker, {})
    f.emit('message', { data: { type: 'error', message: 'boom' } })
    await expect(promise).rejects.toThrow('boom')
    expect(f.isTerminated()).toBe(true)
  })

  it('rejects and terminates on a worker error event', async () => {
    const f = fakeWorker()
    const promise = runWorkerJob(f.worker, {})
    f.emit('error', { message: 'worker crashed' })
    await expect(promise).rejects.toThrow(/worker crashed|worker error/i)
    expect(f.isTerminated()).toBe(true)
  })
})
