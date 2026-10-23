// Material presets on the other fixture blocks: an existing _s keeps its emission, emissive
// glowstone, a gold block, glass with transparent pixels, an animated strip, a selection as mask,
// and a 512×512 texture (the panel must stay responsive).
const num = (text) => Number(String(text).split(': ')[1])

async function material(app, texture) {
  await app.openTexture(texture)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.sleep(200)
}

async function apply(app, preset) {
  await app.click(preset, '.material-presets button')
  await app.click(`Applica ${preset.toLowerCase()}`, '.generator-panel button')
  await app.sleep(300)
}

async function channel(app, name) {
  await app.click(name, '.channel-tabs [role=tab]')
  await app.sleep(200)
}

async function close(app) {
  await app.ev(`window.confirm = () => true`)
  await app.click('Chiudi editor')
  await app.sleep(500)
}

export default async function edges(app) {
  await app.openPack()

  // Glowstone: Pietra keeps the painted emission, Luminoso relights from the colors.
  await material(app, 'glowstone.png')
  await apply(app, 'Pietra')
  await channel(app, 'Emissione')
  app.check(num(await app.editor.color(8, 3)) === 254, 'Pietra keeps the existing emission (254)')
  app.check(num(await app.editor.color(2, 3)) === 0, 'and the dark base stays off')
  await apply(app, 'Luminoso')
  const cross = num(await app.editor.color(8, 3))
  app.check(cross >= 127 && cross <= 254, `Luminoso: the light cross glows (${cross})`)
  app.check(num(await app.editor.color(2, 3)) === 0, 'Luminoso: the dark base stays off')
  await app.shot('01-glowstone')
  await close(app)

  // Gold block: metal preset with gold.
  await material(app, 'gold_block.png')
  await app.click('Metallo', '.material-presets button')
  await app.setValue('.generator-panel select', 231)
  await app.click('Applica metallo', '.generator-panel button')
  await app.sleep(300)
  await channel(app, 'Riflettanza')
  app.check(num(await app.editor.color(5, 5)) === 231, 'gold block: G = 231 (gold)')
  await channel(app, 'Porosità')
  app.check(num(await app.editor.color(5, 5)) === 0, 'metal is not porous')
  await close(app)

  // Glass: transparent pixels are left alone (new map: smoothness 0).
  await material(app, 'glass.png')
  await apply(app, 'Vetro')
  await channel(app, 'Levigatezza')
  app.check(num(await app.editor.color(0, 5)) === 245, 'glass frame is smooth (245)')
  app.check(num(await app.editor.color(3, 7)) === 0, 'transparent pixels are not written')
  await close(app)

  // Animated magma (16×48): the whole strip gets the material.
  await material(app, 'magma.png')
  await apply(app, 'Luminoso')
  await channel(app, 'Levigatezza')
  const first = num(await app.editor.color(3, 3))
  app.check(first > 0, `animated strip: first frame written (${first})`)
  const view = await app.ev(`document.querySelector('.editor-canvas').dataset.view`)
  app.check(Boolean(view), `channel view of the strip (${view})`)
  await app.shot('02-magma')
  await close(app)

  // Selection as mask (Pro mode): only the selected rectangle changes.
  await material(app, 'stone.png')
  await app.click('Pro', '[role=radio]')
  await app.sleep(200)
  await channel(app, 'Levigatezza')
  app.check(num(await app.editor.color(10, 10)) === 70, 'stone_s smoothness starts at 70')
  await app.key('m')
  await app.editor.draw([
    [0, 0],
    [3, 3]
  ])
  await app.sleep(200)
  const label = await app.ev(
    `[...document.querySelectorAll('.generator-panel button')].find((b) => b.textContent.startsWith('Applica'))?.textContent`
  )
  app.check(
    label?.includes('alla selezione'),
    `the button says it acts on the selection (${label})`
  )
  await apply(app, 'Vetro')
  app.check(num(await app.editor.color(1, 1)) === 245, 'inside the selection: glass')
  app.check(num(await app.editor.color(10, 10)) === 70, 'outside the selection: unchanged')
  await app.key('Escape')

  // A selection made on Colore carries over to the channels.
  await app.click('Colore', '.map-tabs [role=tab]')
  await app.sleep(200)
  await app.key('m')
  await app.editor.draw([
    [8, 8],
    [11, 11]
  ])
  await app.sleep(200)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(200)
  await channel(app, 'Riflettanza')
  await channel(app, 'Levigatezza')
  const carried = await app.ev(
    `[...document.querySelectorAll('.generator-panel button')].find((b) => b.textContent.startsWith('Applica'))?.textContent`
  )
  app.check(
    carried?.includes('alla selezione'),
    `the Colore selection is active on _s (${carried})`
  )
  await apply(app, 'Ghiaccio')
  app.check(num(await app.editor.color(9, 9)) > 200, 'inside the Colore selection: ice')
  app.check(num(await app.editor.color(13, 13)) === 70, 'outside it: unchanged')
  app.check(num(await app.editor.color(1, 1)) === 245, 'the earlier glass is kept')
  await app.shot('03-selection-from-color')
  await app.key('Escape')
  await close(app)

  // 512×512: switching to Minerale and hovering must stay fast.
  await material(app, 'big.png')
  const t0 = Date.now()
  await app.click('Minerale', '.material-presets button')
  await app.waitFor(`document.querySelector('[data-testid=accent-count]')`)
  const switchMs = Date.now() - t0
  const t1 = Date.now()
  // Middle row: stays on screen however short the window (a 512 px texture does not fit at 100 %).
  for (let i = 0; i < 10; i++) await app.editor.color(10 + i * 20, 256)
  const hoverMs = (Date.now() - t1) / 10
  app.check(switchMs < 1500, `big texture: Minerale opens in ${switchMs} ms`)
  app.check(hoverMs < 250, `big texture: hover updates in ${Math.round(hoverMs)} ms`)
  const t2 = Date.now()
  await app.click('Applica minerale', '.generator-panel button')
  await app.waitFor(`document.querySelector('.editor-header').textContent.includes('modificata')`)
  app.check(Date.now() - t2 < 3000, `big texture: apply in ${Date.now() - t2} ms`)
}
