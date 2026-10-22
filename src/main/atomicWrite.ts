import { rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Every file PackForge replaces goes through here: the data is written to a temp file next to the
// target and renamed over it, so the target is either the old or the new content, never half.
// Temp names are unique (two writes of the same file never share one) and writes of the same
// path run one at a time, in the order they were asked for.

const queues = new Map<string, Promise<unknown>>()
let tempCounter = 0

/** Runs `task` after every earlier task queued on the same file (case-insensitive on Windows). */
export function serializedOn<T>(file: string, task: () => Promise<T>): Promise<T> {
  const key = fileKey(file)
  const run = (queues.get(key) ?? Promise.resolve()).then(task)
  const tail = run.then(
    () => undefined,
    () => undefined
  )
  queues.set(key, tail)
  // Forget the queue once nothing is waiting on it (keeps the map small).
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}

/** Atomic, serialized replacement of `file`. */
export function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
  return serializedOn(file, () => replaceFile(file, data))
}

/**
 * Atomic replacement WITHOUT queueing: for callers already inside `serializedOn(file)` (a
 * read-modify-write), which would otherwise wait on themselves.
 */
export async function replaceFile(file: string, data: Uint8Array | string): Promise<void> {
  const temp = `${file}.${process.pid}-${++tempCounter}.tmp`
  try {
    await writeFile(temp, data)
    await renameRetrying(temp, file)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** Codes Windows gives while another process briefly holds the file (scanner, editor, indexer). */
export function isLockError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
}

/** Waits between rename attempts: about 2.5 s in all, then the lock is reported. */
export const RENAME_RETRY_MS = [20, 50, 100, 200, 400, 700, 1000] as const

/** rename, retried while the target is locked (as graceful-fs does on Windows). */
export async function renameRetrying(
  from: string,
  to: string,
  doRename: (from: string, to: string) => Promise<void> = rename
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await doRename(from, to)
      return
    } catch (error) {
      const wait = RENAME_RETRY_MS[attempt]
      if (!isLockError(error) || wait === undefined) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

function fileKey(file: string): string {
  const full = resolve(file)
  return process.platform === 'win32' ? full.toLowerCase() : full
}
