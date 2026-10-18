// End-to-end smoke test: open the pack, edit a texture, undo/redo, save, check the file on disk.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function smoke(app) {
  await app.openPack()
  app.check(
    await app.ev(`document.querySelectorAll('.texture-tile').length >= 4`),
    'pack grid lists the textures'
  )

  await app.openTexture('stone.png')
  app.check((await app.editor.header()).includes('16×16'), 'editor opens stone 16×16')

  await app.editor.setHex('e02020')
  await app.editor.draw([
    [0, 0],
    [15, 0]
  ])
  app.check((await app.editor.color(8, 0)) === '#e02020', 'pencil paints the primary color')
  app.check((await app.editor.header()).includes('modificata'), 'unsaved badge appears')

  await app.editor.click(3, 0, 'right')
  app.check(
    (await app.editor.color(3, 0)) === 'trasparente',
    'right click paints the transparent secondary'
  )

  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(3, 0)) === '#e02020', 'Ctrl+Z undoes the last stroke')
  await app.key('y', ['ctrl'])
  app.check((await app.editor.color(3, 0)) === 'trasparente', 'Ctrl+Y redoes it')

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  const file = await readFile(join(app.paths.pack, 'assets/minecraft/textures/block/stone.png'))
  app.check(
    file.length > 0 && !(await app.editor.header()).includes('modificata'),
    'Ctrl+S saves the PNG'
  )

  await app.shot('smoke-editor')
}
