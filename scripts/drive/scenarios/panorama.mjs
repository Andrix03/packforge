// One panorama face without the other five makes the game reject the whole pack ("Resource reload
// failed", found in Andrea's playtest): Schermate, Diagnosi and the export check all say so.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

export default async function panorama(app) {
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'gui', 'title', 'background')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'panorama_0.png'),
    png(64, 64, () => [120, 170, 230, 255])
  )
  await app.openPack()

  await app.section('screens')
  await app.waitFor(`document.querySelector('[data-testid=panorama-partial]')`, 10000)
  const page = await app.ev(`document.querySelector('[data-testid=panorama-partial]').textContent`)
  app.check(
    page.includes('1 facce su 6') && page.includes('panorama_5'),
    `Schermate warns about the missing faces (${page})`
  )
  await app.shot('panorama-partial')

  await app.section('pack')
  await app.tool('Diagnosi')
  await app.waitFor(`document.querySelector('[data-testid=doctor-problems]')`, 20000)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=doctor-problems]').textContent`)).includes(
      'facce su 6'
    ),
    'Diagnosi lists it'
  )
  await app.key('Escape')
  await app.waitFor(`!document.querySelector('[role=dialog]')`)

  await app.tool('Esporta')
  await app.waitFor(
    `document.querySelector('[aria-label=Esporta]')?.textContent.includes('facce su 6')`,
    20000
  )
  app.check(true, 'the export check stops on it')
  await app.shot('panorama-export')
}
