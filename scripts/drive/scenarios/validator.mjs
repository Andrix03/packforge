// Phase 8 validator: broken maps are added to the fixture pack, "Controlla mappe" must find each
// problem (and nothing on the fixture's good maps), "Apri" opens the texture, and saving an
// animated texture writes the maps' .png.mcmeta so the animation problem goes away.
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

async function issues(app) {
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  return app.ev(`[...document.querySelectorAll('.validator-issue')].map((li) => ({
    severity: [...li.classList].find((c) => c !== 'validator-issue'),
    file: li.querySelector('strong').textContent,
    text: li.querySelector('p').textContent
  }))`)
}

const find = (list, file, words) => list.find((i) => i.file === file && i.text.includes(words))

export default async function validator(app) {
  const block = join(app.paths.pack, ...BLOCK)
  // magma.png is a 3-frame strip: a _s strip without its own .mcmeta.
  await writeFile(
    join(block, 'magma_s.png'),
    png(16, 48, () => [40, 10, 0, 255])
  )
  // Wrong aspect ratio, bilinear resize, all-emissive, height 0 everywhere.
  await writeFile(
    join(block, 'sand_n.png'),
    png(16, 32, () => [128, 128, 255, 255])
  )
  await writeFile(
    join(block, 'grass_block_top_s.png'),
    png(24, 24, () => [40, 10, 0, 255])
  )
  await writeFile(
    join(block, 'oak_planks_s.png'),
    png(32, 32, () => [40, 10, 0, 200])
  )
  await writeFile(
    join(block, 'glass_n.png'),
    png(16, 16, () => [128, 128, 255, 0])
  )
  // Orphans.
  await writeFile(
    join(block, 'nothing_here_s.png'),
    png(16, 16, () => [40, 10, 0, 255])
  )
  await writeFile(join(block, 'lost.png.mcmeta'), '{"animation":{}}')

  await app.openPack()
  await app.click('Controlla mappe')
  const list = await issues(app)
  await app.shot('01-validator')
  const summary = await app.ev(
    `document.querySelector('[data-testid=validator-summary]').textContent`
  )
  app.check(summary.includes('mappe controllate'), `summary shown (${summary})`)
  app.check(
    find(list, 'magma_s.png', 'magma_s.png.mcmeta')?.severity === 'error',
    'animated texture, map strip without .mcmeta: error'
  )
  app.check(find(list, 'sand_n.png', 'Proporzioni')?.severity === 'error', 'aspect ratio: error')
  app.check(
    find(list, 'grass_block_top_s.png', 'sfumatura')?.severity === 'warning',
    '24×24 on 16×16: bilinear warning'
  )
  app.check(
    find(list, 'oak_planks_s.png', 'Tutti i pixel emettono')?.severity === 'warning',
    'alpha 200 everywhere: all-emissive warning'
  )
  app.check(find(list, 'glass_n.png', 'Altezza 0 ovunque')?.severity === 'error', 'height 0: error')
  app.check(Boolean(find(list, 'nothing_here_s.png', 'nothing_here.png')), 'orphan map reported')
  app.check(find(list, 'lost.png.mcmeta', 'orfano')?.severity === 'warning', 'orphan .mcmeta')
  const good = ['stone_n.png', 'stone_s.png', 'gold_block_s.png', 'glowstone_s.png', 'sand_s.png']
  const noisy = list.filter((i) => good.includes(i.file))
  app.check(
    noisy.length === 0,
    `the fixture's good maps raise nothing (${noisy.map((i) => i.file).join(', ')})`
  )
  app.check(
    !(await app.ev(
      `[...document.querySelectorAll('.validator-issue')].find((li) => li.textContent.includes('lost.png.mcmeta'))?.querySelector('button')`
    )),
    'no "Apri" for a file without texture'
  )

  // Apri on magma_s opens magma; painting its _s and saving writes magma_s.png.mcmeta.
  await app.ev(`[...document.querySelectorAll('.validator-issue')]
    .find((li) => li.textContent.includes('magma_s.png.mcmeta')).querySelector('button').click()`)
  await app.waitFor(`document.querySelector('.editor-header')?.textContent.includes('magma')`)
  await app.sleep(500)
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.click('Pietra', '.material-presets button')
  await app.click('Applica pietra', '.generator-panel button')
  await app.sleep(300)
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  const mcmetaPath = join(block, 'magma_s.png.mcmeta')
  const written = await stat(mcmetaPath).then(
    () => true,
    () => false
  )
  app.check(written, 'saving the animated texture writes magma_s.png.mcmeta')
  if (written) {
    const content = JSON.parse(await readFile(mcmetaPath, 'utf8'))
    app.check(content.animation?.frametime === 2, 'with the texture animation (frametime 2)')
  }
  await app.click('Chiudi editor')
  await app.sleep(800)
  await app.click('Controlla mappe')
  const after = await issues(app)
  app.check(!find(after, 'magma_s.png', 'mcmeta'), 'the animation problem is gone')
  await app.shot('02-after-fix')
}
