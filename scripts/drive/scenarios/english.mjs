// The English interface: every screen and dialog speaks English and no Italian text is left on
// screen (common Italian words in the visible text give it away). Paths are ignored.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

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

/** Opens the file tree down to `path` (folders already open stay open). */
async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
    })()`)
    await app.sleep(150)
  }
}

/** 1.2 files: an item with old overrides, an item texture, an armor texture. */
async function writeItems(app) {
  const at = (...parts) => join(app.paths.pack, 'assets', 'minecraft', ...parts)
  await mkdir(at('models', 'item'), { recursive: true })
  await mkdir(at('textures', 'item'), { recursive: true })
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid'), { recursive: true })
  await writeFile(
    at('models', 'item', 'apple.json'),
    JSON.stringify({
      parent: 'item/generated',
      textures: { layer0: 'item/apple' },
      overrides: [{ predicate: { custom_model_data: 1 }, model: 'item/golden_apple' }]
    })
  )
  await writeFile(
    at('textures', 'item', 'apple.png'),
    png(16, 16, (x, y) => ((x - 8) ** 2 + (y - 8) ** 2 < 30 ? [200, 30, 40, 255] : [0, 0, 0, 0]))
  )
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid', 'iron.png'),
    png(64, 32, () => [150, 150, 160, 255])
  )
  await writeFile(
    at('textures', 'block', 'oak_leaves.png'),
    png(16, 16, (x, y) => ((x + y) % 4 ? [120, 120, 120, 255] : [0, 0, 0, 0]))
  )
}

export default async function english(app) {
  await writeItems(app)
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

  // 1.2: overrides tool, item preview and its dialogs, armor preview.
  await app.click('Overrides to items/', '.tool-bar button')
  await app.waitFor(`document.querySelector('[data-testid=overrides-list]')`, 15000)
  await screen(app, 'dialog-overrides')
  await app.key('Escape')
  // 1.4: pack doctor, emissive, recolour, game texts.
  for (const [label, wait] of [
    ['Doctor', '[data-testid=doctor-problems], [data-testid=doctor-clean]'],
    ['Light _e', '[data-testid=emissive-plan], [data-testid=emissive-none]'],
    ['Recolour textures', '.gui-recolor'],
    ['Game texts', '[data-testid=lang-count]']
  ]) {
    await app.click(label, '.tool-bar button')
    await app.waitFor(`document.querySelector(${JSON.stringify(wait)})`, 20000)
    await app.sleep(400)
    await screen(app, `dialog-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`)
    await app.key('Escape')
    await app.waitFor(`!document.querySelector('[role=dialog]')`)
  }
  await openFolder(app, 'assets/minecraft/textures/item')
  await app.openTexture('apple.png')
  await app.click('Adjust colours', '.editor button')
  await app.waitFor(`document.querySelector('.adjust-dialog')`)
  await screen(app, 'dialog-adjust-colours')
  await app.key('Escape')
  await app.waitFor(`document.querySelector('[data-testid=item-models]')`, 10000)
  await app.sleep(500)
  await screen(app, 'item-preview')
  await app.click('3D in hand', '.editor button')
  await app.waitFor(`document.querySelector('[role=dialog]')`)
  await app.sleep(800)
  await screen(app, 'dialog-3d-in-hand')
  await app.key('Escape')
  await app.click('Variant by name', '.editor button')
  await app.waitFor(`document.querySelector('[role=dialog]')`)
  await app.setValue('[role=dialog] input', 'Excalibur')
  await app.sleep(500)
  await screen(app, 'dialog-variant-by-name')
  await app.key('Escape')
  await app.click('Positions', '.editor button')
  await app.waitFor(`document.querySelector('.display-dialog')`)
  await app.sleep(800)
  await screen(app, 'dialog-positions')
  await app.key('Escape')
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await openFolder(app, 'assets/minecraft/textures/entity/equipment/humanoid')
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-preview')`)
  await app.sleep(500)
  await screen(app, 'armor-preview')
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await openFolder(app, 'assets/minecraft/textures/block')

  // 1.3: 3D shapes on leaves, raised pixels and model elements on stone.
  await app.openTexture('oak_leaves.png')
  await app.click('3D shapes', '.editor button')
  await app.waitFor(`document.querySelector('[role=dialog]')`)
  await screen(app, 'dialog-3d-shapes')
  await app.key('Escape')
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)

  await app.openTexture('stone.png')
  await app.click('Raised pixels', '.editor button')
  await app.waitFor(`document.querySelector('.pop-color')`, 10000)
  await screen(app, 'dialog-raised-pixels')
  await app.key('Escape')
  await app.click('Model elements', '.editor button')
  await app.waitFor(`document.querySelector('.model-list li')`, 10000)
  await app.sleep(500)
  await screen(app, 'dialog-model-elements')
  await app.key('Escape')
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
