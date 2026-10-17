import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangeBatcher, isIgnoredWatchPath } from './changeBatcher'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ChangeBatcher', () => {
  it('coalesces events within the quiet period into one sorted batch', () => {
    const flush = vi.fn()
    const batcher = new ChangeBatcher(flush, 100)
    batcher.push('change', 'b.png')
    vi.advanceTimersByTime(60)
    batcher.push('change', 'a.png')
    batcher.push('change', 'b.png')
    vi.advanceTimersByTime(99)
    expect(flush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(flush).toHaveBeenCalledExactlyOnceWith({
      paths: ['a.png', 'b.png'],
      structureChanged: false
    })
  })

  it('flags structure changes for add/unlink', () => {
    const flush = vi.fn()
    const batcher = new ChangeBatcher(flush, 50)
    batcher.push('change', 'a.png')
    batcher.push('add', 'new.png')
    vi.advanceTimersByTime(50)
    expect(flush).toHaveBeenLastCalledWith({ paths: ['a.png', 'new.png'], structureChanged: true })

    batcher.push('change', 'a.png')
    vi.advanceTimersByTime(50)
    expect(flush).toHaveBeenLastCalledWith({ paths: ['a.png'], structureChanged: false })
  })

  it('cancel() drops pending events', () => {
    const flush = vi.fn()
    const batcher = new ChangeBatcher(flush, 50)
    batcher.push('unlink', 'a.png')
    batcher.cancel()
    vi.advanceTimersByTime(200)
    expect(flush).not.toHaveBeenCalled()
  })
})

describe('isIgnoredWatchPath', () => {
  it.each(['pack.mcmeta.tmp', 'assets/.DS_Store', 'Thumbs.db', 'a/desktop.ini', 'x.png~'])(
    'ignores %j',
    (path) => expect(isIgnoredWatchPath(path)).toBe(true)
  )

  it.each(['pack.mcmeta', 'assets/minecraft/textures/block/stone.png', 'pack.png'])(
    'keeps %j',
    (path) => expect(isIgnoredWatchPath(path)).toBe(false)
  )
})
