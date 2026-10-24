import { describe, expect, it } from 'vitest'
import { mergeLang, parseLang, searchLang } from './langFile'

const VANILLA = {
  'item.minecraft.diamond_sword': 'Diamond Sword',
  'item.minecraft.apple': 'Apple',
  'block.minecraft.stone': 'Stone'
}

describe('lang files', () => {
  it('searches keys and texts, the pack’s lines first', () => {
    const pack = { 'item.minecraft.apple': 'Red Apple', 'mymod.thing': 'Thing' }
    const { rows, total } = searchLang(VANILLA, pack, 'apple')
    expect(total).toBe(1)
    expect(rows[0]).toEqual({ key: 'item.minecraft.apple', vanilla: 'Apple', pack: 'Red Apple' })
    const all = searchLang(VANILLA, pack, '', 2)
    expect(all.total).toBe(4)
    expect(all.rows.map((r) => r.key)).toEqual(['item.minecraft.apple', 'mymod.thing'])
    expect(searchLang(VANILLA, pack, 'SWORD').rows[0]?.vanilla).toBe('Diamond Sword')
  })

  it('merges edits, dropping lines set back to the game’s text', () => {
    const merged = mergeLang(
      { 'item.minecraft.apple': 'Red Apple', 'block.minecraft.stone': 'Rock' },
      {
        'item.minecraft.diamond_sword': 'Excalibur',
        'item.minecraft.apple': null,
        'block.minecraft.stone': 'Stone'
      },
      VANILLA
    )
    expect(merged).toEqual({ 'item.minecraft.diamond_sword': 'Excalibur' })
  })

  it('reads lang files, with a BOM and non-text values', () => {
    expect(parseLang('﻿{"a": "x", "b": 3}')).toEqual({ a: 'x' })
    expect(parseLang('[1]')).toBeNull()
    expect(parseLang('{')).toBeNull()
  })
})
