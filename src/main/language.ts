// Interface language of this run, decided before any other module builds its texts (index.ts
// imports this first): the saved setting, else the system's. PACKFORGE_LANGUAGE overrides both
// (UI scenarios run in Italian whatever the PC). The preload asks it synchronously.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { isLanguage, language, languageForLocale, setLanguage, type Language } from '../shared/i18n'
import { LANGUAGE_CHANNEL } from '../shared/ipc'

function savedLanguage(): Language | null {
  try {
    const json: unknown = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')
    )
    const value =
      typeof json === 'object' && json !== null
        ? (json as Record<string, unknown>)['language']
        : null
    return isLanguage(value) ? value : null
  } catch {
    return null
  }
}

const forced = process.env['PACKFORGE_LANGUAGE']
setLanguage(
  isLanguage(forced)
    ? forced
    : (savedLanguage() ?? languageForLocale(Intl.DateTimeFormat().resolvedOptions().locale))
)

ipcMain.on(LANGUAGE_CHANNEL, (event) => {
  event.returnValue = language()
})
