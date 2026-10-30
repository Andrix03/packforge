// Self-test 2026-10-22: a whole pack made from scratch in the app, the way the popular Modrinth
// packs are made (research: vanilla-like 16× retexture, glowing ore, connected glass, random
// variants, PBR maps, multi-version, icon, export with license, changelog and listing).
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = 'assets/minecraft/textures/block'

export default async function fullpack(app) {
  const home = await mkdtemp(join(tmpdir(), 'packforge-fullpack-'))
  app.paths.fullpack = home

  // ---- 1. A new pack from the start screen.
  await app.waitFor(`document.querySelector('form.card.form')`)
  await app.setValue('form.card.form input', 'Borgo')
  await app.answerNextDialog(home)
  await app.click('Sfoglia…', 'form.card.form button')
  await app.waitFor(
    `document.querySelector('form.card.form code.path').textContent.includes('packforge-fullpack')`
  )
  await app.shot('01-new-pack-form')
  await app.click('Crea pack', 'form.card.form button')
  await app.waitFor(
    `document.querySelectorAll('.texture-tile').length >= 0 && document.body.textContent.includes('Borgo')`,
    15000
  )
  await app.sleep(1500)
  const mcmeta = JSON.parse(await readFile(join(home, 'Borgo', 'pack.mcmeta'), 'utf8'))
  app.check(mcmeta.pack !== undefined, `pack.mcmeta written (${JSON.stringify(mcmeta)})`)
  await app.shot('02-workspace-empty')

  // ---- 2. Description with colours, versions 1.21.4 → 26.3, an icon.
  const pack = join(home, 'Borgo')
  await app.click('Modifica', '.card button')
  await app.waitFor(`document.querySelector('.card textarea')`)
  await app.setValue('.card textarea', '§6Borgo §7· vanilla+ 16× §a(LabPBR)')
  await app.sleep(300)
  await app.click('Salva in pack.mcmeta', '.card button')
  await app.sleep(800)
  await app.click('Modifica versioni e overlay')
  await app.sleep(500)
  await app.ev(`(() => {
    const [from] = [...document.querySelectorAll('select')].filter((s) => s.offsetParent && [...s.options].some((o) => o.value === '1.21.4'))
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(from, '1.21.4')
    from.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await app.sleep(300)
  await app.shot('03-versions')
  await app.click('Salva in pack.mcmeta', '.card button')
  await app.sleep(1000)
  const meta = JSON.parse(await readFile(join(pack, 'pack.mcmeta'), 'utf8'))
  console.log('MCMETA', JSON.stringify(meta))
  app.check(
    meta.pack.description === '§6Borgo §7· vanilla+ 16× §a(LabPBR)',
    'the description keeps its colour codes'
  )
  app.check(
    meta.pack.pack_format === 46 && meta.pack.min_format !== undefined,
    'old clients get pack_format, new ones min/max_format'
  )
  const compatible = await app.ev(`document.body.textContent.includes('1.21.4')`)
  app.check(compatible, 'the workspace shows the range from 1.21.4')

  const iconSource = join(home, 'logo.png')
  await writeFile(
    iconSource,
    png(300, 200, (x, y) => [40 + (x % 50), 120 + (y % 40), 60, 255])
  )
  await app.click('Aggiungi', '.card button')
  await app.sleep(300)
  await app.answerNextDialog(iconSource)
  await app.click('Scegli immagine…')
  await app.waitFor(`document.body.textContent.includes('300×200')`, 10000)
  await app.shot('04-icon')
  await app.click('Salva come pack.png')
  await app.sleep(1000)
  const icon = await readFile(join(pack, 'pack.png'))
  app.check(
    icon.readUInt32BE(16) === icon.readUInt32BE(20),
    `pack.png is square (${icon.readUInt32BE(16)}×${icon.readUInt32BE(20)})`
  )
  await app.shot('05-overview')

  // ---- 3. Textures, started from the vanilla list (same name = replaces it in game).
  const dialog = '[aria-label="Nuova texture"]'
  async function fromVanilla(name, start, hex) {
    await app.section('pack')
    await app.click('Vanilla', '[role=tab], .tab, button')
    await app.setValue('input[aria-label="Cerca texture"]', name)
    await app.waitFor(
      `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/${name}.png'))`,
      10000
    )
    await app.ev(
      `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('block/${name}.png')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`
    )
    await app.waitFor(`document.querySelector('${dialog}')`)
    await app.click(start, `${dialog} [role=radio]`)
    if (hex) await app.setValue(`${dialog} input[type=color]`, hex)
    await app.click('Crea e apri', `${dialog} button`)
    await app.waitFor(
      `document.querySelector('.editor-canvas') && document.querySelector('.zoom-label')?.textContent.includes('%')`,
      15000
    )
    await app.sleep(800)
  }
  async function save() {
    await app.key('s', ['ctrl'])
    await app.waitFor(
      `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`,
      10000
    )
  }
  async function closeEditor() {
    await app.click('Chiudi editor', '.editor-header button')
    await app.waitFor(`document.querySelector('.texture-tile')`, 10000)
  }

  // Stone: noise from a grey ramp, then a few cracks with the shade tool.
  await fromVanilla('stone', 'Rumore', '#808080')
  await app.click('Pro', '[role=radio]')
  await app.key('s')
  for (const [x, y] of [
    [3, 4],
    [4, 4],
    [5, 5],
    [11, 9],
    [12, 10],
    [12, 11],
    [7, 13]
  ])
    await app.editor.click(x, y)
  await app.shot('06-stone')
  await save()
  const advice = await app.ev(
    `document.querySelector('.advice, [data-testid=advice]')?.textContent ?? ''`
  )
  console.log('ADVICE stone:', advice.slice(0, 300))
  await closeEditor()

  // Diamond ore: stone-like noise and gem clusters with the pencil.
  await fromVanilla('diamond_ore', 'Rumore', '#7a7a7a')
  await app.key('b')
  await app.editor.setHex('5decf5')
  for (const [x, y] of [
    [3, 3],
    [4, 3],
    [3, 4],
    [10, 5],
    [11, 5],
    [11, 6],
    [5, 11],
    [6, 11],
    [6, 12],
    [12, 12]
  ])
    await app.editor.click(x, y)
  await app.editor.setHex('1e8c9a')
  for (const [x, y] of [
    [4, 4],
    [10, 6],
    [5, 12],
    [12, 13]
  ])
    await app.editor.click(x, y)
  await app.editor.setHex('d4fbff')
  for (const [x, y] of [
    [3, 3],
    [10, 5],
    [5, 11]
  ])
    await app.editor.click(x, y)
  await app.shot('07-diamond-ore')
  await save()
  await closeEditor()

  // Oak planks: plain brown, plank seams drawn with the line tool.
  await fromVanilla('oak_planks', 'Colore pieno', '#a2824e')
  await app.key('l')
  await app.editor.setHex('6b5430')
  for (const y of [3, 7, 11, 15])
    await app.editor.draw([
      [0, y],
      [15, y]
    ])
  await app.editor.draw([
    [6, 0],
    [6, 2]
  ])
  await app.editor.draw([
    [12, 4],
    [12, 6]
  ])
  await app.editor.draw([
    [3, 8],
    [3, 10]
  ])
  await app.editor.draw([
    [9, 12],
    [9, 14]
  ])
  await app.key('n')
  await app.editor.setHex('a2824e')
  await app.editor.click(1, 1)
  await app.shot('08-planks')
  await save()
  await closeEditor()

  // Glass: transparent with a frame (connected later).
  await fromVanilla('glass', 'Vuota')
  await app.key('u')
  await app.editor.setHex('dbe9ec')
  await app.editor.draw([
    [0, 0],
    [15, 15]
  ])
  await app.key('b')
  await app.editor.setHex('ffffff')
  await app.editor.click(3, 3)
  await app.editor.click(4, 4)
  await app.shot('09-glass')
  await save()
  await closeEditor()

  const exists = (name) =>
    readFile(join(pack, ...BLOCK.split('/'), name)).then(
      () => true,
      () => false
    )
  async function openOwn(name) {
    await app.click('Pack', '[role=tab], .tab, button')
    await app.setValue('input[aria-label="Cerca texture"]', name)
    await app.sleep(400)
    await app.openTexture(`${name}.png`)
  }

  // ---- 4a. Glowing diamond ore: relief from the colours, ore material, emission painted on gems.
  await openOwn('diamond_ore')
  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.click('Genera tutto dai colori', '.generator-panel button')
  await app.sleep(400)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.click('Minerale', '.material-presets button')
  await app.sleep(200)
  const gems = await app.ev(`document.querySelector('[data-testid=accent-count]').textContent`)
  app.check(gems === 'Pixel gemma: 14', `the ore preset finds the 14 gem pixels (${gems})`)
  await app.click('Applica minerale', '.generator-panel button')
  await app.sleep(300)
  await app.click('Emissione', '.channel-tabs [role=tab]')
  await app.sleep(200)
  await app.click('Piena', '.value-presets button')
  await app.key('b')
  for (const [x, y] of [
    [3, 3],
    [4, 3],
    [3, 4],
    [4, 4],
    [10, 5],
    [11, 5],
    [10, 6],
    [11, 6],
    [5, 11],
    [6, 11],
    [5, 12],
    [6, 12],
    [12, 12],
    [12, 13]
  ])
    await app.editor.click(x, y)
  await app.shot('10-ore-emission')
  await save()
  app.check(
    (await exists('diamond_ore_n.png')) && (await exists('diamond_ore_s.png')),
    'diamond_ore has _n and _s'
  )
  await closeEditor()

  // ---- 4b. Batch: stone material + relief, planks wood + relief.
  await app.click('Pack', '[role=tab], .tab, button')
  await app.setValue('input[aria-label="Cerca texture"]', '')
  async function batch(names, preset) {
    await app.click('Applica in blocco')
    await app.waitFor(`document.querySelector('.modal.batch')`)
    await app.click('Nessuna', '.modal.batch button')
    for (const name of names) {
      await app.ev(
        `[...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith('${name}block'))?.querySelector('input').click()`
      )
    }
    await app.click(preset, '.modal.batch .material-presets button')
    await app.ev(
      `(() => { const box = [...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Rilievo'))?.querySelector('input'); if (box && !box.checked) box.click() })()`
    )
    await app.sleep(200)
    const plan = await app.ev(`document.querySelector('[data-testid=batch-summary]').textContent`)
    await app.ev(
      `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
    )
    await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 30000)
    const result = await app.ev(`document.querySelector('[data-testid=batch-result]').textContent`)
    app.check(!result.includes('errori'), `batch ${preset} (${plan}): ${result}`)
    await app.click('Chiudi', '.modal.batch button')
    await app.sleep(500)
  }
  await batch(['stone'], 'Pietra')
  await batch(['oak_planks'], 'Legno')
  app.check(
    (await exists('stone_n.png')) && (await exists('oak_planks_s.png')),
    'stone and planks got their maps'
  )

  // ---- 4c. Connected glass.
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(300)
  await app.tool('Texture connesse')
  await app.waitFor(`document.querySelector('[aria-label="Texture connesse"]')`)
  await app.sleep(500)
  await app.shot('11-ctm')
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Texture connesse"] button')].find((b) => b.textContent.startsWith('Crea i 47')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  const ctm = await app.ev(`document.querySelector('[data-testid=ctm-result]').textContent`)
  app.check(ctm.includes('47 tile'), `connected glass: ${ctm}`)
  await app.click('Chiudi', '[aria-label="Texture connesse"] button')
  await app.sleep(500)

  // ---- 4d. Random stone variants.
  await openOwn('stone')
  await app.click('Varianti casuali')
  await app.waitFor(`document.querySelector('[data-testid=variants-plan]')`, 10000)
  console.log(
    'VARIANTS PLAN',
    await app.ev(`document.querySelector('[data-testid=variants-plan]').textContent`)
  )
  await app.shot('12-variants')
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Varianti casuali"] button')].find((b) => b.textContent.trim().startsWith('Crea ') && b.textContent.includes('varianti')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=variants-result]')`, 15000)
  const variants = await app.ev(
    `document.querySelector('[data-testid=variants-result]').textContent`
  )
  app.check(
    variants.includes('varianti create') && !variants.includes('errori'),
    `stone variants: ${variants}`
  )
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Varianti casuali"] button')].find((b) => /Chiudi|Fatto/.test(b.textContent))?.click()`
  )
  await app.sleep(800)
  const state = JSON.parse(
    await readFile(join(pack, 'assets/minecraft/blockstates/stone.json'), 'utf8').catch(() => '{}')
  )
  console.log('STONE STATE', JSON.stringify(state).slice(0, 300))
  await closeEditor()

  // ---- 4e. An animated magma (3 frames).
  await fromVanilla('magma', 'Rumore', '#8a3a12')
  await app.click('Anima questa texture')
  await app.waitFor(`document.querySelector('.frame-actions')`)
  await app.click('Duplica', '.frame-actions button')
  await app.key('b')
  await app.editor.setHex('ffb020')
  for (const [x, y] of [
    [4, 4],
    [5, 4],
    [9, 10]
  ])
    await app.editor.click(x, y)
  await app.click('Duplica', '.frame-actions button')
  await app.editor.setHex('ff7a10')
  for (const [x, y] of [
    [4, 5],
    [10, 10],
    [11, 3]
  ])
    await app.editor.click(x, y)
  await save()
  const magmaMeta = JSON.parse(
    await readFile(join(pack, ...BLOCK.split('/'), 'magma.png.mcmeta'), 'utf8')
  )
  app.check(magmaMeta.animation !== undefined, `magma animated: ${JSON.stringify(magmaMeta)}`)
  await app.shot('13-magma')
  await closeEditor()

  // ---- 5a. Checks: maps validator and coverage.
  await app.click('Pack', '[role=tab], .tab, button')
  await app.setValue('input[aria-label="Cerca texture"]', '')
  await app.tool('Controlla mappe')
  await app.waitFor(
    `document.querySelector('[aria-label="Controllo delle mappe"]') && !document.querySelector('[data-testid=validator-progress]')`,
    20000
  )
  await app.sleep(1500)
  const validator = await app.ev(
    `document.querySelector('[aria-label="Controllo delle mappe"]').textContent`
  )
  console.log('VALIDATOR', validator.slice(0, 500))
  await app.shot('14-validator')
  await app.key('Escape')
  await app.click('Copertura')
  await app.waitFor(`document.querySelector('[data-testid=coverage-summary]')`, 20000)
  console.log(
    'COVERAGE',
    await app.ev(`document.querySelector('[data-testid=coverage-summary]').textContent`)
  )
  await app.key('Escape')

  // ---- 5b. Prova: the glowing ore at night in a cave, connected glass on a wall, a screenshot.
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/diamond_ore.png')).click()`
  )
  await app.sleep(300)
  await app.click('Prova in gioco')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    20000
  )
  await app.sleep(1500)
  await app.shot('15-test-ore')
  await app.click('Grotta', '.test-side [role=radio]')
  await app.sleep(3000)
  await app.shot('16-test-cave')
  await app.click('Screenshot')
  await app.waitFor(`document.querySelector('[data-testid=screenshot-result]')?.textContent`, 15000)
  console.log(
    'SCREENSHOT',
    await app.ev(`document.querySelector('[data-testid=screenshot-result]').textContent`)
  )
  await app.click('Chiudi prova')
  await app.waitFor(`!document.querySelector('.test-screen')`)

  // ---- 5c. Export: full + without PBR, with the Modrinth listing; then checks on the zips.
  await app.click('Esporta')
  await app.waitFor(`document.querySelector('[data-testid=export-check]')`, 30000)
  await app.sleep(500)
  console.log(
    'EXPORT CHECK',
    await app.ev(`document.querySelector('[data-testid=export-check]').textContent`)
  )
  await app.setValue('[aria-label=Esporta] input[aria-label=Versione]', '1.0.0')
  await app.setValue('[aria-label=Esporta] input[aria-label=Autore]', 'Andrea')
  await app.setValue('[aria-label=Esporta] select[aria-label=Licenza]', 'CC-BY-NC-SA-4.0')
  await app.setValue(
    '[aria-label=Esporta] textarea[aria-label=Novità]',
    'Prima versione: pietra, assi, vetro connesso, diamante luminoso, magma animato.'
  )
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Esporta] label')].find((l) => l.textContent.startsWith('Senza PBR')).querySelector('input').click()`
  )
  await app.sleep(300)
  await app.shot('17-export')
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Esporta] button')].find((b) => b.textContent.startsWith('Esporta ')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=export-results]')`, 60000)
  const exported = await app.ev(
    `[...document.querySelectorAll('[data-testid=export-results] li')].map((li) => li.textContent)`
  )
  console.log('EXPORTED', JSON.stringify(exported))
  app.check(
    exported.length === 2 && exported.every((r) => r.includes('.zip')),
    'two zips: full and without PBR'
  )
  await app.shot('18-export-done')
  await app.key('Escape')

  // ---- 6. Copy into the game (a FAKE .minecraft: never the real one).
  const fake = join(home, 'fake-minecraft')
  await mkdir(fake, { recursive: true })
  await app.ev(`window.api.invoke('settings:setMinecraftDir', ${JSON.stringify(fake)})`)
  await app.click('Copia nel gioco')
  await app.waitFor(
    `document.querySelector('[data-testid=sync-target], [data-testid=sync-reason]')`
  )
  const where = await app.ev(
    `document.querySelector('[data-testid=sync-target]')?.textContent ?? ''`
  )
  if (!where.startsWith(fake)) throw new Error(`refusing to sync outside the fake folder: ${where}`)
  await app.click('Copia nel gioco', '[aria-label="Prova in gioco"] button')
  await app.sleep(2000)
  const copied = await readFile(join(fake, 'resourcepacks', 'Borgo', 'pack.mcmeta'), 'utf8').catch(
    () => ''
  )
  app.check(copied.includes('Borgo'), 'the pack is copied into resourcepacks/Borgo')
  const stray = await readFile(join(fake, 'resourcepacks', 'Borgo', 'packforge.json')).then(
    () => true,
    () => false
  )
  app.check(!stray, 'PackForge project data stays out of the game copy')
  await app.shot('19-ingame')
}
