// Phase 11 screenshots: "📷 Screenshot" in Prova writes a PNG of the view into
// `<pack> - export/screenshots/`, the size of the canvas and not blank (a WebGL buffer read at
// the wrong time comes back empty), with effects on and off.
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

/** Distinct colors among a sample of the PNG's raw scanline bytes (not exact, enough for "blank"). */
function variety(bytes) {
  let offset = 8
  const idat = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const seen = new Set()
  for (let i = 0; i < raw.length; i += 997) seen.add(raw[i])
  return seen.size
}

const resultText = (app) =>
  app.ev(`document.querySelector('[data-testid=screenshot-result]')?.textContent ?? ''`)

async function shoot(app) {
  const before = await resultText(app)
  await app.click('Screenshot')
  const end = Date.now() + 10000
  for (;;) {
    const now = await resultText(app)
    if (now !== '' && now !== before) return now
    if (Date.now() > end) throw new Error('no screenshot result')
    await app.sleep(100)
  }
}

export default async function screenshot(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  await app.click('Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.sleep(1500)

  const first = await shoot(app)
  app.check(
    first.startsWith('Salvato: ') &&
      first.includes('pack - export') &&
      first.includes('screenshots'),
    `saved next to the pack (${first})`
  )
  const path = first.slice('Salvato: '.length)
  const bytes = await readFile(path)
  app.check(bytes.subarray(1, 4).toString() === 'PNG', 'it is a PNG')
  const canvas = await app.ev(
    `(() => { const c = document.querySelector('.test-canvas'); return [c.width, c.height] })()`
  )
  const size = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  app.check(
    size[0] === canvas[0] && size[1] === canvas[1],
    `PNG ${size.join('×')} = canvas ${canvas.join('×')}`
  )
  app.check(variety(bytes) > 20, `not blank (${variety(bytes)} distinct sampled bytes)`)

  // Effects off: the plain renderer path.
  await app.ev(
    `[...document.querySelectorAll('.test-side label')].find((l) => /Effetti/.test(l.textContent))?.querySelector('input')?.click()`
  )
  await app.sleep(1200)
  const second = await shoot(app)
  const secondPath = second.slice('Salvato: '.length)
  app.check(secondPath !== path, 'a new file each time (never overwritten)')
  app.check(variety(await readFile(secondPath)) > 20, 'effects off: not blank either')
}
