// v3 shell: menu bar, Ctrl+K command search, the hotbar of nine sections (keys 1-9), Pubblica,
// status bar.
const active = (app) =>
  app.ev(`document.querySelector('.shell-slot.active')?.dataset.section ?? null`)
const enabled = (app, id) =>
  app.ev(`!document.querySelector('.shell-slot[data-section="${id}"]').disabled`)

export default async function shell(app) {
  // Start screen: nine slots, all off; the File menu offers opening a pack.
  await app.waitFor(`document.querySelector('.shell-hotbar')`)
  app.check(
    (await app.ev(`document.querySelectorAll('.shell-slot').length`)) === 9,
    'start screen: nine section slots'
  )
  app.check((await active(app)) === null, 'start screen: no section active')
  app.check(!(await enabled(app, 'pack')), 'start screen: the slots are off')
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

  // Pack open: the Pack section, every file, the tools for the whole pack.
  await app.openPack()
  app.check((await active(app)) === 'pack', 'pack open: Pack is the active section')
  app.check(await enabled(app, 'blocks'), 'pack open: the other slots are on')
  app.check(
    (await app.ev(`document.querySelector('.shell-pack strong').textContent`)).length > 0,
    'hotbar shows the pack name'
  )
  const packTools = await app.ev(
    `[...document.querySelectorAll('.tool-row .lbl')].map((l) => l.textContent).join('|')`
  )
  app.check(
    packTools.includes('Diagnosi') && packTools.includes('Backup'),
    `Pack: tools for the whole pack (${packTools})`
  )
  const health = await app.ev(
    `[...document.querySelectorAll('.pack-health [role=progressbar]')].map((b) => b.getAttribute('aria-label') + ' ' + (b.getAttribute('aria-valuenow') ?? '?') + '/' + (b.getAttribute('aria-valuemax') ?? '?')).join(' | ')`
  )
  app.check(health.includes('Mappe PBR complete'), `Pack: health bars (${health})`)
  await app.shot('shell-pack')

  // Ctrl+K finds the section tools too (the playtest found only 13 commands).
  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'diagnosi')
  const found = await app.ev(`document.querySelector('.shell-result.active')?.textContent ?? ''`)
  app.check(found.includes('Diagnosi'), `Ctrl+K finds Diagnosi (${found})`)
  await app.key('Enter')
  await app.waitFor(`document.querySelector('[role=dialog]')`, 10000)
  app.check(true, 'and opens it')
  await app.key('Escape')
  await app.waitFor(`!document.querySelector('[role=dialog]')`)

  // Key 2: Blocchi, browsed by group.
  await app.key('2')
  await app.waitFor(`document.querySelector('.shell-slot.active')?.dataset.section === 'blocks'`)
  app.check(true, 'key 2 opens Blocchi')
  const groups = await app.ev(
    `[...document.querySelectorAll('.group-row')].map((g) => g.textContent).join('|')`
  )
  app.check(groups.startsWith('Tutte') && groups.includes('Pietre'), `Blocchi groups (${groups})`)
  await app.click('Pietre', '.group-row')
  const stones = await app.ev(
    `[...document.querySelectorAll('.texture-tile')].map((t) => t.title.split('/').pop()).join('|')`
  )
  app.check(
    stones.includes('stone.png') && !stones.includes('glass.png'),
    `Pietre shows only stones (${stones})`
  )
  const blockTools = await app.ev(
    `[...document.querySelectorAll('.tool-row .lbl')].map((l) => l.textContent).join('|')`
  )
  app.check(
    blockTools.includes('Texture connesse') && !blockTools.includes('Diagnosi'),
    `Blocchi has its own tools (${blockTools})`
  )
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.tool-row')].find((b) => b.textContent.includes('Texture connesse')).disabled`
    ),
    'per-texture tools wait for a chosen texture'
  )
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/stone.png')).click()`
  )
  await app.sleep(300)
  app.check(
    !(await app.ev(
      `[...document.querySelectorAll('.tool-row')].find((b) => b.textContent.includes('Texture connesse')).disabled`
    )),
    'choosing stone turns them on'
  )
  await app.shot('shell-blocks')

  // Editor: the slot stays on the texture's section.
  await app.openTexture('stone.png')
  app.check((await active(app)) === 'blocks', 'texture open: Blocchi stays lit')
  app.check(
    await app.ev(`document.querySelector('.shell-publish').disabled`),
    'editor open: Pubblica waits'
  )
  await app.click('Rilievo', '.map-tabs [role=tab]')
  await app.waitFor(
    `/Rilievo/.test(document.querySelector('.map-tabs [role=tab][aria-selected=true]')?.textContent ?? '')`
  )
  app.check(true, 'the editor tabs paint the _n map')
  await app.shot('shell-effetti')
  await app.click('Colore', '.map-tabs [role=tab]')
  await app.waitFor(
    `/Colore/.test(document.querySelector('.map-tabs [role=tab][aria-selected=true]')?.textContent ?? '')`
  )
  app.check(true, 'and go back to the colours')

  // Ctrl+K → "prova" → Enter opens the test screen.
  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'prova la')
  const first = await app.ev(`document.querySelector('.shell-result.active')?.textContent ?? ''`)
  app.check(first.includes('Prova la texture'), 'Ctrl+K finds "Prova la texture"')
  await app.shot('shell-search')
  await app.key('Enter')
  await app.waitFor(`document.querySelector('.test-screen')`)
  app.check((await active(app)) === 'blocks', 'test screen: Blocchi stays lit')

  // A slot leaves the test screen and the editor (no changes: it closes without asking).
  await app.click('Pack', '.shell-slot')
  await app.waitFor(`!document.querySelector('.test-screen') && !document.querySelector('.editor')`)
  app.check((await active(app)) === 'pack', 'Pack slot closes the test screen and the editor')

  // Pubblica: a screen with the export and the in-game copy side by side.
  await app.click('Pubblica', '.shell-publish')
  await app.waitFor(`document.querySelector('.publish-screen')`)
  app.check((await active(app)) === null, 'Pubblica: no section lit')
  const panels = await app.ev(
    `[...document.querySelectorAll('.publish-screen > section')].map((s) => s.getAttribute('aria-label')).join('|')`
  )
  app.check(panels === 'Esporta|Prova in gioco', `export and in game side by side (${panels})`)
  app.check(await app.ev(`!document.querySelector('.modal-backdrop')`), 'not a dialog: no backdrop')
  await app.sleep(500)
  await app.shot('shell-pubblica')
  await app.section('gui')
  app.check(
    await app.ev(
      `!document.querySelector('.publish-screen') && !!document.querySelector('.gui-mock')`
    ),
    'GUI slot leaves Pubblica and shows the test screen of the GUI'
  )
  await app.shot('shell-gui')

  // Schermate and Testi are whole pages.
  await app.key('7')
  await app.waitFor(`document.querySelector('.section-page .title-screens')`)
  app.check(true, 'key 7: the title and loading screen page')
  await app.shot('shell-screens')
  await app.key('9')
  await app.waitFor(`document.querySelector('.section-page .lang-dialog')`)
  app.check(true, 'key 9: the game texts page')

  // Settings from the command search.
  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'impostazioni')
  await app.key('Enter')
  await app.waitFor(
    `[...document.querySelectorAll('h2')].some((h) => h.textContent.includes('Impostazioni'))`
  )
  app.check(true, 'Ctrl+K opens the settings')
  const notice = await app.ev(
    `document.querySelector('[data-testid=official-notice]')?.textContent ?? ''`
  )
  app.check(
    notice.includes('Non è un prodotto ufficiale di Minecraft') &&
      notice.includes('Mojang o Microsoft'),
    'settings show the not-official notice'
  )
  await app.ev(
    `document.querySelector('[data-testid=official-notice]').scrollIntoView({ block: 'center' })`
  )
  await app.sleep(200)
  await app.shot('shell-settings')
}
