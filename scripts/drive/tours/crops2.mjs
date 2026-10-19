// Second crops tour (2026-10-19), after Andrea's answers to the first: the black pixels fixed,
// then the three things he asked for — random variants, plant shapes (bushy, tall), wind. The four
// carrot stages of the first tour are written into the fixture pack beforehand.
//   npm run drive -- scripts/drive/tours/crops2.mjs --keep-open
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDemo } from '../demo.mjs'
import { png } from '../fixtures.mjs'

const BLOCK = 'assets/minecraft/textures/block'
const DARK = '#2f6b1f'
const MID = '#4f9a2f'
const LIGHT = '#7cc24a'
const ORANGE = '#e8802a'
const ORANGE_DARK = '#b85a1a'

const column = (x, from, to) => Array.from({ length: to - from + 1 }, (_, i) => [x, from + i])

// The carrots of the first tour, stage by stage (each stage paints over the previous one).
const STAGES = [
  [
    [MID, [...column(4, 14, 15), ...column(11, 14, 15)]],
    [
      LIGHT,
      [
        [4, 13],
        [11, 13],
        [3, 14],
        [12, 14]
      ]
    ]
  ],
  [
    [MID, [...column(4, 11, 13), ...column(11, 11, 13)]],
    [
      LIGHT,
      [
        [4, 10],
        [11, 10],
        [3, 12],
        [5, 11],
        [10, 12],
        [12, 11]
      ]
    ],
    [
      DARK,
      [
        [4, 15],
        [11, 15]
      ]
    ]
  ],
  [
    [MID, [...column(4, 7, 10), ...column(11, 7, 10), ...column(8, 11, 15)]],
    [
      LIGHT,
      [
        [3, 8],
        [5, 7],
        [2, 9],
        [10, 8],
        [12, 7],
        [13, 9],
        [7, 12],
        [9, 11],
        [8, 10]
      ]
    ],
    [
      DARK,
      [
        [4, 12],
        [11, 12],
        [8, 14]
      ]
    ]
  ],
  [
    [
      ORANGE,
      [
        [3, 15],
        [4, 15],
        [5, 15],
        [10, 15],
        [11, 15],
        [12, 15],
        [7, 15],
        [8, 15]
      ]
    ],
    [
      ORANGE_DARK,
      [
        [5, 15],
        [12, 15],
        [8, 15]
      ]
    ]
  ]
]

function rgb(hex) {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255]
}

