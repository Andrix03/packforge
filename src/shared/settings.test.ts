import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, editorDisplayName, parseSettings } from './settings'

describe('parseSettings', () => {
  it('reads valid settings', () => {
    expect(
      parseSettings({
        minecraftDir: 'D:\\Games\\.minecraft',
        externalEditor: 'C:\\A\\Aseprite.exe'
      })
    ).toEqual({ minecraftDir: 'D:\\Games\\.minecraft', externalEditor: 'C:\\A\\Aseprite.exe' })
  })

  it.each([null, undefined, 'text', 42, []])('falls back to defaults for %j', (value) => {
    expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS)
  })

  it('drops invalid and unknown fields', () => {
    expect(parseSettings({ minecraftDir: 5, externalEditor: '   ', theme: 'dark' })).toEqual(
      DEFAULT_SETTINGS
    )
  })
})

describe('editorDisplayName', () => {
  it('strips folders and executable extensions', () => {
    expect(editorDisplayName('C:\\Program Files\\Aseprite\\Aseprite.exe')).toBe('Aseprite')
    expect(editorDisplayName('/Applications/Krita.app')).toBe('Krita')
    expect(editorDisplayName('gimp')).toBe('gimp')
  })
})
