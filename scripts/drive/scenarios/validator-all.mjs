// Every validator check through the app, plus traps: transparent texture pixels must not raise
// value warnings (they are invisible), maps of vanilla textures, "Apri" on each kind of issue,
// "Ricontrolla" and the live update after an external fix.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']
const ITEM = ['assets', 'minecraft', 'textures', 'item']

async function issues(app) {
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  await app.sleep(200)
  return app.ev(`[...document.querySelectorAll('.validator-issue')].map((li) => ({
    severity: [...li.classList].find((c) => c !== 'validator-issue'),
    file: li.querySelector('strong').textContent,
    text: li.querySelector('p').textContent,
    open: Boolean(li.querySelector('button'))
  }))`)
}

const of = (list, file) => list.filter((i) => i.file === file)
const has = (list, file, words, severity) =>
  of(list, file).some((i) => i.text.includes(words) && (!severity || i.severity === severity))
const describe = (list, file) =>
  of(list, file)
    .map((i) => `${i.severity}: ${i.text.slice(0, 60)}`)
    .join(' | ') || 'nothing'

async function openIssue(app, file) {
  await app.ev(`[...document.querySelectorAll('.validator-issue')]
    .find((li) => li.querySelector('strong').textContent === ${JSON.stringify(file)})
    .querySelector('button').click()`)
  await app.waitFor(`document.querySelector('.editor-header')`)
  await app.sleep(400)
  const header = await app.ev(`document.querySelector('.editor-header strong').textContent`)
  await app.ev(`window.confirm = () => true`)
  await app.click('Chiudi editor')
  await app.sleep(600)
  return header
}

