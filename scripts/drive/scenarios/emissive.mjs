// 1.4 emissive overlays: a pack texture whose _s map emits (LabPBR alpha < 255) gets its _e
// texture; the properties file is written once; an existing _e is kept unless replacing.
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

export default async function emissive(app) {
  const block = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block')
  const middle = (x, y) => x > 4 && x < 11 && y > 4 && y < 11
  await writeFile(
    join(block, 'lamp.png'),
    png(16, 16, (x, y) => (middle(x, y) ? [250, 210, 90, 255] : [90, 70, 50, 255]))
  )
  // Smoothness 0, F0 10, no porosity; emission 200/254 in the middle, none (255) elsewhere.
  await writeFile(
    join(block, 'lamp_s.png'),
    png(16, 16, (x, y) => [0, 10, 0, middle(x, y) ? 200 : 255])
  )

  await app.openPack()
  await app.click('Luce _e', '.tool-bar button')
  await app.waitFor(`document.querySelector('[data-testid=emissive-plan]')`, 15000)
  const plan = await app.ev(`document.querySelector('[data-testid=emissive-plan]').textContent`)
  app.check(/file _e da scrivere/.test(plan), `the plan (${plan})`)
  await app.shot('emissive-dialog')
  await app.click('Scrivi', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=emissive-result]')`, 15000)

  const lamp = await stat(join(block, 'lamp_e.png')).catch(() => null)
  app.check(lamp?.isFile() === true, 'lamp_e.png written')
  const properties = await readFile(
    join(app.paths.pack, 'assets', 'minecraft', 'optifine', 'emissive.properties'),
    'utf8'
  ).catch(() => '')
  app.check(properties === 'suffix.emissive=_e\n', 'emissive.properties written')
}
