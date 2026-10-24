// 1.2 "variant by name": on an item texture the dialog writes a copy of the texture, its model
// (the item's model with the new texture) and the item definition with a select on the anvil
// name, then opens the copy. The pack is moved to 1.21.5+ (the select needs it).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const ITEM = ['assets', 'minecraft', 'textures', 'item']

async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
    })()`)
    await app.sleep(150)
  }
}

export default async function nameVariant(app) {
  await writeFile(
    join(app.paths.pack, 'pack.mcmeta'),
    JSON.stringify({ pack: { description: 'Test', min_format: 75, max_format: 94 } })
  )
  const dir = join(app.paths.pack, ...ITEM)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'diamond_sword.png'),
    png(16, 16, (x, y) => (x + y === 15 ? [80, 220, 230, 255] : [0, 0, 0, 0]))
  )

  await app.openPack({ waitForVanilla: true })
  await openFolder(app, ITEM.join('/'))
  await app.openTexture('diamond_sword.png')
  await app.click('Variante per nome', '.editor button')
  await app.waitFor(`document.querySelector('[aria-label="Nome nell’incudine"]')`)
  await app.setValue('[aria-label="Nome nell’incudine"]', 'Excalibur')
  await app.waitFor(`document.querySelector('[data-testid=variant-plan]')`)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=variant-plan]').textContent`)).includes(
      'diamond_sword_excalibur.png'
    ),
    'the plan names the variant files'
  )
  await app.shot('name-variant-dialog')
  await app.click('Crea la variante e disegnala', '[role=dialog] button')
  await app.waitFor(
    `document.querySelector('.editor-header')?.textContent.includes('diamond_sword_excalibur')`,
    15000
  )
  app.check(true, 'the new texture opens in the editor')

  const read = async (...parts) =>
    JSON.parse(await readFile(join(app.paths.pack, 'assets', 'minecraft', ...parts), 'utf8'))
  const definition = await read('items', 'diamond_sword.json')
  app.check(
    definition.model.property === 'minecraft:component' &&
      definition.model.component === 'minecraft:custom_name' &&
      definition.model.cases[0].when === 'Excalibur' &&
      definition.model.cases[0].model.model === 'minecraft:item/diamond_sword_excalibur' &&
      definition.model.fallback.model === 'minecraft:item/diamond_sword',
    'the definition picks the variant by name, the vanilla sword otherwise'
  )
  const model = await read('models', 'item', 'diamond_sword_excalibur.json')
  app.check(
    model.parent === 'minecraft:item/handheld' &&
      model.textures.layer0 === 'minecraft:item/diamond_sword_excalibur',
    `the variant model is the sword model with the new texture (${JSON.stringify(model)})`
  )
  await app.waitFor(
    `document.querySelector('[data-testid=item-models]')?.textContent.includes('diamond_sword_excalibur')`,
    10000
  )
  app.check(true, 'the item preview opens on the named variant')
  await app.sleep(600)
  await app.shot('name-variant-preview')
}
