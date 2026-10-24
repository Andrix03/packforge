// 1.2 overrides → items/: the pack tool reads the item models' old `overrides` and writes item
// definitions (custom model data as range_dispatch, the bow's pulling as using_item + use time);
// an item that already has a definition in the pack is left alone.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MODELS = ['assets', 'minecraft', 'models', 'item']
const ITEMS = ['assets', 'minecraft', 'items']

export default async function overrides(app) {
  const models = join(app.paths.pack, ...MODELS)
  const items = join(app.paths.pack, ...ITEMS)
  await mkdir(models, { recursive: true })
  await mkdir(items, { recursive: true })
  const write = (dir, name, json) => writeFile(join(dir, name), JSON.stringify(json, null, 2))
  await write(models, 'diamond_sword.json', {
    parent: 'minecraft:item/handheld',
    textures: { layer0: 'minecraft:item/diamond_sword' },
    overrides: [
      { predicate: { custom_model_data: 1 }, model: 'minecraft:item/ruby_sword' },
      { predicate: { custom_model_data: 2 }, model: 'minecraft:item/fire_sword' }
    ]
  })
  await write(models, 'bow.json', {
    parent: 'item/generated',
    textures: { layer0: 'item/bow' },
    overrides: [
      { predicate: { pulling: 1 }, model: 'item/bow_pulling_0' },
      { predicate: { pulling: 1, pull: 0.65 }, model: 'item/bow_pulling_1' },
      { predicate: { pulling: 1, pull: 0.9 }, model: 'item/bow_pulling_2' }
    ]
  })
  await write(models, 'apple.json', {
    parent: 'item/generated',
    textures: { layer0: 'item/apple' },
    overrides: [{ predicate: { custom_model_data: 5 }, model: 'item/golden_apple' }]
  })
  const ownApple = { model: { type: 'minecraft:model', model: 'minecraft:item/apple' } }
  await write(items, 'apple.json', ownApple)

  await app.openPack({ waitForVanilla: true })
  await app.click('Overrides in items/', '.tool-bar button')
  await app.waitFor(`document.querySelector('[data-testid=overrides-list]')`, 15000)
  const list = await app.ev(`document.querySelector('[data-testid=overrides-list]').textContent`)
  app.check(
    list.includes('diamond_sword') &&
      list.includes('bow') &&
      list.includes('ha già items/apple.json'),
    `lists the sword, the bow and the apple left alone (${list})`
  )
  await app.shot('overrides-dialog')
  await app.click('Scrivi 2 definizioni', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=overrides-result]')`, 10000)

  const read = async (name) => JSON.parse(await readFile(join(items, name), 'utf8'))
  const sword = await read('diamond_sword.json')
  app.check(
    sword.model.type === 'minecraft:range_dispatch' &&
      sword.model.property === 'minecraft:custom_model_data' &&
      sword.model.entries[0].threshold === 2 &&
      sword.model.entries[0].model.model === 'minecraft:item/fire_sword' &&
      sword.model.fallback.entries[0].model.model === 'minecraft:item/ruby_sword',
    'custom model data 2 tested first, then 1, then the sword'
  )
  const bow = await read('bow.json')
  app.check(
    JSON.stringify(bow).includes('minecraft:using_item') &&
      JSON.stringify(bow).includes('minecraft:use_duration'),
    'the bow pulls with using_item and use_duration'
  )
  app.check(
    JSON.stringify(await read('apple.json')) === JSON.stringify(ownApple),
    'the pack’s own apple definition is untouched'
  )
}
