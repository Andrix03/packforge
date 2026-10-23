// Phase 8: channel painting of _n / _s with the editor tools, and the height/normal generator.
// The fixture's stone_n has seams (height 140, AO 150) around four 8×8 tiles; grass_block_top
// has no maps, so its _n / _s are created on save.

import { stat } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

async function value(app, x, y) {
  return app.editor.color(x, y)
}

async function preview(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.editor-side .preview-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  await app.sleep(800)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

async function setPrimary(app, v) {
  await app.setValue('input[aria-label="Valore primario"]', v)
  await app.sleep(100)
}

export default async function channels(app) {
  const file = (name) => join(app.paths.pack, ...BLOCK, name)
  const albedoBefore = (await stat(file('stone.png'))).mtimeMs

  await app.openPack()
  await app.openTexture('stone.png')
  const vanillaLook = await preview(app)
  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.waitFor(`document.querySelector('.value-panel')?.textContent.includes('Altezza')`)
  app.check(
    (await preview(app)) !== vanillaLook,
    'the 3D preview shows the LabPBR effects on a map'
  )
  app.check((await value(app, 0, 3)) === 'Altezza: 140', 'the height channel shows _n.a in gray')
  app.check((await value(app, 3, 3)) === 'Altezza: 255', 'tile tops are at the surface')
  await app.shot('01-height-channel')

  // Paint a groove with height 20.
  await setPrimary(app, 20)
  await app.editor.draw([
    [3, 3],
    [4, 3],
    [5, 3]
  ])
  await app.sleep(200)
  app.check((await value(app, 4, 3)) === 'Altezza: 20', 'the pencil paints the height value')
  app.check((await app.editor.header()).includes('modificata'), 'painting a channel is a change')
  app.check(
    await app.ev(`!!document.querySelector('.map-tabs [aria-selected=true] .glyph')`),
    'the _n tab shows unsaved changes'
  )

  // Other channels are untouched.
  await app.click('Occlusione', '.channel-tabs [role=tab]')
  await app.sleep(300)
  app.check((await value(app, 4, 3)) === 'Occlusione: 255', 'AO is untouched by the height stroke')
  app.check((await value(app, 0, 3)) === 'Occlusione: 150', 'AO shows _n.b')
  await app.click('Normali', '.channel-tabs [role=tab]')
  await app.sleep(300)
  app.check((await value(app, 0, 3)) === 'Normale X 50, Y 128', 'normals show red/green')
  await app.shot('02-normals-channel')

  // Undo/redo go through the same history.
  await app.click('Altezza', '.channel-tabs [role=tab]')
  await app.key('z', ['ctrl'])
  await app.sleep(150)
  app.check((await value(app, 4, 3)) === 'Altezza: 255', 'Ctrl+Z undoes the height stroke')
  await app.key('y', ['ctrl'])
  await app.sleep(150)
  app.check((await value(app, 5, 3)) === 'Altezza: 20', 'Ctrl+Y redoes it')

  // The 3D preview turns the effects on while painting a map.
  await app.shot('03-height-painted-3d')

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  app.check(
    (await stat(file('stone.png'))).mtimeMs === albedoBefore,
    'saving only the map does not rewrite the albedo'
  )
  await app.sleep(500)
  app.check(!(await app.editor.header()).includes('modificata'), 'saved: no longer modified')

  // Reopen: the saved map comes back with the painted height and the old seams.
  await app.click('Chiudi editor')
  await app.sleep(300)
  await app.openTexture('stone.png')
  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.waitFor(`document.querySelector('.value-panel')`)
  app.check((await value(app, 4, 3)) === 'Altezza: 20', 'the painted height was saved in _n.a')
  app.check((await value(app, 0, 3)) === 'Altezza: 140', 'unpainted heights are kept')
  await app.click('Occlusione', '.channel-tabs [role=tab]')
  await app.sleep(300)
  app.check((await value(app, 0, 3)) === 'Occlusione: 150', 'the other channels were kept on save')
  await app.click('Chiudi editor')
  await app.sleep(300)

  // A texture without maps: paint emission into a new _s.
  await app.openTexture('grass_block_top.png')
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.map-tabs [role=tab]')].some((t) => t.textContent.startsWith('+ Materiale _s'))`
    ),
    'missing maps are offered as new (+)'
  )
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.click('Emissione', '.channel-tabs [role=tab]')
  await app.sleep(300)
  app.check((await value(app, 2, 2)) === 'Emissione: 0', 'a new _s starts without emission')
  await app.click('Piena', '.value-presets button')
  await app.editor.click(2, 2)
  await app.sleep(150)
  app.check((await value(app, 2, 2)) === 'Emissione: 254', 'full emission is 254')
  // The eraser goes back to the neutral value, not transparent.
  await app.key('e')
  await app.editor.click(2, 2)
  await app.sleep(150)
  app.check((await value(app, 2, 2)) === 'Emissione: 0', 'the eraser turns emission off')
  await app.key('b')
  await app.editor.click(3, 2)

  // The generator on the new _n: height from the colors, then normals and AO.
  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.waitFor(`document.querySelector('.generator-panel')`)
  await app.click('Genera tutto dai colori', '.generator-panel button')
  await app.sleep(300)
  const lightest = await value(app, 0, 0)
  app.check(/^Altezza: \d+$/.test(lightest), 'the generator fills the height')
  // stoneValue: (0,0) = 110 (darkest), (1,0) = 110 + 2·12 = 134.
  const dark = Number((await value(app, 0, 0)).split(': ')[1])
  const light = Number((await value(app, 1, 0)).split(': ')[1])
  app.check(dark < light && dark >= 1, `dark pixels go deeper (${dark} < ${light})`)
  await app.click('Normali', '.channel-tabs [role=tab]')
  await app.sleep(300)
  app.check((await value(app, 1, 0)) !== 'Normale X 128, Y 128', 'normals follow the height')
  await app.shot('04-generated-normals')
  await app.key('z', ['ctrl'])
  await app.sleep(150)
  app.check(
    (await value(app, 1, 0)) === 'Normale X 128, Y 128',
    'one Ctrl+Z undoes the whole generation'
  )
  await app.key('y', ['ctrl'])

  // Auto-update: painting the height regenerates the normals (on for a new _n).
  await app.click('Altezza', '.channel-tabs [role=tab]')
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.generator-panel label')].find((l) => l.textContent.includes('Aggiorna mentre')).querySelector('input').checked`
    ),
    'auto normals start on for a map without hand-made normals'
  )
  await setPrimary(app, 1)
  await app.editor.click(8, 8)
  await app.sleep(150)
  await app.click('Normali', '.channel-tabs [role=tab]')
  await app.sleep(300)
  const [nx] = (await value(app, 9, 8)).match(/\d+/g).map(Number)
  app.check(nx < 128, `the pixel right of a painted pit leans left into it (red ${nx})`)

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  const created = await Promise.all(
    ['grass_block_top_n.png', 'grass_block_top_s.png'].map((name) =>
      stat(file(name)).then(
        () => true,
        () => false
      )
    )
  )
  app.check(created.every(Boolean), 'new _n and _s are created on save')
  await app.shot('05-saved')
}
