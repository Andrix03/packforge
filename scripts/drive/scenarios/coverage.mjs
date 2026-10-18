// Phase 8 coverage report: counts per folder (gui skipped, a map for a game texture not counted
// as a texture), filters, "Apri", "Crea le mappe mancanti" → batch dialog preselected with the
// right maps ticked, and the report after the maps are made (up to 100%).
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const TEXTURES = ['assets', 'minecraft', 'textures']

async function open(app) {
  await app.click('Copertura')
  await app.waitFor(`document.querySelector('[data-testid=coverage-summary]')`)
  await app.sleep(200)
}

const summary = (app) =>
  app.ev(`document.querySelector('[data-testid=coverage-summary]').textContent`)
const rows = (app) => app.ev(`document.querySelectorAll('.coverage-row').length`)

async function filter(app, label) {
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Mostra] button')].find((b) => b.textContent.startsWith(${JSON.stringify(label)})).click()`
  )
  await app.sleep(150)
}

async function batchFromCoverage(app) {
  await app.ev(
    `[...document.querySelectorAll('.modal button')].find((b) => b.textContent.startsWith('Crea le mappe mancanti')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-summary]')`)
  await app.sleep(200)
}

async function applyBatch(app) {
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 30000)
  await app.click('Chiudi', '.modal.batch button')
  await app.sleep(1200)
}

export default async function coverage(app) {
  const root = join(app.paths.pack, ...TEXTURES)
  await mkdir(join(root, 'gui'), { recursive: true })
  await writeFile(
    join(root, 'gui', 'widgets.png'),
    png(16, 16, () => [90, 90, 90, 255])
  )
  await writeFile(
    join(root, 'block', 'cobblestone_n.png'),
    png(16, 16, () => [128, 128, 255, 255])
  )

  await app.openPack()
  await open(app)
  await app.shot('01-coverage')
  app.check(
    (await summary(app)) === 'Mappe complete: 1 di 10 texture (10%)',
    `summary: ${await summary(app)}`
  )
  const table = await app.ev(
    `[...document.querySelectorAll('.coverage-table tbody tr')].map((r) => r.textContent)`
  )
  app.check(
    table.some((r) => r.startsWith('gui (non servono)')),
    'gui is listed as not needing maps'
  )
  app.check(
    await app.ev(
      `document.querySelector('.modal').textContent.includes('1 mappa per texture del gioco')`
    ),
    'the map of a game texture is reported apart'
  )
  app.check((await rows(app)) === 9, `9 incomplete textures (${await rows(app)})`)
  await filter(app, 'Manca _n')
  app.check((await rows(app)) === 3, `3 miss only _n (${await rows(app)})`)

  // From the report to the batch dialog: 3 textures, only the relief ticked.
  await batchFromCoverage(app)
  const batchSummary = await app.ev(
    `document.querySelector('[data-testid=batch-summary]').textContent`
  )
  app.check(
    batchSummary === 'Crea 3 · sovrascrive 0 · salta 0',
    `batch preselected: ${batchSummary}`
  )
  const ticks = await app.ev(
    `[...document.querySelectorAll('.modal.batch > label.inline-check input[type=checkbox]')].map((i) => i.checked)`
  )
  app.check(ticks[0] === false && ticks[1] === true, `only "Rilievo" ticked (${ticks})`)
  await applyBatch(app)

  await open(app)
  app.check(
    (await summary(app)) === 'Mappe complete: 4 di 10 texture (40%)',
    `after the batch: ${await summary(app)}`
  )
  await filter(app, 'Senza mappe')
  app.check((await rows(app)) === 6, `6 without maps (${await rows(app)})`)
  await app.ev(
    `[...document.querySelectorAll('.coverage-row')].find((r) => r.textContent.startsWith('diamond')).querySelector('button').click()`
  )
  await app.waitFor(`document.querySelector('.editor-header')`)
  const header = await app.ev(`document.querySelector('.editor-header strong').textContent`)
  app.check(header === 'diamond', `"Apri" opens the texture (${header})`)
  await app.click('Chiudi editor')
  await app.sleep(600)

  // Everything else in one go: both maps ticked from "Tutte".
  await open(app)
  await batchFromCoverage(app)
  const all = await app.ev(`document.querySelector('[data-testid=batch-summary]').textContent`)
  app.check(all === 'Crea 12 · sovrascrive 0 · salta 0', `all missing maps planned: ${all}`)
  await applyBatch(app)
  await open(app)
  app.check(
    (await summary(app)) === 'Mappe complete: 10 di 10 texture (100%)',
    `complete: ${await summary(app)}`
  )
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.modal button')].find((b) => b.textContent.startsWith('Crea le mappe mancanti')).disabled`
    ),
    'nothing left to create'
  )
  await app.shot('02-complete')
  await app.click('Chiudi', '.modal button')
  await app.sleep(300)

  // A map of a game texture listed on its own: marked "mappa", no maps of maps anywhere.
  const badge = await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/cobblestone_n.png'))?.querySelector('.texture-badges').textContent`
  )
  app.check(badge === 'mappa', `grid marks cobblestone_n as a map (${badge})`)
  await app.click('Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch')`)
  await app.setValue('input[aria-label="Filtra texture"]', 'cobblestone')
  await app.sleep(150)
  app.check(
    (await app.ev(`document.querySelectorAll('.batch-list li').length`)) === 0,
    'the batch does not list the map file'
  )
  await app.click('Annulla', '.modal.batch button')
  await app.openTexture('cobblestone_n.png')
  app.check(
    !(await app.ev(`document.querySelector('.map-tabs')`)),
    'opening a map file offers no _n/_s of its own'
  )
  await app.click('Chiudi editor')
  await app.sleep(400)
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/cobblestone_n.png')).click()`
  )
  await app.sleep(300)
  app.check(
    await app.ev(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Varianti di colore')).disabled`
    ),
    'no color variants of a map file'
  )
}
