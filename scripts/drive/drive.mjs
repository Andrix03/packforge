// Drives the real Electron app for UI scenarios, without Playwright: builds, creates a fresh test
// pack and user-data folder, launches Electron with a CDP port, runs a scenario, closes the app.
//
//   npm run drive -- scripts/drive/scenarios/smoke.mjs [--no-build] [--keep-open] [--pack <dir>]
//
// A scenario is a module whose default export is `async (app) => {}`; see helpers below and
// scenarios/smoke.mjs. `app.check(condition, label)` records PASS/FAIL lines; the exit code is 1
// when a check fails or the scenario throws. Screenshots go to a temp folder printed at the end.

import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTestPack } from './fixtures.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const scenarioPath = argv.find((arg) => !arg.startsWith('--') && arg !== option('--pack'))
if (!scenarioPath) {
  console.error('Usage: npm run drive -- <scenario.mjs> [--no-build] [--keep-open] [--pack <dir>]')
  process.exit(2)
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

if (!flag('--no-build')) {
  const build = spawnSync(`"${join(root, 'node_modules', '.bin', 'electron-vite')}" build`, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  })
  if (build.status !== 0) {
    console.error(
      'BUILD FAILED\n' + `${build.stdout}${build.stderr}`.split('\n').slice(-30).join('\n')
    )
    process.exit(1)
  }
  console.log('built')
}

const work = await mkdtemp(join(tmpdir(), 'packforge-drive-'))
const paths = {
  pack: option('--pack') ? resolve(option('--pack')) : join(work, 'pack'),
  userData: join(work, 'userdata'),
  out: join(work, 'shots')
}
await mkdir(paths.out, { recursive: true })
if (!option('--pack')) await createTestPack(paths.pack)

