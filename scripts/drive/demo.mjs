// Helpers for guided tours shown live to a person: a caption bar, a red dot standing in for the
// mouse (CDP input does not move the real cursor) and slow, visible clicks and strokes.
//
//   import { createDemo } from '../demo.mjs'
//   export default async (app) => { const demo = createDemo(app); await demo.say('Ciao!') }
//
// Run tours with `npm run drive -- <tour.mjs> --keep-open` so the window stays open at the end.

export function createDemo(app) {
  const { ev, send, sleep } = app
  const BUTTONS = { left: 1, right: 2 }

  async function overlay() {
    await ev(`(() => {
      if (document.getElementById('demo-cap')) return
      const caption = document.createElement('div')
      caption.id = 'demo-cap'
      caption.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;background:#6fbf73;color:#111;font:600 18px Segoe UI;padding:10px 18px;border-radius:10px;box-shadow:0 4px 18px #0008;max-width:80vw;text-align:center;pointer-events:none'
      document.body.appendChild(caption)
      const dot = document.createElement('div')
      dot.id = 'demo-dot'
      dot.style.cssText = 'position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#ef6b6b;border:2px solid #fff;z-index:99999;pointer-events:none;transition:left .3s,top .3s;left:-50px;top:-50px'
      document.body.appendChild(dot)
    })()`)
  }

  const mouse = (type, point, button = 'none', buttons = 0, modifiers = 0) =>
    send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button,
      buttons,
      modifiers,
      clickCount: type === 'mouseMoved' ? 0 : 1
    })

  const demo = {
    /** Shows a caption, then waits `ms` so the viewer can read it. */
    async say(text, ms = 4000) {
      await overlay()
      await ev(`document.getElementById('demo-cap').textContent = ${JSON.stringify(text)}`)
      await sleep(ms)
    },
    async dot(point) {
      await overlay()
      await ev(
        `(() => { const d = document.getElementById('demo-dot'); d.style.left = '${point.x}px'; d.style.top = '${point.y}px' })()`
      )
    },
    /** Center of the first `selector` element containing `text` (scrolled into view), or null. */
    async center(selector, text = null) {
      return ev(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find((e) => ${text === null ? 'true' : `e.textContent.includes(${JSON.stringify(text)})`})
        if (!el) return null
        el.scrollIntoView({ block: 'nearest' })
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })()`)
    },
    /** Moves the dot to an element and lingers (no click). */
    async point(selector, text = null, ms = 2500) {
      const p = await demo.center(selector, text)
      if (p) {
        await demo.dot(p)
        await sleep(ms)
      }
    },
    async clickAt(point, button = 'left', modifiers = 0) {
      await demo.dot(point)
      await sleep(700)
      await mouse('mouseMoved', point)
      await mouse('mousePressed', point, button, BUTTONS[button], modifiers)
      await mouse('mouseReleased', point, button, 0, modifiers)
    },
    async clickOn(selector, text = null) {
      const p = await demo.center(selector, text)
      if (!p) throw new Error(`demo: nothing to click for ${selector} "${text}"`)
      await demo.clickAt(p)
    },
    /** Clicks texture pixel (x, y) in the editor. */
    async pixelClick(x, y, button = 'left', modifiers = 0) {
      await demo.clickAt(await app.editor.pixel(x, y), button, modifiers)
    },
    /** A slow drag through texture pixels with the dot following (one stroke or shape). */
    async stroke(points, button = 'left', modifiers = 0) {
      const screen = []
      for (const [x, y] of points) screen.push(await app.editor.pixel(x, y))
      await demo.dot(screen[0])
      await sleep(600)
      await mouse('mouseMoved', screen[0])
      await mouse('mousePressed', screen[0], button, BUTTONS[button], modifiers)
      for (let i = 1; i < screen.length; i++) {
        const a = screen[i - 1]
        const b = screen[i]
        for (let t = 1; t <= 6; t++) {
          const p = { x: a.x + ((b.x - a.x) * t) / 6, y: a.y + ((b.y - a.y) * t) / 6 }
          await demo.dot(p)
          await mouse('mouseMoved', p, button, BUTTONS[button], modifiers)
          await sleep(60)
        }
      }
      await mouse('mouseReleased', screen.at(-1), button, 0, modifiers)
      await sleep(500)
    },
    async done() {
      await ev(
        `document.getElementById('demo-cap')?.remove(); document.getElementById('demo-dot')?.remove()`
      )
    }
  }
  return demo
}
