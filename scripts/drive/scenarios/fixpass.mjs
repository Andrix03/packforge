// Phase 12a fix pass: the audit findings that can be seen in the app.

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
}
