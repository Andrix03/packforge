// Phase 10 backups: an editor save and a batch (one overwrite, one creation) take backups; the
// dialog lists them; restoring puts the exact bytes back and removes what was created; the
// restore itself can be undone; a backup can be deleted.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

async function openBackups(app) {
  await app.click('🕘 Backup')
  await app.waitFor(`document.querySelector('[aria-label=Backup] ul, [data-testid=backup-empty]')`)
  await app.sleep(200)
}

const labels = (app) =>
  app.ev(
    `[...document.querySelectorAll('[aria-label=Backup] li strong')].map((s) => s.textContent)`
  )

async function restore(app, label) {
  await app.ev(`window.confirm = () => true`)
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Backup] li')].find((li) => li.querySelector('strong').textContent === ${JSON.stringify(label)}).querySelector('button').click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=backup-message]')`, 10000)
  await app.sleep(600)
  return app.ev(`document.querySelector('[data-testid=backup-message]').textContent`)
}

async function closeBackups(app) {
  await app.click('Chiudi', '[aria-label=Backup] button')
  await app.sleep(200)
}

export default async function backups(app) {
  const file = (name) => join(app.paths.pack, ...BLOCK, name)
  const stoneOriginal = await readFile(file('stone.png'))
  const glowOriginal = await readFile(file('glowstone_s.png'))
  await app.openPack()

  await openBackups(app)
  app.check(
    await app.ev(`!!document.querySelector('[data-testid=backup-empty]')`),
    'no backups at first'
  )
  await closeBackups(app)

  // 1. An editor save.
  await app.openTexture('stone.png')
  await app.editor.setHex('ff00ff')
  await app.editor.click(2, 2)
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  await app.click('Chiudi editor')
  await app.sleep(600)
  const stonePainted = await readFile(file('stone.png'))
  app.check(!stonePainted.equals(stoneOriginal), 'the save changed stone.png')

  // 2. A batch: overwrite glowstone_s, create grass_block_top_s.
  await app.click('Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch')`)
  await app.click('Nessuna', '.modal.batch button')
  for (const name of ['glowstone', 'grass_block_top']) {
    await app.ev(
      `[...document.querySelectorAll('.batch-list label')].find((l) => l.textContent.startsWith(${JSON.stringify(name + 'block')})).querySelector('input').click()`
    )
  }
  await app.click('Pietra', '.modal.batch .material-presets button')
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Sovrascrivile')).querySelector('input').click()`
  )
  await app.ev(`window.confirm = () => true`)
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 20000)
  await app.click('Chiudi', '.modal.batch button')
  await app.sleep(800)
  app.check(await exists(file('grass_block_top_s.png')), 'the batch created grass_block_top_s')
  app.check(
    !(await readFile(file('glowstone_s.png'))).equals(glowOriginal),
    'the batch overwrote glowstone_s'
  )

  await openBackups(app)
  const list = await labels(app)
  app.check(
    list[0] === 'Applica in blocco (Pietra)' && list[1] === 'Salvataggio di stone',
    `newest first (${list.join(' | ')})`
  )
  const batchRow = await app.ev(
    `[...document.querySelectorAll('[aria-label=Backup] li')][0].textContent`
  )
  app.check(
    batchRow.includes('1 file salvati') && batchRow.includes('1 file nuovi'),
    `batch backup counts (${batchRow})`
  )
  await app.shot('01-backups')

  // 3. Restore the batch: exact bytes back, the created map removed.
  const msg = await restore(app, 'Applica in blocco (Pietra)')
  app.check(msg.includes('1 file rimessi, 1 rimossi'), `restored (${msg})`)
  app.check(
    (await readFile(file('glowstone_s.png'))).equals(glowOriginal),
    'glowstone_s is byte-identical again'
  )
  app.check(!(await exists(file('grass_block_top_s.png'))), 'grass_block_top_s removed')

  // 4. Restore the save, then undo that restore.
  await restore(app, 'Salvataggio di stone')
  app.check(
    (await readFile(file('stone.png'))).equals(stoneOriginal),
    'stone.png is the original again'
  )
  const afterRestore = await labels(app)
  app.check(
    afterRestore[0] === 'Prima di ripristinare «Salvataggio di stone»',
    `the restore took a backup (${afterRestore[0]})`
  )
  await restore(app, 'Prima di ripristinare «Salvataggio di stone»')
  app.check(
    (await readFile(file('stone.png'))).equals(stonePainted),
    'undoing the restore brings the painted stone back'
  )

  // 5. Delete.
  const before = (await labels(app)).length
  await app.ev(`window.confirm = () => true`)
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Backup] li')][0].querySelectorAll('button')[1].click()`
  )
  await app.sleep(600)
  app.check((await labels(app)).length === before - 1, 'a backup can be deleted')
  await closeBackups(app)
}
