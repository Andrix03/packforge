// 1.4 element editor gizmo: the selected element has move arrows in the 3D view; dragging the X
// arrow moves it in whole half pixels and updates From/To (the size stays).
export default async function modelGizmo(app) {
  await app.openPack({ waitForVanilla: true })
  await app.openTexture('stone.png')
  await app.click('Elementi del modello', '.editor button')
  await app.waitFor(`document.querySelector('.model-list li')`, 10000)
  // A small element in the middle of the block to move.
  await app.click('Aggiungi', '.model-list button')
  for (const [label, value] of [
    ['Da X', 6],
    ['Da Y', 6],
    ['Da Z', 6],
    ['A X', 10],
    ['A Y', 10],
    ['A Z', 10]
  ]) {
    await app.setValue(`[aria-label="${label}"]`, String(value))
  }
  await app.sleep(800)
  await app.shot('gizmo-before')

  // Where the view's camera (fov 30, yaw 0.7, pitch 0.45, distance 3.6, looking at 0) puts a
  // point: the element's centre is the origin, the X arrow runs along +x from it.
  const view = await app.ev(`(() => {
    const r = document.querySelector('.model-view').getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })()`)
  const project = ([px, py, pz]) => {
    const yaw = 0.7
    const pitch = 0.45
    const d = 3.6
    const c = [
      Math.sin(yaw) * Math.cos(pitch) * d,
      Math.sin(pitch) * d,
      Math.cos(yaw) * Math.cos(pitch) * d
    ]
    const len = Math.hypot(...c)
    const f = c.map((v) => -v / len)
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]
    const norm = (a) => a.map((v) => v / Math.hypot(...a))
    const right = norm(cross(f, [0, 1, 0]))
    const up = cross(right, f)
    const rel = [px - c[0], py - c[1], pz - c[2]]
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    const z = dot(rel, f)
    const t = Math.tan((30 * Math.PI) / 360)
    const sx = dot(rel, right) / (z * t * (view.w / view.h))
    const sy = dot(rel, up) / (z * t)
    return { x: view.x + ((sx + 1) / 2) * view.w, y: view.y + ((1 - sy) / 2) * view.h }
  }
  const centre = project([0, 0, 0])
  const along = project([0.1, 0, 0])
  const dir = { x: along.x - centre.x, y: along.y - centre.y }
  const unit = Math.hypot(dir.x, dir.y)
  const at = (px) => ({ x: centre.x + (dir.x / unit) * px, y: centre.y + (dir.y / unit) * px })
  const mouse = (type, p, buttons) =>
    app.send('Input.dispatchMouseEvent', {
      type,
      x: p.x,
      y: p.y,
      button: 'left',
      buttons,
      clickCount: 1
    })

  const before = await app.ev(`document.querySelector('[aria-label="Da X"]').value`)
  let moved = false
  // The arrow's length depends on the gizmo's on-screen size: try a few points along it.
  for (const px of [30, 45, 60, 22]) {
    await mouse('mouseMoved', at(px), 0)
    await app.sleep(50)
    await mouse('mousePressed', at(px), 1)
    await mouse('mouseMoved', at(px + 20), 1)
    await mouse('mouseMoved', at(px + 45), 1)
    await mouse('mouseReleased', at(px + 45), 0)
    await app.sleep(200)
    if ((await app.ev(`document.querySelector('[aria-label="Da X"]').value`)) !== before) {
      moved = true
      break
    }
  }
  const from = await app.ev(
    `['X','Y','Z'].map((a) => document.querySelector('[aria-label="Da ' + a + '"]').value).join(',')`
  )
  const to = await app.ev(
    `['X','Y','Z'].map((a) => document.querySelector('[aria-label="A ' + a + '"]').value).join(',')`
  )
  app.check(moved, `dragging the X arrow moves the element (from ${from}, to ${to})`)
  const [fx, fy, fz] = from.split(',').map(Number)
  const [tx, ty, tz] = to.split(',').map(Number)
  app.check(
    tx - fx === 4 && fy === 6 && fz === 6 && ty === 10 && tz === 10 && (fx * 2) % 1 === 0,
    'only X changes, the size stays, in half pixels'
  )
  await app.shot('gizmo-after')
}
