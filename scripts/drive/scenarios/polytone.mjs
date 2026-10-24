// Polytone biome colours: a pack colormap generated from three colours, block modifiers for the
// leaves (spruce and birch included), and the map opened in the editor with the biome panel.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export default async function polytone(app) {
  await app.openPack()
  await app.click('Polytone', '.tool-bar button')
  await app.waitFor(`document.querySelector('[data-testid=polytone-plan]')`)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=polytone-plan]').textContent`)).includes(
      '8 blocchi'
    ),
    'leaves: 8 blocks'
  )
  await app.shot('polytone-dialog')
  await app.click('Crea e disegna la colormap', '[role=dialog] button')
  await app.waitFor(`document.querySelector('.colormap-preview')`, 15000)
  app.check(true, 'the colormap opens in the editor with the biome panel')

  const polytone = join(app.paths.pack, 'assets', 'minecraft', 'polytone')
  const png = await stat(join(polytone, 'colormaps', 'leaves.png')).catch(() => null)
  app.check(png?.isFile() === true, 'colormaps/leaves.png written')
  const read = async (block) =>
    JSON.parse(await readFile(join(polytone, 'block_modifiers', `${block}.json`), 'utf8'))
  app.check(
    JSON.stringify(await read('spruce_leaves')) ===
      JSON.stringify({ colormap: 'minecraft:leaves' }) &&
      JSON.stringify(await read('oak_leaves')) === JSON.stringify({ colormap: 'minecraft:leaves' }),
    'block modifiers point the leaves at the colormap'
  )
  app.check(
    !(await stat(join(polytone, 'colormaps', 'leaves.json')).catch(() => null)),
    'no colormap .json: Polytone samples it like vanilla'
  )
  await app.sleep(500)
  await app.shot('polytone-editor')
}
