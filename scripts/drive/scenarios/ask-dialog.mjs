// The app's own question box in place of window.confirm: closing the editor with unsaved work
// offers Annulla / Chiudi senza salvare / Salva e chiudi, Esc cancels.
export const options = { appDialogs: true }

const dialog = `document.querySelector('[role=alertdialog]')`
const choices = () =>
  ev(
    `[...document.querySelectorAll('[role=alertdialog] [data-choice]')].map((b) => b.dataset.choice).join(',')`
  )
let ev

export default async function askDialog(app) {
  ev = app.ev
  const editorOpen = () => app.ev(`!!document.querySelector('.editor-canvas')`)
  await app.openPack()
  await app.openTexture('stone.png')
  await app.editor.setHex('e02020')
  await app.editor.draw([
    [0, 0],
    [3, 0]
  ])

  await app.click('Chiudi editor')
  await app.waitFor(dialog)
  app.check((await choices()) === 'cancel,discard,save', 'three answers in the question box')
  app.check(
    (await app.ev(`${dialog}.textContent`)).includes('stone'),
    'the question names the texture'
  )
  await app.sleep(300)
  await app.shot('ask-dialog')
  await app.key('Escape')
  await app.sleep(300)
  app.check(!(await app.ev(`!!${dialog}`)) && (await editorOpen()), 'Esc cancels, the editor stays')

  // Salva e chiudi: saved to disk, editor closed.
  await app.click('Chiudi editor')
  await app.waitFor(dialog)
  await app.click('Salva e chiudi', '[role=alertdialog] button')
  await app.waitFor(`!document.querySelector('.editor-canvas')`)
  await app.openTexture('stone.png')
  app.check((await app.editor.color(2, 0)) === '#e02020', 'Salva e chiudi saved the stroke')

  // Chiudi senza salvare: the stroke is gone.
  await app.editor.setHex('2020e0')
  await app.editor.draw([
    [0, 1],
    [3, 1]
  ])
  await app.click('Chiudi editor')
  await app.waitFor(dialog)
  await app.click('Chiudi senza salvare', '[role=alertdialog] button')
  await app.waitFor(`!document.querySelector('.editor-canvas')`)
  await app.openTexture('stone.png')
  app.check(
    (await app.editor.color(2, 1)) !== '#2020e0',
    'Chiudi senza salvare threw the stroke away'
  )
  app.check(await editorOpen(), 'editor reopens')
}
