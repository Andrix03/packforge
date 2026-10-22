// Phase 12a fix pass: the audit findings that can be seen in the app.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function fixpass(app) {
  await app.openPack()

  // ---- A4: editor shortcuts are off while the Test screen or a dialog covers the editor.
  await app.openTexture('stone.png')
  await app.key('b')
  await app.editor.setHex('ff2020')
  await app.editor.click(3, 3)
  await app.sleep(200)
  app.check((await app.editor.color(3, 3)) === '#ff2020', 'a red pixel is painted')

  await app.click('🧪 Prova')
  await app.waitFor(`document.querySelector('.test-screen')`)
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])
  await app.sleep(300)
  await app.click('Torna a disegnare')
  await app.waitFor(`!document.querySelector('.test-screen')`)
  await app.sleep(300)
  app.check(
    (await app.editor.color(3, 3)) === '#ff2020',
    'Ctrl+Z on the Test screen did not undo the hidden texture'
  )

  await app.click('Confronta con vanilla')
  await app.waitFor(`document.querySelector('[aria-label="Confronto con vanilla"]')`)
  await app.key('z', ['ctrl'])
  await app.key('e')
  await app.sleep(300)
  await app.key('Escape')
  await app.waitFor(`!document.querySelector('[aria-label="Confronto con vanilla"]')`)
  await app.sleep(200)
  app.check(
    (await app.editor.color(3, 3)) === '#ff2020',
    'Ctrl+Z behind a dialog did not undo the texture'
  )
  // The pencil is still the tool: painting another pixel works (E behind the dialog was ignored).
  await app.editor.click(5, 5)
  await app.sleep(200)
  app.check(
    (await app.editor.color(5, 5)) === '#ff2020',
    'E behind a dialog did not switch to the eraser'
  )

  // Shortcuts still work once the dialog is gone.
  await app.key('z', ['ctrl'])
  await app.sleep(300)
  app.check((await app.editor.color(5, 5)) !== '#ff2020', 'Ctrl+Z works again in the editor')
  await app.key('z', ['ctrl'])
  await app.sleep(300)

  // ---- A5/A6: a tall plant reloads the editor only once the work is saved.
  await newTexture(app, 'wheat_stage0')
  await app.editor.setHex('3f8f2a')
  await app.editor.click(4, 13)
  await app.key('s', ['ctrl'])
  await app.sleep(1000)
  await app.click('Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await app.click('Alta', '[aria-label="Forma della pianta"] [role=radio]')
  await app.click('Applica la forma', '[aria-label="Forma della pianta"] button')
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 10000)
  await app.click('Fatto', '[aria-label="Forma della pianta"] button')
  await app.waitFor(`document.body.textContent.includes('16×32')`, 10000)
  await app.sleep(1000)
  app.check(!(await canUndo(app)), 'the whole plant starts with an empty history')

  // Unsaved stroke, the user refuses to save: the view does not change, the stroke stays.
  await app.editor.setHex('c02020')
  await app.editor.click(4, 5)
  await app.sleep(300)
  app.answerDialogs(false)
  await app.click('Solo questa metà', '[data-testid=tall-mode] [role=tab]')
  await app.sleep(1000)
  app.answerDialogs(true)
  app.check(
    await app.ev(`document.body.textContent.includes('16×32')`),
    'refusing to save keeps the whole-plant view'
  )
  app.check((await app.editor.color(4, 5)) === '#c02020', 'and the unsaved stroke')

  // Accepting: saved, then reloaded as one half with a fresh history.
  const top = join(app.paths.pack, ...BLOCK.split('/'), 'wheat_stage0_top.png')
  const topBefore = await readFile(top)
  await app.click('Solo questa metà', '[data-testid=tall-mode] [role=tab]')
  await app.waitFor(`document.body.textContent.includes('16×16')`, 10000)
  await app.sleep(800)
  app.check(!topBefore.equals(await readFile(top)), 'the upper half was saved before switching')
  app.check(!(await canUndo(app)), 'the reloaded half has a fresh history (no dead steps)')
  app.check(
    !(await app.ev(`document.querySelector('.editor-header').textContent.includes('modificata')`)),
    'and is not marked modified'
  )
  app.check((await app.editor.color(4, 13)) === '#3f8f2a', 'the lower half shows its pixels')
}

const BLOCK = 'assets/minecraft/textures/block'

const canUndo = (app) =>
  app.ev(`!document.querySelector('button[title="Annulla (Ctrl+Z)"]').disabled`)

async function newTexture(app, name) {
  await app.click('Chiudi editor', '.editor-header button')
  await app.waitFor(`document.querySelector('.texture-tile')`, 10000)
  await app.click('+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('[aria-label="Nuova texture"] input:not([type=color])')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, '${name}')
  })()`)
  await app.click('Vuota', '[aria-label="Nuova texture"] [role=radio]')
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await app.sleep(500)
}
