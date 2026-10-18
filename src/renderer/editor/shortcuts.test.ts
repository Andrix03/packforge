import { describe, expect, it } from 'vitest'
import { shortcutsFor } from './shortcuts'
import { TOOLS } from './tools'

describe('shortcutsFor', () => {
  it('lists every tool shortcut in Pro mode', () => {
    const tools = shortcutsFor(true).find((g) => g.title === 'Strumenti')!
    expect(tools.items.map((i) => i.keys)).toEqual(TOOLS.map((t) => t.shortcut))
  })

  it('hides Pro shortcuts (and the selection group) in Beginner mode', () => {
    const groups = shortcutsFor(false)
    expect(groups.some((g) => g.title === 'Selezione')).toBe(false)
    const tools = groups.find((g) => g.title === 'Strumenti')!
    expect(tools.items.some((i) => i.label === 'Rettangolo')).toBe(false)
    expect(tools.items.some((i) => i.label === 'Matita')).toBe(true)
  })

  it('has no duplicate tool keys', () => {
    const keys = TOOLS.map((t) => t.shortcut.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })
})
