// 1.4 colour adjustments: levels brighten the texture, applied as one step that undo restores.
export default async function adjust(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  const before = await app.editor.color(3, 3)
  await app.click('Regola colori', '.editor button')
  await app.waitFor(`document.querySelector('.adjust-dialog')`)
  app.check(
    await app.ev(
      `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Applica').disabled`
    ),
    'nothing to apply while neutral'
  )
  await app.setValue('[aria-label="Livelli: bianco"]', '128')
  await app.sleep(300)
  await app.shot('adjust-dialog')
  await app.click('Applica', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`)
  const after = await app.editor.color(3, 3)
  const lum = (hex) => parseInt(hex.slice(1, 3), 16)
  app.check(lum(after) > lum(before), `brighter (${before} → ${after})`)
  await app.key('z', ['ctrl'])
  await app.sleep(300)
  app.check((await app.editor.color(3, 3)) === before, 'one undo restores the texture')
}
