// The app's own question box in place of window.confirm: closing the editor with unsaved work
// offers Annulla / Chiudi senza salvare / Salva e chiudi, Esc cancels; over another dialog the
// question takes the clicks and the Esc.
export const options = { appDialogs: true }

const dialog = `document.querySelector('[role=alertdialog]')`
// The question is ready for keys once it has the focus (Base UI listens from then on).
const ready = `document.activeElement?.closest('[role=alertdialog]')`
const choices = () =>
  ev(
    `[...document.querySelectorAll('[role=alertdialog] [data-choice]')].map((b) => b.dataset.choice).join(',')`
  )
let ev
// A closing window stays in the page for its short animation: wait for it to go.
const gone = (app, expression) =>
  app.waitFor(`!(${expression})`, 5000).then(
    () => true,
    () => false
  )

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
  await app.waitFor(ready)
  await app.sleep(300)
  await app.shot('ask-dialog')
  await app.key('Escape')
  app.check((await gone(app, dialog)) && (await editorOpen()), 'Esc cancels, the editor stays')

  // Salva e chiudi: saved to disk, editor closed.
  await app.click('Chiudi editor')
  await app.waitFor(dialog)
  await app.click('Salva e chiudi', '[role=alertdialog] button')
  await app.waitFor(`!document.querySelector('.editor-canvas')`)
  await app.openTexture('stone.png')
  const saved = await app.editor.color(2, 0)
  app.check(saved === '#e02020', `Salva e chiudi saved the stroke (${saved})`)

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

  // A question over another dialog: the save above made a backup, deleting it asks first. The
  // question must take the clicks and the Esc, the Backup dialog under it stays open.
  await app.click('Chiudi editor')
  await app.waitFor(`!document.querySelector('.editor-canvas')`)
  await app.section('pack')
  await app.click('Backup')
  await app.waitFor(`document.querySelector('[aria-label=Backup] li')`)
  const backupOpen = () => app.ev(`!!document.querySelector('.pf-dialog[aria-label=Backup]')`)
  await app.click('Elimina', '[aria-label=Backup] li button')
  await app.waitFor(dialog)
  await app.click('Annulla', '[role=alertdialog] button')
  app.check(
    (await gone(app, dialog)) && (await backupOpen()),
    'a question over a dialog takes the click, the dialog stays'
  )
  await app.click('Elimina', '[aria-label=Backup] li button')
  await app.waitFor(ready)
  await app.key('Escape')
  const questionGone = await gone(app, dialog)
  const stillOpen = await backupOpen()
  app.check(
    questionGone && stillOpen,
    `Esc closes only the question (${questionGone}, ${stillOpen})`
  )
  await app.key('Escape')
  app.check(
    await gone(app, `document.querySelector('.pf-dialog[aria-label=Backup]')`),
    'a second Esc closes the dialog'
  )
}
