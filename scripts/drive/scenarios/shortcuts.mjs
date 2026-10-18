// Every tool shortcut, the shortcuts window, T (seamless) and , . (animation frames).
const TOOLS = {
  b: 'Matita',
  e: 'Gomma',
  g: 'Secchiello',
  s: 'Ombra',
  n: 'Rumore',
  i: 'Contagocce',
  l: 'Linea',
  u: 'Rettangolo',
  o: 'Ellisse',
  m: 'Selezione',
  w: 'Bacchetta',
  v: 'Sposta'
}

export default async function shortcuts(app) {
  const active = () => app.ev(`document.querySelector('.tool.active')?.textContent ?? ''`)
  await app.openPack()
  await app.openTexture('magma.png')

  // Beginner: Pro tools ignore their keys.
  await app.key('b')
  await app.key('u')
  app.check((await active()).includes('Matita'), 'in Beginner mode U (rectangle) does nothing')

  await app.click('Pro', '[role=radio]')
  for (const [key, label] of Object.entries(TOOLS)) {
    await app.key(key)
    app.check((await active()).includes(label), `${key.toUpperCase()} → ${label}`)
  }

  await app.key('?')
  app.check(
    await app.ev(`!!document.querySelector('.shortcuts-help')`),
    '? opens the shortcuts window'
  )
  app.check(
    (await app.ev(`document.querySelector('.shortcuts-help').textContent`)).includes('Maiusc+R'),
    'it lists the selection shortcuts in Pro'
  )
  await app.shot('shortcuts-help')
  await app.key('Escape')
  app.check(!(await app.ev(`!!document.querySelector('.shortcuts-help')`)), 'Esc closes it')

  await app.key('t')
  app.check(
    await app.ev(
      `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Bordi continui')).querySelector('input').checked`
    ),
    'T turns seamless mode on'
  )
  await app.key('t')

  const frame = () =>
    app.ev(
      `[...document.querySelectorAll('.frame-thumb')].findIndex((b) => b.classList.contains('active'))`
    )
  await app.key('.')
  app.check((await frame()) === 1, '. goes to the next frame')
  await app.key(',')
  await app.key(',')
  app.check((await frame()) === 2, ', from the first frame wraps to the last')
}
