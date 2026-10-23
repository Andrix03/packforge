// Seamless mode ("Bordi continui"): strokes and fills continue across the edges.
import { stoneValue } from '../fixtures.mjs'

const stone = (x, y) => {
  const v = stoneValue(x, y)
  return '#' + [v, v, v + 4].map((c) => c.toString(16).padStart(2, '0')).join('')
}

export default async function tiling(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  await app.editor.setHex('e02020')
  await app.click('Bordi continui', 'label')
  // The canvas redraws the repeated view first: draw only once the mode is on screen.
  await app.waitFor(
    `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Bordi continui'))?.querySelector('input').checked`
  )
  await app.sleep(200)

  // From pixel 13 to "pixel 18" (two pixels into the right neighbor copy).
  await app.editor.draw([
    [13, 8],
    [18, 8]
  ])
  app.check((await app.editor.color(15, 8)) === '#e02020', 'the stroke reaches the right edge')
  app.check((await app.editor.color(0, 8)) === '#e02020', 'it continues on the left edge')
  app.check((await app.editor.color(2, 8)) === '#e02020', '…up to the wrapped end point')
  app.check((await app.editor.color(3, 8)) === stone(3, 8), '…and no further')
  await app.key('z', ['ctrl'])

  // Upward past the top edge: pixel (5, -1) is (5, 15).
  await app.editor.draw([
    [5, 1],
    [5, -1]
  ])
  app.check((await app.editor.color(5, 15)) === '#e02020', 'vertical strokes wrap too')
  await app.shot('tiling')

  // Turning it off stops the wrapping.
  await app.key('z', ['ctrl'])
  await app.click('Bordi continui', 'label')
  await app.editor.draw([
    [13, 4],
    [18, 4]
  ])
  app.check((await app.editor.color(0, 4)) === stone(0, 4), 'without seamless mode nothing wraps')
}
