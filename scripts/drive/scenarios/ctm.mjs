// Phase 9 CTM generator: glass → 47 tiles + glass.properties, pixels checked in the written PNGs
// (tile 0 = the original, 26 = no frame, 1 = no right frame), overwrite asks first, stone gets
// its _n/_s tiles too, an animated texture is refused.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const CTM = ['assets', 'minecraft', 'optifine', 'ctm']

/** Minimal PNG reader for the RGBA8 files PackForge writes (all filter types). */
async function readPng(path) {
  const bytes = await readFile(path)
  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
    } else if (type === 'IDAT') idat.push(body)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter]
      out[y * stride + x] = (line[x] + predictor) & 255
    }
  }
  return {
    width,
    height,
    data: out,
    at: (x, y) => [...out.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)]
  }
}

async function select(app, fileName) {
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/' + ${JSON.stringify(fileName)})).click()`
  )
  await app.sleep(300)
}

async function openDialog(app) {
  await app.tool('Texture connesse')
  await app.waitFor(`document.querySelector('[aria-label="Texture connesse"]')`)
  await app.sleep(500)
}

async function create(app) {
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Texture connesse"] button')].find((b) => b.textContent.startsWith('Crea i 47')).click()`
  )
}

export default async function ctm(app) {
  const ctmDir = join(app.paths.pack, ...CTM)
  const exists = (path) =>
    stat(path).then(
      () => true,
      () => false
    )
  await app.openPack()

  await select(app, 'glass.png')
  await openDialog(app)
  app.check(
    (await app.ev(`document.querySelectorAll('.ctm-wall, .ctm-sheet').length`)) === 2,
    'wall and tile-sheet previews'
  )
  const sheet = await app.ev(
    `(() => { const c = document.querySelector('.ctm-sheet'); return c.width + '×' + c.height })()`
  )
  app.check(sheet === '192×64', `sheet is 12×4 tiles of 16 px (${sheet})`)
  await app.shot('01-glass')
  await create(app)
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  const result = await app.ev(`document.querySelector('[data-testid=ctm-result]').textContent`)
  app.check(
    result.includes('47 tile scritti in assets/minecraft/optifine/ctm/glass'),
    `written (${result})`
  )
  await app.click('Chiudi', '[aria-label="Texture connesse"] button')
  await app.sleep(800)

  const properties = await readFile(join(ctmDir, 'glass', 'glass.properties'), 'utf8')
  app.check(
    properties.includes('method=ctm') &&
      properties.includes('matchTiles=glass') &&
      properties.includes('tiles=0-46'),
    'glass.properties: method, matchTiles, tiles'
  )
  const original = await readPng(
    join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block', 'glass.png')
  )
  const t0 = await readPng(join(ctmDir, 'glass', '0.png'))
  const t1 = await readPng(join(ctmDir, 'glass', '1.png'))
  const t26 = await readPng(join(ctmDir, 'glass', '26.png'))
  const t46 = await exists(join(ctmDir, 'glass', '46.png'))
  app.check(t46, 'all 47 files (0–46)')
  app.check(
    Buffer.from(t0.data).equals(Buffer.from(original.data)),
    'tile 0 (alone) = the original'
  )
  app.check(
    t26.at(0, 5)[3] === 0 && t26.at(15, 5)[3] === 0 && t26.at(5, 0)[3] === 0,
    'tile 26 (all sides) has no frame'
  )
  app.check(
    t1.at(15, 5)[3] === 0 && t1.at(0, 5)[3] === 255,
    'tile 1 (right) drops only the right frame'
  )
  app.check(t1.at(15, 0)[3] === 255, 'tile 1: the top frame runs on through the corner')

  // Overwrite asks; refused leaves the files.
  const before = (await stat(join(ctmDir, 'glass', '0.png'))).mtimeMs
  await select(app, 'glass.png')
  await openDialog(app)
  app.check(
    await app.ev(
      `document.querySelector('[aria-label="Texture connesse"]').textContent.includes('esiste già')`
    ),
    'the dialog says the folder exists'
  )
  await app.ev(
    `window.__asked = null; window.confirm = (m) => { window.__asked = m; return false }`
  )
  await create(app)
  await app.sleep(500)
  app.check((await app.ev(`window.__asked`))?.includes('sovrascrivere'), 'overwrite asks first')
  app.check(
    (await stat(join(ctmDir, 'glass', '0.png'))).mtimeMs === before,
    'refused: tiles untouched'
  )
  await app.click('Annulla', '[aria-label="Texture connesse"] button')
  await app.sleep(200)

  // Stone has _n and _s: their tiles are made too.
  await select(app, 'stone.png')
  await openDialog(app)
  app.check(
    await app.ev(
      `[...document.querySelectorAll('[aria-label="Texture connesse"] label')].find((l) => l.textContent.includes('_n e _s'))?.querySelector('input').checked`
    ),
    'maps option on for a texture with maps'
  )
  await create(app)
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 30000)
  const stoneResult = await app.ev(`document.querySelector('[data-testid=ctm-result]').textContent`)
  app.check(stoneResult.includes('141 tile scritti'), `47 tiles × 3 files (${stoneResult})`)
  await app.click('Chiudi', '[aria-label="Texture connesse"] button')
  await app.sleep(500)
  const n0 = await readPng(join(ctmDir, 'stone', '0_n.png'))
  const stoneN = await readPng(
    join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block', 'stone_n.png')
  )
  app.check(Buffer.from(n0.data).equals(Buffer.from(stoneN.data)), '0_n.png = stone_n.png (alone)')
  app.check(await exists(join(ctmDir, 'stone', '46_s.png')), '46_s.png written')

  // An animated strip is refused.
  await select(app, 'magma.png')
  await openDialog(app)
  app.check(
    await app.ev(
      `document.querySelector('[aria-label="Texture connesse"]').textContent.includes('quadrata')`
    ),
    'animated texture: explained'
  )
  app.check(
    await app.ev(
      `[...document.querySelectorAll('[aria-label="Texture connesse"] button')].find((b) => b.textContent.startsWith('Crea i 47')).disabled`
    ),
    'animated texture: Crea disabled'
  )
}
