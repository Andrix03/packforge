// 1.4 pack doctor: names the game ignores (capitals, 1.12 folders), a model pointing to a missing
// texture (purple-black), broken JSON; the game textures the pack doesn't replace; and the
// comparison of two installed versions (reads the user's launcher, writes nothing).
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { png } from '../fixtures.mjs'

export default async function doctor(app) {
  const at = (...parts) => join(app.paths.pack, 'assets', 'minecraft', ...parts)
  await mkdir(at('textures', 'blocks'), { recursive: true })
  await mkdir(at('models', 'block'), { recursive: true })
  await mkdir(at('items'), { recursive: true })
  await writeFile(
    at('textures', 'block', 'Ruby.png'),
    png(16, 16, () => [200, 20, 40, 255])
  )
  await writeFile(
    at('textures', 'blocks', 'old.png'),
    png(16, 16, () => [20, 20, 200, 255])
  )
  await writeFile(
    at('models', 'block', 'ruby_block.json'),
    JSON.stringify({ parent: 'block/cube_all', textures: { all: 'block/ruby_block' } })
  )
  await writeFile(at('items', 'ruby.json'), '{ "model": ')

  await app.openPack({ waitForVanilla: true })
  await app.click('Diagnosi', '.tool-bar button')
  await app.waitFor(`document.querySelector('[data-testid=doctor-problems]')`, 20000)
  const problems = await app.ev(
    `document.querySelector('[data-testid=doctor-problems]').textContent`
  )
  app.check(problems.includes('Ruby.png') && problems.includes('maiuscole'), 'capital letters')
  app.check(problems.includes('textures/blocks/'), 'the 1.12 blocks/ folder')
  app.check(
    problems.includes('ruby_block.json') && problems.includes('viola e nero'),
    'a model using a texture that exists nowhere'
  )
  app.check(problems.includes('JSON non valido'), 'broken JSON')
  app.check(
    !problems.includes('stone') && !problems.includes('cube_all.json'),
    'vanilla references are not reported'
  )
  await app.shot('doctor-problems')

  await app.click('Cosa manca', '[role=dialog] [role=tab]')
  await app.waitFor(`document.querySelector('[data-testid=doctor-missing] button')`)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=doctor-missing]').textContent`)).includes(
      'block'
    ),
    'missing game textures grouped by folder'
  )
  await app.ev(`document.querySelector('[data-testid=doctor-missing] button').click()`)
  await app.sleep(300)
  await app.shot('doctor-missing')

  // Porting on a FAKE .minecraft with two tiny versions: "new" renamed grass_path_top to
  // dirt_path_top (same pixels) and dropped old_flower.
  await app.key('Escape')
  const fake = join(dirname(app.paths.userData), 'fake-minecraft')
  const path = png(16, 16, (x, y) => [(x * 13) % 255, (y * 7) % 255, 90, 255])
  const flower = png(16, 16, (x) => [x * 9, 200, 30, 255])
  await fakeVersion(fake, 'old', '2020-01-01T00:00:00+00:00', {
    'block/grass_path_top.png': path,
    'block/old_flower.png': flower
  })
  await fakeVersion(fake, 'new', '2021-01-01T00:00:00+00:00', {
    'block/dirt_path_top.png': path
  })
  await writeFile(
    at('textures', 'block', 'grass_path_top.png'),
    png(16, 16, () => [1, 2, 3, 255])
  )
  await writeFile(
    at('textures', 'block', 'grass_path_top_n.png'),
    png(16, 16, () => [128, 128, 255, 255])
  )
  await writeFile(
    at('textures', 'block', 'old_flower.png'),
    png(16, 16, () => [4, 5, 6, 255])
  )
  const set = await app.ev(`window.api.invoke('settings:setMinecraftDir', ${JSON.stringify(fake)})`)
  app.check(set?.ok !== false, 'the fake .minecraft is set')
  await app.sleep(800)

  await app.click('Diagnosi', '.tool-bar button')
  await app.click('Cambio di versione', '[role=dialog] [role=tab]')
  await app.waitFor(`document.querySelector('[aria-label="Versione di partenza"]')`, 10000)
  await app.setValue('[aria-label="Versione di partenza"]', 'old')
  await app.setValue('[aria-label="Versione di arrivo"]', 'new')
  await app.click('Confronta', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=doctor-diff]')`, 30000)
  const diff = await app.ev(`document.querySelector('[data-testid=doctor-diff]').textContent`)
  app.check(
    diff.startsWith('Rinominate 1, tolte 1, nuove 0'),
    `old → new compared (${diff.slice(0, 60)})`
  )
  app.check(diff.includes('grass_path_top_n.png'), 'the texture moves with its map')
  app.check(diff.includes('old_flower.png'), 'the dropped texture is listed')
  await app.shot('doctor-porting')
  await app.click('Sposta 2 file', '[role=dialog] button')
  await app.waitFor(
    `document.querySelector('[role=dialog]')?.textContent.includes('2 file spostati')`,
    10000
  )
  const block = at('textures', 'block')
  const names = (await readdir(block)).sort()
  app.check(
    names.includes('dirt_path_top.png') &&
      names.includes('dirt_path_top_n.png') &&
      !names.includes('grass_path_top.png'),
    `renamed in the pack (${names.join(', ')})`
  )
}

/** A launcher version folder with a jar holding only `textures` (our own pixels). */
async function fakeVersion(dir, id, releaseTime, textures) {
  const folder = join(dir, 'versions', id)
  await mkdir(folder, { recursive: true })
  const files = { 'version.json': strToU8(JSON.stringify({ pack_version: { resource: 46 } })) }
  for (const [path, bytes] of Object.entries(textures)) {
    files[`assets/minecraft/textures/${path}`] = bytes
  }
  await writeFile(join(folder, `${id}.jar`), zipSync(files))
  await writeFile(join(folder, `${id}.json`), JSON.stringify({ id, type: 'release', releaseTime }))
}
