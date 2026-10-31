import { describe, expect, it } from 'vitest'
import type { EditorTarget } from './TextureEditor'
import type { AssetSources } from '../preview/modelSource'
import { documentSourcesFor, withSources } from './targetSources'

const sources: AssetSources = {
  pack: { base: 'pack', files: new Set(), versions: {} },
  vanilla: null
}
const target: EditorTarget = {
  path: 'texture.png',
  textureKey: 'texture',
  name: 'texture',
  url: 'pack/texture.png',
  mcmetaUrl: null,
  packBase: 'pack',
  readOnly: false,
  sources
}

describe('withSources', () => {
  it('preserves identity for identical sources and absent targets', () => {
    expect(withSources(target, sources)).toBe(target)
    expect(withSources(null, sources)).toBeNull()
  })

  it('updates only preview sources while retaining document inputs across updates', () => {
    const nextSources = { ...sources, vanilla: { base: 'jar', files: new Set<string>() } }
    const next = withSources(target, nextSources)!
    expect(next).not.toBe(target)
    expect(next).toEqual({ ...target, sources: nextSources, documentSources: sources })
    expect(target.sources).toBe(sources)
    const savedSources = { ...nextSources, pack: { ...sources.pack, versions: { map: 1 } } }
    expect(withSources(next, savedSources)?.documentSources).toBe(sources)
  })
})

describe('documentSourcesFor', () => {
  it('captures written files before the watcher and preserves the snapshot on preview updates', () => {
    const snapshot = documentSourcesFor(sources, 'new.png', ['new.png'], 123)
    expect(snapshot.pack.files.has('new.png')).toBe(true)
    expect(snapshot.pack.versions['new.png']).toBe(123)
    expect(sources.pack.files.has('new.png')).toBe(false)
    const opened = { ...target, documentSources: snapshot }
    const updated = withSources(opened, { ...sources })!
    expect(updated.documentSources).toBe(snapshot)
    expect(updated.url).toBe(opened.url)
  })

  it('retains known versions for files that were not written', () => {
    const known = { ...sources, pack: { ...sources.pack, versions: { 'map.png': 7 } } }
    expect(documentSourcesFor(known, 'new.png').pack.versions['map.png']).toBe(7)
  })
})
