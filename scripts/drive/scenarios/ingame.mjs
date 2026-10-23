// Phase 10 "Prova in gioco": the copy into resourcepacks of a FAKE .minecraft (never the real
// one), copy now, automatic copy after external changes (added and removed files), a folder of
// the same name that PackForge did not create is left alone, the key reminders are shown.
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { png } from '../fixtures.mjs'

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

async function openDialog(app) {
  await app.click('Copia nel gioco')
  await app.waitFor(
    `document.querySelector('[data-testid=sync-target], [data-testid=sync-reason]')`
  )
  await app.sleep(200)
}

const text = (app, id) => app.ev(`document.querySelector('[data-testid=${id}]')?.textContent ?? ''`)

export default async function ingame(app) {
  const fake = join(dirname(app.paths.userData), 'fake-minecraft')
  await mkdir(fake, { recursive: true })
  await app.openPack()
  const set = await app.ev(`window.api.invoke('settings:setMinecraftDir', ${JSON.stringify(fake)})`)
  app.check(set?.ok !== false, 'the fake .minecraft is set')
  const target = join(fake, 'resourcepacks', 'pack')

  await openDialog(app)
  const where = await text(app, 'sync-target')
  // Safety: stop before copying anywhere but the fake folder.
  if (!where.startsWith(fake)) throw new Error(`refusing to sync outside the fake folder: ${where}`)
  app.check(where.includes('non ancora copiato'), `target shown (${where})`)
  app.check(
    await app.ev(
      `document.querySelector('[aria-label="Prova in gioco"]').textContent.includes('F3 + T')`
    ),
    'key reminders shown'
  )
  await app.shot('01-ingame')

  await app.click('Copia nel gioco', '[aria-label="Prova in gioco"] button')
  await app.waitFor(`document.querySelector('[data-testid=sync-last]')`, 15000)
  const last = await text(app, 'sync-last')
  app.check(/\d+ file copiati/.test(last), `copied (${last})`)
  app.check(await exists(join(target, 'pack.mcmeta')), 'pack.mcmeta in resourcepacks/pack')
  app.check(
    await exists(join(target, 'assets', 'minecraft', 'textures', 'block', 'stone.png')),
    'textures copied'
  )
  app.check(await exists(join(target, '.packforge-copy')), 'marker written')
  app.check((await text(app, 'sync-target')).includes('copia di PackForge'), 'now PackForge’s copy')

  // Automatic copy after changes made outside the app.
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Prova in gioco"] label')].find((l) => l.textContent.includes('da sola')).querySelector('input').click()`
  )
  await app.sleep(300)
  const block = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block')
  await writeFile(
    join(block, 'new_block.png'),
    png(16, 16, () => [10, 200, 30, 255])
  )
  await app
    .waitFor(
      `document.querySelector('[data-testid=sync-last]').textContent.includes('1 file copiati')`,
      10000
    )
    .catch(() => null)
  app.check(
    await exists(join(target, 'assets', 'minecraft', 'textures', 'block', 'new_block.png')),
    'auto: a new file is copied'
  )
  await rm(join(block, 'new_block.png'))
  await app.sleep(2500)
  app.check(
    !(await exists(join(target, 'assets', 'minecraft', 'textures', 'block', 'new_block.png'))),
    'auto: a removed file is removed'
  )
  const copiedMcmeta = await readFile(join(target, 'pack.mcmeta'), 'utf8')
  const ownMcmeta = await readFile(join(app.paths.pack, 'pack.mcmeta'), 'utf8')
  app.check(copiedMcmeta === ownMcmeta, 'the copy matches the pack')
  await app.click('Chiudi', '[aria-label="Prova in gioco"] button')

  // A folder of the same name that PackForge did not make is never touched.
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await writeFile(join(target, 'mine.txt'), 'user file')
  await openDialog(app)
  app.check(
    await app.ev(
      `document.querySelector('[aria-label="Prova in gioco"]').textContent.includes('non ha creato')`
    ),
    'foreign folder explained'
  )
  app.check(
    await app.ev(
      `[...document.querySelectorAll('[aria-label="Prova in gioco"] button')].find((b) => b.textContent.startsWith('Copia nel gioco')).disabled`
    ),
    'copy disabled over a foreign folder'
  )
  app.check(
    (await readFile(join(target, 'mine.txt'), 'utf8')) === 'user file',
    'the user file is intact'
  )
  await app.shot('02-foreign')
}
