// Layers (Pro mode): add, paint on top, hide, opacity, undo, merge, flatten on save.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

/** Reads pixel (x, y) of an 8-bit RGBA PNG written by PackForge (filter types decoded). */
function pngPixel(bytes, x, y) {
  const width = bytes.readUInt32BE(16)
  const chunks = []
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  let previous = new Uint8Array(stride)
  let row = null
  for (let r = 0; r <= y; r++) {
    const filter = raw[r * (stride + 1)]
    row = Uint8Array.from(raw.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1)))
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? row[i - 4] : 0
      const up = previous[i]
      const upLeft = i >= 4 ? previous[i - 4] : 0
      const p = left + up - upLeft
      const paeth =
        Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - upLeft)
          ? left
          : Math.abs(p - up) <= Math.abs(p - upLeft)
            ? up
            : upLeft
      const add = [0, left, up, (left + up) >> 1, paeth][filter]
      row[i] = (row[i] + add) & 255
    }
    previous = row
  }
  return [...row.subarray(x * 4, x * 4 + 4)]
}

export default async function layers(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.waitFor(`document.querySelector('.layers-panel')`)
  app.check(await app.ev(`document.querySelectorAll('.layer').length === 1`), 'one layer at start')

  const original = await app.editor.color(2, 2)
  await app.click('+ Nuovo', '.layer-actions button')
  app.check(
    await app.ev(`document.querySelectorAll('.layer').length === 2`),
    'a new layer is added'
  )

  await app.editor.setHex('2040e0')
  await app.editor.draw([
    [0, 2],
    [15, 2]
  ])
  app.check((await app.editor.color(2, 2)) === '#2040e0', 'painting goes on the new top layer')

  // Hide the top layer: the stone below shows again.
  await app.ev(`document.querySelector('.layer.active .layer-eye').click()`)
  app.check((await app.editor.color(2, 2)) === original, 'hiding the layer shows the one below')
  await app.editor.draw([
    [0, 5],
    [3, 5]
  ])
  app.check(
    (await app.ev(`document.querySelector('.canvas-notice')?.textContent ?? ''`)).includes(
      'nascosto'
    ),
    'painting on a hidden layer is refused with a message'
  )
  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(2, 2)) === '#2040e0', 'Ctrl+Z undoes hiding the layer')

  // Half opacity blends with the stone.
  await app.setValue('.layers-panel input[type=range]', 50)
  await app.ev(
    `document.querySelector('.layers-panel input[type=range]').dispatchEvent(new Event('blur'))`
  )
  const blended = await app.editor.color(2, 2)
  app.check(blended !== '#2040e0' && blended !== original, `50% opacity blends (${blended})`)

  await app.click('Unisci giù', '.layer-actions button')
  app.check(
    await app.ev(`document.querySelectorAll('.layer').length === 1`),
    'merge down leaves one layer'
  )
  app.check((await app.editor.color(2, 2)) === blended, 'merging keeps what you see')

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  const file = await readFile(join(app.paths.pack, 'assets/minecraft/textures/block/stone.png'))
  const saved = pngPixel(file, 2, 2)
  const hex =
    '#' +
    saved
      .slice(0, 3)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  app.check(hex === blended, `the saved PNG is the flattened image (${hex})`)
  await app.shot('layers')
}
