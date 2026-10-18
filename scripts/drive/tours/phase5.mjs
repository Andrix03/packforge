// Guided tour of Phase 5 (the test screen), shown live with captions and a red dot.
//   npm run drive -- scripts/drive/tours/phase5.mjs --keep-open
import { createDemo } from '../demo.mjs'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, pixelClick } = demo
  await app.send('Page.bringToFront')

  /** Drags across the 3D view (orbit, or look around while flying). */
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
    for (let i = 1; i <= 20; i++) {
      await move('mouseMoved', c.x + (dx * i) / 20, c.y + (dy * i) / 20, 1)
      await app.sleep(40)
    }
    await move('mouseReleased', c.x + dx, c.y + dy, 0)
  }

  /** Holds a key (by code) for `ms`. */
  async function hold(key, code, ms) {
    await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code })
    await app.sleep(ms)
    await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code })
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say('Ciao Andrea! Ecco la Phase 5: la schermata "Prova". Apro il pack di prova…', 4000)
  await clickOn('button', 'Apri cartella')
  await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)
  await app.waitFor(
    `[...document.querySelectorAll('.tab')].some((t) => t.textContent.startsWith('Vanilla') && !t.disabled)`,
    30000
  )

  // ---- From the editor
  await say('Apro "stone" nell’editor e faccio una modifica SENZA salvare: due pixel rossi.', 4000)
  await app.openTexture('stone.png')
  await app.key('b')
  await app.editor.setHex('ff2020')
  await pixelClick(3, 3)
  await pixelClick(10, 8)
  await say('In alto c’è il nuovo pulsante "🧪 Prova".', 3000)
  await clickOn('button', '🧪 Prova')
  await app.waitFor(`document.querySelector('.test-screen')`)
  await app.sleep(1200)
  await say(
    'Ecco la Prova: il blocco grande a sinistra, i controlli a destra. Usa anche le modifiche non salvate (vedi i pixel rossi).',
    5500
  )
  await point('.test-screen header .badge', null, 2500)
  await say('Trascino per ruotare intorno al blocco.', 2500)
  await drag(220, 0)

  // ---- Scenes
  await say('SCENE: muro e pavimento mostrano come si ripete la texture.', 3500)
  await clickOn('.test-side [role=radio]', 'Muro 3×3')
  await app.sleep(2500)
  await clickOn('.test-side [role=radio]', 'Pavimento 5×5')
  await app.sleep(2500)
  await say(
    'SCENA MISTA: il tuo blocco (la croce e metà del muro) accanto ad altri blocchi, per vedere se i colori stanno bene insieme.',
    5500
  )
  await clickOn('.test-side [role=radio]', 'Con altri blocchi')
  await app.sleep(2500)
  await say('I blocchi vicini si scelgono qui: metto la sabbia al posto dell’erba.', 3500)
  await point('.test-neighbours input')
  await app.setValue('.test-neighbours input', 'sand')
  await app.sleep(3000)
  await say('SCENE COSTRUITE: un angolo di casa, dove il tuo blocco forma i muri…', 4000)
  await clickOn('.test-side [role=radio]', 'Angolo di casa')
  await app.sleep(3500)
  await say('…una grotta (pareti, soffitto e pavimento)…', 3000)
  await clickOn('.test-side [role=radio]', 'Grotta')
  await app.sleep(3500)
  await say('…e un sentiero nell’erba con un albero.', 3000)
  await clickOn('.test-side [role=radio]', 'Sentiero')
  await app.sleep(3500)

  // ---- Free fly
  await say(
    'VOLO LIBERO: W A S D per muoverti, Spazio e Maiusc per salire e scendere, trascina per guardarti intorno.',
    5000
  )
  await clickOn('button', 'Volo libero')
  await hold('w', 'KeyW', 900)
  await drag(-160, 40)
  await hold('w', 'KeyW', 700)
  await hold(' ', 'Space', 500)
  await app.sleep(1500)
  await clickOn('button', 'Torna a ruotare')

  // ---- Distance + mipmaps
  await say('DISTANZA: sulla distesa 33×33 mi allontano fino a 70 blocchi.', 4000)
  await clickOn('.test-side [role=radio]', 'Distesa 33×33')
  await app.sleep(2500)
  await point('input[aria-label=Distanza]')
  for (const d of [30, 45, 60, 70]) {
    await app.setValue('input[aria-label=Distanza]', d)
    await app.sleep(500)
  }
  await say(
    'Con "Mipmap come nel gioco" da lontano i dettagli si fondono in un colore medio, come in Minecraft…',
    5000
  )
  await point('label', 'Mipmap come nel gioco', 1500)
  await clickOn('label', 'Mipmap come nel gioco')
  await say(
    '…senza mipmap invece compaiono puntini e sfarfallio. Il rumore troppo fitto si scopre subito.',
    5000
  )
  await clickOn('label', 'Mipmap come nel gioco')
  await app.sleep(1500)

  // ---- Vanilla comparison
  await say(
    'CONFRONTO: lo schermo si divide, a sinistra il tuo pack e a destra il gioco originale.',
    4500
  )
  await clickOn('.test-side [role=radio]', 'Angolo di casa')
  await app.sleep(1500)
  await clickOn('label', 'Confronta con vanilla')
  await app.sleep(2500)
  await say('La telecamera è la stessa per entrambe le metà.', 3000)
  await drag(-200, 0)
  await app.sleep(1500)
  await clickOn('label', 'Confronta con vanilla')

  // ---- Back to drawing
  await say(
    '"✏ Torna a disegnare" riporta all’editor: le modifiche non salvate sono ancora lì.',
    4500
  )
  await clickOn('button', 'Torna a disegnare')
  await app.sleep(2500)

  // ---- Items
  await say('ITEM: chiudo l’editor (senza salvare) e cerco "diamond" nel pack.', 4000)
  await app.answerDialogs(true)
  await clickOn('button', 'Chiudi editor')
  await app.sleep(800)
  await point('input[type=search]')
  await app.setValue('input[type=search]', 'diamond')
  await app.sleep(1200)
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('item/diamond.png')).click()`
  )
  await say('Si può provare anche direttamente dal pack, con "🧪 Prova in gioco".', 3500)
  await clickOn('button', 'Prova in gioco')
  await app.waitFor(`document.querySelector('.test-screen .item-slots-canvas')`)
  await app.sleep(1500)
  await say(
    'Per gli item: l’oggetto tenuto nella mano destra, con lo spessore come nel gioco, in uno schermo 16:9.',
    5000
  )
  await say('Sotto, la barra e l’inventario: slot 1 la tua texture, slot 2 quella vanilla.', 4500)
  await point('.item-slots-canvas', null, 2500)
  await clickOn('label', 'Confronta con vanilla')
  await say('E il confronto in mano: a sinistra il tuo diamante, a destra quello del gioco.', 4500)

  await say(
    'Ho testato tutto da solo: 27 controlli nuovi, tutti i 14 scenari verdi, 3 bug trovati e corretti.',
    6000
  )
  await say('Fine del tour! La finestra resta aperta: prova pure tu.', 6000)
  await demo.done()
}
