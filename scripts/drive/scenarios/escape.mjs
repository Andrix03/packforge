// Phase 12 keyboard: Esc closes every workspace dialog, and in the editor it closes the compare
// dialog without also clearing the selection under it.
const DIALOGS = [
  ['Controlla mappe', '[aria-label="Controllo delle mappe"]'],
  ['Copertura', '[aria-label="Copertura delle mappe"]'],
  ['Applica in blocco', '[aria-label="Applica in blocco"]'],
  ['Ridimensiona', '[aria-label="Ridimensiona"]'],
  ['Copia nel gioco', '[aria-label="Prova in gioco"]'],
  ['Backup', '[aria-label="Backup"]'],
  ['Esporta', '[aria-label="Esporta"]'],
  ['Varianti di colore', '[aria-label="Varianti di colore"]'],
  ['Texture connesse', '[aria-label="Texture connesse"]']
]

const present = (app, selector) => app.ev(`!!document.querySelector(${JSON.stringify(selector)})`)

export default async function escape(app) {
  await app.openPack()
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(300)
  for (const [button, dialog] of DIALOGS) {
    await app.click(button)
    await app.waitFor(`document.querySelector(${JSON.stringify(dialog)})`, 10000)
    await app.sleep(300)
    await app.key('Escape')
    await app.sleep(300)
    app.check(!(await present(app, dialog)), `Esc closes ${button}`)
  }

  // In the editor: Esc closes the compare dialog, the selection stays.
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.sleep(200)
  await app.key('m')
  await app.editor.draw([
    [1, 1],
    [4, 4]
  ])
  await app.sleep(200)
  const selected = () =>
    app.ev(
      `!document.querySelector('button[title^="Togli la selezione"], button[title^="Deseleziona"]')?.disabled`
    )
  app.check(await selected(), 'a selection is active')
  await app.click('Confronta con vanilla')
  await app.waitFor(`document.querySelector('[aria-label="Confronto con vanilla"]')`)
  await app.key('Escape')
  await app.sleep(300)
  app.check(
    !(await present(app, '[aria-label="Confronto con vanilla"]')),
    'Esc closes the compare dialog'
  )
  app.check(await selected(), 'the selection under it is still there')
}
