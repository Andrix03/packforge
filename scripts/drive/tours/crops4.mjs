// Fourth crops tour (2026-10-19): Andrea asked for no transparent overlays and a taller editor for
// tall plants. A tall carrot painted as one 16×32 canvas, saved as its two files.
//   npm run drive -- scripts/drive/tours/crops4.mjs --keep-open
import { createDemo } from '../demo.mjs'
import { writeCarrots } from './crops2.mjs'

const MID = '#4f9a2f'
const LIGHT = '#7cc24a'

export default async function tour(app) {
  const demo = createDemo(app)
  const { say, clickOn, point, ask, pixelClick, stroke } = demo
  await app.send('Page.bringToFront')
  await writeCarrots(app.paths.pack)

  async function paint(hex, points) {
    await app.editor.setHex(hex)
    for (const p of points) await pixelClick(...p)
  }

  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Quarto tour, solo la pianta alta: niente più trasparenze, l’editor diventa alto il doppio.',
    6000
  )
  await app.openPack()
  await app.openTexture('carrots_stage3.png')
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await app.ev(`window.confirm = () => true`)
  await app.sleep(1000)

  await say('Rendo «Alta» la carota matura.', 3500)
  await clickOn('button', 'Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await clickOn('[aria-label="Forma della pianta"] [role=radio]', 'Alta')
  await clickOn('[aria-label="Forma della pianta"] button', 'Applica la forma')
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 15000)
  await clickOn('[aria-label="Forma della pianta"] button', 'Fatto')
  await app.waitFor(`document.body.textContent.includes('16×32')`, 15000)
  await app.sleep(2000)
  await point('[data-testid=tall-mode]', null, 2500)
  await say(
    'Ora la tela è 16×32: sopra la parte alta (carrots_stage3_top), sotto quella bassa. Si disegna su tutta, come una texture sola.',
    7000
  )
  await point('.editor-canvas', null, 2500)
  await say('Allungo i gambi in un tratto unico, dalla carota fino in cima.', 4000)
  await app.editor.setHex(MID)
  await stroke([
    [4, 22],
    [4, 6]
  ])
  await stroke([
    [11, 22],
    [11, 4]
  ])
  await paint(LIGHT, [
    [4, 5],
    [11, 3],
    [3, 9],
    [5, 12],
    [10, 7],
    [12, 10],
    [3, 18],
    [12, 17]
  ])
  await say('Salvo: PackForge scrive le due metà nei loro file.', 4000)
  await app.key('s', ['ctrl'])
  await app.sleep(1500)
  await clickOn('.preview-size', '3D')
  await app.sleep(800)
  await app.ev(`document.querySelector('.preview-canvas')?.scrollIntoView({ block: 'center' })`)
  await point('.preview-canvas', null, 6000)
  await app.shot('tall-3d')
  await clickOn('.preview-size', '3D')
  await say(
    '«Solo questa metà» torna alla texture singola: serve per le mappe _n/_s o un’animazione di una metà.',
    6500
  )
  await point('[data-testid=tall-mode]', null, 3000)
  await ask('La pianta alta come tela unica va bene così?')

  await say('Fine! Grazie.', 3000)
  await demo.done()
}
