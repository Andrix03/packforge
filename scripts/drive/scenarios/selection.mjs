// Selections (Pro): rectangle, copy/paste + move, cut, clip painting, flip, rotate, cancel, wand.
import { stoneValue } from '../fixtures.mjs'

const hex = (v) => '#' + [v, v, v + 4].map((c) => c.toString(16).padStart(2, '0')).join('')
const stone = (x, y) => hex(stoneValue(x, y))

export default async function selection(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  const outline = () =>
    app.ev(`!!document.querySelector('.selection-actions button[title^="Togli"]:not(:disabled)')`)

  // Rectangle selection.
  await app.key('m')
  await app.editor.draw([
    [2, 2],
    [4, 4]
  ])
  app.check(await outline(), 'dragging with M creates a selection')

  // Copy, paste, move 7 pixels right, put down.
  await app.key('c', ['ctrl'])
  await app.key('v', ['ctrl'])
  app.check(
    (await app.ev(`document.querySelector('.tool.active').textContent`)).includes('Sposta'),
    'paste switches to the move tool'
  )
  // The pasted pixels float only once the paste is in the selection (a drag before moves nothing).
  await app.waitFor(
    `!!document.querySelector('.selection-actions button[title^="Togli"]:not(:disabled)')`
  )
  await app.editor.draw([
    [3, 3],
    [10, 3]
  ])
  await app.key('Enter')
  // Putting the paste down re-renders the canvas: give it a moment before reading the colour.
  let landed = false
  for (let i = 0; i < 20 && !landed; i++) {
    landed = (await app.editor.color(9, 2)) === stone(2, 2)
    if (!landed) await new Promise((resolve) => setTimeout(resolve, 100))
  }
  app.check(landed, 'pasted pixels land 7 pixels to the right')
  app.check((await app.editor.color(2, 2)) === stone(2, 2), 'copy leaves the original in place')
  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(9, 2)) === stone(9, 2), 'one Ctrl+Z removes the whole paste')

  // Cut.
  await app.key('m')
  await app.editor.draw([
    [0, 0],
    [1, 1]
  ])
  await app.key('x', ['ctrl'])
  app.check((await app.editor.color(0, 0)) === 'trasparente', 'Ctrl+X cuts')
  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(0, 0)) === stone(0, 0), 'Ctrl+Z restores the cut pixels')

  // Painting stays inside the selection.
  await app.editor.draw([
    [5, 5],
    [7, 7]
  ])
  await app.key('b')
  await app.editor.setHex('e02020')
  await app.editor.draw([
    [0, 6],
    [15, 6]
  ])
  app.check((await app.editor.color(6, 6)) === '#e02020', 'the pencil paints inside the selection')
  app.check((await app.editor.color(2, 6)) === stone(2, 6), '…and not outside it')
  await app.key('z', ['ctrl'])

  // Flip the selected 3×3 block horizontally: column 5 ↔ column 7.
  await app.key('h', ['shift'])
  await app.key('Enter')
  app.check((await app.editor.color(5, 5)) === stone(7, 5), 'Shift+H flips the selection')
  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(5, 5)) === stone(5, 5), 'Ctrl+Z undoes the flip')

  // Rotate 90°: top-left (5,5) goes to top-right (7,5).
  await app.key('r', ['shift'])
  await app.key('Enter')
  app.check((await app.editor.color(7, 5)) === stone(5, 5), 'Shift+R rotates the selection 90°')
  await app.key('z', ['ctrl'])

  // Move then Esc cancels.
  await app.key('v')
  await app.editor.draw([
    [6, 6],
    [6, 10]
  ])
  await app.key('Escape')
  app.check((await app.editor.color(6, 6)) === stone(6, 6), 'Esc cancels a move')

  // Delete key.
  await app.key('Delete')
  app.check((await app.editor.color(6, 6)) === 'trasparente', 'Canc clears the selected pixels')
  await app.key('z', ['ctrl'])

  // Magic wand on glass: the transparent triangle.
  await app.key('d', ['ctrl'])
  app.check(!(await outline()), 'Ctrl+D deselects')
  await app.shot('selection')
}
