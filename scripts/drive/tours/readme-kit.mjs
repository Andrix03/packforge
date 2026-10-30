// Shared helpers of the README GIF tours (scripts/drive/tours/readme-*.mjs): frames named
// NNN-<ms> for scripts/make-demo-gif.mjs, no captions or pointer, our own textures only.
//   npm run drive -- scripts/drive/tours/readme-<name>.mjs
//   node scripts/make-demo-gif.mjs <shots folder> 880 .github/assets/<name>.gif

/** A frame recorder: `frame(ms)` shows the current window for `ms` milliseconds in the GIF. */
export function recorder(app) {
  let n = 0
  return async (ms, settle = 300) => {
    await app.sleep(settle)
    await app.shot(`${String(n++).padStart(3, '0')}-${ms}`)
  }
}

/** Expands the pack tree down to `path` (assets/minecraft/textures/…). */
export async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const b = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (b.getAttribute('aria-expanded') !== 'true') b.click()
    })()`)
    await app.sleep(150)
  }
}

/** Drags horizontally across the middle of `selector` by `dx` pixels (turns a 3D view). */
export async function turn(app, selector, dx) {
  const at = await app.ev(
    `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
  )
  const mouse = (type, x, buttons) =>
    app.send('Input.dispatchMouseEvent', {
      type,
      x,
      y: at.y,
      button: 'left',
      buttons,
      clickCount: 1
    })
  await mouse('mousePressed', at.x, 1)
  for (let step = 1; step <= 4; step++) await mouse('mouseMoved', at.x + (dx * step) / 4, 1)
  await mouse('mouseReleased', at.x + dx, 0)
}

/** Clicks the first button whose text starts with `text` inside `scope`. */
export async function press(app, text, scope = 'body') {
  const found = await app.ev(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)}))
    b?.click()
    return Boolean(b)
  })()`)
  if (!found) throw new Error(`no button "${text}" in ${scope}`)
}
