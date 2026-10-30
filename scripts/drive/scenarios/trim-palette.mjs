// A trim pattern painted with greys outside trim_base stays uncoloured in game (found in the
// playtest): the armour preview says so, and a pattern with the right greys gets no warning.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

export default async function trimPalette(app) {
  const at = (...p) => join(app.paths.pack, 'assets', 'minecraft', ...p)
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'trims', 'entity', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'palettes', 'trim'), { recursive: true })
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid', 'iron.png'),
    png(64, 32, (x, y) => (y < 16 || x < 56 ? [150, 160, 175, 255] : [0, 0, 0, 0]))
  )
  await writeFile(
    at('textures', 'palettes', 'trim_base.png'),
    png(8, 1, (x) => [224 - x * 32, 224 - x * 32, 224 - x * 32, 255])
  )
  await writeFile(
    at('textures', 'palettes', 'trim', 'jade.png'),
    png(8, 1, (x) => [40, 240 - x * 25, 110, 255])
  )
  // "good" uses the base greys; "white" the 255 white of the playtest.
  const stripe = (color) =>
    png(64, 32, (x, y) => (y === 22 && x >= 20 && x < 28 ? color : [0, 0, 0, 0]))
  await writeFile(
    at('textures', 'trims', 'entity', 'humanoid', 'good.png'),
    stripe([224, 224, 224, 255])
  )
  await writeFile(
    at('textures', 'trims', 'entity', 'humanoid', 'white.png'),
    stripe([255, 255, 255, 255])
  )

  await app.openPack()
  await app.section('armor')
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-preview canvas')`)
  const pick = async (pattern) => {
    await app.setValue('.armor-choices label:nth-child(1) select', pattern)
    await app.waitFor(`document.querySelectorAll('.armor-choices select').length === 2`)
    await app.setValue('.armor-choices label:nth-child(2) select', 'jade')
    await app.sleep(600)
  }
  await pick('good')
  app.check(
    await app.ev(`!document.querySelector('[data-testid=trim-off-palette]')`),
    'a pattern painted with the base greys: no warning'
  )
  await pick('white')
  await app.waitFor(`document.querySelector('[data-testid=trim-off-palette]')`, 5000)
  const text = await app.ev(`document.querySelector('[data-testid=trim-off-palette]').textContent`)
  app.check(text.startsWith('8 pixel'), `a white pattern: warned (${text.slice(0, 60)})`)
  await app.shot('trim-off-palette')
}
