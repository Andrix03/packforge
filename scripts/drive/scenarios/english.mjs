// The English interface: every screen and dialog speaks English and no Italian text is left on
// screen (common Italian words in the visible text give it away). Paths are ignored.
export const options = { language: 'en' }

const ITALIAN =
  /\b(della|delle|dello|degli|nella|nelle|sono|questa|questo|ancora|anche|oppure|niente|nessun[ao]?|prima|dopo|cartella|scegli|salva|chiudi|apri|crea|mostra|blocco|blocchi|colore|colori|mappe|rilievo|materiale|prova|disegna|pubblica|effetti|impostazioni|modifica|annulla|ripeti|trasparente|sinistro|destro|tutte|tutti|gioco|pixel sono|il|lo|gli|una|per|con|che|del|nel|è)\b/i

/** Lines of visible text with Italian words, outside inputs and file paths. */
async function italianLeft(app) {
  const text = await app.ev(`(() => {
    const clone = document.body.cloneNode(true)
    clone.querySelectorAll('input, textarea, select, code, [data-testid=selected-texture]').forEach((e) => e.remove())
    return clone.innerText
  })()`)
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/[\\/]/.test(line) && ITALIAN.test(line))
}

async function screen(app, name) {
  const left = await italianLeft(app)
  app.check(left.length === 0, `${name}: no Italian text (${left.slice(0, 6).join(' | ')})`)
  await app.shot(`english-${name}`)
}

const DIALOGS = [
  ['Check maps', '[role=dialog]'],
  ['Coverage', '[role=dialog]'],
  ['Batch apply', '[role=dialog]'],
  ['Resize', '[role=dialog]'],
  ['Copy to the game', '[role=dialog]'],
  ['Backup', '[role=dialog]'],
  ['Colour variants', '[role=dialog]'],
  ['Connected textures', '[role=dialog]']
]

export default async function english(app) {
  await app.waitFor(`document.querySelector('.shell-hotbar')`)
  app.check(
    (
      await app.ev(`document.querySelector('.shell-tab[data-workspace="disegna"]').textContent`)
    ).includes('Paint'),
    'hotbar says Paint'
  )
  await screen(app, 'start')

  await app.openPack()
  await screen(app, 'pack')
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(500)
  for (const [label, selector] of DIALOGS) {
    await app.click(label, '.pack-tools button')
    await app.waitFor(`document.querySelector(${JSON.stringify(selector)})`)
    await app.sleep(800)
    await screen(app, `dialog-${label.toLowerCase().replace(/ /g, '-')}`)
    await app.key('Escape')
    await app.waitFor(`!document.querySelector(${JSON.stringify(selector)})`)
  }
  await app.click('+ New texture')
  await app.waitFor(`document.querySelector('[role=dialog]')`)
  await screen(app, 'dialog-new-texture')
  await app.key('Escape')

  // 1.1: the GUI tab, the title and loading screen window, the GUI recolour.
  await app.click('GUI', '.mode-bar [role=tab]')
  await app.waitFor(`document.querySelector('.gui-mock canvas')`)
  await app.sleep(600)
  await screen(app, 'gui-tab')
  await app.click('Title and loading screen', '.gui-mock button')
  await app.waitFor(`document.querySelector('.title-screens')`)
  await app.sleep(600)
  await screen(app, 'dialog-title')
  await app.key('Escape')
  await app.click('Recolour GUI', '.gui-mock button')
  await app.waitFor(`document.querySelector('.gui-recolor')`)
  await screen(app, 'dialog-recolour')
  await app.key('Escape')
  await app.click('Pack', '.mode-bar [role=tab]')

  await app.openTexture('stone.png')
  await screen(app, 'paint')
  await app.click('Pro', '.shell-hotbar button, .editor-hotbar button')
  await app.sleep(500)
  await screen(app, 'paint-pro')
  await app.click('Compare with vanilla')
  await app.waitFor(`document.querySelector('[aria-label="Compare with vanilla"]')`)
  await app.sleep(500)
  await screen(app, 'dialog-compare')
  await app.key('Escape')

  await app.click('Effects', '.shell-tab')
  await app.waitFor(`document.querySelector('.shell-tab.active')?.dataset.workspace === 'effetti'`)
  await app.sleep(500)
  await screen(app, 'effects')

  await app.click('Paint', '.shell-tab')
  await app.click('Test', '.editor-header button')
  await app.waitFor(`document.querySelector('.test-screen')`)
  await app.sleep(1000)
  await screen(app, 'test')
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)

  await app.click('Publish', '.shell-tab')
  await app.waitFor(`document.querySelector('.publish-screen')`)
  await app.sleep(800)
  await screen(app, 'publish')
  await app.click('Pack', '.shell-tab')

  await app.key('k', ['ctrl'])
  await app.waitFor(`document.querySelector('.shell-search-box input')`)
  await app.setValue('.shell-search-box input', 'settings')
  await app.key('Enter')
  await app.waitFor(
    `[...document.querySelectorAll('h2')].some((h) => h.textContent.includes('Settings'))`
  )
  app.check(
    await app.ev(
      `document.querySelector('[data-language="en"]')?.getAttribute('aria-checked') === 'true'`
    ),
    'settings: English is the chosen language'
  )
  await screen(app, 'settings')
}
