// Crops (Phase 12b): a new wheat_stage0 opens on the wheat model at its stage, the growth stage
// tabs offer the 7 missing stages, a new stage starts as a copy of the previous one (saved first),
// the growth plays through the stages, and Prova's "Campo coltivato" grows the rows on farmland.
const BLOCK = 'assets/minecraft/textures/block'

const stageText = (app) => app.ev(`document.querySelector('.growth-bar')?.textContent ?? ''`)
const tabs = (app) =>
  app.ev(
    `[...document.querySelectorAll('[aria-label="Stadi di crescita"] [role=tab]')].map((t) => t.textContent.trim())`
  )

async function newTexture(app, name, start) {
  await app.click('+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('[aria-label="Nuova texture"] input:not([type=color])')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, '${name}')
  })()`)
  await app.click(start, '[aria-label="Nuova texture"] [role=radio]')
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
}

export default async function crops(app) {
  await app.openPack()
  await newTexture(app, 'wheat_stage0', 'Vuota')

  // The preview finds the wheat and shows the stage of this texture.
  await app.waitFor(`document.querySelector('.growth-bar')`, 15000)
  app.check(
    (await stageText(app)).includes('Stadio 1/8'),
    `seed stage shown (${await stageText(app)})`
  )
  await app.waitFor(
    `document.querySelectorAll('[aria-label="Stadi di crescita"] [role=tab]').length === 8`
  )
  const missing = (await tabs(app)).filter((t) => t.startsWith('+'))
  app.check(missing.length === 7, `7 stages still to create (${(await tabs(app)).join(' ')})`)

  // Draw a sprout and save.
  await app.editor.setHex('#3f8f2a')
  for (const y of [13, 14, 15]) await app.editor.click(4, y)
  await app.editor.click(5, 13)
  await app.sleep(300)

  // Creating stage 2 asks to save first, then offers the copy of stage 1.
  await app.ev(`window.confirm = () => true`)
  await app.click('+ 2', '[aria-label="Stadi di crescita"] [role=tab]')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  const copyOn = await app.ev(
    `[...document.querySelectorAll('[aria-label="Nuova texture"] [role=radio]')].find((b) => b.textContent.includes('Copia'))?.getAttribute('aria-checked')`
  )
  app.check(copyOn === 'true', 'the copy of the previous stage is the default start')
  await app.shot('01-new-stage')
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(
    `document.querySelector('.editor-header, header')?.textContent.includes('wheat_stage1') || document.title.includes('wheat_stage1') || [...document.querySelectorAll('[aria-label="Stadi di crescita"] [role=tab][aria-selected=true]')].some((t) => t.textContent.includes('wheat_stage1'))`,
    10000
  )
  await app.sleep(800)
  app.check((await app.editor.color(4, 14)) === '#3f8f2a', 'stage 2 starts from the stage 1 pixels')
  app.check((await app.editor.color(10, 5)) === 'trasparente', 'and keeps its transparency')
  await app.waitFor(
    `/Stadio 2\\/8/.test(document.querySelector('.growth-bar')?.textContent ?? '')`,
    8000
  )
  app.check(true, 'the wheat_stage1 texture shows the wheat at age=1')

  // Growth playback steps through the stages.
  await app.click('Crescita', '.growth-bar button')
  const seen = new Set()
  for (let i = 0; i < 12; i++) {
    seen.add(/Stadio (\d+)/.exec(await stageText(app))?.[1])
    await app.sleep(400)
  }
  app.check(seen.size >= 4, `growth plays (${[...seen].join(',')})`)
  await app.shot('02-growing')
  await app.click('Ferma', '.growth-bar button')

  const problems = await app.ev(
    `[...document.querySelectorAll('.preview-panel .warning-text')].map((w) => w.textContent)`
  )
  app.check(problems.length === 0, `no preview warnings (${problems.join(' | ')})`)

  // Prova: the farm scene.
  await app.ev(
    `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Prova'))?.click()`
  )
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.click('Campo coltivato', '.test-side [role=radio]')
  await app.waitFor(
    `/170 blocchi/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  const status = await app.ev(`document.querySelector('.test-side')?.textContent ?? ''`)
  app.check(/170 blocchi · \d+ tipi/.test(status), 'farm scene built')
  const warnings = await app.ev(
    `[...document.querySelectorAll('.test-side .warning-text')].map((w) => w.textContent)`
  )
  app.check(warnings.length === 0, `no scene warnings (${warnings.join(' | ')})`)
  await app.sleep(2500)
  await app.shot('03-farm')

  // Wind: the field moves between two frames; still, it does not.
  const view = async () => {
    const rect = await app.ev(`(() => {
      const r = document.querySelector('.test-canvas').getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    })()`)
    return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
      .result.data
  }
  const still = [await view(), await app.sleep(600).then(view)]
  app.check(still[0] === still[1], 'no wind: the field is still')
  await app.setValue('input[aria-label=Vento]', 1)
  await app.sleep(500)
  const windy = [await view(), await app.sleep(600).then(view)]
  app.check(windy[0] !== windy[1], 'wind: the plants move')
  await app.shot('04-wind')
}