export default async function validatorAll(app) {
  const block = join(app.paths.pack, ...BLOCK)
  const item = join(app.paths.pack, ...ITEM)
  const write = (dir, name, content) => writeFile(join(dir, name), content)
  const glassHole = (x, y) => !(x === 0 || y === 0 || x === 15 || y === 15 || x === y)
  const diamondHole = (x, y) => Math.abs(x - 7.5) + Math.abs(y - 7.5) >= 7

  // 1. Map animation that does not divide the image.
  await write(
    block,
    'oak_planks_n.png',
    png(32, 32, () => [128, 128, 255, 255])
  )
  await write(block, 'oak_planks_n.png.mcmeta', '{"animation":{"height":20}}')
  // 2. Frame count mismatch: 2 frames on the 3-frame magma.
  await write(
    block,
    'magma_n.png',
    png(16, 32, () => [128, 128, 255, 255])
  )
  await write(block, 'magma_n.png.mcmeta', '{"animation":{"frametime":2}}')
  // 3. Smaller exact map (info).
  await write(
    block,
    'grass_block_top_n.png',
    png(8, 8, () => [128, 128, 255, 255])
  )
  // 4. Map of a vanilla texture (dirt): wiped pixels and an undefined metal code.
  await write(
    block,
    'dirt_s.png',
    png(16, 16, (x) => (x === 0 ? [0, 0, 0, 0] : x === 1 ? [200, 240, 0, 255] : [30, 10, 40, 255]))
  )
  // 5. Light on the transparent glass pixels (info only).
  await write(
    block,
    'glass_s.png',
    png(16, 16, (x, y) => (glassHole(x, y) ? [0, 10, 0, 120] : [240, 10, 0, 255]))
  )
  // 6. Some height 0 and out-of-scale normals on an opaque texture.
  await write(
    block,
    'glowstone_n.png',
    png(16, 16, (x, y) =>
      x === 3 && y === 3
        ? [128, 128, 255, 0]
        : x === 5
          ? [255, 255, 128, 255]
          : [128, 128, 255, 255]
    )
  )
  // 7. Traps: what lies under transparent texture pixels is invisible, so no warnings.
  await write(
    block,
    'glass_n.png',
    png(16, 16, (x, y) => (glassHole(x, y) ? [0, 0, 0, 0] : [128, 128, 255, 255]))
  )
  await mkdir(item, { recursive: true })
  await write(
    item,
    'diamond_s.png',
    png(16, 16, (x, y) => (diamondHole(x, y) ? [0, 0, 0, 0] : [220, 44, 0, 255]))
  )
  // 8. Map of a vanilla texture with the wrong size (dirt is 16×16 in the game).
  await write(
    block,
    'cobblestone_n.png',
    png(16, 32, () => [128, 128, 255, 255])
  )

  await app.openPack()
  await app.click('Controlla mappe')
  const list = await issues(app)
  await app.shot('01-all')

  app.check(
    has(list, 'oak_planks_n.png', 'Animazione della mappa non valida', 'error'),
    `1. invalid map animation → error (${describe(list, 'oak_planks_n.png')})`
  )
  app.check(
    has(list, 'magma_n.png', '2 frame contro i 3', 'warning'),
    `2. frame count mismatch → warning (${describe(list, 'magma_n.png')})`
  )
  app.check(
    has(list, 'grass_block_top_n.png', 'pixel netti', 'info'),
    `3. smaller exact map → info (${describe(list, 'grass_block_top_n.png')})`
  )
  app.check(
    has(list, 'dirt_s.png', 'trasparenti e neri', 'warning'),
    `4a. wiped pixels → warning (${describe(list, 'dirt_s.png')})`
  )
  app.check(has(list, 'dirt_s.png', '238 e 254', 'warning'), '4b. undefined metal code → warning')
  app.check(
    !of(list, 'dirt_s.png').some((i) => i.open),
    '4c. no "Apri" on a map of a vanilla texture'
  )
  app.check(
    of(list, 'glass_s.png').length === 1 && has(list, 'glass_s.png', 'trasparente', 'info'),
    `5. light on transparent pixels → only an info (${describe(list, 'glass_s.png')})`
  )
  app.check(
    has(list, 'glowstone_n.png', '1 pixel ha altezza 0', 'warning'),
    `6a. some height 0 → warning (${describe(list, 'glowstone_n.png')})`
  )
  app.check(
    has(list, 'glowstone_n.png', 'fuori scala', 'warning'),
    '6b. out-of-scale normals → warning'
  )
  app.check(
    of(list, 'glass_n.png').length === 0,
    `7a. glass_n: nothing under transparent pixels (${describe(list, 'glass_n.png')})`
  )
  app.check(
    of(list, 'diamond_s.png').length === 0,
    `7b. item diamond_s: nothing under transparent pixels (${describe(list, 'diamond_s.png')})`
  )
  app.check(
    has(list, 'cobblestone_n.png', 'Proporzioni', 'error'),
    `8. vanilla texture size is used (${describe(list, 'cobblestone_n.png')})`
  )
  const good = ['stone_n.png', 'stone_s.png', 'gold_block_s.png', 'glowstone_s.png', 'sand_s.png']
  app.check(
    list.every((i) => !good.includes(i.file)),
    'the good fixture maps stay quiet'
  )

  // "Apri" opens the texture of the map, not the map.
  app.check((await openIssue(app, 'magma_n.png')) === 'magma', '"Apri" on magma_n opens magma')
  await app.click('Controlla mappe')
  await issues(app)
  app.check(
    (await openIssue(app, 'glowstone_n.png')) === 'glowstone',
    '"Apri" on glowstone_n opens glowstone'
  )

  // Ricontrolla after an external fix; then a live fix while the dialog is open.
  await app.click('Controlla mappe')
  await issues(app)
  await write(
    block,
    'grass_block_top_n.png',
    png(16, 16, () => [128, 128, 255, 255])
  )
  await app.sleep(1500)
  const live = await issues(app)
  app.check(
    of(live, 'grass_block_top_n.png').length === 0,
    `the dialog follows an external fix (${describe(live, 'grass_block_top_n.png')})`
  )
  await write(
    block,
    'magma_n.png',
    png(16, 48, () => [128, 128, 255, 255])
  )
  await app.click('Ricontrolla')
  const again = await issues(app)
  app.check(
    of(again, 'magma_n.png').length === 0,
    `Ricontrolla sees the fixed magma_n (${describe(again, 'magma_n.png')})`
  )
  await app.shot('02-after-fixes')
  await app.click('Chiudi', '.validator button')
  await app.sleep(200)
  app.check(!(await app.ev(`document.querySelector('.validator')`)), 'Chiudi closes the dialog')
}
