import { describe, expect, it } from 'vitest'
import { coverageFolder, coverageReport } from './coverage'

const T = 'assets/minecraft/textures/'

describe('coverageFolder', () => {
  it('reads the folder under textures/, with the namespace for mods', () => {
    expect(coverageFolder(`${T}block/stone.png`)).toBe('block')
    expect(coverageFolder(`${T}entity/cow/cow.png`)).toBe('entity')
    expect(coverageFolder('assets/mymod/textures/block/x.png')).toBe('mymod:block')
    expect(coverageFolder('pack.png')).toBeNull()
  })
})

describe('coverageReport', () => {
  const files = [
    `${T}block/stone.png`,
    `${T}block/stone_n.png`,
    `${T}block/stone_s.png`,
    `${T}block/dirt.png`,
    `${T}block/dirt_n.png`,
    `${T}block/sand.png`,
    `${T}block/sand_s.png`,
    `${T}block/glass.png`,
    `${T}item/diamond.png`,
    `${T}block/cobblestone_n.png`,
    `${T}gui/widgets.png`,
    'assets/mymod/textures/gui/panel.png',
    'pack.png'
  ]
  const report = coverageReport(files)

  it('counts per folder, skipping folders where maps make no sense', () => {
    const block = report.folders.find((f) => f.folder === 'block')!
    expect(block).toMatchObject({ total: 4, both: 1, normalOnly: 1, specularOnly: 1, none: 1 })
    expect(report.folders.find((f) => f.folder === 'gui')?.skipped).toBe(true)
    expect(report.folders.find((f) => f.folder === 'mymod:gui')?.skipped).toBe(true)
    expect(report.total).toBe(5)
    expect(report.complete).toBe(1)
    // A map for a game texture is not a texture missing maps.
    expect(report.gameMaps).toBe(1)
    // Skipped folders go last.
    expect(report.folders.at(-1)?.skipped).toBe(true)
  })

  it('lists what each incomplete texture misses', () => {
    expect(report.missing.map((m) => [m.texture.name, m.missing])).toEqual([
      ['dirt', 'specular'],
      ['glass', 'both'],
      ['sand', 'normal'],
      ['diamond', 'both']
    ])
  })
})

describe('coverageReport and emissive overlays', () => {
  it('does not count x_e.png next to x.png as a texture missing maps', () => {
    const report = coverageReport([
      `${T}block/glowstone.png`,
      `${T}block/glowstone_e.png`,
      `${T}block/lonely_e.png`
    ])
    expect(report.total).toBe(2)
    expect(report.missing.map((m) => m.texture.name)).toEqual(['glowstone', 'lonely_e'])
  })
})
