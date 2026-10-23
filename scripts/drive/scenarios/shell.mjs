// 12b shell: menu bar, Ctrl+K command search, workspace hotbar, status bar.
const active = (app) =>
  app.ev(`document.querySelector('.shell-tab.active')?.dataset.workspace ?? null`)
const enabled = (app, id) =>
  app.ev(`!document.querySelector('.shell-tab[data-workspace="${id}"]').disabled`)

export default async function shell(app) {
  // Start screen: no workspace yet, File menu offers opening a pack.
  await app.waitFor(`document.querySelector('.shell-hotbar')`)
  app.check((await active(app)) === null, 'start screen: no workspace active')
  app.check(!(await enabled(app, 'pack')), 'start screen: Pack is disabled')
  await app.click('File', '.shell-menu-button')
  const fileItems = await app.ev(
    `[...document.querySelectorAll('.shell-dropdown .shell-item')].map((b) => b.textContent).join('|')`
  )
  app.check(fileItems.includes('Apri un pack (cartella)'), 'File menu: open a pack folder')
  app.check(fileItems.includes('Impostazioni'), 'File menu: settings')
  await app.shot('shell-start-menu')
  await app.key('Escape')
  app.check(
    !(await app.ev(`!!document.querySelector('.shell-dropdown')`)),
    'Escape closes the menu'
  )

  // Pack open.
  await app.openPack()
  app.check((await active(app)) === 'pack', 'pack open: Pack is the active workspace')
  app.check(!(await enabled(app, 'disegna')), 'no texture open: Disegna is disabled')
  app.check(
    (await app.ev(`document.querySelector('.shell-pack strong').textContent`)).length > 0,
    'hotbar shows the pack name'
  )
  await app.shot('shell-pack')

  // Editor.
  await app.openTexture('stone.png')
  app.check((await active(app)) === 'disegna', 'texture open: Disegna is active')
  app.check(await enabled(app, 'prova'), 'texture open: Prova is enabled')
  await app.shot('shell-editor')

  // Effetti = the editor on the LabPBR maps; Disegna goes back to the colours.
  app.check(!(await enabled(app, 'pubblica')), 'editor open: Pubblica waits for the Pack')
  await app.click('Effetti', '.shell-tab')
  await app.waitFor(`document.querySelector('.shell-tab.active')?.dataset.workspace === 'effetti'`)
  const mapTab = await app.ev(
    `document.querySelector('.map-tabs [role=tab][aria-selected=true]')?.textContent ?? ''`
  )
  app.check(/Rilievo/.test(mapTab), `Effetti paints the _n map (${mapTab})`)
  await app.shot('shell-effetti')
  await app.click('Disegna', '.shell-tab')
  await app.waitFor(`document.querySelector('.shell-tab.active')?.dataset.workspace === 'disegna'`)
  app.check(
    /Colore/.test(
      await app.ev(
        `document.querySelector('.map-tabs [role=tab][aria-selected=true]')?.textContent ?? ''`
      )
    ),
    'Disegna goes back to the colours'
  )

  // Ctrl+K → "prova" → Enter opens the test screen.
  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'prova la')
  const first = await app.ev(`document.querySelector('.shell-result.active')?.textContent ?? ''`)
  app.check(first.includes('Prova la texture'), 'Ctrl+K finds "Prova la texture"')
  await app.shot('shell-search')
  await app.key('Enter')
  await app.waitFor(`document.querySelector('.test-screen')`)
  app.check((await active(app)) === 'prova', 'Enter runs it: Prova is active')

  // Hotbar: back to Disegna, then Pack (no changes: the editor closes without asking).
  await app.click('Disegna', '.shell-tab')
  await app.waitFor(`!document.querySelector('.test-screen') && document.querySelector('.editor')`)
  app.check((await active(app)) === 'disegna', 'Disegna tab leaves the test screen')
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  app.check((await active(app)) === 'pack', 'Pack tab closes the editor')

  // Pubblica opens the export from the Pack.
  await app.click('Pubblica', '.shell-tab')
  await app.waitFor(
    `[...document.querySelectorAll('h2')].some((h) => /Esporta il pack/i.test(h.textContent))`
  )
  app.check(true, 'Pubblica opens the export')
  await app.shot('shell-pubblica')
  await app.key('Escape')
  await app.waitFor(
    `![...document.querySelectorAll('h2')].some((h) => /Esporta il pack/i.test(h.textContent))`
  )

  // Settings from the command search.
  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'impostazioni')
  await app.key('Enter')
  await app.waitFor(
    `[...document.querySelectorAll('h2')].some((h) => h.textContent.includes('Impostazioni'))`
  )
  app.check(true, 'Ctrl+K opens the settings')
  await app.shot('shell-settings')
}
