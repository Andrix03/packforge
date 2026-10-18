// Bugs found by the fuzz test or by hand, kept as checks so they can't come back.
export default async function regressions(app) {
  await app.openPack()
  await app.openTexture('magma.png')

  // 2026-10-18: undoing "Duplica" while hovering the removed frame read pixels outside the image
  // and crashed the whole editor (TypeError ... reading 'toString').
  // From the LAST frame, so the hovered pixel (frame 4) no longer exists after the undo.
  await app.ev(`[...document.querySelectorAll('.frame-thumb')].at(-1).click()`)
  await app.click('Duplica', '.frame-actions button')
  await app.editor.color(8, 8)
  await app.key('z', ['ctrl'])
  await app.sleep(300)
  app.check(
    await app.ev(`!!document.querySelector('.editor-canvas')`),
    'undoing a frame under the cursor does not crash'
  )

  // Closing with unsaved changes asks first: "Annulla" keeps the editor open, "OK" closes it.
  await app.editor.draw([
    [1, 1],
    [4, 1]
  ])
  app.answerDialogs(false)
  await app.click('Chiudi editor')
  app.check(
    app.dialogs.at(-1)?.includes('non salvate') ?? false,
    'closing with changes asks for confirmation'
  )
  app.check(await app.ev(`!!document.querySelector('.editor')`), '"Annulla" keeps the editor open')
  app.answerDialogs(true)
  await app.click('Chiudi editor')
  await app.sleep(300)
  app.check(!(await app.ev(`!!document.querySelector('.editor')`)), '"OK" closes it')
}
