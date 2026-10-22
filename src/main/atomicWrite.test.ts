import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renameRetrying, serializedOn, writeFileAtomic } from './atomicWrite'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-atomic-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeFileAtomic', () => {
  it('overlapping writes of one file land in order, leaving no temp files', async () => {
    const file = join(dir, 'a.png')
    const big = 'x'.repeat(2_000_000)
    await Promise.all([
      writeFileAtomic(file, big),
      writeFileAtomic(file, 'second'),
      writeFileAtomic(file, 'third')
    ])
    expect(await readFile(file, 'utf8')).toBe('third')
    expect(await readdir(dir)).toEqual(['a.png'])
  })
})

describe('serializedOn', () => {
  it('runs tasks on the same file one at a time; a failure does not block the next', async () => {
    const file = join(dir, 'pack.mcmeta')
    const log: string[] = []
    const slow = serializedOn(file, async () => {
      log.push('a start')
      await new Promise((r) => setTimeout(r, 30))
      log.push('a end')
      throw new Error('a failed')
    })
    const next = serializedOn(file, async () => {
      log.push('b')
      return 2
    })
    await expect(slow).rejects.toThrow('a failed')
    expect(await next).toBe(2)
    expect(log).toEqual(['a start', 'a end', 'b'])
  })

  it('different files do not wait on each other', async () => {
    const log: string[] = []
    let release = (): void => undefined
    const blocked = serializedOn(join(dir, 'a'), () => new Promise<void>((r) => (release = r)))
    await serializedOn(join(dir, 'b'), async () => {
      log.push('b')
    })
    expect(log).toEqual(['b'])
    release()
    await blocked
  })
})

describe('renameRetrying', () => {
  const lock = Object.assign(new Error('locked'), { code: 'EPERM' })

  it('retries while the target is locked, then succeeds', async () => {
    let calls = 0
    await renameRetrying('a', 'b', async () => {
      calls++
      if (calls < 3) throw lock
    })
    expect(calls).toBe(3)
  })

  it('gives up on other errors at once', async () => {
    let calls = 0
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
    await expect(
      renameRetrying('a', 'b', async () => {
        calls++
        throw missing
      })
    ).rejects.toThrow('missing')
    expect(calls).toBe(1)
  })
})
