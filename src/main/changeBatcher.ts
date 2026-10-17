import type { PackFilesChanged } from '../shared/ipc'

export type FileEvent = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

/**
 * Coalesces file events that arrive close together (editors often write a
 * file in several steps) into one notification per quiet period.
 */
export class ChangeBatcher {
  private changed = new Set<string>()
  private structureChanged = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly flush: (batch: PackFilesChanged) => void,
    private readonly delayMs = 150
  ) {}

  push(event: FileEvent, path: string): void {
    this.changed.add(path)
    if (event !== 'change') this.structureChanged = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.emit(), this.delayMs)
  }

  /** Drops pending events without notifying (e.g. the pack was closed). */
  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.changed.clear()
    this.structureChanged = false
  }

  private emit(): void {
    this.timer = null
    const batch: PackFilesChanged = {
      paths: [...this.changed].sort(),
      structureChanged: this.structureChanged
    }
    this.changed.clear()
    this.structureChanged = false
    if (batch.paths.length > 0) this.flush(batch)
  }
}

/** Files PackForge itself writes atomically, or that editors/OS create. */
export function isIgnoredWatchPath(relativePosixPath: string): boolean {
  const name = relativePosixPath.split('/').pop() ?? ''
  return (
    name.endsWith('.tmp') ||
    name.startsWith('.') ||
    name === 'Thumbs.db' ||
    name === 'desktop.ini' ||
    name.endsWith('~')
  )
}
