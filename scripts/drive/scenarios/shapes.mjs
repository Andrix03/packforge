// Shapes (line, rectangle, ellipse) and mirror drawing, Pro mode.
export default async function shapes(app) {
  await app.openPack()
  await app.openTexture('glass.png')
  await app.click('Pro', '[role=radio]')
  await app.editor.setHex('e02020')
  const red = '#e02020'

  await app.key('u')
  app.check(
    (await app.ev(`document.querySelector('.tool.active').textContent`)).includes('Rettangolo'),
    'U selects the rectangle'
  )
  await app.editor.draw([
    [3, 2],
    [6, 5],
    [9, 8]
  ])
  app.check(
    (await app.editor.color(3, 2)) === red && (await app.editor.color(9, 8)) === red,
    'rectangle corners are painted'
  )
  app.check((await app.editor.color(6, 4)) === 'trasparente', 'outline rectangle leaves the inside')
  app.check((await app.editor.color(6, 3)) === 'trasparente', 'the drag preview leaves no trail')

  await app.key('z', ['ctrl'])
  app.check((await app.editor.color(3, 2)) === 'trasparente', 'one Ctrl+Z removes the whole shape')

  await app.click('Pieno', 'label')
  await app.editor.draw([
    [3, 2],
    [9, 8]
  ])
  app.check((await app.editor.color(6, 4)) === red, '"Pieno" fills the rectangle')
  await app.key('z', ['ctrl'])

  await app.key('o')
  await app.click('Pieno', 'label')
  await app.editor.draw([
    [2, 2],
    [12, 12]
  ])
  app.check(
    (await app.editor.color(7, 2)) === red && (await app.editor.color(2, 7)) === red,
    'ellipse touches the middle of its box sides'
  )
  app.check((await app.editor.color(3, 3)) !== red, 'ellipse leaves the box corners')
  await app.key('z', ['ctrl'])

  await app.key('l')
  await app.editor.draw([
    [2, 10],
    [12, 11]
  ])
  app.check((await app.editor.color(12, 11)) === red, 'line reaches the end point')
  await app.key('z', ['ctrl'])

  // Mirror: paint at the left, the right side gets the mirror image.
  await app.key('b')
  await app.ev(`[...document.querySelectorAll('.mirror-toggles input')][0].click()`)
  await app.editor.draw([
    [2, 4],
    [2, 6]
  ])
  app.check((await app.editor.color(13, 5)) === red, 'mirror ↔ paints the opposite side')
  await app.shot('shapes-mirror')
}
