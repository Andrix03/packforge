// Phase 12 first-run tutorial (Beginner): the six steps tick by themselves while doing them
// (open pack, open texture, paint, save, Prova, copy into a FAKE .minecraft), "Fatto!", stored
// in the settings; "Riduci" → pill; a compact bar (not the card) in the editor and Prova;
// "Chiudi" hides it, "Rifai il tutorial" brings it back.
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const options = { tutorial: true }

/** "n/6" from the card, or from the compact bar shown in the editor and Prova. */
const progress = (app) =>
  app.ev(`(() => {
    const card = document.querySelector('[data-testid=tutorial] .tutorial-head .muted')
    if (card) return card.textContent
    const bar = document.querySelector('[data-testid=tutorial-bar]')
    return bar ? (bar.textContent.match(/\\d\\/6/)?.[0] ?? '') : ''
  })()`)
const current = (app) =>
  app.ev(`document.querySelector('[data-testid=tutorial] li.current')?.textContent ?? ''`)

async function waitProgress(app, value) {
  const end = Date.now() + 8000
  while (Date.now() < end && (await progress(app)) !== value) await app.sleep(150)
  return progress(app)
}

export default async function tutorial(app) {
  await app.waitFor(`document.querySelector('[data-testid=tutorial]')`, 10000)
  app.check((await progress(app)) === '0/6', 'fresh start: tutorial at 0/6')
  app.check(
    (await current(app)).startsWith('Crea o apri un pack'),
    `first step with its hint (${(await current(app)).slice(0, 60)})`
  )
  await app.shot('01-start')

  await app.openPack()
  app.check((await waitProgress(app, '1/6')) === '1/6', 'opening a pack ticks step 1')

  // Shrink to a pill and back.
  await app.click('Riduci', '[data-testid=tutorial] button')
  await app.sleep(200)
  const pill = await app.ev(
    `document.querySelector('[data-testid=tutorial-pill]')?.textContent ?? ''`
  )
  app.check(pill.includes('Tutorial 1/6'), `"Riduci" leaves a pill (${pill})`)
  await app.ev(`document.querySelector('[data-testid=tutorial-pill]').click()`)
  await app.sleep(200)

  await app.openTexture('stone.png')
  app.check((await waitProgress(app, '2/6')) === '2/6', 'opening a texture ticks step 2')
  await app.editor.setHex('ff0000')
  await app.editor.click(5, 5)
  app.check((await waitProgress(app, '3/6')) === '3/6', 'painting ticks step 3')
  await app.key('s', ['ctrl'])
  app.check((await waitProgress(app, '4/6')) === '4/6', 'saving ticks step 4')
  const bar = await app.ev(
    `document.querySelector('[data-testid=tutorial-bar]')?.textContent ?? ''`
  )
  app.check(
    bar.includes('Guardala in 3D') &&
      !(await app.ev(`!!document.querySelector('[data-testid=tutorial]')`)),
    `in the editor: a compact bar, not the card (${bar.slice(0, 50)})`
  )
  await app.shot('02-editor')

  await app.click('Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  app.check((await waitProgress(app, '5/6')) === '5/6', 'Prova ticks step 5')
  await app.click('Torna a disegnare')
  await app.sleep(400)
  await app.click('Chiudi editor')
  await app.sleep(500)

  // Last step: the copy into the game (a fake .minecraft).
  const fake = join(dirname(app.paths.userData), 'fake-minecraft')
  await mkdir(fake, { recursive: true })
  await app.ev(`window.api.invoke('settings:setMinecraftDir', ${JSON.stringify(fake)})`)
  await app.click('🎮 Copia nel gioco')
  await app.waitFor(`document.querySelector('[data-testid=sync-target]')`)
  const where = await app.ev(`document.querySelector('[data-testid=sync-target]').textContent`)
  if (!where.startsWith(fake)) throw new Error(`refusing to copy outside the fake folder: ${where}`)
  await app.click('Copia nel gioco', '[aria-label="Prova in gioco"] button')
  await app.waitFor(`document.querySelector('[data-testid=sync-last]')`, 15000)
  await app.click('Chiudi', '[aria-label="Prova in gioco"] button')
  app.check((await waitProgress(app, '6/6')) === '6/6', 'copying into the game ticks step 6')
  const finished = await app.ev(
    `document.querySelector('[data-testid=tutorial]')?.textContent ?? ''`
  )
  app.check(finished.includes('Fatto!'), 'all done: "Fatto!"')
  await app.shot('03-done')
  const stored = await app.ev(
    `window.api.invoke('settings:get').then((v) => v.settings.tutorial.status)`
  )
  app.check(stored === 'done', `stored in the settings (${stored})`)

  // Close it, then bring it back from the settings.
  await app.click('Chiudi', '[data-testid=tutorial] button')
  await app.sleep(200)
  app.check(!(await app.ev(`!!document.querySelector('[data-testid=tutorial]')`)), 'closed')
  await app.click('Impostazioni')
  await app.waitFor(
    `[...document.querySelectorAll('h3')].some((h) => h.textContent === 'Tutorial')`
  )
  await app.click('Rifai il tutorial')
  await app.waitFor(`document.querySelector('[data-testid=tutorial]')`, 8000).catch(() => null)
  app.check((await progress(app)) === '0/6', '"Rifai il tutorial" starts again at 0/6')
}
