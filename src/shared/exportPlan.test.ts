import { describe, expect, it } from 'vitest'
import {
  changelogText,
  compareVersions,
  creditsText,
  DEFAULT_PROJECT,
  DISCLAIMER,
  exportFileName,
  filesForVariant,
  licenseText,
  parseProject,
  PROJECT_FILE,
  strayReason
} from './exportPlan'

const B = 'assets/minecraft/textures/block/'

describe('parseProject', () => {
  it('keeps valid fields and falls back for the rest', () => {
    const p = parseProject({
      version: '1.2.0',
      author: 'Andrea',
      license: 'CC-BY-NC-SA-4.0',
      credits: [{ name: 'Friend', what: 'sounds' }, { name: '' }],
      changelog: [{ version: '1.2.0', date: '2026-10-19', notes: 'PBR' }, { version: '???' }]
    })
    expect(p.version).toBe('1.2.0')
    expect(p.license).toBe('CC-BY-NC-SA-4.0')
    expect(p.credits).toEqual([{ name: 'Friend', what: 'sounds' }])
    expect(p.changelog).toHaveLength(1)
    expect(parseProject({ version: '../../x', license: 'GPL-9' })).toMatchObject({
      version: DEFAULT_PROJECT.version,
      license: DEFAULT_PROJECT.license
    })
    expect(parseProject(null)).toEqual(DEFAULT_PROJECT)
  })
})

describe('files', () => {
  it('flags work files, OS clutter and hidden folders', () => {
    expect(strayReason(`${B}stone.psd`)).toContain('editor')
    expect(strayReason(`${B}Thumbs.db`)).toContain('Windows')
    expect(strayReason('.git/config')).toContain('nascosti')
    expect(strayReason(`${B}stone.png~`)).toContain('temporaneo')
    expect(strayReason(`${B}stone.png`)).toBeNull()
  })

  it('exports everything but stray files and the project file; no maps without PBR', () => {
    const files = [
      'pack.mcmeta',
      PROJECT_FILE,
      `${B}stone.png`,
      `${B}stone_n.png`,
      `${B}stone_s.png`,
      `${B}magma_s.png.mcmeta`,
      `${B}stone.psd`
    ]
    expect(filesForVariant(files, { kind: 'full' })).toEqual([
      'pack.mcmeta',
      `${B}stone.png`,
      `${B}stone_n.png`,
      `${B}stone_s.png`,
      `${B}magma_s.png.mcmeta`
    ])
    expect(filesForVariant(files, { kind: 'no-pbr' })).toEqual(['pack.mcmeta', `${B}stone.png`])
  })

  it('names the zip safely with version and variant', () => {
    expect(exportFileName('My Pack!', '1.2.0', { kind: 'full' })).toBe('My-Pack-1.2.0.zip')
    expect(exportFileName('My Pack', '1.2.0', { kind: 'no-pbr' })).toBe('My-Pack-1.2.0-base.zip')
    expect(exportFileName('Città', '2', { kind: 'resolution', resolution: 32 })).toBe(
      'Citta-2-32x.zip'
    )
  })
})

describe('texts', () => {
  const info = {
    ...DEFAULT_PROJECT,
    author: 'Andrea',
    credits: [{ name: 'Friend', what: 'ideas' }]
  }

  it('always carries the Mojang disclaimer in CREDITS', () => {
    const credits = creditsText(info, 'Pack')
    expect(credits).toContain(DISCLAIMER)
    expect(credits).toContain('- Friend: ideas')
  })

  it('writes the license with owner and year', () => {
    expect(licenseText(info, 'Pack', 2026)).toContain(
      'Copyright (c) 2026 Andrea. All rights reserved.'
    )
    expect(licenseText({ ...info, license: 'CC-BY-4.0' }, 'Pack', 2026)).toContain(
      'https://creativecommons.org/licenses/by/4.0/'
    )
  })

  it('orders the changelog newest first, numerically', () => {
    const text = changelogText(
      {
        ...info,
        changelog: [
          { version: '1.9.0', date: '', notes: 'a' },
          { version: '1.10.0', date: '2026-10-19', notes: 'b' }
        ]
      },
      'Pack'
    )
    expect(text.indexOf('1.10.0')).toBeLessThan(text.indexOf('1.9.0'))
    expect(compareVersions('1.10.0', '1.9.2')).toBeGreaterThan(0)
  })
})
