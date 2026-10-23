// 12b Applica in blocco as a 4-step wizard: Texture → Cosa fare → Anteprima (before/after in 3D,
// what will be written) → Applica (result).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
const current = (app) =>
  app.ev(`document.querySelector('.wizard-steps [aria-current=step]')?.textContent ?? ''`)
const views = (app) => app.ev(`document.querySelectorAll('.before-after-view').length`)

export default async function wizard(app) {
  await app.openPack()
  await app.click('Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch.wizard')`)
  app.check((await current(app)).includes('1. Texture'), 'opens on step 1 (Texture)')
  await app.click('Nessuna', '.modal.batch button')
  await app.ev(`(() => {
    const row = [...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith('glassblock'))
    row.querySelector('input').click()
  })()`)
  await app.shot('wizard-1-texture')

  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('2. Cosa fare'), 'Avanti: step 2 (Cosa fare)')
  // Material (_s) and relief (_n) both.
  await app.ev(`(() => {
    const box = [...document.querySelectorAll('.wizard-step label.inline-check')]
      .find((l) => l.textContent.startsWith('Rilievo'))?.querySelector('input')
    if (box && !box.checked) box.click()
  })()`)
  await app.shot('wizard-2-what')

  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('3. Anteprima'), 'Avanti: step 3 (Anteprima)')
  await app.waitFor(`document.querySelector('.before-after-view .preview-canvas')`, 15000)
  app.check((await views(app)) === 1, 'one view at a time: Dopo')
  const after = await app.ev(`document.querySelector('.before-after-view figcaption').textContent`)
  app.check(after === 'Dopo', `the result is shown first (${after})`)
  await app.ev(`(() => {
    const box = [...document.querySelectorAll('.before-after-bar label')]
      .find((l) => l.textContent.includes('Affiancati'))?.querySelector('input')
    box?.click()
  })()`)
  await app.waitFor(
    `document.querySelectorAll('.before-after-view .preview-canvas').length === 2`,
    15000
  )
  app.check(true, '"Affiancati" shows before and after together')
  const files = await app.ev(
    `[...document.querySelectorAll('.wizard-files li')].map((l) => l.textContent).join('|')`
  )
  app.check(
    files.includes('+ glass_s.png') && files.includes('+ glass_n.png'),
    `files listed (${files})`
  )
  await app.sleep(1500)
  await app.shot('wizard-3-preview')

  await app.ev(
    `[...document.querySelectorAll('.wizard-foot button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 20000)
  app.check((await current(app)).includes('4. Applica'), 'applying moves to step 4')
  await app.shot('wizard-4-done')
  await app.click('Chiudi', '.wizard-foot button')
  await app.waitFor(`!document.querySelector('.modal.batch')`)
  app.check(true, 'Chiudi closes the wizard')

  // Texture connesse: Texture → Metodo → Anteprima (wall before / after) → Applica.
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(300)
  await app.click('Texture connesse')
  await app.waitFor(`document.querySelector('[aria-label="Texture connesse"] .wizard-steps')`)
  app.check((await current(app)).includes('1. Texture'), 'CTM: opens on step 1 (Texture)')
  await app.shot('ctm-1-texture')
  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('2. Metodo'), 'CTM: step 2 (Metodo)')
  const methods = await app.ev(
    `[...document.querySelectorAll('.ctm-method')].map((b) => (b.disabled ? '-' : '+') + b.querySelector('strong').textContent).join(' ')`
  )
  app.check(methods === '+Completo +Orizzontale +Verticale', `CTM: methods (${methods})`)
  // Horizontal: 4 tiles (start, middle, end, alone).
  await app.click('Orizzontale', '.ctm-method')
  app.check(
    (await app.ev(
      `document.querySelector('.ctm-method[aria-checked=true] strong').textContent`
    )) === 'Orizzontale',
    'CTM: Orizzontale chosen'
  )
  await app.shot('ctm-2-method')
  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('3. Anteprima'), 'CTM: step 3 (Anteprima)')
  const shown = () =>
    app.ev(
      `[...document.querySelectorAll('[aria-label="Texture connesse"] .before-after-view')].filter((f) => !f.hidden).map((f) => f.querySelector('canvas').className).join(' ')`
    )
  app.check((await shown()) === 'ctm-wall', 'CTM: the connected wall first')
  await app.ev(`(() => {
    const box = [...document.querySelectorAll('[aria-label="Texture connesse"] .before-after-bar label')]
      .find((l) => l.textContent.includes('Affiancati'))?.querySelector('input')
    box?.click()
  })()`)
  await app.sleep(200)
  app.check((await shown()) === 'ctm-wall-before ctm-wall', 'CTM: "Affiancati" shows both walls')
  const sheet = await app.ev(
    `(() => { const c = document.querySelector('.ctm-sheet'); return c.width + '×' + c.height })()`
  )
  app.check(sheet === '64×16', `CTM: 4 tiles in a row (${sheet})`)
  const listed = await app.ev(
    `[...document.querySelectorAll('[aria-label="Texture connesse"] .wizard-files li')].map((l) => l.textContent).join('|')`
  )
  app.check(listed.includes('0.png … 3.png'), `CTM: 4 tile files listed (${listed})`)
  await app.shot('ctm-3-preview')

  // Apply: 4 tiles and the properties with method=horizontal on disk.
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Texture connesse"] .wizard-foot button')].find((b) => b.textContent.startsWith('Crea i 4 tile')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'optifine', 'ctm', 'glass')
  const written = (await readdir(dir)).sort()
  app.check(
    ['0.png', '1.png', '2.png', '3.png'].every((name) => written.includes(name)) &&
      !written.includes('4.png'),
    `CTM: exactly 4 tiles written (${written.join(' ')})`
  )
  const properties = await readFile(join(dir, 'glass.properties'), 'utf8')
  app.check(
    /method=horizontal/.test(properties) && /tiles=0-3/.test(properties),
    'CTM: glass.properties says method=horizontal, tiles=0-3'
  )
  await app.shot('ctm-4-done')
  await app.click('Chiudi', '.wizard-foot button')
  await app.waitFor(`!document.querySelector('[aria-label="Texture connesse"]')`)
}
