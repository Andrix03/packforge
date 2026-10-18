// Zip packs are read-only: the editor opens for viewing but nothing can change or be written.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const options = { zip: true }

export default async function readonly(app) {
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri zip'))`
  )
  await app.click('Apri zip')
  await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)
  app.check(
    !(await app.ev(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Nuova texture'))`
    )),
    'no "Nuova texture" in a zip pack'
  )

  await app.openTexture('stone.png')
  const header = await app.editor.header()
  app.check(header.includes('sola lettura'), 'the editor says "sola lettura"')
  app.check(!header.includes('Salva'), 'there is no Save button')
  app.check(
    await app.ev(`[...document.querySelectorAll('.tool')].every((b) => b.disabled)`),
    'the tools are disabled'
  )

  const before = await app.editor.color(3, 3)
  await app.editor.draw([
    [0, 3],
    [15, 3]
  ])
  app.check((await app.editor.color(3, 3)) === before, 'drawing changes nothing')
  await app.key('s', ['ctrl'])
  app.check(!(await app.editor.header()).includes('modificata'), 'nothing counts as modified')

  await app.click('Pro', '[role=radio]')
  app.check(!(await app.ev(`!!document.querySelector('.layers-panel')`)), 'no layers panel')
  app.check(
    !(await app.ev(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Anima'))`
    )),
    'no "Anima" button'
  )
  // Keyboard shortcuts must not get around the read-only mode either.
  await app.key('a', ['ctrl'])
  await app.key('Delete')
  await app.key('h', ['shift'])
  await app.key('Enter')
  app.check((await app.editor.color(3, 3)) === before, 'Ctrl+A, Canc, Maiusc+H change nothing')
  app.check(!(await app.editor.header()).includes('modificata'), '…and nothing counts as modified')
  await app.sleep(2500)
  const drafts = await readdir(join(app.paths.userData, 'drafts')).catch(() => [])
  app.check(drafts.length === 0, 'no draft is written for a read-only pack')
}
