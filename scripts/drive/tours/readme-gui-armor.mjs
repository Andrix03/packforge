// README GIF "GUI and armour": frames named NNN-<ms> for scripts/make-demo-gif.mjs. Only textures
// drawn here (no Mojang art); English interface.
//   npm run drive -- scripts/drive/tours/readme-gui-armor.mjs
//   node scripts/make-demo-gif.mjs <shots folder> 880 .github/assets/gui-armor.gif
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'
import { createDemo } from '../demo.mjs'

export const options = { language: 'en' }

async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const b = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (b.getAttribute('aria-expanded') !== 'true') b.click()
    })()`)
    await app.sleep(150)
  }
}

export default async function tour(app) {
  const demo = createDemo(app)
  let n = 0
  const frame = async (ms, caption) => {
    if (caption) await demo.say(caption, 0)
    await app.sleep(300)
    await app.shot(`${String(n++).padStart(3, '0')}-${ms}`)
  }
  const at = (...p) => join(app.paths.pack, 'assets', 'minecraft', ...p)
  await mkdir(at('textures', 'gui', 'sprites', 'widget'), { recursive: true })
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid_leggings'), { recursive: true })
  await mkdir(at('textures', 'trims', 'entity', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'palettes', 'trim'), { recursive: true })

  // A bevelled stone button with a gold frame.
  await writeFile(
    at('textures', 'gui', 'sprites', 'widget', 'button.png'),
    png(200, 20, (x, y) =>
      x < 1 || y < 1 || x > 198 || y > 18
        ? [40, 30, 10, 255]
        : x < 3 || y < 3 || x > 196 || y > 16
          ? [214, 170, 60, 255]
          : [88 + ((x * 7 + y * 13) % 9), 92 + ((x * 5 + y * 3) % 7), 104, 255]
    )
  )
  await writeFile(
    at('textures', 'gui', 'sprites', 'widget', 'button.png.mcmeta'),
    JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } })
  )
  // Steel armour with darker seams, and leggings.
  const armor = (base) =>
    png(64, 32, (x, y) => {
      const used = y < 16 || x < 56
      if (!used) return [0, 0, 0, 0]
      const seam = x % 8 === 0 || y % 8 === 0
      const v = (x * 11 + y * 7) % 13
      return seam ? base.map((c) => c * 0.55).concat(255) : base.map((c) => c - v).concat(255)
    })
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid', 'iron.png'),
    armor([150, 160, 175])
  )
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid_leggings', 'iron.png'),
    armor([120, 130, 150])
  )
  // Trim: our own base palette (8 greys), a chevron pattern and an emerald-like material.
  await writeFile(
    at('textures', 'palettes', 'trim_base.png'),
    png(8, 1, (x) => [224 - x * 32, 224 - x * 32, 224 - x * 32, 255])
  )
  await writeFile(
    at('textures', 'trims', 'entity', 'humanoid', 'chevron.png'),
    png(64, 32, (x, y) => {
      const chest =
        x >= 20 && x < 28 && y >= 20 && y < 32 && Math.floor(Math.abs(x - 23.5)) + 20 === y - 1
      const brow = x >= 8 && x < 16 && y === 9
      const boots = y === 29 && x < 16
      return chest || brow || boots
        ? [224, 224, 224, 255]
        : x >= 20 && x < 28 && y === 22
          ? [160, 160, 160, 255]
          : [0, 0, 0, 0]
    })
  )
  await writeFile(
    at('textures', 'palettes', 'trim', 'jade.png'),
    png(8, 1, (x) => [40, 240 - x * 25, 110, 255])
  )

  await app.openPack()
  await openFolder(app, 'assets/minecraft/textures/gui/sprites/widget')
  await app.openTexture('button.png')
  await app.waitFor(`document.querySelectorAll('.gui-sprite').length === 3`)
  await app.click('2×', '.gui-preview-head button')
  await frame(2500, 'GUI sprites: the nine-slice as the game stretches it, at GUI scale 1 to 4')

  // Drag the left border line of the first sprite.
  const box = await app.ev(
    `(() => { const r = document.querySelector('.gui-sprite').getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2 } })()`
  )
  const mouse = (type, x, buttons) =>
    app.send('Input.dispatchMouseEvent', {
      type,
      x,
      y: box.y,
      button: 'left',
      buttons,
      clickCount: 1
    })
  await demo.say('Drag the guide lines to set the borders', 0)
  await mouse('mouseMoved', box.x + 7, 0)
  await mouse('mousePressed', box.x + 7, 1)
  for (const dx of [12, 18, 24]) {
    await mouse('mouseMoved', box.x + dx, 1)
    await demo.dot({ x: box.x + dx, y: box.y })
    await frame(500)
  }
  await mouse('mouseReleased', box.x + 24, 0)
  await frame(1500)

  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await openFolder(app, 'assets/minecraft/textures/entity/equipment/humanoid')
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-preview canvas')`)
  await app.sleep(800)
  await frame(2500, 'Armour on a 3D player, live while you paint')
  const view = await app.ev(
    `(() => { const r = document.querySelector('.armor-view').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
  )
  const turn = async (dx) => {
    await app.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: view.x,
      y: view.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    })
    await app.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: view.x + dx,
      y: view.y,
      button: 'left',
      buttons: 1
    })
    await app.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: view.x + dx,
      y: view.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    })
  }
  await app.setValue('.armor-choices label:nth-child(1) select', 'chevron')
  await app.waitFor(`document.querySelectorAll('.armor-choices select').length === 2`)
  await app.setValue('.armor-choices label:nth-child(2) select', 'jade')
  await app.sleep(800)
  await frame(2200, 'Trims coloured like the game: pick a pattern and a material')
  for (const dx of [70, 70, 70, 70]) {
    await turn(dx)
    await frame(450)
  }
  await frame(1500)
}
