// 12b Applica in blocco as a 4-step wizard: Texture → Cosa fare → Anteprima (before/after in 3D,
// what will be written) → Applica (result).
const current = (app) =>
  app.ev(`document.querySelector('.wizard-steps [aria-current=step]')?.textContent ?? ''`)
const views = (app) => app.ev(`document.querySelectorAll('.before-after-view').length`)

export default async function wizard(app) {
  await app.openPack()
  await app.click('Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch.wizard')`)
  app.check((await current(app)).includes('1 · Texture'), 'opens on step 1 (Texture)')
  await app.click('Nessuna', '.modal.batch button')
  await app.ev(`(() => {
    const row = [...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith('glassblock'))
    row.querySelector('input').click()
  })()`)
  await app.shot('wizard-1-texture')

  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('2 · Cosa fare'), 'Avanti: step 2 (Cosa fare)')
  // Material (_s) and relief (_n) both.
  await app.ev(`(() => {
    const box = [...document.querySelectorAll('.wizard-step label.inline-check')]
      .find((l) => l.textContent.startsWith('Rilievo'))?.querySelector('input')
    if (box && !box.checked) box.click()
  })()`)
  await app.shot('wizard-2-what')

  await app.click('Avanti', '.wizard-foot button')
  app.check((await current(app)).includes('3 · Anteprima'), 'Avanti: step 3 (Anteprima)')
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
  app.check((await current(app)).includes('4 · Applica'), 'applying moves to step 4')
  await app.shot('wizard-4-done')
  await app.click('Chiudi', '.wizard-foot button')
  await app.waitFor(`!document.querySelector('.modal.batch')`)
  app.check(true, 'Chiudi closes the wizard')
}
