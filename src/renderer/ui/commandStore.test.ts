import { describe, expect, it } from 'vitest'
import type { Command } from './commands'
import { CommandStore } from './commandStore'

const cmd = (id: string, run: () => void, extra: Partial<Command> = {}): Command => ({
  id,
  label: id,
  area: 'Pack',
  run,
  ...extra
})

describe('CommandStore', () => {
  it('notifies only on visible changes and runs the latest closure', () => {
    const store = new CommandStore()
    const owner = Symbol('editor')
    let calls = 0
    store.subscribe(() => calls++)
    let ran = ''
    store.set(owner, [cmd('save', () => (ran = 'first'))])
    const first = store.getSnapshot()
    store.set(owner, [cmd('save', () => (ran = 'second'))])
    expect(calls).toBe(1)
    expect(store.getSnapshot()).toBe(first)
    expect(store.run('save')).toBe(true)
    expect(ran).toBe('second')
    store.set(owner, [cmd('save', () => undefined, { enabled: false })])
    expect(calls).toBe(2)
    expect(store.run('save')).toBe(false)
  })

  it('merges owners and forgets removed ones', () => {
    const store = new CommandStore()
    const a = Symbol('a')
    const b = Symbol('b')
    store.set(a, [cmd('x', () => undefined)])
    store.set(b, [cmd('y', () => undefined)])
    expect(store.getSnapshot().map((c) => c.id)).toEqual(['x', 'y'])
    store.remove(a)
    expect(store.getSnapshot().map((c) => c.id)).toEqual(['y'])
    expect(store.run('x')).toBe(false)
  })
})
