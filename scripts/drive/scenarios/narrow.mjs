// Narrow windows (found in the playtest at 800×600: the hotbar covered Copia nel gioco and
// Pubblica, the editor scrolled sideways): nothing overlaps or runs off the edge.
const overflow = (app) =>
  app.ev(`document.documentElement.scrollWidth > window.innerWidth + 1 ||
    document.querySelector('.shell-body').scrollWidth > document.querySelector('.shell-body').clientWidth + 1`)

/** True when the hotbar's slots and its right-hand buttons do not overlap. */
const hotbarClear = (app) =>
  app.ev(`(() => {
    const slots = document.querySelector('.shell-slots').getBoundingClientRect()
    const right = document.querySelector('.shell-right').getBoundingClientRect()
    const buttons = [...document.querySelectorAll('.shell-right button')].map((b) => b.getBoundingClientRect())
    return buttons.every((b) => b.left >= slots.right - 1 && b.right <= window.innerWidth + 1) && right.left >= slots.right - 1
  })()`)

export default async function narrow(app) {
  await app.openPack()
  for (const [width, height] of [
    [1000, 650],
    [800, 600]
  ]) {
    await app.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    })
    await app.sleep(600)
    await app.section('blocks')
    app.check(await hotbarClear(app), `${width}: slots and right buttons do not overlap`)
    app.check(!(await overflow(app)), `${width}: Blocchi does not scroll sideways`)
    await app.shot(`narrow-${width}-blocks`)
    await app.openTexture('stone.png')
    app.check(!(await overflow(app)), `${width}: the editor does not scroll sideways`)
    app.check(
      await app.ev(`(() => {
        const b = [...document.querySelectorAll('.editor-header button')].find((x) => x.textContent.includes('Chiudi editor'))
        const r = b.getBoundingClientRect()
        return r.right <= window.innerWidth + 1 && r.width > 0
      })()`),
      `${width}: Chiudi editor is on screen`
    )
    await app.shot(`narrow-${width}-editor`)
    await app.click('Chiudi editor', '.editor-header button')
    await app.waitFor(`!document.querySelector('.editor')`)
  }
}
