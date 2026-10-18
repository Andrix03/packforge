// Phase 8: material presets on _s. grass_block_top (stone pattern, no maps) gets three cyan
// "diamond" pixels, a new _s, the ore preset (gem pixels found by color), undo/redo, the emissive
// preset (only light pixels glow), then a save that creates the _s file.

import { stat } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']
const GEM = [
  [2, 2],
  [3, 2],
  [2, 3]
]

export default async function materials(app) {
  await app.openPack()
  await app.openTexture('grass_block_top.png')
  await app.editor.setHex('5ae6dc')
  for (const point of GEM) await app.editor.click(...point)
  await app.sleep(200)
  app.check((await app.editor.color(2, 2)) === '#5ae6dc', 'gem pixels painted on the albedo')

  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.click('Minerale', '.material-presets button')
  await app.sleep(200)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=accent-count]')?.textContent`)) ===
      'Pixel gemma: 3',
    'the ore preset finds exactly the three colored pixels'
  )
  await app.click('Applica minerale', '.generator-panel button')
  await app.sleep(300)
  app.check(
    (await app.editor.color(2, 2)) === 'Levigatezza: 225',
    'gem pixels are smooth (diamond)'
  )
  const stone = await app.editor.color(8, 8)
  const stoneValue = Number(stone.split(': ')[1])
  app.check(stoneValue >= 30 && stoneValue <= 70, `stone pixels stay rough around 50 (${stone})`)
  await app.click('Riflettanza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check((await app.editor.color(2, 2)) === 'Riflettanza / metallo: 44', 'gem F0 = diamond 17%')
  app.check((await app.editor.color(8, 8)) === 'Riflettanza / metallo: 10', 'stone F0 = 4%')
  await app.click('Porosità', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check((await app.editor.color(8, 8)) === 'Porosità / SSS: 24', 'stone porosity written')
  await app.ev(
    `document.querySelector('.generator-panel[aria-label=Materiale]').scrollIntoView({ block: 'end' })`
  )
  await app.shot('01-ore-applied')

  // One undo step for the whole preset.
  await app.key('z', ['ctrl'])
  await app.sleep(200)
  app.check((await app.editor.color(8, 8)) === 'Porosità / SSS: 0', 'Ctrl+Z undoes the preset')
  await app.click('Riflettanza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check(
    (await app.editor.color(2, 2)) === 'Riflettanza / metallo: 10',
    'Ctrl+Z restores F0 too (one step)'
  )
  await app.key('y', ['ctrl'])
  await app.sleep(200)
  app.check(
    (await app.editor.color(2, 2)) === 'Riflettanza / metallo: 44',
    'Ctrl+Y redoes the preset'
  )

  // Emissive: the light cyan glows, the darker stone stays off.
  await app.click('Luminoso', '.material-presets button')
  await app.click('Applica luminoso', '.generator-panel button')
  await app.sleep(300)
  await app.click('Emissione', '.channel-tabs [role=tab]')
  await app.sleep(200)
  const glow = Number((await app.editor.color(2, 2)).split(': ')[1])
  app.check(glow >= 127 && glow <= 254, `light pixels glow (${glow})`)
  app.check((await app.editor.color(8, 8)) === 'Emissione: 0', 'darker pixels stay off')
  await app.shot('02-emissive')

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  const saved = await stat(join(app.paths.pack, ...BLOCK, 'grass_block_top_s.png')).then(
    () => true,
    () => false
  )
  app.check(saved, 'the new _s is created on save')
}
