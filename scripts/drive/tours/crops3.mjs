// Third crops tour (2026-10-19): the three problems Andrea found in the second one — drawing the
// two halves of a tall plant, checking which random variant the preview shows, dark edges on far
// plants. The carrots of the first tour are written into the fixture pack beforehand.
//   npm run drive -- scripts/drive/tours/crops3.mjs --keep-open
import { createDemo } from '../demo.mjs'
import { writeCarrots } from './crops2.mjs'

const BLOCK = 'assets/minecraft/textures/block'
const MID = '#4f9a2f'
const LIGHT = '#7cc24a'
const ORANGE = '#e8802a'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, pixelClick, stroke } = demo
  await app.send('Page.bringToFront')
  await writeCarrots(app.paths.pack)

  async function paint(hex, points) {
    await app.editor.setHex(hex)
    for (const p of points) await pixelClick(...p)
  }
  const save = async () => {
    await app.key('s', ['ctrl'])
    await app.sleep(1200)
  }
  const openTab = async (label, file) => {
    await clickOn('[aria-label="Stadi di crescita"] [role=tab]', label)
    await app.waitFor(`document.body.textContent.includes('${BLOCK}/${file}')`, 10000)
    await app.sleep(1500)
  }

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Terzo tour: i tre problemi che hai trovato. 1) disegnare le due metà di una pianta alta, 2) capire quale variante mostra l’anteprima, 3) i bordi neri sulle piante lontane.',
    9000
  )
  await app.openPack()
  await app.openTexture('carrots_stage3.png')
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await app.ev(`window.confirm = () => true`)
  await app.sleep(1000)

  // ---- 1. Tall plant: both halves in view
  await say('1 · Rendo «Alta» la carota matura.', 3500)
  await clickOn('button', 'Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await clickOn('[aria-label="Forma della pianta"] [role=radio]', 'Alta')
  await clickOn('[aria-label="Forma della pianta"] button', 'Applica la forma')
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 15000)
  await clickOn('[aria-label="Forma della pianta"] button', 'Fatto')
  await app.sleep(1500)
  await point('.editor-canvas', null, 2000)
  await say(
    'Ora sopra la tela (tratteggiata) c’è la parte alta: vedi subito dove i gambi devono continuare. Li allungo fino in cima.',
    7000
  )
  await app.editor.setHex(MID)
  await stroke([
    [4, 6],
    [4, 0]
  ])
  await stroke([
    [11, 6],
    [11, 0]
  ])
  await save()
  await say(
    'Apro la parte alta («4·su»): sotto la tela c’è la parte bassa, quindi i gambi si attaccano al pixel giusto.',
    7000
  )
  await openTab('4·su', 'carrots_stage3_top.png')
  await point('.editor-canvas', null, 2500)
  await app.editor.setHex(MID)
  await stroke([
    [4, 15],
    [4, 8]
  ])
  await stroke([
    [11, 15],
    [11, 6]
  ])
  await paint(LIGHT, [
    [4, 7],
    [11, 5],
    [3, 11],
    [5, 13],
    [10, 9],
    [12, 12]
  ])
  await save()
  await say(
    'E per disegnare uno stadio guardando il precedente: «Stadio precedente in trasparenza» (qui la carota di prima, sbiadita).',
    7000
  )
  await openTab('4', 'carrots_stage3.png')
  await app.ev(
    `[...document.querySelectorAll('[data-testid=stage-context] label')].find((l) => l.textContent.includes('Stadio precedente'))?.querySelector('input')?.click()`
  )
  await point('[data-testid=stage-context]', null, 2500)
  await point('.editor-canvas', null, 4000)
  await ask(
    '1 · Con le due metà affiancate e lo stadio precedente, disegnare la pianta alta è chiaro?'
  )

  // ---- 2. Which random variant the preview shows
  await say('2 · Creo 2 varianti della carota matura e apro la seconda.', 4000)
  await clickOn('button', 'Varianti casuali')
  await app.waitFor(`document.querySelector('[data-testid=variants-plan]')`, 10000)
  await clickOn('[aria-label="Varianti casuali"] button', 'Crea 2 varianti')
  await app.waitFor(`document.querySelector('[data-testid=variants-result]')`, 15000)
  await clickOn('[aria-label="Varianti casuali"] button', 'Apri carrots_stage3_v2')
  await app.waitFor(`document.body.textContent.includes('${BLOCK}/carrots_stage3_v2.png')`, 10000)
  await app.sleep(1500)
  await paint(ORANGE, [
    [6, 15],
    [9, 15],
    [3, 14],
    [12, 14]
  ])
  await save()
  await app.ev(
    `document.querySelector('[data-testid=random-choice]')?.scrollIntoView({ block: 'center' })`
  )
  await say(
    'Sopra l’anteprima ora c’è scritto quale variante disegna: «Variante 2 di 3» = quella aperta. Con ◀ ▶ le guardi tutte.',
    7000
  )
  await point('[data-testid=random-choice]', null, 2500)
  await clickOn('[aria-label="Varianti casuali"] button', '▶')
  await app.sleep(2500)
  await clickOn('[aria-label="Varianti casuali"] button', '▶')
  await app.sleep(2500)
  await clickOn('[aria-label="Varianti casuali"] button', '▶')
  await app.sleep(2500)
  await ask('2 · Ora si capisce quale variante mostra l’anteprima?')

  // ---- 3. Dark edges far away
  await say(
    '3 · I bordi neri: da lontano la scheda video mediava anche il nero dei pixel trasparenti. Ora le mipmap si fanno come nel gioco 26.3 (letto dal codice del client): niente bordi scuri.',
    9000
  )
  await openTab('4', 'carrots_stage3.png')
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Prova'))?.click()`
  )
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await clickOn('.test-side [role=radio]', 'Campo coltivato')
  await app.waitFor(`/170 blocchi/.test(document.querySelector('.test-side')?.textContent ?? '')`)
  await app.setValue('input[aria-label=Distanza]', 9)
  await app.sleep(3000)
  await point('.test-canvas', null, 4000)
  await say(
    'Il pack può anche scegliere la strategia per texture (.png.mcmeta → "texture": "mipmap_strategy"): l’anteprima la rispetta.',
    6000
  )
  await ask('3 · Le piante lontane hanno ancora bordi neri?')

  await say('Fine! Grazie: tutto è nel commit e nella roadmap.', 5000)
  await demo.done()
}
