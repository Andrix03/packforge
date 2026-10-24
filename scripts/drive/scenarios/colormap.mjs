// 1.4 colormap preview: a grass colormap opens with the biome points and their colours; plains
// (temperature 0.8, downfall 0.4) reads pixel (50, 173) as the game does: (int)((1 - 0.8) * 255)
// is 50, the float being just under 0.2.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
    })()`)
    await app.sleep(150)
  }
}

export default async function colormap(app) {
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'colormap')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'grass.png'),
    png(256, 256, (x, y) => [x, y, 100, 255])
  )
  await app.openPack()
  await openFolder(app, 'assets/minecraft/textures/colormap')
  await app.openTexture('grass.png')
  await app.waitFor(`document.querySelector('.colormap-preview')`)
  app.check(
    await app.ev(`!document.querySelector('.editor-side .preview-canvas')`),
    'a colormap gets the colormap preview'
  )
  await app.sleep(500)
  const plains = await app.ev(
    `document.querySelector('[data-testid=colormap-biomes] .colormap-swatch').style.background`
  )
  app.check(plains === 'rgb(50, 173, 100)', `plains reads pixel (50, 173) (${plains})`)
  await app.shot('colormap')
}
