// Heavy operations on a 512×512 texture must stay responsive (each under LIMIT_MS, measured from
// the input to the updated status bar / DOM).
const LIMIT_MS = 1500

export default async function performance(app) {
  const timed = async (label, action) => {
    const start = Date.now()
    await action()
    const ms = Date.now() - start
    app.check(ms < LIMIT_MS, `${label}: ${ms} ms`)
  }
  await app.openPack()
  await app.click('Pro', '[role=radio]').catch(() => {})
  await timed('open the 512×512 texture', () => app.openTexture('big.png'))
  await app.click('Pro', '[role=radio]')

  await app.key('g')
  await app.editor.setHex('e02020')
  await timed('fill (area, 256×512 pixels)', async () => {
    await app.editor.click(400, 100)
    await app.waitFor(`document.querySelector('.editor-header').textContent.includes('modificata')`)
  })
  await timed('read the filled color', async () => {
    const color = await app.editor.color(400, 300)
    app.check(color === '#e02020', 'the fill reached the whole area')
  })
  await app.click('Globale', '[role=radio]')
  await app.key('n')
  await timed('noise fill (global)', () => app.editor.click(10, 10))
  await timed('pencil stroke across the texture', () =>
    app.editor.draw([
      [0, 250],
      [511, 260]
    ])
  )
  // A long stroke: main-thread time per pointer move (renderer task time from CDP metrics).
  const taskSeconds = async () =>
    (await app.send('Performance.getMetrics')).result.metrics.find((m) => m.name === 'TaskDuration')
      .value
  await app.send('Performance.enable')
  const moves = Array.from({ length: 120 }, (_, i) => [
    Math.floor((i / 120) * 511),
    Math.floor(256 + Math.sin(i / 8) * 128)
  ])
  const before = await taskSeconds()
  await app.editor.draw(moves)
  await app.sleep(800)
  const perMove = (((await taskSeconds()) - before) * 1000) / moves.length
  app.check(perMove < 20, `long pencil stroke: ${perMove.toFixed(1)} ms of work per pointer move`)
  await app.key('z', ['ctrl'])

  await timed('add a layer', () => app.click('+ Nuovo', '.layer-actions button'))
  await timed('layer opacity change', () => app.setValue('.layers-panel input[type=range]', 40))
  await timed('select all + flip (Shift+H)', async () => {
    await app.key('a', ['ctrl'])
    await app.key('h', ['shift'])
    await app.key('Enter')
  })
  await timed('3 × undo', async () => {
    for (let i = 0; i < 3; i++) await app.key('z', ['ctrl'])
  })
  await timed('save (flatten + PNG encode)', async () => {
    await app.key('s', ['ctrl'])
    await app.waitFor(
      `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`,
      10000
    )
  })
}
