// v3: a zombie texture opens on the zombie in 3D (shared/mobModel.ts) instead of a block, from the
// Entità section; a stroke shows up on the model. Our own pixels only.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

export default async function mobPreview(app) {
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'entity', 'zombie')
  await mkdir(dir, { recursive: true })
  // Head green, body teal, legs blue, the rest (overlay, unused) transparent.
  await writeFile(
    join(dir, 'zombie.png'),
    png(64, 64, (x, y) =>
      y < 16 && x < 32
        ? [90, 140, 70, 255]
        : y >= 16 && y < 32 && x >= 16 && x < 40
          ? [40, 110, 115, 255]
          : y >= 16 && y < 32 && x < 16
            ? [60, 60, 140, 255]
            : y >= 16 && y < 32 && x >= 40 && x < 56
              ? [90, 140, 70, 255]
              : [0, 0, 0, 0]
    )
  )
  await app.openPack()
  await app.section('entities')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/zombie.png'))`
  )
  const group = await app.ev(
    `document.querySelector('.group-row.active, .group-row[data-group="hostile"]')?.textContent ?? ''`
  )
  app.check(
    /Mob ostili/.test(await app.ev(`document.querySelector('.group-list').textContent`)),
    `zombie is a hostile mob (${group})`
  )
  await app.openTexture('zombie.png')
  await app.waitFor(`document.querySelector('.mob-preview canvas')`, 10000)
  app.check(
    await app.ev(`!document.querySelector('.editor .preview-canvas')`),
    'the zombie, not the block'
  )
  app.check(
    (await app.ev(`document.querySelector('.shell-slot.active')?.dataset.section`)) === 'entities',
    'Entità stays lit while painting it'
  )
  await app.sleep(800)
  await app.shot('mob-preview')
  // Paint the face red: the model takes it live.
  await app.editor.setHex('#c03030')
  await app.editor.click(10, 10)
  await app.sleep(400)
  app.check((await app.editor.color(10, 10)) === '#c03030', 'painted on the head')
  await app.shot('mob-preview-painted')
}
