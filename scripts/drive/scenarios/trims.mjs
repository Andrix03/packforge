// 1.2 armor trims: on an armor texture a trim pattern and material can be put on the player; a
// trim pattern opens on vanilla iron armor with a material; a material palette opens on a vanilla
// pattern. Patterns are painted in the trim_base greys (224, 192 … 0), palettes are 8×1.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const TEXTURES = ['assets', 'minecraft', 'textures']

async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    // Already open folders stay open: click only the closed ones.
    await app.ev(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
    })()`)
    await app.sleep(150)
  }
}

const select = (n) => `.armor-choices label:nth-child(${n}) select`
const value = (app, n) => app.ev(`document.querySelector('${select(n)}')?.value`)
const options = (app, n) =>
  app.ev(`[...document.querySelector('${select(n)}').options].map((o) => o.value)`)

async function backToPack(app) {
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
}

export default async function trims(app) {
  const pack = (...parts) => join(app.paths.pack, ...TEXTURES, ...parts)
  await mkdir(pack('entity', 'equipment', 'humanoid'), { recursive: true })
  await mkdir(pack('trims', 'entity', 'humanoid'), { recursive: true })
  await mkdir(pack('palettes', 'trim'), { recursive: true })
  // Plain blue armor on every part.
  await writeFile(
    pack('entity', 'equipment', 'humanoid', 'iron.png'),
    png(64, 32, (x, y) => (y < 16 || x < 56 ? [70, 90, 160, 255] : [0, 0, 0, 0]))
  )
  // A stripe across the chest front and the helmet's front brow, in two base greys.
  await writeFile(
    pack('trims', 'entity', 'humanoid', 'stripe.png'),
    png(64, 32, (x, y) => {
      if (x >= 20 && x < 28 && y >= 22 && y < 25) return [224, 224, 224, 255]
      if (x >= 8 && x < 16 && y === 9) return [128, 128, 128, 255]
      return [0, 0, 0, 0]
    })
  )
  // A material: bright to dark greens.
  await writeFile(
    pack('palettes', 'trim', 'jade.png'),
    png(8, 1, (x) => [40, 240 - x * 25, 90, 255])
  )

  await app.openPack({ waitForVanilla: true })
  await openFolder(app, [...TEXTURES, 'entity', 'equipment', 'humanoid'].join('/'))
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-choices select')`)
  app.check((await value(app, 1)) === '', 'armor opens without a trim')
  const patterns = await options(app, 1)
  app.check(
    patterns.includes('stripe') && patterns.includes('sentry'),
    `trims from the pack and vanilla (${patterns.length - 1})`
  )
  await app.setValue(select(1), 'stripe')
  await app.waitFor(`document.querySelectorAll('.armor-choices select').length === 2`)
  const materials = await options(app, 2)
  app.check(
    materials.includes('jade') && materials.includes('gold') && !materials.includes('gold_darker'),
    `materials from the pack and vanilla, no _darker (${materials.join(', ')})`
  )
  await app.setValue(select(2), 'jade')
  await app.sleep(800)
  await app.shot('trim-on-armor')
  await backToPack(app)

  await openFolder(app, [...TEXTURES, 'trims', 'entity', 'humanoid'].join('/'))
  await app.openTexture('stripe.png')
  await app.waitFor(`document.querySelector('.armor-preview')`)
  app.check(
    (await app.ev(`document.querySelector('.armor-preview .lbl').textContent`)) ===
      'Anteprima rifinitura',
    'a trim pattern gets the trim preview'
  )
  app.check((await value(app, 1)) === 'iron', `on iron armor (${await value(app, 1)})`)
  // A new brow pixel in the darkest base grey: shows live in the material's darkest colour.
  await app.editor.setHex('#000000')
  await app.editor.draw([
    [10, 8],
    [13, 8]
  ])
  await app.sleep(600)
  await app.shot('trim-pattern')
  await app.key('s', ['ctrl'])
  await app.sleep(500)
  await backToPack(app)

  await openFolder(app, [...TEXTURES, 'palettes', 'trim'].join('/'))
  await app.openTexture('jade.png')
  await app.waitFor(`document.querySelector('.armor-preview')`)
  app.check(
    (await value(app, 2)) === 'sentry',
    `a palette opens on a vanilla pattern (${await value(app, 2)})`
  )
  app.check(await app.ev(`!document.querySelector('.armor-map')`), 'no part map for an 8×1 palette')
  await app.sleep(800)
  await app.shot('trim-palette')
}
