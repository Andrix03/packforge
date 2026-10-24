// Saved palettes and custom ramps (Pro).
import { readFile, writeFile } from 'node:fs/promises'
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

  // Import a Lospec .hex file (the real file input, given a file through CDP), export as .gpl.
  const hex = join(app.paths.userData, 'sunset.hex')
  await writeFile(hex, 'ff0040\n1a1c2c\n\nnot-a-colour\n5d275d\n')
  const input = await app.send('Runtime.evaluate', {
    expression: `document.querySelector('.palette-import input')`
  })
  await app.send('DOM.setFileInputFiles', { files: [hex], objectId: input.result.result.objectId })
  await app.waitFor(`document.querySelector('[data-testid=palette-message]')`)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=palette-message]').textContent`)) ===
      '«sunset» importata, colori saltati: 1.',
    'the .hex file is imported, the bad line skipped'
  )
  const imported = await app.ev(
    `[...document.querySelectorAll('.saved-palette')].find((p) => p.textContent.includes('sunset')).querySelectorAll('.ramp-swatch').length`
  )
  app.check(imported === 3, `three colours (${imported})`)
  await app.ev(`document.querySelector('[aria-label="Esporta sunset"]').click()`)
  await app.waitFor(
    `document.querySelector('[data-testid=palette-message]').textContent.startsWith('Salvata in')`
  )
  const saved = (
    await app.ev(`document.querySelector('[data-testid=palette-message]').textContent`)
  ).slice('Salvata in '.length)
  const gpl = await readFile(saved, 'utf8')
  app.check(
    gpl.startsWith('GIMP Palette') && gpl.includes('Name: sunset') && /255\s+0\s+64/.test(gpl),
    `exported as .gpl (${saved.split(/[\\/]/).slice(-2).join('/')})`
  )
}
