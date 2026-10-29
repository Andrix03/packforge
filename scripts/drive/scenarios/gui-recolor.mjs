// 1.1 Recolour GUI: the pack's own GUI textures get the dark preset in one go; on disk the button is
// darker, its transparent corner stays transparent, and a backup was taken first.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { png } from '../fixtures.mjs'

const WIDGET = ['assets', 'minecraft', 'textures', 'gui', 'sprites', 'widget']

/** RGBA of pixel (x, y) of an 8-bit RGBA PNG written by the app (filters decoded). */
function pixelOf(bytes, x, y) {
  const width = bytes.readUInt32BE(16)
  const chunks = []
  for (let pos = 8; pos < bytes.length;) {
    const len = bytes.readUInt32BE(pos)
    if (bytes.toString('latin1', pos + 4, pos + 8) === 'IDAT')
      chunks.push(bytes.subarray(pos + 8, pos + 8 + len))
    pos += 12 + len
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  const rows = []
  for (let r = 0; r <= y; r++) {
    const f = raw[r * (stride + 1)]
    const row = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const v = raw[r * (stride + 1) + 1 + i]
      const a = i >= 4 ? row[i - 4] : 0
      const b = r > 0 ? rows[r - 1][i] : 0
      const c = i >= 4 && r > 0 ? rows[r - 1][i - 4] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      row[i] = (v + [0, a, b, (a + b) >> 1, paeth][f]) & 255
    }
    rows.push(row)
  }
  return [...rows[y].subarray(x * 4, x * 4 + 4)]
}

export default async function guiRecolor(app) {
  const dir = join(app.paths.pack, ...WIDGET)
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'button.png')
  // Light grey face, a transparent top-left corner.
  await writeFile(
    file,
    png(200, 20, (x, y) => (x === 0 && y === 0 ? [0, 0, 0, 0] : [200, 200, 200, 255]))
  )

  await app.openPack({ waitForVanilla: true })
  await app.section('gui')
  await app.waitFor(`document.querySelector('.gui-mock')`)
  await app.click('Ricolora GUI', '.gui-mock button')
  await app.waitFor(`document.querySelector('[role=dialog][aria-label="Ricolora GUI"]')`)
  const listed = await app.ev(`document.querySelectorAll('.gui-recolor-list li').length`)
  app.check(listed === 1, `lists the pack's GUI textures only (${listed})`)
  await app.waitFor(`document.querySelectorAll('.gui-recolor-pair canvas').length === 2`)
  await app.sleep(500)
  await app.shot('gui-recolor')

  await app.click('Ricolora 1', '.gui-recolor button')
  await app.waitFor(`document.querySelector('[data-testid=recolor-result]')`, 15000)
  await app.sleep(500)
  const bytes = await readFile(file)
  const face = pixelOf(bytes, 5, 5)
  const corner = pixelOf(bytes, 0, 0)
  app.check(face[0] < 120 && face[3] === 255, `the button is darker (${face.join(',')})`)
  app.check(corner[3] === 0, 'the transparent corner stays transparent')
  const backups = await app.ev(`window.api.invoke('backup:list')`)
  app.check(
    Array.isArray(backups) ? backups.length > 0 : (backups?.backups?.length ?? 0) > 0,
    'a backup was taken first'
  )
}
