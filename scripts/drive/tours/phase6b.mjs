// Interactive guided tour of Phase 6b (effects closer to the shader packs): after each part the
// viewer answers "works / problem" (with a note) and the answers are printed at the end.
//   npm run drive -- scripts/drive/tours/phase6b.mjs --keep-open
import { createDemo } from '../demo.mjs'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask } = demo
  await app.send('Page.bringToFront')

  /** Drags across the 3D view to orbit. */
  async function drag(dx, dy) {
    const c = await demo.center('.test-canvas')
    await demo.dot(c)
    const move = (type, x, y, buttons) =>
      app.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1
      })
    await move('mousePressed', c.x, c.y, 1)
    for (let i = 1; i <= 24; i++) {
      await move('mouseMoved', c.x + (dx * i) / 24, c.y + (dy * i) / 24, 1)
      await app.sleep(45)
    }
    await move('mouseReleased', c.x + dx, c.y + dy, 0)
  }

  async function scene(label, ms = 2500) {
    await clickOn('.test-side [role=radio]', label)
    await app.sleep(ms)
  }

  /** Opens the test screen on a block texture from the pack grid. */
  async function openTest(file) {
    if (await app.ev(`Boolean(document.querySelector('.test-screen'))`)) {
      await clickOn('button', 'Chiudi prova')
      await app.waitFor(`!document.querySelector('.test-screen')`)
    }
    await app.setValue('input[type=search]', file.replace('.png', ''))
    await app.waitFor(
      `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('block/${file}'))`
    )
    await app.ev(
      `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('block/${file}')).click()`
    )
    await app.sleep(600)
    await clickOn('button', 'Prova in gioco')
    await app.waitFor(`/\\d+ blocc/.test(document.querySelector('.test-side').textContent)`, 15000)
    await app.sleep(1500)
  }

  async function set(selector, value, ms = 1500) {
    await point(selector, null, 800)
    await app.setValue(selector, value)
    await app.sleep(ms)
  }

  async function effectsOn(on) {
    const checked = await app.ev(
      `[...document.querySelectorAll('.test-side label')].find((l) => l.textContent.includes('Mostra effetti')).querySelector('input').checked`
    )
    if (checked !== on) await clickOn('label', 'Mostra effetti')
    await app.sleep(1200)
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Tour interattivo della Phase 6b. Alla fine di ogni parte ti chiedo se funziona: rispondi coi pulsanti.',
    6000
  )
  await clickOn('button', 'Apri cartella')
  await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)
  await app.waitFor(
    `[...document.querySelectorAll('.tab')].some((t) => t.textContent.startsWith('Vanilla') && !t.disabled)`,
    30000
  )

  // ---- 1. Light levels and smooth-lighting AO
  await say(
    '1 · LUCE COME NEL GIOCO. Apro la pietra nella Prova, prima SENZA effetti (look vanilla).',
    4500
  )
  await openTest('stone.png')
  await effectsOn(false)
  await say(
    'Grotta: la galleria è aperta solo da un lato, quindi la luce del cielo cala entrando…',
    4500
  )
  await scene('Grotta', 3000)
  await say(
    '…e in fondo c’è una torcia vanilla: la luce dei blocchi rischiara le ultime pareti.',
    5000
  )
  await set('input[aria-label=Distanza]', 4, 2500)
  await say(
    'Angolo di casa: guarda gli angoli tra muri e pavimento, sono più scuri (AO dello smooth lighting).',
    5500
  )
  await scene('Angolo di casa', 2500)
  await set('input[aria-label=Distanza]', 5, 2500)
  await drag(160, 0)
  await app.sleep(1500)
  await ask(
    '1 · La grotta si scurisce entrando, la torcia illumina il fondo e gli angoli hanno l’AO?'
  )

  // ---- 2. Sun shadows
  await say(
    '2 · OMBRE DEL SOLE. Accendo gli effetti e porto l’ora alle 16:00, col sole basso.',
    4500
  )
  await effectsOn(true)
  await set('select[aria-label="Luce degli effetti"]', 'time', 800)
  await set('input[aria-label="Ora del giorno"]', 16, 2500)
  await say('I muri fanno ombra su pavimento ed erba, e il sole entra dalla finestra.', 5500)
  await say('Ombre "A pixel": il bordo segue i pixel della texture, come negli shader pack.', 4500)
  await set('input[aria-label=Distanza]', 3, 3500)
  await say('Ora "Morbide": lo stesso bordo diventa liscio.', 3000)
  await set('select[aria-label=Ombre]', 'soft', 3500)
  await set('select[aria-label=Ombre]', 'pixel', 1500)
  await say('Di notte fa ombra la luna (luce debole e fredda).', 3500)
  await set('input[aria-label="Ora del giorno"]', 0, 3500)
  await set('input[aria-label="Ora del giorno"]', 16, 1200)
  await set('input[aria-label=Distanza]', 12, 1500)
  await ask(
    '2 · Le ombre sono al posto giusto, a pixel / morbide, e di notte senza macchie strane?'
  )

  // ---- 3. Reflections (SSR + capture)
  await say('3 · RIFLESSI. Passo al blocco d’oro (metallo predefinito 231, molto liscio).', 4500)
  await openTest('gold_block.png')
  await set('select[aria-label="Luce degli effetti"]', 'noon', 1000)
  await say(
    'Scena mista: il muro e la croce d’oro specchiano i blocchi vicini, nitidi e al posto giusto.',
    5500
  )
  await scene('Con altri blocchi', 3000)
  await set('input[aria-label=Distanza]', 6, 3500)
  await drag(-180, 0)
  await app.sleep(2000)
  await say(
    'Confronto con "Solo cielo": senza riflessi della scena l’oro riflette solo il cielo.',
    4500
  )
  await set('select[aria-label=Riflessi]', 'sky', 3500)
  await set('select[aria-label=Riflessi]', 'scene', 2500)
  await say('L’angolo della casa tutto d’oro: niente più cuneo nero nello spigolo.', 4500)
  await scene('Angolo di casa', 2500)
  await set('input[aria-label=Distanza]', 5, 4000)
  await say('E la galleria d’oro: la torcia si riflette, senza righe nere lungo gli spigoli.', 4500)
  await scene('Grotta', 2500)
  await set('input[aria-label=Distanza]', 4, 4500)
  await ask('3 · I riflessi dell’oro sono nitidi, al posto giusto e senza bordi neri?')

  // ---- 4. Metal interpretation
  await say(
    '4 · METALLI. Ogni shader pack legge i metalli a modo suo: provo le 3 interpretazioni.',
    4500
  )
  await scene('Blocco', 2000)
  await set('select[aria-label="Luce degli effetti"]', 'noon', 800)
  await say('"Come la spec": oro N/K tinto dall’albedo (LabPBR, Photon).', 4000)
  await set('select[aria-label=Metalli]', 'spec', 3000)
  await say('"Senza metalli predefiniti": 230–255 letto come 255, l’albedo fa da F0.', 4500)
  await set('select[aria-label=Metalli]', 'albedo', 3500)
  await say('"Metalli senza tinta": oro puro, la texture sparisce e resta lo specchio d’oro.', 4500)
  await set('select[aria-label=Metalli]', 'untinted', 3500)
  await set('select[aria-label=Metalli]', 'spec', 1200)
  await ask('4 · Le 3 interpretazioni dei metalli si vedono diverse e hanno senso?')

  // ---- 5. Bloom
  await say('5 · BLOOM SENZA SOGLIA (come Photon). Glowstone in grotta, al buio.', 4500)
  await openTest('glowstone.png')
  await set('select[aria-label="Luce degli effetti"]', 'cave', 3000)
  await say(
    'Le strisce che emettono luce hanno un alone stretto; il resto del blocco non è velato.',
    5000
  )
  await say('Bloom a 0 (spento)…', 2500)
  await set('input[aria-label=Bloom]', 0, 3000)
  await say('…e a 2 (forte).', 2500)
  await set('input[aria-label=Bloom]', 2, 3500)
  await set('input[aria-label=Bloom]', 1, 1500)
  await say('La "Forza emissione" decide quanto brilla: la porto a 20.', 3500)
  await set('input[aria-label="Forza emissione"]', 20, 3500)
  await set('input[aria-label="Forza emissione"]', 8, 1500)
  await ask('5 · Il bagliore si vede solo sulle parti che emettono luce, senza alone largo?')

  // ---- 6. Rain
  await say('6 · PIOGGIA. Sabbia completamente porosa (_s blu 64): bagnata si scurisce.', 4500)
  await openTest('sand.png')
  await scene('Pavimento 5×5', 2500)
  await set('select[aria-label="Luce degli effetti"]', 'noon', 2500)
  await set('input[aria-label=Pioggia]', 1, 4000)
  await say('Le chiazze più scure sono le pozze assorbite dalla sabbia.', 4000)
  await say(
    'Pietra (porosità 0,31) su una distesa: pozze lucide che riflettono il cielo da lontano.',
    5000
  )
  await openTest('stone.png')
  await scene('Distesa 33×33', 3000)
  await set('select[aria-label="Luce degli effetti"]', 'noon', 800)
  await set('input[aria-label=Pioggia]', 1, 1000)
  await set('input[aria-label=Distanza]', 6, 4000)
  await say('In grotta invece non piove: dentro resta tutto asciutto.', 4000)
  await scene('Grotta', 4000)
  await ask(
    '6 · La pioggia scurisce i blocchi porosi, fa pozze sotto il cielo e non entra nella grotta?'
  )

  // ---- End
  await say(
    'Fine del tour! La finestra resta aperta: prova pure tu. Le tue risposte me le ritrovo nel terminale.',
    7000
  )
  await demo.done()
}
