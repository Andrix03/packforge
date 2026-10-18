// Guided tour of Phase 4 (Pro tools), shown live with captions and a red dot.
//   npm run drive -- scripts/drive/tours/phase4.mjs --keep-open
import { createDemo } from '../demo.mjs'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, stroke, pixelClick } = demo
  await app.send('Page.bringToFront')

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Ecco la Phase 4: gli strumenti Pro dell’editor. Apro il pack di prova…',
    4500
  )
  await clickOn('button', 'Apri cartella')
  await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)
  await app.waitFor(
    `[...document.querySelectorAll('.tab')].some((t) => t.textContent.startsWith('Vanilla') && !t.disabled)`,
    30000
  )
  await say('Apro "stone" e passo alla modalità Pro (in alto a destra).', 3000)
  await app.openTexture('stone.png')
  await clickOn('[role=radio]', 'Pro')
  await say('In Pro compaiono 6 strumenti nuovi a sinistra e il pannello Livelli a destra.', 4500)

  // ---- Layers
  await say('LIVELLI: "+ Nuovo" crea un livello trasparente sopra la pietra.', 3500)
  await clickOn('.layer-actions button', '+ Nuovo')
  await app.editor.setHex('d04030')
  await say('Disegno sul nuovo livello: la pietra sotto resta intatta.', 2500)
  await stroke([
    [2, 4],
    [13, 4]
  ])
  await stroke([
    [2, 11],
    [13, 11]
  ])
  await say('Il pallino ● nasconde e mostra un livello…', 2500)
  await clickOn('.layer.active .layer-eye')
  await app.sleep(1500)
  await clickOn('.layer.active .layer-eye')
  await say('…e l’opacità lo rende semitrasparente. Ogni modifica si annulla con Ctrl+Z.', 3500)
  await point('.layers-panel input[type=range]')
  await app.setValue('.layers-panel input[type=range]', 50)
  await app.sleep(1500)
  await say('Quando salvi, i livelli si uniscono in un’unica PNG, come vuole Minecraft.', 3500)
  await clickOn('.layer-actions button', 'Unisci giù')
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])
  await app.key('z', ['ctrl'])

  // ---- Shapes + mirror
  await say('FORME: Rettangolo (U), Ellisse (O), Linea (L). Trascini da un angolo all’altro.', 4000)
  await app.key('u')
  await app.editor.setHex('2a6fd6')
  await stroke([
    [2, 2],
    [8, 7]
  ])
  await say('Con "Pieno" la forma si riempie; con Maiusc diventa quadrato o cerchio.', 3500)
  await app.key('o')
  await clickOn('label', 'Pieno')
  await stroke(
    [
      [8, 8],
      [14, 14]
    ],
    'left',
    8
  )
  await app.key('l')
  await stroke([
    [1, 14],
    [7, 9]
  ])
  await say('SIMMETRIA: attivo ↔ e quello che disegno a sinistra appare specchiato a destra.', 4000)
  await app.key('b')
  await app.ev(`document.querySelectorAll('.mirror-toggles input')[0].click()`)
  await app.editor.setHex('f0d020')
  await stroke([
    [1, 1],
    [3, 3],
    [1, 5]
  ])
  await app.sleep(1500)
  await app.ev(`document.querySelectorAll('.mirror-toggles input')[0].click()`)

  // ---- Selections
  await say('SELEZIONI: con M trascino un rettangolo (le "formiche" tratteggiate).', 3500)
  await app.key('m')
  await stroke([
    [2, 2],
    [8, 7]
  ])
  await say('Ctrl+C copia, Ctrl+V incolla e passa a "Sposta": trascino la copia dove voglio…', 4000)
  await app.key('c', ['ctrl'])
  await app.key('v', ['ctrl'])
  await stroke([
    [4, 4],
    [11, 4]
  ])
  await say('…Invio la appoggia. Maiusc+H la riflette, Maiusc+R la ruota di 90°.', 3500)
  await app.key('h', ['shift'])
  await app.sleep(1200)
  await app.key('Enter')
  await say('La bacchetta (W) seleziona i pixel dello stesso colore; Canc li cancella.', 3500)
  await app.key('w')
  await pixelClick(10, 11)
  await app.sleep(1500)
  await app.key('Delete')
  await app.sleep(1500)
  await say(
    'Mentre c’è una selezione, i pennelli dipingono solo al suo interno. Ctrl+D deseleziona.',
    4000
  )
  await app.key('d', ['ctrl'])

  // ---- Seamless
  await say('BORDI CONTINUI (tasto T): la texture appare ripetuta intorno…', 3500)
  await app.key('t')
  await app.key('b')
  await app.editor.setHex('ffffff')
  await say(
    '…e il tratto che esce da destra rientra da sinistra: niente più giunture sbagliate.',
    4000
  )
  await stroke([
    [11, 6],
    [19, 6]
  ])
  await app.sleep(2000)
  await app.key('t')

  // ---- Palettes + custom ramp
  await say(
    'PALETTE: do un nome e salvo la rampa (o i colori della texture): resta per tutte le texture.',
    4500
  )
  await app.editor.setHex('6a9a3a')
  await app.setValue('.palette-name', 'Erba')
  await clickOn('.palettes-panel button', 'Salva rampa')
  await point('.saved-palette', null, 2500)
  await say(
    '"✎ Modifica" permette di cambiare la rampa tonalità per tonalità (rampa personalizzata).',
    4000
  )
  await point('.ramp-edit button', 'Modifica', 2500)

  // ---- Shortcuts window
  await say('Il tasto ? (o il pulsante ⌨) mostra tutte le scorciatoie.', 3000)
  await app.key('?')
  await app.sleep(4000)
  await app.key('Escape')

  // ---- Animation
  await say('ANIMAZIONI: apro "magma", che ha 3 frame e un file .mcmeta.', 3500)
  await app.answerDialogs(true)
  await clickOn('button', 'Chiudi editor')
  await app.sleep(800)
  await app.openTexture('magma.png')
  await say(
    'Sotto il canvas c’è la timeline: un riquadro per frame. Clicco il secondo per modificarlo.',
    4500
  )
  await clickOn('.frame-thumb', '2')
  await app.editor.setHex('ffe080')
  await stroke([
    [3, 3],
    [12, 12]
  ])
  await say(
    '"Duplica" copia il frame; ◀ ▶ lo spostano; "Onion skin" mostra il frame precedente in trasparenza.',
    5000
  )
  await clickOn('.frame-actions button', 'Duplica')
  await clickOn('label', 'Onion skin')
  await app.sleep(1500)
  await say(
    '"Tick per frame" regola la velocità (20 tick = 1 secondo); "▶ Anteprima" la riproduce.',
    4500
  )
  await app.setValue('.frames-header input[type=number]', 6)
  await clickOn('.frames-header button', 'Anteprima')
  await app.sleep(4000)
  await clickOn('.frames-header button', 'Ferma')
  await say(
    'Ctrl+S salva la striscia PNG e scrive il .png.mcmeta mantenendo gli altri campi.',
    4000
  )
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  await point('.editor-header .success', null, 2500)
  await say('E qualsiasi texture può diventare animata con "🎞 Anima questa texture".', 4000)

  await say(
    'Infine ho testato tutto da solo: 12 scenari, test casuali da 150 azioni, 3 bug trovati e corretti.',
    6000
  )
  await say('Fine del tour! La finestra resta aperta: prova pure tu.', 6000)
  await demo.done()
}
