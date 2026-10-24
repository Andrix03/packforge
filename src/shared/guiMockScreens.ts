// Mock game screens for the GUI tab: what to draw where, in GUI units, so a pack's sprites can be
// seen together (main menu, HUD, inventory). An approximation of the 26.3 layouts, close enough to
// judge sizes and colours; the renderer takes each sprite from the pack or else vanilla. Pure.

export type MockScreenKind = 'title' | 'hud' | 'inventory'

export const MOCK_SCREENS: readonly MockScreenKind[] = ['title', 'hud', 'inventory']

const GUI = 'assets/minecraft/textures/gui/'
const SPRITE = `${GUI}sprites/`

/** A sprite (laid out with its gui.scaling) or a plain texture region, drawn into a rectangle. */
export interface MockImage {
  kind: 'image'
  path: string
  x: number
  y: number
  width: number
  height: number
  /**
   * Part of a plain texture, in the units of `textureSize` (the whole file's size in GUI units:
   * a 4× logo of 1024×256 pixels is still 256×64). Container backgrounds use the top-left of 256×256.
   */
  region?: { x: number; y: number; width: number; height: number }
  textureSize?: { width: number; height: number }
  /** Covers the whole screen, cropped (panorama). */
  cover?: boolean
}

export interface MockText {
  kind: 'text'
  text: string
  x: number
  y: number
  color: string
  align: 'left' | 'center' | 'right'
  shadow: boolean
  /** Degrees, the splash's tilt. */
  rotate?: number
}

export interface MockFill {
  kind: 'fill'
  color: string
  x: number
  y: number
  width: number
  height: number
}

export type MockItem = MockImage | MockText | MockFill

export interface MockScreen {
  width: number
  height: number
  items: MockItem[]
}

export interface MockLabels {
  singleplayer: string
  multiplayer: string
  realms: string
  options: string
  quit: string
  inventory: string
  splash: string
  version: string
}

const image = (
  path: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<MockImage> = {}
): MockImage => ({ kind: 'image', path, x, y, width, height, ...extra })

const text = (value: string, x: number, y: number, extra: Partial<MockText> = {}): MockText => ({
  kind: 'text',
  text: value,
  x,
  y,
  color: '#ffffff',
  align: 'center',
  shadow: true,
  ...extra
})

/** The mock screen `kind`, `width`×`height` GUI units (a 1280×720 window at GUI scale 3 ≈ 427×240). */
export function mockScreen(
  kind: MockScreenKind,
  labels: MockLabels,
  width = 427,
  height = 240
): MockScreen {
  const cx = Math.floor(width / 2)
  if (kind === 'title') {
    const top = Math.floor(height / 4) + 48
    const button = (label: string, x: number, y: number, w: number): MockItem[] => [
      image(`${SPRITE}widget/button.png`, x, y, w, 20),
      text(label, x + w / 2, y + 6)
    ]
    return {
      width,
      height,
      items: [
        image(`${GUI}title/background/panorama_0.png`, 0, 0, width, height, { cover: true }),
        image(`${GUI}title/background/panorama_overlay.png`, 0, 0, width, height),
        image(`${GUI}title/minecraft.png`, cx - 128, 30, 256, 44, {
          region: { x: 0, y: 0, width: 256, height: 44 },
          textureSize: { width: 256, height: 64 }
        }),
        image(`${GUI}title/edition.png`, cx - 64, 67, 128, 14, {
          region: { x: 0, y: 0, width: 128, height: 14 },
          textureSize: { width: 128, height: 16 }
        }),
        text(labels.splash, cx + 90, 70, { color: '#ffff00', rotate: -20 }),
        ...button(labels.singleplayer, cx - 100, top, 200),
        ...button(labels.multiplayer, cx - 100, top + 24, 200),
        ...button(labels.realms, cx - 100, top + 48, 200),
        image(`${SPRITE}widget/button.png`, cx - 124, top + 84, 20, 20),
        image(`${SPRITE}icon/language.png`, cx - 122, top + 86, 15, 15),
        ...button(labels.options, cx - 100, top + 84, 98),
        ...button(labels.quit, cx + 2, top + 84, 98),
        image(`${SPRITE}widget/button.png`, cx + 104, top + 84, 20, 20),
        image(`${SPRITE}icon/accessibility.png`, cx + 106, top + 86, 15, 15),
        text(labels.version, 2, height - 10, { align: 'left' })
      ]
    }
  }
  if (kind === 'hud') {
    const left = cx - 91
    const bottom = height - 22
    const items: MockItem[] = [
      { kind: 'fill', color: '#7fb0e6', x: 0, y: 0, width, height: Math.floor(height * 0.55) },
      {
        kind: 'fill',
        color: '#5d8f3a',
        x: 0,
        y: Math.floor(height * 0.55),
        width,
        height: height - Math.floor(height * 0.55)
      },
      image(`${SPRITE}hud/crosshair.png`, cx - 7, Math.floor(height / 2) - 7, 15, 15),
      image(`${SPRITE}hud/experience_bar_background.png`, left, bottom - 7, 182, 5),
      image(`${SPRITE}hud/experience_bar_progress.png`, left, bottom - 7, 72, 5),
      image(`${SPRITE}hud/hotbar.png`, left, bottom, 182, 22),
      image(`${SPRITE}hud/hotbar_selection.png`, left - 1 + 20 * 2, bottom - 1, 24, 23)
    ]
    for (let i = 0; i < 10; i++) {
      // Hearts from the left (8.5 full), food from the right (7.5 full), above the bar.
      const hx = left + i * 8
      const fx = left + 182 - 9 - i * 8
      const y = bottom - 17
      items.push(image(`${SPRITE}hud/heart/container.png`, hx, y, 9, 9))
      if (i < 9) {
        items.push(image(`${SPRITE}hud/heart/${i < 8 ? 'full' : 'half'}.png`, hx, y, 9, 9))
      }
      items.push(image(`${SPRITE}hud/food_empty.png`, fx, y, 9, 9))
      if (i < 8) {
        items.push(image(`${SPRITE}hud/food_${i < 7 ? 'full' : 'half'}.png`, fx, y, 9, 9))
      }
    }
    return { width, height, items }
  }
  // Inventory over the dimmed game.
  const x = cx - 88
  const y = Math.floor(height / 2) - 83
  return {
    width,
    height,
    items: [
      { kind: 'fill', color: '#3a4a2e', x: 0, y: 0, width, height },
      { kind: 'fill', color: 'rgba(16, 16, 16, 0.75)', x: 0, y: 0, width, height },
      image(`${GUI}container/inventory.png`, x, y, 176, 166, {
        region: { x: 0, y: 0, width: 176, height: 166 },
        textureSize: { width: 256, height: 256 }
      }),
      text(labels.inventory, x + 97, y + 6, { color: '#404040', align: 'left', shadow: false })
    ]
  }
}

/** Every texture a mock screen draws, to load before drawing. */
export function mockScreenPaths(screen: MockScreen): string[] {
  return [
    ...new Set(
      screen.items.filter((item): item is MockImage => item.kind === 'image').map((i) => i.path)
    )
  ]
}
