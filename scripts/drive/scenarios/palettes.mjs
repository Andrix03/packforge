// Saved palettes and custom ramps (Pro).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function palettes(app) {
  await app.openPack()
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.editor.setHex('5e9d34')

  await app.setValue('.palette-name', 'Erba')
  await app.click('Salva rampa', '.palettes-panel button')
  app.check(
    (await app.ev(`document.querySelector('.saved-palette')?.textContent ?? ''`)).includes('Erba'),
    'the ramp is saved as a palette'
  )
  await app.sleep(500)
  const settings = JSON.parse(await readFile(join(app.paths.userData, 'settings.json'), 'utf8'))
  app.check(
    settings.palettes?.[0]?.name === 'Erba' && settings.palettes[0].colors.length === 5,
    'the palette is stored in the settings (5 colors)'
  )

  // Survives closing and reopening the editor.
  await app.click('Chiudi editor')
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.waitFor(`document.querySelector('.saved-palette')`)
  app.check(true, 'the palette is still there after reopening')

  // Use the texture's colors as the ramp.
  await app.click('Salva colori texture', '.palettes-panel button')
  await app.ev(
    `[...document.querySelectorAll('.saved-palette')][1].querySelector('button').click()`
  )
  app.check(
    (await app.ev(`document.querySelector('.ramp-panel .panel-title').textContent`)).includes(
      'personalizzata'
    ),
    '"Usa come rampa" makes a custom ramp'
  )
  app.check(
    (await app.ev(`document.querySelectorAll('.ramp-panel .ramp-swatch').length`)) === 5,
    'the ramp has the 5 stone grays'
  )

  // Edit: right click removes a shade, + Primario adds the primary.
  await app.click('Modifica', '.ramp-edit button')
  await app.ev(
    `document.querySelector('.ramp-panel .ramp-swatch').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))`
  )
  app.check(
    (await app.ev(`document.querySelectorAll('.ramp-panel .ramp-swatch').length`)) === 4,
    'right click in edit mode removes a shade'
  )
  await app.click('+ Primario', '.ramp-edit button')
  app.check(
    (await app.ev(`document.querySelectorAll('.ramp-panel .ramp-swatch').length`)) === 5,
    '+ Primario adds a shade'
  )
  await app.click('Automatica', '.ramp-edit button')
  app.check(
    !(await app.ev(`document.querySelector('.ramp-panel .panel-title').textContent`)).includes(
      'personalizzata'
    ),
    '↺ Automatica goes back to the generated ramp'
  )

  // Delete a palette.
  await app.ev(`document.querySelector('.saved-palette button[aria-label^="Elimina"]').click()`)
  app.check(
    (await app.ev(`document.querySelectorAll('.saved-palette').length`)) === 1,
    '× deletes a palette'
  )
  await app.shot('palettes')
}
