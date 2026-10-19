// Interactive tour of what the Phase 8–12 tour did not cover: the update banner, the first-run
// tutorial, the editor reloading files changed by another program, a Colore selection used on
// _s, Esc on dialogs and the new Settings sections.
//   npm run drive -- scripts/drive/tours/phase12-extra.mjs --keep-open
// The "new version" is a fake feed (no network); the "other program" is this script writing
// the file, as Aseprite would.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDemo } from '../demo.mjs'
import { png } from '../fixtures.mjs'

const RELEASE = {
  tag_name: 'v9.9.9',
  html_url: 'https://github.com/Andrix03/packforge/releases/tag/v9.9.9'
}

export const options = {
  tutorial: true,
  updateFeed: `data:application/json,${encodeURIComponent(JSON.stringify(RELEASE))}`
}

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, pixelClick } = demo
  await app.send('Page.bringToFront')
  const stone = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block', 'stone.png')

  // ---- 1. Update banner
  await app.waitFor(`document.querySelector('[data-testid=update-banner]')`, 10000)
  await say(
    'Ciao Andrea! Ecco le parti rimaste fuori dal tour. 1 · All’avvio PackForge chiede a GitHub se c’è una versione nuova (qui una finta, la 9.9.9): compare questo avviso con il link per scaricarla.',
    8000
  )
  await point('[data-testid=update-banner]', null, 3000)
  await clickOn('[data-testid=update-banner] button', 'Più tardi')
  await ask('1 · L’avviso della nuova versione compare e «Più tardi» lo chiude?')

  // ---- 2. First-run tutorial
  await say(
    '2 · Il tutorial del primo avvio (solo in Principiante): sei passi che si spuntano da soli mentre li fai davvero.',
    6000
  )
  await point('[data-testid=tutorial]', null, 4000)
  await app.openPack()
  await say('Ho aperto un pack: il passo 1 è spuntato.', 4000)
  await point('[data-testid=tutorial]', null, 2500)
  await app.openTexture('stone.png')
  await say(
    'Nell’editor il tutorial diventa una barra in basso, per non coprire gli strumenti.',
    5000
  )
  await point('[data-testid=tutorial-bar]', null, 3000)
  await app.editor.setHex('ff0000')
  await pixelClick(5, 5)
  await app.key('s', ['ctrl'])
  await app.sleep(1200)
  await say('Disegnato e salvato: altri due passi spuntati.', 3500)
  await point('[data-testid=tutorial-bar]', null, 3000)
  await ask('2 · Il tutorial si aggiorna da solo e nell’editor non copre gli strumenti?')

  // ---- 3. Changes made by another program
  await say(
    '3 · Ora faccio finta di essere Aseprite: scrivo stone.png da fuori. Non hai modifiche in sospeso, quindi l’editor si ricarica da solo.',
    7000
  )
  await writeFile(
    stone,
    png(16, 16, (x, y) => ((x + y) % 2 ? [40, 90, 200, 255] : [60, 120, 230, 255]))
  )
  await app.sleep(3500)
  await say('Fatto: la texture è quella nuova, senza aver chiuso niente.', 4000)
  await say('Adesso dipingo un pixel (modifica non salvata) e Aseprite salva di nuovo…', 4500)
  await app.editor.setHex('ffff00')
  await pixelClick(8, 8)
  await writeFile(
    stone,
    png(16, 16, () => [30, 160, 60, 255])
  )
  await app.waitFor(`document.querySelector('.external-change')`, 8000).catch(() => null)
  await say(
    '…e PackForge chiede: ricaricare dal file (perdi il pixel giallo) o tenere le tue modifiche. Prima, salvando avresti cancellato senza saperlo il lavoro fatto nell’altro programma.',
    8000
  )
  await point('.external-change', null, 3000)
  await clickOn('.external-change button', 'Ricarica dal file')
  await app.sleep(1500)
  await ask('3 · L’editor si ricarica da solo, e con modifiche in sospeso ti chiede cosa fare?')

  // ---- 4. A Colore selection used on _s
  await say(
    '4 · In modalità Pro: seleziono un rettangolo sulla superficie Colore, poi passo a «Materiale _s». La selezione resta, e il preset cambia solo quei pixel.',
    7000
  )
  await clickOn('[role=radio]', 'Pro')
  await app.sleep(500)
  await app.key('m')
  await demo.stroke([
    [2, 2],
    [7, 7]
  ])
  await app.sleep(800)
  await clickOn('.map-tabs [role=tab]', 'Materiale _s')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.ev(
    `document.querySelector('.generator-panel[aria-label=Materiale]').scrollIntoView({ block: 'center' })`
  )
  await clickOn('.material-presets button', 'Vetro')
  await point('.generator-panel button.primary', null, 3000)
  await clickOn('.generator-panel button', 'Applica vetro alla selezione')
  await app.sleep(800)
  await clickOn('.channel-tabs [role=tab]', 'Levigatezza')
  await say('Levigatezza: solo il quadrato selezionato è diventato vetro (bianco = liscio).', 5000)
  await ask('4 · La selezione fatta su Colore vale anche sul canale _s?')
  await app.key('Escape')
  await app.ev(`window.confirm = () => true`)
  await clickOn('button', 'Chiudi editor')
  await app.sleep(800)

  // ---- 5. Esc and the Settings
  await say('5 · Esc chiude tutti i dialoghi (ma non mentre un’operazione è in corso).', 4500)
  await clickOn('.tool-bar button', '🕘 Backup')
  await app.waitFor(`document.querySelector('[aria-label=Backup]')`)
  await app.sleep(1500)
  await app.key('Escape')
  await app.sleep(800)
  await say(
    'Nelle Impostazioni: «Rifai il tutorial» e «Aggiornamenti» (il controllo si può spegnere). Il testo dell’editor esterno ora spiega la ricarica automatica.',
    7000
  )
  await clickOn('button', 'Impostazioni')
  await app.waitFor(
    `[...document.querySelectorAll('h3')].some((h) => h.textContent === 'Aggiornamenti')`
  )
  await app.ev(
    `[...document.querySelectorAll('h3')].find((h) => h.textContent === 'Tutorial').scrollIntoView({ block: 'center' })`
  )
  await point('.settings', null, 4000)
  await ask('5 · Esc chiude il dialogo e le nuove sezioni delle Impostazioni sono chiare?')

  // ---- End
  await say(
    'Fuori dall’app: CI su GitHub (ogni push esegue i controlli), workflow «Release» per l’installer, e «npm run dist:zip» per la versione portatile. Fine, grazie!',
    9000
  )
  await demo.done()
}
