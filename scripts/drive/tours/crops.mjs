// Interactive guided tour of the crops support (Phase 12b, 2026-10-19): carrots drawn from the
// seed to the ripe plant, one texture per growth stage, each new stage started as a copy of the
// previous one; then the growth played in the preview and a farm in Prova.
//   npm run drive -- scripts/drive/tours/crops.mjs --keep-open
import { createDemo } from '../demo.mjs'

const BLOCK = 'assets/minecraft/textures/block'
const DARK = '#2f6b1f'
const MID = '#4f9a2f'
const LIGHT = '#7cc24a'
const ORANGE = '#e8802a'
const ORANGE_DARK = '#b85a1a'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, pixelClick, stroke } = demo
  await app.send('Page.bringToFront')

  const stageTab = (label) => clickOn('[aria-label="Stadi di crescita"] [role=tab]', label)
  async function waitOpen(name) {
    await app.waitFor(
      `document.querySelector('.editor-header, .editor h1, header')?.textContent.includes('${name}') || document.body.textContent.includes('${BLOCK}/${name}.png')`,
      15000
    )
    await app.sleep(1200)
  }
  async function paint(hex, points) {
    await app.editor.setHex(hex)
    for (const p of points) await pixelClick(...p)
  }
  async function nextStage(label, name, caption) {
    await app.key('s', ['ctrl'])
    await app.sleep(1000)
    await say(caption, 5000)
    await stageTab(label)
    await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
    await point('[aria-label="Nuova texture"] [role=radio]', 'Copia', 3500)
    await clickOn('[aria-label="Nuova texture"] button', 'Crea e apri')
    await waitOpen(name)
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Sì: anche le piantagioni si possono personalizzare. Ogni coltura ha una texture per ogni stadio di crescita. Ti mostro le carote, dal seme alla pianta matura.',
    9000
  )
  await app.openPack()
  await app.sleep(800)

  // ---- 1. Stage 1: the seed
  await say('1 · Nuova texture: carrots_stage0 (il primo stadio), vuota e trasparente.', 4500)
  await clickOn('button', '+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('[aria-label="Nuova texture"] input:not([type=color])')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, 'carrots_stage0')
  })()`)
  await clickOn('[aria-label="Nuova texture"] [role=radio]', 'Vuota')
  await app.sleep(800)
  await clickOn('[aria-label="Nuova texture"] button', 'Crea e apri')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await app.sleep(1000)
  await point('[aria-label="Stadi di crescita"]', null, 2500)
  await say(
    'PackForge ha riconosciuto le carote: qui sopra ci sono i 4 stadi. Il primo è il mio, gli altri (tratteggiati, con la miniatura vanilla) sono ancora da creare.',
    7500
  )
  await point('.growth-bar', null, 2500)
  await say(
    'A destra, l’anteprima usa il vero modello delle colture (4 piani incrociati) allo stadio di questa texture.',
    6000
  )

  await say('Disegno due germogli appena spuntati.', 3500)
  await app.editor.setHex(MID)
  await stroke([
    [4, 15],
    [4, 14]
  ])
  await stroke([
    [11, 15],
    [11, 14]
  ])
  await paint(LIGHT, [
    [4, 13],
    [11, 13],
    [3, 14],
    [12, 14]
  ])
  await app.sleep(1500)
  await ask('1 · Vedi i germogli sull’anteprima 3D, piantati nel modello delle carote?')

  // ---- 2. Stage 2: grows from a copy
  await nextStage(
    '+ 2',
    'carrots_stage1',
    '2 · Secondo stadio: clicco «+ 2». Si parte da una COPIA dello stadio prima, così ritocco solo ciò che cresce.'
  )
  await say('Le foglie si allungano.', 3000)
  await app.editor.setHex(MID)
  await stroke([
    [4, 13],
    [4, 11]
  ])
  await stroke([
    [11, 13],
    [11, 11]
  ])
  await paint(LIGHT, [
    [4, 10],
    [11, 10],
    [3, 12],
    [5, 11],
    [10, 12],
    [12, 11]
  ])
  await paint(DARK, [
    [4, 15],
    [11, 15]
  ])
  await app.sleep(1200)

  // ---- 3. Stage 3
  await nextStage(
    '+ 3',
    'carrots_stage2',
    '3 · Terzo stadio, ancora da una copia: ciuffo pieno e un terzo germoglio al centro.'
  )
  await app.editor.setHex(MID)
  await stroke([
    [4, 10],
    [4, 7]
  ])
  await stroke([
    [11, 10],
    [11, 7]
  ])
  await stroke([
    [8, 15],
    [8, 11]
  ])
  await paint(LIGHT, [
    [3, 8],
    [5, 7],
    [2, 9],
    [10, 8],
    [12, 7],
    [13, 9],
    [7, 12],
    [9, 11],
    [8, 10]
  ])
  await paint(DARK, [
    [4, 12],
    [11, 12],
    [8, 14]
  ])
  await app.sleep(1200)

  // ---- 4. Stage 4: ripe, the carrot shows
  await nextStage(
    '+ 4',
    'carrots_stage3',
    '4 · Ultimo stadio, la carota matura: spunta la punta arancione dalla terra.'
  )
  await paint(ORANGE, [
    [3, 15],
    [4, 15],
    [5, 15],
    [10, 15],
    [11, 15],
    [12, 15],
    [7, 15],
    [8, 15]
  ])
  await paint(ORANGE_DARK, [
    [5, 15],
    [12, 15],
    [8, 15]
  ])
  await app.key('s', ['ctrl'])
  await app.sleep(1200)
  await point('[aria-label="Stadi di crescita"]', null, 2500)
  await say('Tutti e 4 gli stadi sono nel pack (le miniature in alto sono le mie).', 4500)
  await ask('2–4 · Ogni nuovo stadio è partito dalla copia del precedente e lo hai visto cambiare?')

  // ---- 5. Growth in the preview
  await say(
    '5 · «Crescita» fa crescere la pianta nell’anteprima, stadio dopo stadio come nel gioco (le carote hanno 8 età su 4 texture).',
    6500
  )
  await clickOn('.growth-bar button', 'Crescita')
  await point('.preview-panel .preview-canvas', null, 9000)
  await clickOn('.growth-bar button', 'Ferma')
  await say('Con il cursore scegli tu lo stadio da guardare.', 3000)
  await app.setValue('input[aria-label="Stadio di crescita"]', 0)
  await app.sleep(1500)
  await app.setValue('input[aria-label="Stadio di crescita"]', 7)
  await app.sleep(1500)
  await ask('5 · La crescita nell’anteprima funziona?')

  // ---- 6. PBR for every stage at once
  await say(
    '6 · Ora gli effetti LabPBR. Chiudo l’editor e uso «Applica in blocco» su tutti e 4 gli stadi insieme.',
    5500
  )
  await clickOn('button', 'Chiudi editor')
  await app.sleep(1200)
  await clickOn('button', 'Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch')`)
  await clickOn('.modal.batch button', 'Nessuna')
  await app.setValue('input[aria-label="Filtra texture"]', 'carrots')
  await app.sleep(800)
  await clickOn('.modal.batch button', 'Seleziona visibili')
  await say(
    'Nuovo preset «Coltura»: riconosce dai colori le foglie verdi (la luce le attraversa: SSS), le parti secche/mature (meno) e i frutti (lisci, pieni).',
    8000
  )
  await clickOn('.modal.batch .material-presets button', 'Coltura')
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Rilievo'))?.querySelector('input')?.click()`
  )
  await point('[data-testid=batch-summary]', null, 3500)
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 30000)
  await point('[data-testid=batch-result]', null, 3500)
  await clickOn('.modal.batch button', 'Chiudi')
  await app.sleep(800)

  await say('Guardiamo il materiale della carota matura, canale per canale.', 4000)
  await app.openTexture('carrots_stage3.png')
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await clickOn('.map-tabs [role=tab]', 'Materiale _s')
  await app.waitFor(`document.querySelector('.channel-tabs')`)
  await app.sleep(800)
  await clickOn('.channel-tabs [role=tab]', 'Porosità / SSS')
  await app.sleep(800)
  await say(
    'SSS: foglie chiare (la luce passa), punte arancioni nere (il frutto è pieno). Si può ritoccare col pennello.',
    6500
  )
  await app.shot('sss-channel')
  await clickOn('.channel-tabs [role=tab]', 'Levigatezza')
  await app.sleep(800)
  await say('Levigatezza: il frutto è più liscio delle foglie.', 4500)
  await app.ev(
    `document.querySelector('.generator-panel[aria-label=Materiale]')?.scrollIntoView({ block: 'center' })`
  )
  await clickOn('.material-presets button', 'Coltura')
  await point('[data-testid=crop-parts]', null, 4000)
  await clickOn('.map-tabs [role=tab]', 'Colore')
  await app.sleep(600)
  await ask('6 · Il materiale «Coltura» è stato applicato a tutti gli stadi con le parti giuste?')

  // ---- 7. Prova: the farm
  await say(
    '7 · In Prova c’è la nuova scena «Campo coltivato»: terra arata bagnata, file dal seme (davanti) alla pianta matura (in fondo).',
    6500
  )
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Prova'))?.click()`
  )
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await clickOn('.test-side [role=radio]', 'Campo coltivato')
  await app.waitFor(`/170 blocchi/.test(document.querySelector('.test-side')?.textContent ?? '')`)
  await app.sleep(2000)
  await app.setValue('input[aria-label=Distanza]', 7)
  await app.sleep(3500)
  await say(
    'Effetti attivi (le carote hanno _n e _s). Al tramonto la luce bassa attraversa le foglie (SSS): gira intorno al campo verso il sole per vederle in controluce.',
    5000
  )
  await app.ev(
    `document.querySelector('select[aria-label="Luce degli effetti"]')?.scrollIntoView({ block: 'center' })`
  )
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.sleep(5000)
  await app.shot('farm-sunset')
  await say('E con la pioggia: tutto si bagna e luccica, sulla terra arata si formano pozze.', 5000)
  await app.setValue('input[aria-label=Pioggia]', 0.8)
  await app.sleep(5000)
  await app.shot('farm-rain')
  await app.setValue('input[aria-label=Pioggia]', 0)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await say(
    'Puoi trascinare per girare intorno al campo (o «Volo libero»). Fai pure, poi rispondi.',
    5000
  )
  await ask('7 · Il campo di carote (tramonto, pioggia) ti sembra come nel gioco con uno shader?')

  // ---- 8. Animations and what comes next
  await say(
    '8 · Animazioni: la crescita non è un’animazione, il gioco cambia texture a ogni stadio (fatto sopra). Ma ogni stadio può avere una sua animazione .png.mcmeta (editor Fotogrammi, modalità Pro).',
    10000
  )
  await say(
    'Il dondolio al vento invece NON si fa col pack: lo fanno gli shader (Iris). Potrei simularlo nell’anteprima: dimmi tu se vuoi.',
    8000
  )
  await ask('8 · Vuoi la simulazione del vento nell’anteprima? (scrivi nella nota)')

  await say(
    'Fine! Funziona per grano, carote, patate, barbabietole, verruca, cacao, bacche dolci, torcifiore, pianta caraffa e gambi di zucca/anguria (verdi→gialli). Grazie!',
    9000
  )
  await demo.done()
}
