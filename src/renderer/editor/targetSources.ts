import type { EditorTarget } from './TextureEditor'
import type { AssetSources } from '../preview/modelSource'

/** Refresh preview assets without changing the inputs that own the open document. */
export function withSources(
  target: EditorTarget | null,
  sources: AssetSources
): EditorTarget | null {
  if (!target || target.sources === sources) return target
  const pendingWrites = target.pendingWrites?.filter((path) => !sources.pack.files.has(path))
  const versions = { ...sources.pack.versions }
  for (const path of pendingWrites ?? []) versions[path] = target.sources.pack.versions[path] ?? 0
  const liveSources = pendingWrites?.length
    ? {
        ...sources,
        pack: {
          ...sources.pack,
          files: new Set([...sources.pack.files, ...pendingWrites]),
          versions
        }
      }
    : sources
  return {
    ...target,
    sources: liveSources,
    ...(pendingWrites ? { pendingWrites } : {}),
    documentSources: target.documentSources ?? target.sources
  }
}

/** Capture document inputs at open time, including writes not yet reported by the watcher. */
export function documentSourcesFor(
  sources: AssetSources,
  path: string,
  written: readonly string[] = [],
  stamp = Date.now()
): AssetSources {
  const versions = { ...sources.pack.versions }
  for (const file of written) versions[file] = stamp
  return {
    ...sources,
    pack: { ...sources.pack, files: new Set([...sources.pack.files, path, ...written]), versions }
  }
}
