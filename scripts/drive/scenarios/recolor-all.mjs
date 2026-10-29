// 1.4 recolour any textures: from the pack tools the recolour works on a texture folder (blocks
// here): the textures change, their LabPBR maps don't.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function recolorAll(app) {
  const block = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block')
  const read = (name) => readFile(join(block, name))
  const [stone, stoneN] = await Promise.all([read('stone.png'), read('stone_n.png')])

  await app.openPack()
  await app.tool('Ricolora texture')
  await app.waitFor(`document.querySelector('.gui-recolor')`)
  app.check(
    (await app.ev(`document.querySelector('[aria-label="Quali texture"]').value`)) === 'block',
    'starts on the folder with most textures (block)'
  )
  const listed = await app.ev(
    `[...document.querySelectorAll('.gui-recolor-list li')].map((li) => li.textContent).join('|')`
  )
  app.check(
    listed.includes('block/stone.png') && !listed.includes('stone_n'),
    'lists the textures, not their maps'
  )
  await app.click('Caldo', '[role=dialog] button')
  await app.shot('recolor-all')
  await app.click('Ricolora', '[role=dialog] .primary')
  await app.waitFor(
    `document.querySelector('.gui-recolor')?.textContent.includes('texture ricolorate')`,
    20000
  )
  const [after, afterN] = await Promise.all([read('stone.png'), read('stone_n.png')])
  app.check(!after.equals(stone), 'stone.png recoloured')
  app.check(afterN.equals(stoneN), 'stone_n.png untouched')
}
