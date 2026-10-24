// 1.1 Title and loading screen: from the GUI tab, the window shows the panorama (vanilla's comes
// from the launcher assets since 26.x), the logos and the loading screen as a reference; the
// splashes are written to the pack's texts/splashes.txt and emptied away; "Create yours" on the
// Minecraft logo offers the vanilla size and its fractions, never its pixels.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function title(app) {
  await app.openPack({ waitForVanilla: true })
  await app.click('GUI', '.mode-bar [role=tab]')
  await app.waitFor(`document.querySelector('.gui-mock')`)
  await app.click('Titolo e caricamento', '.gui-mock button')
  await app.waitFor(`document.querySelector('[role=dialog][aria-label="Titolo e caricamento"]')`)
  await app.waitFor(`document.querySelector('.panorama-view')`)
  const slots = await app.ev(`document.querySelectorAll('.title-slot').length`)
  app.check(slots === 9, `six faces, two logos and the loading logo (${slots})`)
  // The vanilla panorama is the launcher's, not the jar's 1×1 placeholder.
  await app.waitFor(
    `[...document.querySelectorAll('.title-thumb img')].every((img) => img.complete && img.naturalWidth > 0)`,
    15000
  )
  const faceWidth = await app.ev(`document.querySelector('.title-thumb img').naturalWidth`)
  app.check(faceWidth > 16, `the vanilla panorama face is a real image (${faceWidth} px)`)
  await app.sleep(800)
  await app.shot('title-dialog')

  // Splashes: written, then emptied (the file goes away and vanilla's come back).
  await app.setValue('[aria-label="Frasi del titolo"]', 'Fatto a mano!\nAnche in pixel art!\n')
  await app.click('Salva le frasi', '.title-splashes button')
  await app.waitFor(`document.querySelector('.title-splashes').textContent.includes('Salvate')`)
  const file = join(app.paths.pack, 'assets', 'minecraft', 'texts', 'splashes.txt')
  app.check(
    (await readFile(file, 'utf8')) === 'Fatto a mano!\nAnche in pixel art!\n',
    'the splashes are written to texts/splashes.txt'
  )
  app.check(
    (await app.ev(`document.querySelector('.title-splashes').textContent`)).includes('2 frasi'),
    'two splashes counted'
  )
  await app.setValue('[aria-label="Frasi del titolo"]', '')
  await app.click('Salva le frasi', '.title-splashes button')
  await app.sleep(800)
  const gone = await readFile(file, 'utf8').then(
    () => false,
    () => true
  )
  app.check(gone, 'emptied: the file is deleted')

  // A new logo of the vanilla shape.
  await app.ev(
    `[...document.querySelectorAll('.title-slot')].find((s) => s.textContent.includes('Logo di Minecraft')).querySelector('button').click()`
  )
  await app.waitFor(`document.querySelector('[role=dialog][aria-label="Nuova texture"]')`)
  await app.waitFor(
    `[...document.querySelectorAll('[aria-label="Dimensione"] [role=radio]')].some((b) => b.textContent === '1024×256')`
  )
  const sizes = await app.ev(
    `[...document.querySelectorAll('[aria-label="Dimensione"] [role=radio]')].map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')).join(' ')`
  )
  app.check(
    sizes === '256×64 512×128 1024×256* 2048×512',
    `logo sizes, the vanilla one chosen (${sizes})`
  )
}
