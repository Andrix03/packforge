// 1.3 ready-made 3D shapes: bushy leaves, grass on the sides, a 3D ladder, each written as the
// block's model and shown by the block preview.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

async function apply(app, texture, shape) {
  await app.openTexture(texture)
  await app.click('Forme 3D', '.editor button')
  await app.waitFor(`document.querySelector('[role=dialog]')`)
  if (shape) await app.click(shape, '[role=dialog] button')
  await app.click('Scrivi il modello', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`, 10000)
  await app.click('Modello del blocco', '.editor-side button')
  await app.sleep(1500)
}

async function backToPack(app) {
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
}

const model = async (app, name) =>
  JSON.parse(
    await readFile(
      join(app.paths.pack, 'assets', 'minecraft', 'models', 'block', `${name}.json`),
      'utf8'
    )
  )

export default async function blockShapes(app) {
  // Grey-green leaves with holes (tinted by the game), a ladder of two rails and four rungs.
  await writeFile(
    join(app.paths.pack, ...BLOCK, 'oak_leaves.png'),
    png(16, 16, (x, y) =>
      (x * 5 + y * 3) % 7 === 0
        ? [0, 0, 0, 0]
        : (x + y) % 3
          ? [140, 140, 140, 255]
          : [100, 100, 100, 255]
    )
  )
  await writeFile(
    join(app.paths.pack, ...BLOCK, 'ladder.png'),
    png(16, 16, (x, y) =>
      x === 2 || x === 13 || (y % 4 === 1 && x > 2 && x < 13) ? [130, 95, 50, 255] : [0, 0, 0, 0]
    )
  )
  await writeFile(
    join(app.paths.pack, ...BLOCK, 'rail.png'),
    png(16, 16, (x, y) =>
      x === 3 || x === 12 ? [150, 150, 160, 255] : y % 4 === 1 ? [110, 80, 40, 255] : [0, 0, 0, 0]
    )
  )
  await app.openPack({ waitForVanilla: true })

  await apply(app, 'oak_leaves.png', null)
  app.check((await model(app, 'oak_leaves')).elements.length === 5, 'bushy leaves: cube + 4 planes')
  await app.shot('shape-leaves')
  await backToPack(app)

  await apply(app, 'ladder.png', null)
  const ladder = await model(app, 'ladder')
  app.check(
    ladder.elements.length > 2 && ladder.elements.every((e) => e.to[2] === 16),
    `3D ladder against the wall (${ladder.elements.length} elements)`
  )
  await app.shot('shape-ladder')
  await backToPack(app)

  await apply(app, 'grass_block_top.png', 'Erba sui lati')
  const grass = await model(app, 'grass_block')
  app.check(
    grass.elements[0].faces.north.texture === '#top' &&
      grass.elements[0].faces.down.texture === '#bottom',
    'grass on the four sides, dirt underneath'
  )
  await app.shot('shape-grass')
  await backToPack(app)

  await apply(app, 'rail.png', null)
  const flat = await model(app, 'rail')
  const raised = await model(app, 'rail_raised_ne')
  app.check(
    flat.elements.every((e) => e.from[1] === 1) &&
      raised.elements.every((e) => e.rotation?.angle === 45),
    `3D rails, flat and sloped (${flat.elements.length} elements)`
  )
  await app.shot('shape-rails')
}