async function writeCarrots(packRoot) {
  const folder = join(packRoot, ...BLOCK.split('/'))
  await mkdir(folder, { recursive: true })
  const pixels = new Map()
  for (const [index, layers] of STAGES.entries()) {
    for (const [hex, points] of layers)
      for (const [x, y] of points) pixels.set(`${x},${y}`, rgb(hex))
    const snapshot = new Map(pixels)
    await writeFile(
      join(folder, `carrots_stage${index}.png`),
      png(16, 16, (x, y) => snapshot.get(`${x},${y}`) ?? [0, 0, 0, 0])
    )
  }
}

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
  const bigPreview = async (ms, shot) => {
    await clickOn('.preview-size', '3D')
    await app.sleep(800)
    await app.ev(`document.querySelector('.preview-canvas')?.scrollIntoView({ block: 'center' })`)
    await point('.preview-canvas', null, ms)
    await app.shot(shot)
    await clickOn('.preview-size', '3D')
  }
  const openProva = async () => {
    await app.ev(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Prova'))?.click()`
    )
    await app.waitFor(
      `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
      15000
    )
  }
  const closeProva = () =>
    app.ev(
      `[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Torna a disegnare'))?.click()`
    )

  // ---- Start
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
  )
  await say(
    'Ciao Andrea! Secondo tour sulle colture: prima la correzione dei pixel neri, poi le tre cose che mi hai chiesto: varianti casuali, forma 3D della pianta e vento. Le carote del primo tour sono già nel pack.',
    9000
  )
  await app.openPack()
  await app.sleep(800)

  // ---- 1. The black pixels
  await say(
    '1 · I pixel neri: il rilievo (POM) su piani sottili come le colture mostrava i lati dei pixel «dall’interno». Ora sui piani delle piante il POM è spento (come negli shader), e i pixel trasparenti non fanno più da muro.',
    9000
  )
  await clickOn('button', 'Applica in blocco')
  await app.waitFor(`document.querySelector('.modal.batch')`)
  await clickOn('.modal.batch button', 'Nessuna')
  await app.setValue('input[aria-label="Filtra texture"]', 'carrots')
  await app.sleep(600)
  await clickOn('.modal.batch button', 'Seleziona visibili')
  await clickOn('.modal.batch .material-presets button', 'Coltura')
  await app.ev(
    `[...document.querySelectorAll('.modal.batch label')].find((l) => l.textContent.startsWith('Rilievo'))?.querySelector('input')?.click()`
  )
  await app.ev(
    `[...document.querySelectorAll('.modal.batch button')].find((b) => b.textContent.startsWith('Applica a')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=batch-result]')`, 30000)
  await clickOn('.modal.batch button', 'Chiudi')
  await app.sleep(800)
  await app.openTexture('carrots_stage3.png')
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  await app.ev(`window.confirm = () => true`)
  await openProva()
  await app.setValue('input[aria-label=Distanza]', 2.2)
  await say('Stesso rilievo e materiale di prima, da vicino: niente più strisce nere.', 6000)
  await ask('1 · I pixel neri sono spariti?')
  await closeProva()
  await app.sleep(1000)

  // ---- 2. Plant shape: bushy
  await say(
    '2 · Forma della pianta: il modello 3D. «Cespuglio» = i 4 piani inclinati verso l’esterno più 2 diagonali, come i pack di colture più scaricati. Lo applico a tutti gli stadi.',
    8000
  )
  await clickOn('button', 'Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await clickOn('[aria-label="Forma della pianta"] [role=radio]', 'Cespuglio')
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Forma della pianta"] label')].find((l) => l.textContent.includes('Tutti gli stadi'))?.querySelector('input')?.click()`
  )
  await point('[data-testid=shape-plan]', null, 4000)
  await clickOn('[aria-label="Forma della pianta"] button', 'Applica la forma')
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 15000)
  await clickOn('[aria-label="Forma della pianta"] button', 'Fatto')
  await app.sleep(1500)
  await clickOn('.growth-bar button', 'Crescita')
  await bigPreview(8000, 'bushy')
  await clickOn('.growth-bar button', 'Ferma')
  await ask('2 · La forma «Cespuglio» ti piace, su tutti gli stadi?')

  // ---- 3. Plant shape: tall
  await say(
    '3 · «Alta»: la carota matura sale di un blocco. La parte di sopra è una seconda texture (carrots_stage3_top), così i pixel restano quadrati.',
    7500
  )
  await clickOn('button', 'Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await clickOn('[aria-label="Forma della pianta"] [role=radio]', 'Alta')
  await point('[data-testid=shape-plan]', null, 3500)
  await clickOn('[aria-label="Forma della pianta"] button', 'Applica la forma')
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 15000)
  await clickOn('[aria-label="Forma della pianta"] button', 'Fatto')
  await app.sleep(1500)
  await say(
    'Una pianta alta due blocchi è disegnata in due texture: prima allungo i gambi fino in cima a quella di sotto…',
    5500
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
  await paint(LIGHT, [
    [3, 4],
    [5, 2],
    [12, 3],
    [10, 1]
  ])
  await save()
  await say('…poi apro la parte alta («4·su», vuota) e li faccio proseguire fino alle punte.', 5000)
  await clickOn('[aria-label="Stadi di crescita"] [role=tab]', '4·su')
  await app.waitFor(`document.body.textContent.includes('${BLOCK}/carrots_stage3_top.png')`, 10000)
  await app.sleep(1500)
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
    [12, 12],
    [2, 9],
    [13, 7]
  ])
  await save()
  await bigPreview(6000, 'tall')
  await ask('3 · La carota alta (due blocchi) si vede bene nell’anteprima?')

  // ---- 4. Random variants
  await say(
    '4 · Varianti casuali: più versioni della stessa texture, il gioco ne sceglie una per ogni blocco. Così un campo non sembra fatto con lo stampino. Funziona senza mod.',
    8000
  )
  await clickOn('[aria-label="Stadi di crescita"] [role=tab]', '4')
  await app.waitFor(`document.body.textContent.includes('${BLOCK}/carrots_stage3.png')`, 10000)
  await app.sleep(1200)
  await clickOn('button', 'Varianti casuali')
  await app.waitFor(`document.querySelector('[data-testid=variants-plan]')`, 10000)
  await point('[data-testid=variants-plan]', null, 5000)
  await clickOn('[aria-label="Varianti casuali"] button', 'Crea 2 varianti')
  await app.waitFor(`document.querySelector('[data-testid=variants-result]')`, 15000)
  await point('[data-testid=variants-result]', null, 3500)
  await clickOn('[aria-label="Varianti casuali"] button', 'Apri carrots_stage3_v2')
  await app.waitFor(`document.body.textContent.includes('${BLOCK}/carrots_stage3_v2.png')`, 10000)
  await app.sleep(1500)
  await say(
    'Si apre la copia (già con la forma alta del suo stadio): la ridisegno un po’ diversa, carote più grosse e un ciuffo in più.',
    6000
  )
  await paint(ORANGE, [
    [6, 15],
    [9, 15],
    [3, 14],
    [12, 14]
  ])
  await paint(LIGHT, [
    [6, 6],
    [7, 5],
    [14, 8]
  ])
  await save()
  await point('[aria-label="Stadi di crescita"]', null, 4000)
  await say('Nelle schede le varianti stanno con il loro stadio: «4·v2», «4·v3».', 4500)
  await ask('4 · Le varianti sono state create e la v2 si ridisegna come una texture normale?')

  // ---- 5. The farm: variants, shapes and wind
  await say(
    '5 · In Prova, «Campo coltivato»: nelle file mature ogni pianta pesca la sua variante; tutte hanno la nuova forma. E ora il vento.',
    7000
  )
  // From the ripe stage (it has the _n/_s maps: the effects start on).
  await clickOn('[aria-label="Stadi di crescita"] [role=tab]', '4')
  await app.waitFor(`document.body.textContent.includes('${BLOCK}/carrots_stage3.png')`, 10000)
  await app.sleep(1200)
  await openProva()
  await clickOn('.test-side [role=radio]', 'Campo coltivato')
  await app.waitFor(`/170 blocchi/.test(document.querySelector('.test-side')?.textContent ?? '')`)
  await app.setValue('input[aria-label=Distanza]', 7)
  await app.sleep(2500)
  await point('input[aria-label=Vento]', null, 2500)
  await app.setValue('input[aria-label=Vento]', 0.6)
  await say(
    'Vento sulle piante: si muove la cima, la base resta nella terra, ogni pianta un po’ sfasata (come gli shader Iris). Anche le ombre seguono.',
    8000
  )
  await app.ev(
    `document.querySelector('select[aria-label="Luce degli effetti"]')?.scrollIntoView({ block: 'center' })`
  )
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.sleep(6000)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await say('Gira pure intorno al campo, poi rispondi.', 4000)
  await app.shot('farm')
  await ask('5 · Varianti, forme e vento nel campo ti convincono?')

  await say(
    'Fine! Tutto è nella roadmap (Fase 11b) e nel commit. Le varianti casuali funzionano con qualsiasi blocco, non solo le colture. Grazie!',
    8000
  )
  await demo.done()
}
