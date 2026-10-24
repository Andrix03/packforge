// 1.2 armor preview: an armor texture (entity/equipment/humanoid…, 64×32) opens with a player
// wearing it in place of the 3D block; the other layer of the same armor can be shown too, and
// leather gets a dye colour. Painting updates the model live.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const EQUIPMENT = ['assets', 'minecraft', 'textures', 'entity', 'equipment']

/** Opens the file tree down to `path` (each folder opens on click). */
async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(
      `[...document.querySelectorAll('button')].find((b) => b.title === '${folder}').click()`
    )
    await app.sleep(150)
  }
}

/** Our own armor: every part painted in one colour with a darker rim, the rest transparent. */
function armor(color) {
  const dark = color.map((c) => Math.round(c * 0.6))
  const parts = [
    [0, 0, 32, 16],
    [16, 16, 24, 16],
    [40, 16, 16, 16],
    [0, 16, 16, 16]
  ]
  return png(64, 32, (x, y) => {
    const inside = parts.some(([px, py, w, h]) => x >= px && y >= py && x < px + w && y < py + h)
    if (!inside) return [0, 0, 0, 0]
    return (x + y) % 4 === 0 ? [...dark, 255] : [...color, 255]
  })
}

export default async function armorPreview(app) {
  const outer = join(app.paths.pack, ...EQUIPMENT, 'humanoid')
  const inner = join(app.paths.pack, ...EQUIPMENT, 'humanoid_leggings')
  await mkdir(outer, { recursive: true })
  await mkdir(inner, { recursive: true })
  await writeFile(join(outer, 'iron.png'), armor([200, 60, 60]))
  await writeFile(join(inner, 'iron.png'), armor([60, 90, 200]))
  await writeFile(join(outer, 'leather.png'), armor([180, 180, 180]))

  await app.openPack()
  await openFolder(app, [...EQUIPMENT, 'humanoid'].join('/'))
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-preview canvas')`)
  app.check(
    await app.ev(`!document.querySelector('.editor-side .preview-canvas')`),
    'an armor texture gets the armor preview, not the 3D block'
  )
  app.check(
    (await app.ev(`document.querySelector('.armor-preview').textContent`)).includes(
      'elmo, corazza e stivali'
    ),
    'the outer layer is named'
  )
  app.check(
    (await app.ev(`document.querySelectorAll('.armor-legend span').length`)) === 5,
    'the part map names head, helmet, body, arms and legs'
  )
  await app.sleep(800)
  await app.shot('armor-both-layers')

  await app.ev(`document.querySelector('[aria-label="Mostra anche i gambali"]').click()`)
  await app.sleep(400)
  await app.shot('armor-outer-only')

  // Paint the front of the chest (a diagonal from the wearer's right shoulder) and the top-left
  // pixel of the helmet's front: seen from the front both are on the viewer's left. Live.
  await app.editor.setHex('#20c020')
  await app.editor.draw([
    [20, 20],
    [24, 24]
  ])
  await app.editor.setHex('#f0e020')
  await app.editor.draw([
    [8, 8],
    [9, 9]
  ])
  await app.sleep(400)
  await app.shot('armor-painted')
  await app.ev(`document.querySelector('.armor-map').scrollIntoView({ block: 'center' })`)
  await app.sleep(200)
  await app.shot('armor-map')

  // Drag to turn the player round.
  const box = await app.ev(`(() => {
    const r = document.querySelector('.armor-view').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  const mouse = (type, x, buttons) =>
    app.send('Input.dispatchMouseEvent', {
      type,
      x,
      y: box.y,
      button: 'left',
      buttons,
      clickCount: 1
    })
  await mouse('mousePressed', box.x, 1)
  await mouse('mouseMoved', box.x + 120, 1)
  await mouse('mouseMoved', box.x + 250, 1)
  await mouse('mouseReleased', box.x + 250, 0)
  await app.sleep(300)
  await app.shot('armor-turned')

  await app.key('s', ['ctrl'])
  await app.sleep(500)
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await app.openTexture('leather.png')
  await app.waitFor(`document.querySelector('.armor-dye input[type=color]')`)
  app.check(
    (await app.ev(`document.querySelector('.armor-dye input').value`)) === '#a06540',
    'leather is tinted with the undyed brown'
  )
  await app.sleep(600)
  await app.shot('armor-leather')
}
