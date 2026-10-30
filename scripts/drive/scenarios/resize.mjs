// Phase 8 resize: resolution histogram, "Seleziona quelle non a 32×", refused confirmation writes
// nothing, accepted one rewrites textures + maps at 32× with exact LabPBR values, animated strip,
// lossy shrinking named in the confirmation, a 24 px texture incompatible with 32×.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']
const num = (text) => Number(String(text).split(': ')[1])

async function sizeOf(path) {
  const bytes = await readFile(path)
  return `${bytes.readUInt32BE(16)}×${bytes.readUInt32BE(20)}`
}

async function open(app) {
  await app.tool('Ridimensiona')
  await app.waitFor(`document.querySelector('[data-testid=resize-histogram]')`, 15000)
  await app.sleep(200)
}

async function untick(app, name) {
  await app.ev(`(() => {
    const row = [...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith(${JSON.stringify(name)}))
    const box = row.querySelector('input')
    if (box.checked) box.click()
  })()`)
  await app.sleep(100)
}

const summary = (app) =>
  app.ev(`document.querySelector('[data-testid=resize-summary]').textContent`)

async function run(app, accept) {
  await app.ev(
    `window.__asked = null; window.confirm = (m) => { window.__asked = m; return ${accept} }`
  )
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Ridimensiona ')).click()`
  )
  await app.sleep(1500)
  return app.ev(`window.__asked`)
}

export default async function resize(app) {
  const file = (name) => join(app.paths.pack, ...BLOCK, name)
  await writeFile(
    file('odd.png'),
    png(24, 24, () => [120, 90, 60, 255])
  )
  await app.openPack()

  await open(app)
  const histogram = await app.ev(
    `document.querySelector('[data-testid=resize-histogram]').textContent`
  )
  app.check(
    histogram.includes('16× 8') && histogram.includes('32× 1') && histogram.includes('24× 1'),
    `histogram (${histogram})`
  )
  await app.shot('01-resize')

  await app.click('Seleziona quelle non a 32×', '.modal.batch button')
  await app.sleep(100)
  app.check(
    (await summary(app)) === 'Da ridimensionare: 9, incompatibili: 1',
    `selection: ${await summary(app)}`
  )
  const oddNote = await app.ev(
    `[...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith('odd')).textContent`
  )
  app.check(oddNote.includes('non si può portare'), `24 px is incompatible with 32× (${oddNote})`)
  await untick(app, 'big')
  app.check((await summary(app)).startsWith('Da ridimensionare: 8'), 'big unticked')

  // Refused: nothing is written.
  const asked = await run(app, false)
  app.check(asked?.includes('Riscrivere 13 file a 32×'), `asks before rewriting (${asked})`)
  app.check((await sizeOf(file('stone.png'))) === '16×16', 'refused: stone still 16×16')

  // Accepted.
  await run(app, true)
  await app.waitFor(`document.querySelector('[data-testid=resize-result]')`, 20000)
  const result = await app.ev(`document.querySelector('[data-testid=resize-result]').textContent`)
  app.check(result.includes('13 file riscritti'), `rewritten (${result})`)
  await app.click('Chiudi', '.modal.batch button')
  await app.sleep(1200)
  app.check((await sizeOf(file('stone.png'))) === '32×32', 'stone.png 32×32')
  app.check(
    (await sizeOf(file('stone_n.png'))) === '32×32' &&
      (await sizeOf(file('stone_s.png'))) === '32×32',
    'its maps too'
  )
  app.check((await sizeOf(file('magma.png'))) === '32×96', 'animated strip: 32×96')
  app.check((await sizeOf(file('big.png'))) === '512×512', 'unticked big untouched')

  // Exact LabPBR values after enlarging (no blending of emission or metal codes). The 13 rewritten
  // files reload the grid first (file watcher): a double-click before that lands on an old tile.
  await app.sleep(2500)
  await app.openTexture('glowstone.png')
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.click('Emissione', '.channel-tabs [role=tab]')
  await app.sleep(200)
  const cross = num(await app.editor.color(16, 6))
  const beside = num(await app.editor.color(18, 6))
  app.check(cross === 254 && beside === 0, `emission exact: cross ${cross}, beside ${beside}`)
  await app.click('Chiudi editor')
  await app.sleep(500)

  // The validator: no size problems between textures and maps.
  await app.click('Controlla mappe')
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  const issues = await app.ev(
    `[...document.querySelectorAll('.validator-issue')].map((li) => li.textContent)`
  )
  app.check(
    !issues.some((t) => /Dimensione|Proporzioni|frame/.test(t)),
    `validator: maps match (${issues.length} issues)`
  )
  await app.click('Chiudi', '.validator button')
  await app.sleep(200)

  // Shrinking real detail is named in the confirmation.
  await open(app)
  await app.setValue('.modal.batch select[aria-label=Risoluzione]', 16)
  await app.sleep(100)
  await app.setValue('input[aria-label="Filtra texture"]', 'oak_planks')
  await app.sleep(100)
  await app.ev(`document.querySelector('.batch-list input').click()`)
  await app.sleep(100)
  const lossy = await run(app, false)
  app.check(
    lossy?.includes('perdono dettagli') && lossy.includes('oak_planks'),
    `lossy shrink named (${lossy?.replace(/\n/g, ' ')})`
  )
  app.check((await sizeOf(file('oak_planks.png'))) === '32×32', 'refused: oak_planks untouched')
}
