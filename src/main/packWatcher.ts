import { relative, sep } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import type { PackFilesChanged } from '../shared/ipc'
import { ChangeBatcher, isIgnoredWatchPath, type FileEvent } from './changeBatcher'

/**
 * Watches a folder pack and reports coalesced changes as pack-relative posix
 * paths. Symlinks are not followed, so nothing outside the pack is watched.
 */
export class PackWatcher {
  private readonly watcher: FSWatcher
  private readonly batcher: ChangeBatcher

  constructor(root: string, onChange: (batch: PackFilesChanged) => void) {
    this.batcher = new ChangeBatcher(onChange)
    const toRelative = (path: string): string => relative(root, path).split(sep).join('/')
    this.watcher = watch(root, {
      ignoreInitial: true,
      followSymlinks: false,
      // Editors write in several steps: wait until the size is stable.
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (path) => {
        const rel = toRelative(path)
        return rel !== '' && isIgnoredWatchPath(rel)
      }
    })
    this.watcher.on('all', (event, path) => {
      const rel = toRelative(path)
      if (rel !== '' && !rel.startsWith('..')) this.batcher.push(event as FileEvent, rel)
    })
    // Watch errors (e.g. folder deleted) must not crash main.
    this.watcher.on('error', () => undefined)
  }

  async close(): Promise<void> {
    this.batcher.cancel()
    await this.watcher.close()
  }
}
