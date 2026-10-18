// Phase 8 color variants: white_wool (with _n/_s) → every color, game colors when the jar has the
// variant, existing textures left alone unless overwrite is confirmed, maps copied, an animated
// texture's .mcmeta copied to the variants and their maps, names for a texture without a dye.
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

async function select(app, fileName) {
  const found = await app.ev(`(() => {
    const tile = [...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/' + ${JSON.stringify(fileName)}))
    tile?.click()
    return Boolean(tile)
  })()`)
  if (!found) throw new Error(`no tile ${fileName}`)
  await app.sleep(300)
}

async function openDialog(app) {
  await app.click('Varianti di colore')
  await app.waitFor(`document.querySelectorAll('.variant canvas').length === 16`, 10000)
  await app.sleep(400)
}

const createLabel = (app) =>
  app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Crea')).textContent`
  )

async function create(app) {
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Crea')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=variants-result]')`, 20000)
  const result = await app.ev(`document.querySelector('[data-testid=variants-result]').textContent`)
  await app.click('Chiudi', '.modal.batch button')
  await app.sleep(800)
  return result
}

export default async function variants(app) {
  const block = join(app.paths.pack, ...BLOCK)
  const file = (name) => join(block, name)
  const exists = (name) =>
    stat(file(name)).then(
      () => true,
      () => false
    )
  await writeFile(
    file('white_wool.png'),
    png(16, 16, (x, y) => {
      const v = 225 + ((x * 5 + y * 3) % 4) * 7
      return [v, v, v - 4, 255]
    })
  )
  await writeFile(
    file('white_wool_n.png'),
    png(16, 16, () => [128, 128, 255, 200])
  )
  await writeFile(
    file('white_wool_s.png'),
    png(16, 16, () => [15, 10, 38, 255])
  )
  await writeFile(
    file('red_wool.png'),
    png(16, 16, () => [160, 40, 35, 255])
  )
  await writeFile(
    file('white_concrete.png'),
    png(16, 32, (x, y) => (y < 16 ? [207, 213, 214, 255] : [190, 196, 197, 255]))
  )
  await writeFile(file('white_concrete.png.mcmeta'), '{"animation":{"frametime":3}}')
  const redBefore = (await stat(file('red_wool.png'))).mtimeMs

  await app.openPack()
  await select(app, 'white_wool.png')
  await openDialog(app)
  await app.shot('01-wool-dialog')
  const tiles = await app.ev(`[...document.querySelectorAll('.variant')].map((v) => ({
    name: v.querySelector('span.small').textContent,
    checked: v.querySelector('input').checked,
    disabled: v.querySelector('input').disabled,
    badge: v.querySelector('.badge')?.textContent ?? '',
    title: v.title
  }))`)
  const tile = (name) => tiles.find((t) => t.name === name)
  app.check(
    tile('white_wool')?.badge === 'originale' && tile('white_wool').disabled,
    'the source is marked original'
  )
  app.check(
    tile('red_wool')?.badge === 'esiste già' && !tile('red_wool').checked,
    'an existing variant starts unchecked'
  )
  app.check(
    tile('light_blue_wool') && tile('light_gray_wool') && tile('blue_wool'),
    'names: light_blue / light_gray / blue'
  )
  app.check(
    tile('orange_wool')?.title.includes('colore del gioco'),
    `game color used when the jar has the variant (${tile('orange_wool')?.title})`
  )
  app.check(
    (await createLabel(app)) === 'Crea 14 texture',
    `14 to create (${await createLabel(app)})`
  )

  const result = await create(app)
  app.check(result.includes('14 texture create'), `created (${result})`)
  app.check(
    (await exists('orange_wool.png')) &&
      (await exists('orange_wool_n.png')) &&
      (await exists('light_blue_wool_s.png')),
    'variants and their maps written'
  )
  app.check((await stat(file('red_wool.png'))).mtimeMs === redBefore, 'red_wool left alone')

  // Colors in the editor.
  await app.openTexture('orange_wool.png')
  const orange = await app.editor.color(5, 5)
  await app.click('Chiudi editor')
  await app.sleep(500)
  await app.openTexture('black_wool.png')
  const black = await app.editor.color(5, 5)
  await app.click('Chiudi editor')
  await app.sleep(500)
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [or, og, ob] = rgb(orange)
  app.check(or > og && og > ob && or > 200, `orange_wool is orange (${orange})`)
  app.check(Math.max(...rgb(black)) < 70, `black_wool is dark (${black})`)

  // Overwrite: refused leaves red_wool, accepted rewrites it.
  await select(app, 'white_wool.png')
  await openDialog(app)
  app.check((await createLabel(app)) === 'Crea 0 texture', 'everything exists: nothing to create')
  await app.ev(
    `[...document.querySelectorAll('.variant')].find((v) => v.textContent.includes('red_wool')).querySelector('input').click()`
  )
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.includes('Sovrascrivi')).querySelector('input').click()`
  )
  await app.sleep(150)
  app.check((await createLabel(app)) === 'Crea 1 texture', 'overwrite red_wool: 1')
  await app.ev(
    `window.__asked = null; window.confirm = (m) => { window.__asked = m; return false }`
  )
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Crea')).click()`
  )
  await app.sleep(500)
  app.check(
    (await app.ev(`window.__asked`))?.includes('Sovrascrivere 1 texture'),
    'overwrite asks first'
  )
  app.check((await stat(file('red_wool.png'))).mtimeMs === redBefore, 'refused: red_wool untouched')
  await app.ev(`window.confirm = () => true`)
  await create(app)
  app.check(
    (await stat(file('red_wool.png'))).mtimeMs !== redBefore,
    'accepted: red_wool rewritten'
  )

  // Animated concrete: the .mcmeta goes with the variants.
  await select(app, 'white_concrete.png')
  await openDialog(app)
  await create(app)
  app.check(await exists('lime_concrete.png.mcmeta'), 'animated: lime_concrete.png.mcmeta written')
  if (await exists('lime_concrete.png.mcmeta')) {
    const meta = JSON.parse(await readFile(file('lime_concrete.png.mcmeta'), 'utf8'))
    app.check(meta.animation?.frametime === 3, 'with the same animation')
  }

  // A texture without a dye in its name gets the dye as a prefix.
  await select(app, 'stone.png')
  await openDialog(app)
  const names = await app.ev(
    `[...document.querySelectorAll('.variant span.small')].map((s) => s.textContent)`
  )
  app.check(
    names.includes('red_stone') && names.includes('light_blue_stone'),
    'stone → red_stone, light_blue_stone'
  )
  app.check(!names.includes('stone'), 'no variant overwrites the source')
  await app.shot('02-stone-dialog')
  await app.click('Annulla', '.modal.batch button')

  // A 512×512 texture: previews come from a small copy, the dialog stays responsive.
  await select(app, 'big.png')
  const t0 = Date.now()
  await openDialog(app)
  const openMs = Date.now() - t0
  app.check(openMs < 3000, `big texture: dialog ready in ${openMs} ms`)
  const t1 = Date.now()
  await app.setValue('.modal.batch input[aria-label=Contrasto]', 50)
  await app.ev(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`)
  const slideMs = Date.now() - t1
  app.check(slideMs < 500, `big texture: slider answers in ${slideMs} ms`)
  await app.click('Annulla', '.modal.batch button')

  // The validator is fine with the copied maps.
  await app.click('Controlla mappe')
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  const flagged = await app.ev(
    `[...document.querySelectorAll('.validator-issue strong')].map((s) => s.textContent)`
  )
  app.check(
    !flagged.some((f) => /_wool_[ns]\.png$/.test(f)),
    `validator quiet on the copied maps (${flagged.join(', ')})`
  )
}
