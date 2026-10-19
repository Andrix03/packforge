// Phase 11 export: project info (version, author, license, notes, a credit) saved in
// packforge.json, the checklist (stray files, missing icon), three variants (full, base, 32×)
// written next to the pack, zip contents checked, re-export asks before overwriting.
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { unzipSync } from 'fflate'

const B = 'assets/minecraft/textures/block/'

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false
  )

async function openExport(app) {
  await app.click('📦 Esporta')
  await app.waitFor(`document.querySelector('[data-testid=export-check]')`, 20000)
  await app.sleep(300)
}

async function exportNow(app) {
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Esporta] button')].find((b) => b.textContent.startsWith('Esporta ')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=export-results]')`, 60000)
  await app.sleep(200)
  return app.ev(
    `[...document.querySelectorAll('[data-testid=export-results] li')].map((li) => li.textContent)`
  )
}

export default async function exporting(app) {
  await writeFile(join(app.paths.pack, ...B.split('/'), 'stone.psd'), 'work file')
  await writeFile(join(app.paths.pack, ...B.split('/'), 'Thumbs.db'), 'os file')
  await app.openPack()
  await openExport(app)

  const check = await app.ev(`document.querySelector('[data-testid=export-check]').textContent`)
  app.check(
    check.includes('2 file di lavoro o di sistema'),
    `stray files reported (${check.slice(0, 160)})`
  )
  app.check(check.includes('stone.psd') && check.includes('Thumbs.db'), 'stray files named')
  app.check(check.includes('pack.png'), 'missing icon reported')
  const dir = await app.ev(`document.querySelector('[data-testid=export-dir]').textContent`)
  app.check(
    dir === join(dirname(app.paths.pack), 'pack - export'),
    `default destination next to the pack (${dir})`
  )

  await app.setValue('[aria-label=Esporta] input[aria-label=Versione]', '1.2.0')
  await app.setValue('[aria-label=Esporta] input[aria-label=Autore]', 'Andrea')
  await app.setValue('[aria-label=Esporta] select[aria-label=Licenza]', 'CC-BY-NC-SA-4.0')
  await app.setValue('[aria-label=Esporta] textarea[aria-label=Novità]', 'Prima versione con PBR')
  await app.click('+ Credito', '[aria-label=Esporta] button')
  await app.setValue('[aria-label=Esporta] input[aria-label="Nome 1"]', 'Amico')
  await app.setValue('[aria-label=Esporta] input[aria-label="Contributo 1"]', 'idee')
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Esporta] label')].find((l) => l.textContent.startsWith('Senza PBR')).querySelector('input').click()`
  )
  await app.ev(
    `[...document.querySelectorAll('[aria-label=Esporta] label')].find((l) => l.textContent.startsWith('Anche a')).querySelector('input').click()`
  )
  await app.setValue('[aria-label=Esporta] select[aria-label="Risoluzione export"]', 32)
  await app.sleep(200)
  await app.shot('01-export')
  const results = await exportNow(app)
  app.check(
    results.length === 3 && results.every((r) => r.includes('.zip')),
    `three zips (${results.join(' | ')})`
  )
  await app.shot('02-results')

  const full = join(dir, 'pack-1.2.0.zip')
  const base = join(dir, 'pack-1.2.0-base.zip')
  const big = join(dir, 'pack-1.2.0-32x.zip')
  app.check(
    (await exists(full)) && (await exists(base)) && (await exists(big)),
    'files named with version and variant'
  )
  const entries = unzipSync(await readFile(full))
  const names = Object.keys(entries)
  app.check(
    names.includes('pack.mcmeta') && names.includes(`${B}stone_n.png`),
    'full zip has the pack and its maps'
  )
  app.check(
    !names.some((n) => n.endsWith('.psd') || n.endsWith('Thumbs.db') || n === 'packforge.json'),
    'no stray or project files'
  )
  const credits = Buffer.from(entries['CREDITS.txt']).toString()
  app.check(
    credits.includes('by Andrea') &&
      credits.includes('- Amico: idee') &&
      credits.includes('NOT AN OFFICIAL MINECRAFT PRODUCT'),
    'CREDITS with author, credit, disclaimer'
  )
  app.check(
    Buffer.from(entries['LICENSE.txt']).toString().includes('CC BY-NC-SA 4.0'),
    'LICENSE with the chosen license'
  )
  app.check(
    Buffer.from(entries['CHANGELOG.md']).toString().includes('## 1.2.0') &&
      Buffer.from(entries['CHANGELOG.md']).toString().includes('Prima versione con PBR'),
    'CHANGELOG with the notes'
  )
  const baseNames = Object.keys(unzipSync(await readFile(base)))
  app.check(!baseNames.some((n) => /_[ns]\.png$/.test(n)), 'base zip has no _n / _s')
  const bigStone = unzipSync(await readFile(big))[`${B}stone.png`]
  app.check(
    Boolean(bigStone) && Buffer.from(bigStone).readUInt32BE(16) === 32,
    '32× zip: stone is 32 px wide'
  )
  // The listing kit for Modrinth / CurseForge.
  const listingDir = join(dir, 'listing', '1.2.0')
  const listing = await readFile(join(listingDir, 'listing.txt'), 'utf8').catch(() => '')
  app.check(
    listing.includes('File: pack-1.2.0.zip') && listing.includes('Modrinth tags: 16x'),
    `listing.txt (${listing.split('\n').slice(0, 6).join(' / ')})`
  )
  const en = await readFile(join(listingDir, 'description-en.md'), 'utf8').catch(() => '')
  app.check(
    en.includes('LabPBR 1.3') && en.includes('NOT AN OFFICIAL MINECRAFT PRODUCT'),
    'English description with PBR and disclaimer'
  )
  app.check(await exists(join(listingDir, 'description-it.md')), 'Italian description')

  const project = JSON.parse(await readFile(join(app.paths.pack, 'packforge.json'), 'utf8'))
  app.check(
    project.version === '1.2.0' && project.license === 'CC-BY-NC-SA-4.0',
    'packforge.json saved'
  )

  // Same version again: asks before overwriting (refused here).
  await app.click('Chiudi', '[aria-label=Esporta] button')
  await app.sleep(300)
  await openExport(app)
  const version = await app.ev(
    `document.querySelector('[aria-label=Esporta] input[aria-label=Versione]').value`
  )
  app.check(version === '1.2.0', 'the project is read back')
  await app.ev(
    `window.__asked = null; window.confirm = (m) => { window.__asked = m; return false }`
  )
  const again = await exportNow(app)
  app.check((await app.ev(`window.__asked`))?.includes('esiste già'), 'overwrite asks first')
  app.check(
    again.some((r) => r.includes('esiste già')),
    `refused: reported (${again[0]})`
  )
}
