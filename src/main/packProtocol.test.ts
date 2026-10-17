import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodePackPath } from '../shared/ipc'
import { handlePackRequest, packAssetBase } from './packProtocol'
import type { PackSource } from './packSource'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const source: PackSource = {
  kind: 'zip',
  root: 'pack.zip',
  data: zipSync({
    'pack.mcmeta': strToU8('{}'),
    'my textures': { 'stone #1.png': PNG }
  })
}
const current = { source, generation: 7 }
const get = (url: string, method = 'GET') =>
  handlePackRequest(new Request(url, { method }), current)

describe('handlePackRequest', () => {
  it('serves PNGs of the current generation with encoded paths', async () => {
    const url = packAssetBase(7) + encodePackPath('my textures/stone #1.png')
    const response = await get(url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it('returns 404 for stale generations, non-PNGs, traversal and no open pack', async () => {
    expect((await get(packAssetBase(6) + 'my%20textures/stone%20%231.png')).status).toBe(404)
    expect((await get(packAssetBase(7) + 'pack.mcmeta')).status).toBe(404)
    expect((await get(packAssetBase(7) + '..%2Fsecret.png')).status).toBe(404)
    expect((await get(packAssetBase(7) + '%E0%A4%A.png')).status).toBe(404)
    expect((await get(packAssetBase(7) + 'my%20textures/stone%20%231.png', 'POST')).status).toBe(
      404
    )
    const none = await handlePackRequest(new Request(packAssetBase(7) + 'x.png'), null)
    expect(none.status).toBe(404)
  })
})
