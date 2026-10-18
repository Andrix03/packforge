// Interactive guided tour of Phase 8, first part (channel painting of _n / _s and the height/normal
// generator): after each part the viewer answers "works / problem" (with a note) and the answers
// are printed at the end.
//   npm run drive -- scripts/drive/tours/phase8.mjs --keep-open
import { createDemo } from '../demo.mjs'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, stroke, pixelClick } = demo
  await app.send('Page.bringToFront')

  async function openEditor(file) {
    await app.setValue('input[type=search]', file.replace('.png', ''))
    await app.openTexture(file)
    await app.sleep(500)
  }

  async function closeEditor() {
    await clickOn('button', 'Chiudi editor')
    await app.sleep(600)
  }

  async function tab(label) {
    await clickOn('.map-tabs [role=tab]', label)
    await app.sleep(700)
  }

  async function channel(label) {
    await clickOn('.channel-tabs [role=tab]', label)
    await app.sleep(1200)
  }

  async function setPrimary(value) {
    await point('input[aria-label="Valore primario"]', null, 900)
    await app.setValue('input[aria-label="Valore primario"]', value)
    await app.sleep(600)
  }

  /** Opens the test screen from the editor, lets the scene settle, then goes back. */
  async function tryInGame(caption, setup = async () => {}) {
    await clickOn('button', 'Prova')
    await app.waitFor(
      `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
      15000
    )
    await app.sleep(1500)
    await setup()
    await say(caption, 6000)
    await clickOn('button', 'Torna a disegnare')
    await app.sleep(1200)
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Tour della Phase 8, prima parte: dipingere i canali di _n e _s e generare il rilievo. Dopo ogni parte rispondi coi pulsanti.',
    7000
  )
  await clickOn('button', 'Apri cartella')
  await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)

  // ---- 1. Height channel
  await openEditor('stone.png')
  await say('Sopra la tela ora c’è “Dipingi”: Colore, Rilievo _n, Materiale _s.', 5000)
  await point('.map-tabs', null, 2500)
  await tab('Rilievo _n')
  await say(
    'Questo è il canale Altezza di stone_n.png, in grigio: bianco = in superficie, grigio = le fughe a 140. Normali e occlusione non si toccano.',
    7000
  )
  await point('.value-panel', null, 3000)
  await say(
    'Scelgo un valore basso (1 = il fondo, 25% del blocco) e scavo un solco con la matita.',
    5000
  )
  await setPrimary(1)
  await stroke([
    [2, 3],
    [5, 3]
  ])
  await stroke([
    [10, 11],
    [13, 11]
  ])
  await say('Il 3D a destra ora mostra gli effetti LabPBR, con le mappe che stai dipingendo.', 5000)
  await point('.editor-side .preview-canvas', null, 3000)
  await tryInGame(
    'In Prova il solco appena dipinto è scavato dal POM, anche senza salvare.',
    async () => {
      await app.setValue('input[aria-label=Distanza]', 2.5)
      await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
      await app.sleep(2000)
    }
  )
  await ask('1 · L’altezza si dipinge in grigio e il solco si vede scavato nel 3D e in Prova?')

  // ---- 2. Other channels untouched, undo
  await channel('Occlusione')
  await say('Occlusione (canale B): il solco non c’è, le fughe sono rimaste com’erano.', 5000)
  await channel('Normali')
  await say(
    'Normali (RG): si vedono a colori, come una normal map normale. Si generano dall’altezza, non si dipingono a mano.',
    6500
  )
  await channel('Altezza')
  await say(
    'Ctrl+Z annulla il solco, Ctrl+Y lo rimette: la cronologia è la stessa del colore.',
    4500
  )
  await app.key('z', ['ctrl'])
  await app.sleep(1800)
  await app.key('y', ['ctrl'])
  await app.sleep(1800)
  await ask('2 · Gli altri canali restano intatti e annulla/ripeti funzionano?')

  // ---- 3. Generator on a texture without maps
  await say('Ora una texture senza mappe: grass_block_top. Le schede col + sono mappe nuove.', 5000)
  app.answerDialogs(true)
  await closeEditor()
  await openEditor('grass_block_top.png')
  await point('.map-tabs', null, 2500)
  await tab('Rilievo _n')
  await say(
    'Il generatore: altezza dai colori (chiaro = alto, scuro = fessura), poi normali e occlusione.',
    6000
  )
  await point('.generator-panel', null, 2500)
  await clickOn('.generator-panel button', 'Genera tutto dai colori')
  await app.sleep(1500)
  await say(
    'Fatto, in un solo passo da annullare. Guarda le normali e l’occlusione generate.',
    4500
  )
  await channel('Normali')
  await channel('Occlusione')
  await channel('Altezza')
  await say(
    'Per la pixel art: “Gradini” arrotonda l’altezza a pochi livelli, per un rilievo a cubetti.',
    5000
  )
  await point('input[aria-label=Gradini]', null, 1200)
  await app.setValue('input[aria-label=Gradini]', 3)
  await app.sleep(600)
  await clickOn('.generator-panel button', 'Genera tutto dai colori')
  await app.sleep(1500)
  await tryInGame('Il prato col rilievo generato, a 3 livelli.', async () => {
    await app.setValue('input[aria-label=Distanza]', 2.5)
    await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
    await app.sleep(2000)
  })
  await ask(
    '3 · Il generatore dà un rilievo sensato (scuro = più profondo) e i Gradini lo fanno a cubetti?'
  )

  // ---- 4. Auto normals while painting
  await say(
    '“Aggiorna mentre dipingi l’altezza” è acceso per le mappe senza normali fatte a mano: dipingo un buco e le normali lo seguono.',
    7000
  )
  await point('.generator-panel label:last-of-type', null, 1500)
  await setPrimary(1)
  await pixelClick(8, 8)
  await app.sleep(800)
  await channel('Normali')
  await say('Attorno al buco le normali ora puntano verso il centro.', 5000)
  await ask('4 · Dipingendo l’altezza le normali si aggiornano da sole?')

  // ---- 5. Emission in a new _s
  await tab('Materiale _s')
  await channel('Emissione')
  await say(
    'Materiale _s, canale Emissione: nero = spento. Uso il valore tipico “Piena” (254).',
    5500
  )
  await clickOn('.value-presets button', 'Piena')
  await app.sleep(500)
  await stroke([
    [7, 2],
    [7, 13]
  ])
  await stroke([
    [2, 7],
    [13, 7]
  ])
  await tryInGame('In grotta la croce dipinta brilla, col bagliore.', async () => {
    await app.setValue('select[aria-label="Luce degli effetti"]', 'cave')
    await app.setValue('input[aria-label=Distanza]', 2.5)
    await app.sleep(2500)
  })
  await say(
    'Ctrl+S salva: crea grass_block_top_n.png e _s.png; il PNG dei colori non viene riscritto.',
    5500
  )
  await app.key('s', ['ctrl'])
  await app.sleep(1500)
  await ask('5 · L’emissione dipinta brilla in Prova e il salvataggio crea le due mappe?')

  // ---- End
  await say(
    'Fine del tour! La finestra resta aperta: prova pure tu. Le tue risposte me le ritrovo nel terminale.',
    7000
  )
  await demo.done()
}
