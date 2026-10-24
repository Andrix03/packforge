// 1.1 GUI preview: a GUI sprite opens with the GUI preview instead of the 3D block, drawn at the
// chosen GUI scale; without its own .png.mcmeta it warns that the vanilla nine-slice is lost (the
// game reads the scaling from the pack that gives the image); "use the vanilla scaling" + save
// writes gui.scaling into the pack, and an edited border is saved as a {left, top…} object.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const WIDGET = ['assets', 'minecraft', 'textures', 'gui', 'sprites', 'widget']

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

export default async function gui(app) {
  const dir = join(app.paths.pack, ...WIDGET)
  await mkdir(dir, { recursive: true })
  // Our own button: dark frame, grey face (never the vanilla pixels).
  await writeFile(
    join(dir, 'button.png'),
    png(200, 20, (x, y) =>
      x < 2 || y < 2 || x > 197 || y > 17 ? [40, 40, 40, 255] : [120, 120, 130, 255]
    )
  )
  const mcmetaFile = join(dir, 'button.png.mcmeta')

  await app.openPack({ waitForVanilla: true })
  await openFolder(app, WIDGET.join('/'))
  await app.openTexture('button.png')
  await app.waitFor(`document.querySelector('.gui-preview')`)
  app.check(
    await app.ev(`!document.querySelector('.editor-side .preview-canvas')`),
    'a GUI sprite gets the GUI preview, not the 3D block'
  )
  const size = await app.ev(`document.querySelector('.gui-sprite').width`)
  app.check(size === 200, `fits the column: GUI scale 1 for a 200-unit button (${size} px)`)
  await app.click('4×', '.gui-preview-head button')
  await app.sleep(200)
  app.check((await app.ev(`document.querySelector('.gui-sprite').width`)) === 800, 'GUI scale 4')

  await app.waitFor(`document.querySelector('.gui-warning')`, 10000)
  app.check(
    (await app.ev(`document.querySelector('.gui-warning').textContent`)).includes('nine-slice'),
    'warns that the vanilla nine-slice is lost without its own .png.mcmeta'
  )
  await app.shot('gui-warning')

  await app.click('Usa la scala di vanilla', '.gui-scaling button')
  await app.sleep(200)
  app.check(
    (await app.ev(`document.querySelectorAll('.gui-sprite').length`)) === 3,
    'nine-slice: the sprite and two stretched sizes'
  )
  await app.click('Salva la scala', '.gui-scaling button')
  await app.waitFor(`!document.querySelector('.gui-warning')`, 10000)
  const saved = JSON.parse(await readFile(mcmetaFile, 'utf8'))
  app.check(
    JSON.stringify(saved.gui.scaling) ===
      JSON.stringify({ type: 'nine_slice', width: 200, height: 20, border: 3 }),
    `the vanilla scaling is written (${JSON.stringify(saved.gui?.scaling)})`
  )

  // Dragging the left border line of the first sprite (GUI scale 4: 4 px per unit).
  const box = await app.ev(`(() => {
    const c = document.querySelector('.gui-sprite')
    c.scrollIntoView({ block: 'center', inline: 'start' })
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, h: r.height }
  })()`)
  const at = (units) => ({ x: box.x + units * 4 + 1, y: box.y + box.h / 2 })
  const mouse = (type, p, buttons) =>
    app.send('Input.dispatchMouseEvent', {
      type,
      x: p.x,
      y: p.y,
      button: 'left',
      buttons,
      clickCount: 1
    })
  await mouse('mouseMoved', at(3), 0)
  await mouse('mousePressed', at(3), 1)
  await mouse('mouseMoved', at(6), 1)
  await mouse('mouseMoved', at(10), 1)
  await mouse('mouseReleased', at(10), 0)
  await app.sleep(200)
  const dragged = await app.ev(`document.querySelector('[aria-label="Bordo Sinistra"]').value`)
  app.check(dragged === '10', `dragging the left line sets the border (${dragged})`)

  await app.setValue('[aria-label="Bordo Sinistra"]', '5')
  await app.sleep(200)
  await app.click('Salva la scala', '.gui-scaling button')
  await app.sleep(800)
  const edited = JSON.parse(await readFile(mcmetaFile, 'utf8'))
  app.check(
    JSON.stringify(edited.gui.scaling.border) ===
      JSON.stringify({ left: 5, top: 3, right: 3, bottom: 3 }),
    `an edited border is saved per side (${JSON.stringify(edited.gui.scaling.border)})`
  )
  await app.shot('gui-nine-slice')
}
