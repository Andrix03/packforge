// Phase 8 batch apply: filter + select textures, material (_s) and relief (_n) together, an
// animated texture (its maps get a .png.mcmeta), existing maps skipped by default, overwrite only
// after a confirmation (refused = nothing written), values checked in the editor, validator clean.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']
const num = (text) => Number(String(text).split(': ')[1])

async function open(app) {
  await app.click('Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch')`)
  await app.sleep(200)
}

async function summary(app) {
  return app.ev(`document.querySelector('[data-testid=batch-summary]').textContent`)
}

/** Ticks the texture whose row starts with `name` (the folder follows the name). */
async function tick(app, name, on = true) {
  const done = await app.ev(`(() => {
    const row = [...document.querySelectorAll('.batch-list label')]
      .find((l) => l.textContent.startsWith(${JSON.stringify(name + 'block')}))
    if (!row) return false
    const box = row.querySelector('input')
    if (box.checked !== ${on}) box.click()
    return true
  })()`)
  if (!done) throw new Error(`no texture row ${name}`)
}

async function applyAndWait(app) {
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 20000)
  const result = await app.ev(`document.querySelector('[data-testid=batch-result]').textContent`)
  await app.click('Chiudi', '.modal.batch button')
  await app.sleep(800)
  return result
}

async function editorValue(app, texture, channel, x, y) {
  await app.openTexture(texture)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.click(channel, '.channel-tabs [role=tab]')
  await app.sleep(200)
  const value = num(await app.editor.color(x, y))
  await app.click('Chiudi editor')
  await app.sleep(600)
  return value
}

export default async function batch(app) {
  const file = (name) => join(app.paths.pack, ...BLOCK, name)
  const exists = (name) =>
    stat(file(name)).then(
      () => true,
      () => false
    )
  await app.openPack()

  // 1. The dialog opens with the current folder selected; "Nessuna" empties it.
  await open(app)
  const title = await app.ev(
    `document.querySelector('.modal.batch .wizard-head .muted').textContent`
  )
  app.check(
    /^\d+ di \d+ texture/.test(title) && !title.startsWith('0 '),
    `current folder preselected (${title})`
  )
  await app.click('Nessuna', '.modal.batch button')
  await app.sleep(100)
  app.check((await summary(app)).includes('Crea 0'), 'Nessuna: nothing to do')
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).disabled`
    ),
    'Applica disabled with nothing to do'
  )

  // 2. Filter "planks", wood material + relief.
  await app.setValue('input[aria-label="Filtra texture"]', 'planks')
  await app.sleep(150)
  const rows = await app.ev(`document.querySelectorAll('.batch-list li').length`)
  app.check(rows === 1, `the filter narrows the list (${rows} rows)`)
  await app.click('Seleziona visibili', '.modal.batch button')
  await app.click('Legno', '.modal.batch .material-presets button')
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Rilievo')).querySelector('input').click()`
  )
  await app.sleep(150)
  app.check(
    (await summary(app)) === 'Crea 2, sovrascrive 0, salta 0',
    `plan: ${await summary(app)}`
  )
  await app.shot('01-setup')
  const first = await applyAndWait(app)
  app.check(first.includes('2 mappe scritte'), `wood written (${first})`)
  app.check(
    (await exists('oak_planks_s.png')) && (await exists('oak_planks_n.png')),
    'oak_planks _s and _n created'
  )

  // 3. Animated magma + textures that already have _s: skipped by default.
  await open(app)
  await app.click('Nessuna', '.modal.batch button')
  for (const name of ['magma', 'stone', 'gold_block', 'glowstone']) await tick(app, name)
  await app.click('Pietra', '.modal.batch .material-presets button')
  await app.sleep(100)
  app.check(
    (await summary(app)) === 'Crea 1, sovrascrive 0, salta 3',
    `existing maps skipped: ${await summary(app)}`
  )
  const stoneBefore = (await stat(file('stone_s.png'))).mtimeMs
  await applyAndWait(app)
  app.check((await stat(file('stone_s.png'))).mtimeMs === stoneBefore, 'stone_s untouched')
  app.check(await exists('magma_s.png.mcmeta'), 'animated magma: magma_s.png.mcmeta written')
  if (await exists('magma_s.png.mcmeta')) {
    const meta = JSON.parse(await readFile(file('magma_s.png.mcmeta'), 'utf8'))
    app.check(meta.animation?.frametime === 2, 'with the magma animation')
  }

  // 4. Overwrite: refused confirmation writes nothing; accepted keeps the emission.
  const glowBefore = (await stat(file('glowstone_s.png'))).mtimeMs
  await open(app)
  await app.click('Nessuna', '.modal.batch button')
  await tick(app, 'glowstone')
  await app.click('Pietra', '.modal.batch .material-presets button')
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Sovrascrivile')).querySelector('input').click()`
  )
  await app.sleep(100)
  app.check(
    (await summary(app)) === 'Crea 0, sovrascrive 1, salta 0',
    `overwrite planned: ${await summary(app)}`
  )
  await app.ev(
    `window.__asked = null; window.confirm = (m) => { window.__asked = m; return false }`
  )
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.sleep(500)
  app.check(
    (await app.ev(`window.__asked`))?.includes('Sovrascrivere 1 mappa'),
    'overwrite asks first'
  )
  app.check(
    (await stat(file('glowstone_s.png'))).mtimeMs === glowBefore,
    'refused: glowstone_s untouched'
  )
  await app.ev(`window.confirm = () => true`)
  await applyAndWait(app)
  app.check(
    (await stat(file('glowstone_s.png'))).mtimeMs !== glowBefore,
    'accepted: glowstone_s overwritten'
  )

  // 5. Values in the editor.
  const wood = await editorValue(app, 'oak_planks.png', 'Porosità', 4, 4)
  app.check(wood === 12, `oak_planks_s porosity = wood 12 (${wood})`)
  const glowEmission = await editorValue(app, 'glowstone.png', 'Emissione', 8, 3)
  app.check(
    glowEmission === 254,
    `glowstone keeps its emission after the overwrite (${glowEmission})`
  )
  const glowSmooth = await editorValue(app, 'glowstone.png', 'Levigatezza', 2, 3)
  app.check(glowSmooth !== 30 && glowSmooth < 90, `glowstone now stone-rough (${glowSmooth})`)

  // 6. The validator has nothing to say about the new maps.
  await app.click('Controlla mappe')
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  const flagged = await app.ev(
    `[...document.querySelectorAll('.validator-issue strong')].map((s) => s.textContent)`
  )
  const ours = flagged.filter((f) => /^(oak_planks|magma)_[ns]\.png$/.test(f))
  app.check(ours.length === 0, `validator quiet on the batch maps (${ours.join(', ')})`)
  await app.shot('02-validator')
}
