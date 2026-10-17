import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { assetUrl, encodePackPath } from '../shared/ipc'
import { assetBase, handlePackRequest } from './packProtocol'
import type { PackSource } from './packSource'
import type { OpenedSource, SourceRole } from './session'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const VANILLA_PNG = new Uint8Array([...PNG, 1, 2, 3])

const packSource: PackSource = {
  kind: 'zip',
  root: 'pack.zip',
  data: zipSync({ 'pack.mcmeta': strToU8('{}'), 'my textures': { 'stone #1.png': PNG } })
}
const vanillaSource: PackSource = {
  kind: 'zip',
  root: 'client.jar',
  data: zipSync({ 'my textures': { 'stone #1.png': VANILLA_PNG } })
}

const opened: Record<SourceRole, OpenedSource | null> = {
  pack: { source: packSource, generation: 7 },
  vanilla: { source: vanillaSource, generation: 8 }
}
const get = (url: string, method = 'GET') =>
  handlePackRequest(new Request(url, { method }), (role) => opened[role])
const bytesOf = async (response: Response) => new Uint8Array(await response.arrayBuffer())
const STONE = encodePackPath('my textures/stone #1.png')

describe('assetUrl', () => {
  it('appends the version only when non-zero, and the protocol ignores it', async () => {
    expect(assetUrl(assetBase('pack', 7), 'my textures/stone #1.png')).toBe(
      assetBase('pack', 7) + STONE
    )
    const versioned = assetUrl(assetBase('pack', 7), 'my textures/stone #1.png', 3)
    expect(versioned.endsWith('?v=3')).toBe(true)
    expect((await get(versioned)).status).toBe(200)
  })
})

describe('handlePackRequest', () => {
  it('serves PNGs of the current pack generation with encoded paths', async () => {
    const response = await get(assetBase('pack', 7) + STONE)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await bytesOf(response)).toEqual(PNG)
  })

  it('serves the vanilla source on its own host', async () => {
    const response = await get(assetBase('vanilla', 8) + STONE)
    expect(await bytesOf(response)).toEqual(VANILLA_PNG)
  })

  it('does not mix up roles or generations', async () => {
    expect((await get(assetBase('vanilla', 7) + STONE)).status).toBe(404)
    expect((await get(assetBase('pack', 8) + STONE)).status).toBe(404)
    expect((await get(assetBase('pack', 6) + STONE)).status).toBe(404)
  })

  it('serves .mcmeta as JSON', async () => {
    const response = await get(assetBase('pack', 7) + 'pack.mcmeta')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('returns 404 for other types, traversal, bad encoding, POST and closed sources', async () => {
    expect((await get(assetBase('pack', 7) + 'notes.txt')).status).toBe(404)
    expect((await get(assetBase('pack', 7) + '..%2Fsecret.png')).status).toBe(404)
    expect((await get(assetBase('pack', 7) + '%E0%A4%A.png')).status).toBe(404)
    expect((await get(assetBase('pack', 7) + STONE, 'POST')).status).toBe(404)
    const closed = await handlePackRequest(new Request(assetBase('pack', 7) + STONE), () => null)
    expect(closed.status).toBe(404)
  })
})
