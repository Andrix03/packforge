// 1.1 GUI tab: the game's GUI textures with a mock screen in the dock (main menu, HUD, inventory)
// that uses the pack's sprite where it has one; double-clicking a vanilla GUI sprite the pack
// lacks offers a new texture of the same shape (200×20 and its 2×, 4×), never its pixels.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const WIDGET = ['assets', 'minecraft', 'textures', 'gui', 'sprites', 'widget']

export default async function guiTab(app) {
  const dir = join(app.paths.pack, ...WIDGET)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'button.png'),
    png(200, 20, (x, y) =>
      x < 2 || y < 2 || x > 197 || y > 17 ? [90, 20, 20, 255] : [200, 60, 60, 255]
    )
  )
  await app.openPack({ waitForVanilla: true })
  await app.section('gui')
  await app.waitFor(`document.querySelector('.gui-mock canvas')`)
  app.check(
    await app.ev(`!document.querySelector('.pack-dock .preview-canvas')`),
    'the GUI tab shows the mock screen instead of the 3D block'
  )
  await app.waitFor(
    `/Dal tuo pack: 1 di/.test(document.querySelector('.gui-mock').textContent)`,
    15000
  )
  app.check(true, 'the main menu takes the pack button, the rest from vanilla')
  await app.shot('gui-tab-title')

  for (const [label, kind] of [
    ['HUD', 'hud'],
    ['Inventario', 'inventory']
  ]) {
    await app.click(label, '.gui-mock button')
    await app.waitFor(`document.querySelector('.gui-mock canvas').dataset.screen === '${kind}'`)
    await app.sleep(600)
    await app.shot(`gui-tab-${kind}`)
  }
  app.check(true, 'HUD and inventory screens')

  // A vanilla sprite the pack doesn't have: a new texture of its shape.
  await app.click('Gioco', '.source-switch button')
  await app.click('Pulsanti e widget', '.group-row')
  const found = await app.ev(`(() => {
    const tile = [...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/button_disabled.png'))
    tile?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    return Boolean(tile)
  })()`)
  app.check(found, 'the GUI tab lists the vanilla widget sprites')
  await app.waitFor(`document.querySelector('[role=dialog][aria-label="Nuova texture"]')`)
  await app.waitFor(
    `[...document.querySelectorAll('[aria-label="Dimensione"] [role=radio]')].some((b) => b.textContent === '200×20')`
  )
  const sizes = await app.ev(
    `[...document.querySelectorAll('[aria-label="Dimensione"] [role=radio]')].map((b) => b.textContent).join(' ')`
  )
  app.check(sizes === '200×20 400×40 800×80', `offers the vanilla shape and its 2×, 4× (${sizes})`)
  await app.shot('gui-tab-new-texture')
}
