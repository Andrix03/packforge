// Animation frames editor: edit a frame, frame operations, timing, save PNG + .png.mcmeta;
// turn a static texture into an animation.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = 'assets/minecraft/textures/block'

export default async function animation(app) {
  const frames = () => app.ev(`document.querySelectorAll('.frame-thumb').length`)
  const pngHeight = async (name) =>
    (await readFile(join(app.paths.pack, BLOCK, name))).readUInt32BE(20)
  const mcmeta = async (name) =>
    JSON.parse(await readFile(join(app.paths.pack, BLOCK, `${name}.mcmeta`), 'utf8'))

  await app.openPack()
  await app.openTexture('magma.png')
  app.check((await frames()) === 3, 'an animated texture shows its 3 frames')
  app.check((await app.editor.color(5, 5)) === '#c8281e', 'the canvas shows frame 1 only')

  // Edit frame 2.
  await app.ev(`document.querySelectorAll('.frame-thumb')[1].click()`)
  app.check((await app.editor.color(5, 5)) === '#28b43c', 'clicking a thumbnail shows that frame')
  await app.editor.setHex('ffffff')
  await app.editor.draw([
    [0, 0],
    [15, 0]
  ])
  app.check((await app.editor.color(3, 0)) === '#ffffff', 'painting works on frame 2')
  await app.ev(`document.querySelectorAll('.frame-thumb')[0].click()`)
  app.check((await app.editor.color(3, 0)) === '#c8281e', 'frame 1 was not touched')

  // A fill on frame 1 must not leak into frame 2.
  await app.key('g')
  await app.editor.setHex('101010')
  await app.editor.click(8, 8)
  await app.ev(`document.querySelectorAll('.frame-thumb')[1].click()`)
  app.check((await app.editor.color(8, 8)) === '#28b43c', 'a fill stays inside its frame')

  // Duplicate, move, delete, undo.
  await app.click('Duplica', '.frame-actions button')
  app.check((await frames()) === 4, 'Duplica adds a frame')
  app.check(
    (await app.editor.color(3, 0)) === '#ffffff',
    'the copy is shown and has the white line'
  )
  await app.click('Elimina', '.frame-actions button')
  app.check((await frames()) === 3, 'Elimina removes it')
  await app.key('z', ['ctrl'])
  app.check((await frames()) === 4, 'Ctrl+Z brings the frame back')
  await app.key('z', ['ctrl'])
  app.check((await frames()) === 3, 'Ctrl+Z again undoes the duplicate')

  // Timing and save.
  await app.setValue('.frames-header input[type=number]', 5)
  await app.click('Interpola', 'label')
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  app.check((await pngHeight('magma.png')) === 48, 'the strip is saved (16×48)')
  const meta = await mcmeta('magma.png')
  app.check(
    meta.animation?.frametime === 5 && meta.animation?.interpolate === true,
    `the .mcmeta has the new timing (${JSON.stringify(meta)})`
  )

  // Onion skin + preview don't crash.
  await app.click('Onion skin', 'label')
  await app.click('Anteprima', '.frames-header button')
  await app.sleep(600)
  await app.shot('animation')
  await app.click('Ferma', '.frames-header button')

  // Turn stone into an animation of 2 frames.
  await app.click('Chiudi editor')
  await app.openTexture('stone.png')
  await app.click('Pro', '[role=radio]')
  await app.click('Anima questa texture')
  app.check((await frames()) === 1, '"Anima" turns stone into a 1-frame animation')
  await app.click('Duplica', '.frame-actions button')
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `document.querySelector('.editor-header').textContent.includes('Salvata nel pack')`
  )
  app.check((await pngHeight('stone.png')) === 32, 'stone is saved as a 2-frame strip')
  app.check((await mcmeta('stone.png')).animation?.frametime === 4, 'with a new .png.mcmeta')
}
