import { describe, expect, it } from 'vitest'
import { MOCK_SCREENS, mockScreen, mockScreenPaths, type MockLabels } from './guiMockScreens'

const LABELS: MockLabels = {
  singleplayer: 'Singleplayer',
  multiplayer: 'Multiplayer',
  realms: 'Realms',
  options: 'Options…',
  quit: 'Quit Game',
  inventory: 'Crafting',
  splash: 'Hello!',
  version: 'Minecraft 26.3'
}

describe('mock GUI screens', () => {
  it('keep every image inside the screen (except the cropped panorama)', () => {
    for (const kind of MOCK_SCREENS) {
      const screen = mockScreen(kind, LABELS)
      for (const item of screen.items) {
        if (item.kind !== 'image' || item.cover) continue
        expect(item.x, `${kind} ${item.path}`).toBeGreaterThanOrEqual(0)
        expect(item.y, `${kind} ${item.path}`).toBeGreaterThanOrEqual(0)
        expect(item.x + item.width, `${kind} ${item.path}`).toBeLessThanOrEqual(screen.width)
        expect(item.y + item.height, `${kind} ${item.path}`).toBeLessThanOrEqual(screen.height)
      }
    }
  })

  it('use the game paths: sprites, the title folder and the inventory container', () => {
    const paths = MOCK_SCREENS.flatMap((kind) => mockScreenPaths(mockScreen(kind, LABELS)))
    expect(paths).toContain('assets/minecraft/textures/gui/sprites/widget/button.png')
    expect(paths).toContain('assets/minecraft/textures/gui/sprites/hud/hotbar.png')
    expect(paths).toContain('assets/minecraft/textures/gui/title/minecraft.png')
    expect(paths).toContain('assets/minecraft/textures/gui/container/inventory.png')
    for (const path of paths) expect(path).toMatch(/^assets\/minecraft\/textures\/gui\/.+\.png$/)
  })

  it('centres the hotbar and puts ten hearts and ten food icons above it', () => {
    const hud = mockScreen('hud', LABELS)
    const hotbar = hud.items.find((i) => i.kind === 'image' && i.path.endsWith('hud/hotbar.png'))
    expect(hotbar).toMatchObject({ x: Math.floor(hud.width / 2) - 91, width: 182 })
    const count = (suffix: string) =>
      hud.items.filter((i) => i.kind === 'image' && i.path.endsWith(suffix)).length
    expect(count('heart/container.png')).toBe(10)
    expect(count('food_empty.png')).toBe(10)
  })
})
