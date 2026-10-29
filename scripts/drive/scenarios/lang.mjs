// 1.4 game texts: the game's en_us texts are searched, one line changed, and the pack's
// lang/en_us.json keeps only that line.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function lang(app) {
  await app.openPack({ waitForVanilla: true })
  await app.section('texts')
  await app.waitFor(`document.querySelector('[data-testid=lang-count]')`, 20000)
  await app.setValue('[aria-label="Cerca nei testi"]', 'diamond sword')
  await app.waitFor(`document.querySelector('[aria-label="item.minecraft.diamond_sword"]')`, 5000)
  app.check(
    (await app.ev(
      `document.querySelector('[aria-label="item.minecraft.diamond_sword"]').placeholder`
    )) === 'Diamond Sword',
    'the game text shows as the placeholder'
  )
  await app.setValue('[aria-label="item.minecraft.diamond_sword"]', 'Excalibur')
  await app.shot('lang-dialog')
  await app.click('Salva i testi', '.lang-dialog button')
  await app.waitFor(`document.querySelector('[data-testid=lang-saved]')`, 10000)
  const saved = JSON.parse(
    await readFile(join(app.paths.pack, 'assets', 'minecraft', 'lang', 'en_us.json'), 'utf8')
  )
  app.check(
    JSON.stringify(saved) === JSON.stringify({ 'item.minecraft.diamond_sword': 'Excalibur' }),
    `only the changed line is in the pack (${JSON.stringify(saved)})`
  )
  const languages = await app.ev(`document.querySelector('[aria-label="Lingua"]').options.length`)
  app.check(languages > 1, `other languages from the launcher (${languages})`)
}
