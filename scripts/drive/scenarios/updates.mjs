// Phase 12 update check, opt-in since 0.1.1: off by default; once on, a fake feed (data: URL, no
// network) announces v9.9.9 → banner with the versions, "Più tardi" hides it; turning the setting off stops the check; links outside the
// project's releases are refused (the real "Scarica" link is not clicked: it opens a browser).
const RELEASE = {
  tag_name: 'v9.9.9',
  html_url: 'https://github.com/Andrix03/packforge/releases/tag/v9.9.9',
  draft: false,
  prerelease: false
}

export const options = {
  updateFeed: `data:application/json,${encodeURIComponent(JSON.stringify(RELEASE))}`
}

export default async function updates(app) {
  // Opt-in: with the default settings nothing is asked to GitHub.
  await app.waitFor(`document.querySelector('.shell-hotbar')`)
  const byDefault = await app.ev(`window.api.invoke('app:checkUpdate')`)
  app.check(byDefault.status === 'off', `no check until turned on (${byDefault.status})`)
  app.check(
    !(await app.ev(`!!document.querySelector('[data-testid=update-banner]')`)),
    'no banner by default'
  )
  await app.ev(`window.api.invoke('settings:setCheckUpdates', true)`)
  await app.ev(`location.reload()`)
  await app.sleep(500)
  await app.waitFor(`document.querySelector('[data-testid=update-banner]')`, 10000)
  const banner = await app.ev(`document.querySelector('[data-testid=update-banner]').textContent`)
  app.check(
    banner.includes('PackForge 9.9.9') && /tu hai \d+\.\d+\.\d+/.test(banner),
    `banner (${banner})`
  )
  await app.shot('01-banner')
  await app.click('Più tardi', '[data-testid=update-banner] button')
  await app.sleep(200)
  app.check(
    !(await app.ev(`!!document.querySelector('[data-testid=update-banner]')`)),
    '"Più tardi" hides it'
  )

  const refused = await app.ev(
    `window.api.invoke('app:openRelease', 'https://evil.example/packforge.exe')`
  )
  app.check(refused.ok === false, 'a link outside the project releases is refused')

  const on = await app.ev(`window.api.invoke('app:checkUpdate')`)
  app.check(
    on.status === 'newer' && on.version === '9.9.9',
    `check with the setting on (${on.status})`
  )
  await app.ev(`window.api.invoke('settings:setCheckUpdates', false)`)
  const off = await app.ev(`window.api.invoke('app:checkUpdate')`)
  app.check(off.status === 'off', `setting off: no check (${off.status})`)

  await app.click('Impostazioni')
  await app.waitFor(
    `[...document.querySelectorAll('h3')].some((h) => h.textContent === 'Aggiornamenti')`
  )
  const box = await app.ev(
    `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('nuova versione di PackForge')).querySelector('input').checked`
  )
  app.check(box === false, 'the settings show it off')
}
