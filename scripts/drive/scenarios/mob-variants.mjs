// 1.4 random mob textures (OptiFine / ETF): a variant is copied to optifine/random/entity/ and
// opened; a rule (variant 2 only in the desert) is written to the .properties beside it.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
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

export default async function mobVariants(app) {
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'entity', 'zombie')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'zombie.png'),
    png(64, 64, (x, y) => [60 + x, 120, 60 + y, 255])
  )
  const random = join(
    app.paths.pack,
    'assets',
    'minecraft',
    'optifine',
    'random',
    'entity',
    'zombie'
  )

  await app.openPack()
  await openFolder(app, 'assets/minecraft/textures/entity/zombie')
  await app.openTexture('zombie.png')
  await app.click('Varianti del mob', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=mob-variants]')`)
  await app.click('Aggiungi la variante 2', '[role=dialog] button')
  await app.waitFor(
    `document.querySelector('.editor-header')?.textContent.includes('zombie2')`,
    10000
  )
  app.check(
    (await stat(join(random, 'zombie2.png')).catch(() => null))?.isFile() === true,
    'zombie2.png copied and opened'
  )

  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await app.sleep(800)
  await app.openTexture('zombie.png')
  await app.click('Varianti del mob', '.editor button')
  await app.waitFor(
    `document.querySelectorAll('[data-testid=mob-variants] li').length === 2`,
    10000
  )
  app.check(true, 'the dialog lists texture 1 and variant 2')
  await app.click('Aggiungi una regola', '[role=dialog] button')
  await app.setValue('[aria-label="Texture della regola 1"]', '2')
  await app.setValue('.mob-rule input[placeholder^="ovunque"]', 'desert')
  await app.shot('mob-variants')
  await app.click('Salva le regole', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=mob-message]')`, 10000)
  const properties = await readFile(join(random, 'zombie.properties'), 'utf8')
  app.check(
    properties === 'textures.1=2\nbiomes.1=desert\n',
    `the rule is written (${JSON.stringify(properties)})`
  )
}
