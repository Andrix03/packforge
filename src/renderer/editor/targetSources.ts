import type { EditorTarget } from './TextureEditor'
import type { AssetSources } from '../preview/modelSource'

/** Refresh preview assets without changing the inputs that own the open document. */
export function withSources(
  target: EditorTarget | null,
  sources: AssetSources
): EditorTarget | null {
  if (!target || target.sources === sources) return target
  return { ...target, sources, documentSources: target.documentSources ?? target.sources }
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
