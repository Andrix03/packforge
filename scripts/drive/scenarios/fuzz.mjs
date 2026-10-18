// Random-action stress test (Pro mode): many tools, layers, selections, undo/redo in random order.
// Invariants: no page errors; undoing everything restores the original texture exactly; redoing
// everything restores the final state exactly. Seed with FUZZ_SEED (default 1), FUZZ_STEPS (80).

const SEED = Number(process.env.FUZZ_SEED ?? 1)
const STEPS = Number(process.env.FUZZ_STEPS ?? 80)
/** FUZZ_TEXTURE=magma.png adds animation-frame actions (the fixture has 3 frames). */
const TEXTURE = process.env.FUZZ_TEXTURE ?? 'stone.png'
const ANIMATED = TEXTURE === 'magma.png'

function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

export default async function fuzz(app) {
  const random = rng(SEED)
  const int = (n) => Math.floor(random() * n)
  const pick = (list) => list[int(list.length)]
  const point = () => [int(16), int(16)]
  const hex = () => [0, 0, 0].map(() => int(256).toString(16).padStart(2, '0')).join('')
  const buttonEnabled = (title) =>
    app.ev(`!!document.querySelector('button[title^="${title}"]:not(:disabled)')`)
  const layers = () => app.ev(`document.querySelectorAll('.layer').length`)

  /** Colors of every second pixel (64 samples) as shown in the status bar. */
  const frameCount = () => app.ev(`document.querySelectorAll('.frame-thumb').length`)

  /** Every second pixel of the texture (every frame when animated), as shown in the status bar. */
  async function snapshot() {
    const frames = ANIMATED ? await frameCount() : 1
    const colors = [`frames:${frames}`]
    for (let f = 0; f < frames; f++) {
      if (ANIMATED) await app.ev(`document.querySelectorAll('.frame-thumb')[${f}].click()`)
      await app.key('0')
      for (let y = 0; y < 16; y += 2) {
        for (let x = 0; x < 16; x += 2) colors.push(await app.editor.color(x, y))
      }
    }
    return colors.join(' ')
  }

  await app.openPack()
  await app.openTexture(TEXTURE)
  await app.click('Pro', '[role=radio]')
  const baseline = await snapshot()
  console.log(`fuzz seed ${SEED}, ${STEPS} steps`)

  const actions = {
    pencil: async () => {
      await app.key('b')
      await app.editor.draw([point(), point(), point()], pick(['left', 'right']))
    },
    eraser: async () => {
      await app.key('e')
      await app.editor.draw([point(), point()])
    },
    fill: async () => {
      await app.key('g')
      await app.editor.click(...point(), pick(['left', 'right']))
    },
    noise: async () => {
      await app.key('n')
      await app.editor.click(...point())
    },
    shade: async () => {
      await app.key('s')
      await app.editor.draw([point(), point()], pick(['left', 'right']))
    },
    shape: async () => {
      await app.key(pick(['l', 'u', 'o']))
      if (random() < 0.3) await app.click('Pieno', 'label').catch(() => {})
      await app.editor.draw([point(), point()])
    },
    color: async () => app.editor.setHex(hex()),
    brush: async () => app.key(pick(['[', ']'])),
    mirror: async () =>
      app.ev(`document.querySelectorAll('.mirror-toggles input')[${int(2)}]?.click()`),
    tiling: async () => app.key('t'),
    select: async () => {
      await app.key('m')
      await app.editor.draw([point(), point()])
    },
    wand: async () => {
      await app.key('w')
      await app.editor.click(...point())
    },
    copyPaste: async () => {
      await app.key('c', ['ctrl'])
      await app.key('v', ['ctrl'])
      await app.editor.draw([point(), point()])
      await app.key('Enter')
    },
    move: async () => {
      await app.key('v')
      await app.editor.draw([point(), point()])
      await app.key(pick(['Enter', 'Escape']))
    },
    transform: async () => {
      await app.key(pick(['h', 'v', 'r']), ['shift'])
      await app.key('Enter')
    },
    erase: async () => app.key('Delete'),
    deselect: async () => app.key('d', ['ctrl']),
    layer: async () => {
      const label = pick(['+ Nuovo', 'Duplica', '▲', '▼', 'Unisci giù', 'Elimina'])
      await app
        .ev(
          `[...document.querySelectorAll('.layer-actions button')].find((b) => b.textContent.includes(${JSON.stringify(label)}) && !b.disabled)?.click()`
        )
        .catch(() => {})
    },
    layerVisibility: async () =>
      app.ev(`[...document.querySelectorAll('.layer-eye')][${int(4)}]?.click()`),
    layerSelect: async () =>
      app.ev(`[...document.querySelectorAll('.layer-name')][${int(4)}]?.click()`),
    opacity: async () => {
      await app.setValue('.layers-panel input[type=range]', int(101))
      await app.ev(
        `document.querySelector('.layers-panel input[type=range]').dispatchEvent(new Event('blur'))`
      )
    },
    undo: async () => app.key('z', ['ctrl']),
    redo: async () => app.key('y', ['ctrl']),
    ...(ANIMATED
      ? {
          frameOp: async () => {
            const label = pick(['Duplica', '+ Vuoto', '◀', '▶', 'Elimina'])
            await app.ev(
              `[...document.querySelectorAll('.frame-actions button')].find((b) => b.textContent.includes(${JSON.stringify(label)}) && !b.disabled)?.click()`
            )
          },
          frameSelect: async () => {
            const count = await frameCount()
            await app.ev(`document.querySelectorAll('.frame-thumb')[${int(count)}]?.click()`)
          },
          frameKey: async () => app.key(pick([',', '.']))
        }
      : {})
  }
  const names = Object.keys(actions)
  for (let step = 0; step < STEPS; step++) {
    const name = pick(names)
    if (process.env.FUZZ_LOG) console.log(`step ${step}: ${name}`)
    try {
      await actions[name]()
    } catch (error) {
      app.check(false, `step ${step} (${name}) threw: ${error.message}`)
    }
  }

  // Put down anything floating so the final state is part of the history.
  await app.key('Enter')
  // Make every layer visible again? No: visibility is part of the history like everything else.
  const final = await snapshot()
  const finalLayers = await layers()

  let undone = 0
  while ((await buttonEnabled('Annulla')) && undone < 400) {
    await app.key('z', ['ctrl'])
    undone++
  }
  app.check((await layers()) === 1, `undoing all ${undone} steps leaves one layer`)
  if (ANIMATED) app.check((await frameCount()) === 3, 'undoing everything brings back the 3 frames')
  const restored = await snapshot()
  if (!app.check(restored === baseline, 'undoing everything restores the original texture')) {
    const before = baseline.split(' ')
    restored.split(' ').forEach((color, i) => {
      if (color !== before[i]) {
        console.log(`  pixel (${(i % 8) * 2}, ${Math.floor(i / 8) * 2}): ${before[i]} → ${color}`)
      }
    })
    await app.shot(`fuzz-${SEED}-after-undo`)
  }

  let redone = 0
  while ((await buttonEnabled('Ripeti')) && redone < 400) {
    await app.key('y', ['ctrl'])
    redone++
  }
  app.check(redone === undone, `redo replays every step (${redone}/${undone})`)
  app.check((await layers()) === finalLayers, 'redoing everything restores the layers')
  app.check((await snapshot()) === final, 'redoing everything restores the final image')
  await app.shot(`fuzz-${SEED}`)
}
