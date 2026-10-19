// Phase 10 external editor: the "✎" button starts the program of the settings (node.exe here, a
// harmless .exe that exits at once), saving unsaved work first; files changed on disk by another
// program reload the editor when nothing is unsaved, or show a choice when something is; our own
// saves never trigger it.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

const banner = (app) => app.ev(`document.querySelector('.external-change')?.textContent ?? ''`)
const modified = async (app) => (await app.editor.header()).includes('modificata')

async function waitColor(app, x, y, hex, timeout = 8000) {
  const end = Date.now() + timeout
  let seen = ''
  while (Date.now() < end) {
    seen = await app.editor.color(x, y).catch(() => '')
    if (seen === hex) return seen
    await app.sleep(250)
  }
  return seen
}

export default async function external(app) {
  const stone = join(app.paths.pack, ...BLOCK, 'stone.png')
  await app.openPack()
  const set = await app.ev(
    `window.api.invoke('settings:setExternalEditor', ${JSON.stringify(process.execPath)})`
  )
  app.check(set?.ok !== false, `external editor set to node.exe (${JSON.stringify(set)})`)

  await app.openTexture('stone.png')
  await app.sleep(500)
  const label = await app.ev(
    `[...document.querySelectorAll('.editor-header button')].find((b) => b.textContent.startsWith('✎'))?.textContent`
  )
  app.check(label === '✎ node', `button names the program (${label})`)
  await app.click('✎', '.editor-header button')
  await app.sleep(800)
  app.check(
    !(await app.ev(`document.querySelector('.editor-header .field-error')`)),
    'the program starts without errors'
  )

  // 1. Changed outside, nothing unsaved: the editor reloads by itself.
  await writeFile(
    stone,
    png(16, 16, () => [255, 0, 0, 255])
  )
  const red = await waitColor(app, 3, 3, '#ff0000')
  app.check(red === '#ff0000', `reloaded from disk (${red})`)
  app.check(!(await modified(app)), 'not modified after the reload')

  // 2. Our own save is not an external change.
  await app.editor.setHex('00ff00')
  await app.editor.click(1, 1)
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  await app.sleep(2000)
  app.check((await banner(app)) === '', 'own save: no warning')
  app.check((await app.editor.color(1, 1)) === '#00ff00', 'own save: the painted pixel stays')

  // 3. Changed outside with unsaved work: a choice. "Tieni" keeps mine.
  await app.editor.setHex('ffff00')
  await app.editor.click(2, 2)
  await writeFile(
    stone,
    png(16, 16, () => [0, 0, 255, 255])
  )
  await app.waitFor(`document.querySelector('.external-change')`, 8000).catch(() => null)
  const warning = await banner(app)
  app.check(
    warning.includes('stone.png è cambiato fuori da PackForge'),
    `warning shown (${warning})`
  )
  await app.shot('01-external-change')
  await app.click('Tieni le mie modifiche', '.external-change button')
  await app.sleep(200)
  app.check(
    (await app.editor.color(2, 2)) === '#ffff00' && (await modified(app)),
    '"Tieni": my work stays'
  )

  // "Ricarica" takes the file.
  await writeFile(
    stone,
    png(16, 16, () => [0, 128, 0, 255])
  )
  await app.waitFor(`document.querySelector('.external-change')`, 8000).catch(() => null)
  await app.click('Ricarica dal file', '.external-change button')
  const green = await waitColor(app, 2, 2, '#008000')
  app.check(green === '#008000', `"Ricarica": the file is shown (${green})`)
  app.check(!(await modified(app)), '"Ricarica": nothing unsaved')

  // 4. A map changed outside reloads too.
  await writeFile(
    join(app.paths.pack, ...BLOCK, 'stone_s.png'),
    png(16, 16, () => [123, 10, 20, 255])
  )
  await app.sleep(2500)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.click('Levigatezza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  const smooth = await app.editor.color(5, 5)
  app.check(smooth === 'Levigatezza: 123', `_s changed outside → reloaded (${smooth})`)
  await app.click('Colore', '.map-tabs [role=tab]')
  await app.sleep(200)

  // 5. "✎" with unsaved work saves first (the other program must see it).
  await app.editor.setHex('ff00ff')
  await app.editor.click(4, 4)
  await app.click('✎', '.editor-header button')
  await app
    .waitFor(`!document.querySelector('.editor-header').textContent.includes('modificata')`, 8000)
    .catch(() => null)
  app.check(!(await modified(app)), '"✎" saved the unsaved work first')
  const saved = await readFile(stone)
  app.check(saved.length > 0, 'the file on disk was written')
  await app.sleep(1500)
  app.check((await banner(app)) === '', 'saving before opening is not an external change')
}
