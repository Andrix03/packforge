// Interactive guided tour of Phases 8–12 (built unattended on 2026-10-19), told through one
// example: a diamond ore block made from scratch, then the pack tools around it. After each part
// the viewer answers "works / problem" (with a note); the answers are printed at the end.
//   npm run drive -- scripts/drive/tours/phase8-12.mjs --keep-open
// The copy into the game uses a FAKE .minecraft in the tour's temp folder, never the real one.
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createDemo } from '../demo.mjs'

const BLOCK = 'assets/minecraft/textures/block'

// Diamond clusters, shaded like vanilla: highlight, light, mid, dark edge.
const GEM = {
  ffffff: [[3, 3]],
  a1fbe8: [
    [4, 3],
    [3, 4],
    [11, 7],
    [6, 11]
  ],
  '4aedd9': [
    [4, 4],
    [5, 4],
    [10, 7],
    [11, 8],
    [7, 11],
    [6, 12]
  ],
  '1aa59c': [
    [4, 5],
    [5, 5],
    [10, 8],
    [7, 12],
    [12, 8]
  ]
}

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, pixelClick } = demo
  await app.send('Page.bringToFront')

  const dialogButton = (dialog, text) => clickOn(`[aria-label="${dialog}"] button`, text)

  async function selectTile(file) {
    await app.ev(
      `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/${file}'))?.click()`
    )
    await app.sleep(600)
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Questo è il tour delle fasi 8–12, fatte stanotte. Lo racconto con un esempio: creiamo da zero un blocco di minerale di diamante, poi usiamo gli strumenti del pack. Dopo ogni parte rispondi coi pulsanti.',
    9000
  )
  await app.openPack()
  await app.sleep(800)

  // ---- 1. The block: texture, relief, material
  await say('1 · Nuova texture: diamond_ore, 16×16, partendo da un grigio pietra.', 4000)
  await clickOn('button', '+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('[aria-label="Nuova texture"] input:not([type=color])')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, 'diamond_ore')
  })()`)
  await app.setValue('[aria-label="Nuova texture"] input[type=color]', '#7f7f7f')
  await app.sleep(1200)
  await clickOn('[aria-label="Nuova texture"] button', 'Crea e apri')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
  await app.sleep(1000)

  await say(
    'Disegno crepe scure e i grappoli di diamante, con luce, mezzitoni e bordo scuro.',
    4000
  )
  await app.editor.setHex('#5e5e5e')
  for (const p of [
    [0, 0],
    [8, 2],
    [9, 2],
    [14, 5],
    [1, 9],
    [13, 13],
    [14, 13]
  ])
    await pixelClick(...p)
  for (const [hex, points] of Object.entries(GEM)) {
    await app.editor.setHex(hex)
    for (const p of points) await pixelClick(...p)
  }
  await app.sleep(800)

  await say(
    'Rilievo _n: «Genera tutto dai colori» crea altezza, normali e occlusione in un colpo.',
    4500
  )
  await clickOn('.map-tabs [role=tab]', 'Rilievo _n')
  await app.waitFor(`document.querySelector('.generator-panel')`)
  await point('.generator-panel', null, 2000)
  await clickOn('.generator-panel button', 'Genera tutto dai colori')
  await app.sleep(1500)

  await say(
    'Materiale _s: il preset «Minerale» trova da solo i pixel colorati (gemma = diamante, liscia e riflettente) e fa il resto pietra ruvida. Calibrato sui minerali vanilla.',
    7000
  )
  await clickOn('.map-tabs [role=tab]', 'Materiale _s')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.ev(
    `document.querySelector('.generator-panel[aria-label=Materiale]').scrollIntoView({ block: 'center' })`
  )
  await clickOn('.material-presets button', 'Minerale')
  await point('[data-testid=accent-count]', null, 2500)
  await clickOn('.generator-panel button', 'Applica minerale')
  await app.sleep(800)
  await clickOn('.channel-tabs [role=tab]', 'Levigatezza')
  await say(
    'Ecco la levigatezza: gemme quasi bianche (lucide), pietra scura (ruvida), crepe ancora più ruvide.',
    5000
  )
  await app.key('s', ['ctrl'])
  await app.sleep(1200)
  await ask('1 · Il blocco è stato creato, con rilievo e materiale applicati automaticamente?')

  // ---- 2. Compare with vanilla, Prova, screenshot
  await clickOn('.map-tabs [role=tab]', 'Colore')
  await app.sleep(500)
  await say(
    '2 · «Confronta con vanilla»: la mia texture accanto a quella del gioco, con le differenze evidenziate.',
    5000
  )
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Confronta con vanilla'))?.scrollIntoView({ block: 'center' })`
  )
  await clickOn('button', 'Confronta con vanilla')
  await app.waitFor(`document.querySelector('[data-testid=compare-stats]')`)
  await point('[data-testid=compare-stats]', null, 4000)
  await clickOn('.compare [role=radio]', 'Tendina')
  await say(
    'Vista a tendina: trascina il cursore per passare dalla mia a quella vanilla. Esc chiude.',
    4500
  )
  await app.key('Escape')
  await app.sleep(600)

  await say('Prova: il blocco al sole e al tramonto. Il diamante riflette, la pietra no.', 4000)
  await clickOn('button', 'Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.setValue('input[aria-label=Distanza]', 2.2)
  await app.sleep(3000)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.sleep(3500)
  await say(
    '«📷 Screenshot» salva questa vista per la pagina del pack (Modrinth, CurseForge).',
    4000
  )
  await clickOn('button', '📷 Screenshot')
  await app.waitFor(`document.querySelector('[data-testid=screenshot-result]')`, 10000)
  await point('[data-testid=screenshot-result]', null, 3500)
  await ask('2 · Confronto con vanilla, Prova (riflessi sul diamante) e screenshot funzionano?')
  await clickOn('button', 'Torna a disegnare')
  await app.sleep(800)

  // ---- 3. External changes + backups
  await say(
    '3 · «✎» apre la texture nel tuo editor esterno (Aseprite, Photoshop…). Quando lì salvi, qui si ricarica da sola; se hai modifiche non salvate, ti chiede cosa fare.',
    7000
  )
  await point('.editor-header button', '✎', 3000)
  await clickOn('button', 'Chiudi editor')
  await app.sleep(800)
  await say(
    'Ogni salvataggio e ogni operazione in blocco fa prima un backup: «🕘 Backup» li elenca e li ripristina.',
    5000
  )
  await clickOn('.tool-bar button', '🕘 Backup')
  await app.waitFor(`document.querySelector('[aria-label=Backup] ul, [data-testid=backup-empty]')`)
  await point('[aria-label=Backup] ul', null, 4000)
  await app.key('Escape')
  await app.sleep(500)
  await ask('3 · Vedi il backup «Salvataggio di diamond_ore» nella lista?')

  // ---- 4. Pack tools: validator, coverage → batch, resize, variants
  await say('4 · Gli strumenti del pack sono raggruppati: PACK, MAPPE e la texture scelta.', 4000)
  await point('.tool-bar', null, 3000)
  await clickOn('.tool-bar button', '🔍 Controlla mappe')
  await app.waitFor(`document.querySelector('[data-testid=validator-summary]')`, 15000)
  await say(
    'Il validatore controlla le mappe come le legge Iris: dimensioni, animazione, emissione, altezza, file orfani.',
    5500
  )
  await app.key('Escape')
  await app.sleep(400)
  await clickOn('.tool-bar button', '📊 Copertura')
  await app.waitFor(`document.querySelector('[data-testid=coverage-summary]')`)
  await say(
    'La copertura dice quante texture hanno già _n e _s. «Crea le mappe mancanti» apre «Applica in blocco» già pronto.',
    6000
  )
  await clickOn('.modal button', 'Crea le mappe mancanti')
  await app.waitFor(`document.querySelector('[data-testid=batch-summary]')`)
  await point('[data-testid=batch-summary]', null, 3500)
  await say(
    'Qui scegli preset materiale e rilievo per tutte insieme. Le mappe esistenti non vengono toccate se non lo chiedi.',
    5500
  )
  await app.key('Escape')
  await app.sleep(400)
  await clickOn('.tool-bar button', '↔ Ridimensiona')
  await app.waitFor(`document.querySelector('[data-testid=resize-histogram]')`, 15000)
  await say(
    '«Ridimensiona» mostra le risoluzioni del pack e le porta tutte a una (pixel netti, mappe comprese): utile perché una sola texture a 16× limita le mipmap di tutto il pack.',
    7000
  )
  await app.key('Escape')
  await app.sleep(400)
  await selectTile('glass.png')
  await clickOn('.tool-bar button', '🎨 Varianti di colore')
  await app.waitFor(`document.querySelectorAll('.variant canvas').length === 16`, 10000)
  await say(
    'Varianti di colore: i 16 coloranti del gioco in un colpo (lana, cemento, vetro colorato…), con i colori presi dalla texture vanilla corrispondente.',
    6500
  )
  await app.key('Escape')
  await app.sleep(400)
  await ask(
    '4 · Validatore, copertura, applica in blocco, ridimensiona e varianti si aprono e si capiscono?'
  )

  // ---- 5. Connected textures
  await say(
    '5 · Texture connesse sul vetro: 47 tile generati dalla cornice, compatibili con Continuity e OptiFine.',
    5000
  )
  await clickOn('.tool-bar button', '🧩 Texture connesse')
  await app.waitFor(`document.querySelector('.ctm-wall')`, 10000)
  await point('.ctm-wall', null, 3500)
  await clickOn('[aria-label="Texture connesse"] button', 'Crea i 47 tile')
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  await dialogButton('Texture connesse', 'Chiudi')
  await app.sleep(1000)
  await say('In Prova, su un muro 3×3, i blocchi di vetro si uniscono in un’unica lastra.', 4000)
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Prova in gioco'))?.click()`
  )
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await clickOn('.test-side [role=radio]', 'Muro 3×3')
  await app.setValue('input[aria-label=Distanza]', 4)
  await app.sleep(3500)
  await point('.test-side label', 'Texture connesse', 3000)
  await ask('5 · Il muro di vetro appare come una lastra unica, con la cornice solo all’esterno?')
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Chiudi prova') && b.closest('.test-screen'))?.click()`
  )
  await app.sleep(800)

  // ---- 6. In the game + export
  const fake = join(dirname(app.paths.userData), 'fake-minecraft')
  await mkdir(fake, { recursive: true })
  await app.ev(`window.api.invoke('settings:setMinecraftDir', ${JSON.stringify(fake)})`)
  await say(
    '6 · «🎮 Copia nel gioco» copia il pack in resourcepacks (qui una .minecraft finta) e si aggiorna da solo a ogni salvataggio. Sotto, i tasti utili.',
    6500
  )
  await clickOn('.tool-bar button', '🎮 Copia nel gioco')
  await app.waitFor(
    `document.querySelector('[data-testid=sync-target], [data-testid=sync-reason]')`
  )
  const where = await app.ev(
    `document.querySelector('[data-testid=sync-target]')?.textContent ?? ''`
  )
  if (where.startsWith(fake)) {
    await clickOn('[aria-label="Prova in gioco"] button', 'Copia nel gioco')
    await app.waitFor(`document.querySelector('[data-testid=sync-last]')`, 15000)
    await point('[data-testid=sync-last]', null, 3000)
  }
  await app.key('Escape')
  await app.sleep(400)
  await say(
    '«📦 Esporta»: versione, licenza, crediti, novità; controlla il pack e crea gli zip (completo, senza PBR, altra risoluzione) più la scheda per Modrinth/CurseForge.',
    7000
  )
  await clickOn('.tool-bar button', '📦 Esporta')
  await app.waitFor(`document.querySelector('[data-testid=export-check]')`, 20000)
  await app.setValue('[aria-label=Esporta] input[aria-label=Autore]', 'Andrea')
  await app.setValue('[aria-label=Esporta] textarea[aria-label=Novità]', 'Minerale di diamante PBR')
  await point('[data-testid=export-check]', null, 3500)
  await app.ev(`document.querySelector('.export-rules')?.setAttribute('open', '')`)
  await point('.export-rules', null, 4000)
  await clickOn('[aria-label=Esporta] button', 'Esporta 1 zip')
  await app.waitFor(`document.querySelector('[data-testid=export-results]')`, 60000)
  await point('[data-testid=export-results]', null, 4000)
  await ask(
    '6 · Copia nel gioco ed export (zip + scheda) funzionano? Hai letto la nota sulle regole Minecraft per guadagnare?'
  )
  await dialogButton('Esporta', 'Chiudi')
  await app.sleep(400)

  // ---- End
  await say(
    'Fine! Altre novità senza tour: tutorial del primo avvio in Principiante (Impostazioni → Tutorial), avviso nuove versioni, CI su GitHub, zip portatile (npm run dist:zip). Grazie!',
    9000
  )
  await demo.done()
}
