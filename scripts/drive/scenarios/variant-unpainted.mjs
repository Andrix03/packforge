// A name variant left as the copy the app made (found in the playtest: "Spada di Prova" looked
// the same in game): the export check warns about variants with the original's pixels.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

export default async function variantUnpainted(app) {
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'item')
  await mkdir(dir, { recursive: true })
  const sword = png(16, 16, (x, y) => (x === y ? [220, 220, 230, 255] : [0, 0, 0, 0]))
  await writeFile(join(dir, 'iron_sword.png'), sword)
  await writeFile(join(dir, 'iron_sword_excalibur.png'), sword)
  await writeFile(
    join(dir, 'iron_sword_durendal.png'),
    png(16, 16, (x, y) => (x === y ? [230, 190, 60, 255] : [0, 0, 0, 0]))
  )
  await app.openPack()
  await app.tool('Esporta')
  await app.waitFor(
    `document.querySelector('[aria-label=Esporta]')?.textContent.includes('Varianti ancora uguali')`,
    20000
  )
  const text = await app.ev(`document.querySelector('[aria-label=Esporta]').textContent`)
  app.check(text.includes('iron_sword_excalibur.png'), 'the unpainted variant is named')
  app.check(!text.includes('iron_sword_durendal.png'), 'the repainted one is not')
  await app.shot('variant-unpainted')
}