const port = 9300 + Math.floor(Math.random() * 100)
const electron = createRequire(import.meta.url)('electron')
const child = spawn(
  electron,
  ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${paths.userData}`],
  { cwd: root, env: { ...process.env, PACKFORGE_TEST_DIALOG_PATH: paths.pack }, stdio: 'ignore' }
)

const results = []
let exitCode = 0
let socket
try {
  const app = await connect()
  const scenario = await import(pathToFileURL(resolve(scenarioPath)).href)
  await scenario.default(app)
} catch (error) {
  exitCode = 1
  console.log(`SCENARIO ERROR: ${error instanceof Error ? error.stack : error}`)
} finally {
  socket?.close()
  if (!flag('--keep-open')) killTree(child.pid)
}
const failures = results.filter((r) => !r.ok).length
if (failures > 0) exitCode = 1
console.log(
  `${results.length - failures}/${results.length} checks passed · screenshots: ${paths.out}`
)
process.exit(exitCode)

function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'])
  else child.kill('SIGKILL')
}

async function connect() {
  let page = null
  for (let i = 0; i < 60 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      page = targets.find((t) => t.type === 'page') ?? null
    } catch {
      // Not listening yet.
    }
    if (!page) await sleep(250)
  }
  if (!page) throw new Error('Electron did not open a debuggable page')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done)
    socket.addEventListener('error', fail)
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.log(
        `PAGE ERROR: ${data.params.exceptionDetails?.exception?.description ?? data.params.exceptionDetails?.text}`
      )
    } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      console.log(
        `PAGE CONSOLE ERROR: ${data.params.args.map((a) => a.value ?? a.description).join(' ')}`
      )
    }
  })
  const send = (method, params = {}) =>
    new Promise((done) => {
      const requestId = ++id
      pending.set(requestId, done)
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
  await send('Runtime.enable')
  await send('Page.enable')
  return createApp(send)
}

/** Helpers for scenarios. Coordinates are CSS pixels of the window. */
function createApp(send) {
  const ev = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (response.result?.exceptionDetails) {
      throw new Error(
        `evaluate failed: ${response.result.exceptionDetails.exception?.description ?? expression}`
      )
    }
    return response.result?.result?.value
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
  const BUTTONS = { left: 1, right: 2, middle: 4 }
  const MODS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
  const keyCode = (key) =>
    /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : key

  const app = {
    paths,
    ev,
    send,
    sleep,
    /** Records a PASS/FAIL line. */
    check(ok, label) {
      results.push({ ok: Boolean(ok), label })
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
      return Boolean(ok)
    },
    async shot(name) {
      const response = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(paths.out, `${name}.png`)
      const { writeFile } = await import('node:fs/promises')
      await writeFile(file, Buffer.from(response.result.data, 'base64'))
      return file
    },
    /** Polls a page expression until truthy; returns its value or throws after `timeout` ms. */
    async waitFor(expression, timeout = 10000) {
      const end = Date.now() + timeout
      for (;;) {
        const value = await ev(expression)
        if (value) return value
        if (Date.now() > end) throw new Error(`timeout waiting for: ${expression}`)
        await sleep(100)
      }
    },
    /** Clicks the first `selector` element whose text includes `text`. */
    async click(text, selector = 'button') {
      const found = await ev(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find((e) => e.textContent.includes(${JSON.stringify(text)}))
        el?.click()
        return Boolean(el)
      })()`)
      if (!found) throw new Error(`no ${selector} with text "${text}"`)
    },
    /** Sets a React-controlled input/select value and fires input + change. */
    async setValue(selector, value) {
      await ev(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)})
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))})
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
    },
    /** Presses a key; `mods` like ['ctrl', 'shift']. */
    async key(key, mods = []) {
      const modifiers = mods.reduce((sum, m) => sum | MODS[m], 0)
      const text = key.length === 1 && modifiers === 0 ? key : undefined
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: keyCode(key),
        modifiers,
        text
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: keyCode(key), modifiers })
    },
    /** Opens the fixture pack through the start screen (the dialog hook returns it). */
    async openPack({ waitForVanilla = false } = {}) {
      await app.waitFor(
        `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Apri cartella'))`
      )
      await app.click('Apri cartella')
      await app.waitFor(`document.querySelectorAll('.texture-tile').length > 0`)
      if (waitForVanilla) {
        await app.waitFor(
          `[...document.querySelectorAll('.tab')].some((t) => t.textContent.startsWith('Vanilla') && !t.disabled)`,
          30000
        )
      }
    },
    /** Double-clicks the grid tile whose path ends with `/fileName` and waits for the editor. */
    async openTexture(fileName) {
      const found = await ev(`(() => {
        const tile = [...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/' + ${JSON.stringify(fileName)}))
        tile?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
        return Boolean(tile)
      })()`)
      if (!found) throw new Error(`no tile for ${fileName}`)
      await app.waitFor(
        `document.querySelector('.editor-canvas') && document.querySelector('.zoom-label')?.textContent.includes('%')`
      )
      await sleep(300)
    },
    editor: {
      /** Screen point at the center of texture pixel (x, y), from the current zoom and pan. */
      async pixel(x, y) {
        return ev(`(() => {
          const canvas = document.querySelector('.editor-canvas').getBoundingClientRect()
          const zoom = parseInt(document.querySelector('.zoom-label').textContent) / 100
          const size = document.querySelector('.editor-header .badge').textContent.match(/(\\d+)×(\\d+)/)
          const [w, h] = [Number(size[1]), Number(size[2])]
          // The canvas starts fitted and centered; scenarios that pan should press 0 first.
          return {
            x: canvas.x + canvas.width / 2 + (${x} - w / 2 + 0.5) * zoom,
            y: canvas.y + canvas.height / 2 + (${y} - h / 2 + 0.5) * zoom
          }
        })()`)
      },
      /** Drags through texture pixels with a mouse button (one stroke). */
      async draw(points, button = 'left') {
        const screen = []
        for (const [x, y] of points) screen.push(await app.editor.pixel(x, y))
        await mouse('mouseMoved', screen[0])
        await mouse('mousePressed', screen[0], button, BUTTONS[button])
        for (const point of screen.slice(1))
          await mouse('mouseMoved', point, button, BUTTONS[button])
        await mouse('mouseReleased', screen.at(-1), button, 0)
      },
      async click(x, y, button = 'left', mods = []) {
        const point = await app.editor.pixel(x, y)
        const modifiers = mods.reduce((sum, m) => sum | MODS[m], 0)
        await mouse('mousePressed', point, button, BUTTONS[button], modifiers)
        await mouse('mouseReleased', point, button, 0, modifiers)
      },
      /** Color of texture pixel (x, y) as shown in the status bar: '#rrggbb', 'trasparente'… */
      async color(x, y) {
        await mouse('mouseMoved', await app.editor.pixel(x, y))
        await sleep(50)
        return (await ev(`document.querySelector('.editor-status').textContent`))
          .replace(/^x \d+, y \d+/, '')
          .trim()
      },
      /** Types a hex color into the color panel (selected slot). */
      async setHex(hex) {
        await ev(`(() => {
          const input = document.querySelector('.color-fields input')
          input.focus()
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(hex)})
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.blur()
        })()`)
      },
      header: () => ev(`document.querySelector('.editor-header').textContent`)
    }
  }
  return app
}
