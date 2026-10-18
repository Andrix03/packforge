// Does the 3D preview in the editor really show the animation being made?
// WebGL canvases can't be read back, so two screenshots of the preview, a moment apart, must differ.

/** True when the 3D preview changes over ~0.4 s (the animation plays). */
async function previewAnimates(app) {
  const rect = await app.ev(`(() => {
    const canvas = document.querySelector('.editor-side .preview-canvas')
    canvas.scrollIntoView({ block: 'center' })
    const r = canvas.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  const shot = async () =>
    (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
      .result.data
  const shots = []
  for (let i = 0; i < 4; i++) {
    shots.push(await shot())
    await app.sleep(130)
  }
  return new Set(shots).size > 1
}

export default async function animationPreview(app) {
  await app.openPack({ waitForVanilla: true })

  // Control: a static texture must NOT look animated (else the detector proves nothing).
  await app.openTexture('glass.png')
  await app.sleep(1500)
  app.check(!(await previewAnimates(app)), 'a static texture stays still in 3D (control)')
  await app.click('Chiudi editor')

  // An existing animated texture (magma.png → block magma_block).
  await app.openTexture('magma.png')
  await app.sleep(1500)
  const block = await app.ev(
    `document.querySelector('.editor-side .preview-header')?.textContent ?? ''`
  )
  app.check(
    block.includes('magma_block'),
    `the 3D shows the block that uses the texture (${block})`
  )
  app.check(await previewAnimates(app), 'the 3D block plays the animation')
  await app.shot('magma-editor')

  // The 3D must be visible without scrolling, even in Pro mode (layers panel) with the timeline.
  await app.click('Pro', '[role=radio]')
  await app.ev(`document.querySelector('.editor-side').scrollTop = 0`)
  const visible = await app.ev(`(() => {
    const r = document.querySelector('.editor-side .preview-canvas').getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight ? Math.round(r.width) : 0
  })()`)
  app.check(visible > 0, `the 3D block is fully visible without scrolling (${visible}px)`)
  await app.click('3D grande')
  await app.sleep(500)
  const big = await app.ev(
    `Math.round(document.querySelector('.editor-side .preview-canvas').getBoundingClientRect().width)`
  )
  app.check(big > visible * 1.3, `"3D grande" enlarges it (${visible}px → ${big}px)`)
  app.check(await previewAnimates(app), 'it keeps animating in the big view')
  await app.shot('magma-big-preview')
  await app.click('3D piccolo')

  // A new animation, not saved yet: stone with 2 different frames.
  await app.click('Chiudi editor')
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.click('Anima questa texture')
  await app.click('+ Vuoto', '.frame-actions button')
  await app.key('g')
  await app.editor.setHex('ff2020')
  await app.editor.click(5, 5)
  await app.sleep(1500)
  app.check(await previewAnimates(app), 'a new animation plays in 3D before saving')
  await app.shot('stone-animated-unsaved')

  // After saving too.
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  await app.sleep(1500)
  app.check(await previewAnimates(app), 'it still plays after saving')
  await app.shot('stone-animated-saved')
}
