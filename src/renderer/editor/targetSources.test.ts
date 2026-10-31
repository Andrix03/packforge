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
  it('keeps confirmed writes through stale listings until the watcher lists them', () => {
    const written = documentSourcesFor(sources, 'v2.png', ['v2.png', 'v3.png'], 123)
    const opened = { ...target, sources: written, pendingWrites: ['v2.png', 'v3.png'] }
    const stale = withSources(opened, sources)!
    expect(stale.sources.pack.files.has('v2.png')).toBe(true)
    expect(stale.sources.pack.files.has('v3.png')).toBe(true)
    expect(stale.sources.pack.versions['v3.png']).toBe(123)
    const partial = withSources(stale, {
      ...sources,
      pack: { ...sources.pack, files: new Set(['v2.png']) }
    })!
    expect(partial.pendingWrites).toEqual(['v3.png'])
    expect(partial.sources.pack.files.has('v3.png')).toBe(true)
    expect(partial.documentSources).toBe(written)
    const listed = { ...sources, pack: { ...sources.pack, files: new Set(['v2.png', 'v3.png']) } }
    const caughtUp = withSources(stale, listed)!
    expect(caughtUp.pendingWrites).toEqual([])
    expect(withSources(caughtUp, sources)!.sources.pack.files.has('v3.png')).toBe(false)
  })

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
