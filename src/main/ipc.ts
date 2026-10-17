import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { registerHandlers, type DirectoryPurpose, type IpcHandlers } from '../shared/ipc'
import { openPack } from './openPack'
import { createPack } from './pack'
import { assetBase } from './packProtocol'
import { listPackFiles } from './packSource'
import { closeSource, getSource, setSource } from './session'
import {
  defaultMinecraftDir,
  listInstalledVersions,
  loadVanillaJar,
  VANILLA_TEXTURES_PREFIX
} from './vanilla'

const DIRECTORY_TITLES: Record<DirectoryPurpose, string> = {
  packDestination: 'Scegli la cartella di destinazione',
  openPack: 'Apri la cartella di un resource pack'
}

async function showOpenDialog(options: Electron.OpenDialogOptions): Promise<string | null> {
  // Automated UI tests cannot drive native dialogs; never honored in packaged builds.
  const testPath = process.env['PACKFORGE_TEST_DIALOG_PATH']
  if (!app.isPackaged && testPath) return testPath

  const window = BrowserWindow.getFocusedWindow()
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

const handlers: IpcHandlers = {
  'app:getInfo': () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  }),

  'dialog:pickDirectory': (purpose) =>
    showOpenDialog({
      // Untrusted input: unknown purposes fall back to a generic title.
      title: Object.hasOwn(DIRECTORY_TITLES, purpose)
        ? DIRECTORY_TITLES[purpose]
        : 'Scegli una cartella',
      properties: ['openDirectory', 'createDirectory']
    }),

  'dialog:pickPackZip': () =>
    showOpenDialog({
      title: 'Apri un resource pack (.zip)',
      properties: ['openFile'],
      filters: [{ name: 'Resource pack', extensions: ['zip'] }]
    }),

  // Renderer input is untrusted: createPack/openPack re-validate everything.
  'pack:create': (request) => createPack(request),

  'pack:open': async (path) => {
    const result = await openPack(path)
    if (!result.ok) return result
    setSource('pack', result.source)
    return { ok: true, pack: result.pack }
  },

  'pack:listFiles': async () => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    try {
      const { files, truncated } = await listPackFiles(current.source)
      return { ok: true, files, truncated, assetBase: assetBase('pack', current.generation) }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Impossibile leggere i file del pack: ${detail}` }
    }
  },

  'pack:close': () => closeSource('pack'),

  // TODO(settings): use the configured .minecraft path once Settings exist.
  'vanilla:listVersions': async () => {
    const minecraftDir = defaultMinecraftDir()
    return { ok: true, minecraftDir, versions: await listInstalledVersions(minecraftDir) }
  },

  'vanilla:load': async (versionId) => {
    const loaded = await loadVanillaJar(defaultMinecraftDir(), versionId)
    if (!loaded.ok) return loaded
    const { files } = await listPackFiles(loaded.source, VANILLA_TEXTURES_PREFIX)
    const opened = setSource('vanilla', loaded.source)
    return {
      ok: true,
      versionId: String(versionId),
      resourceFormat: loaded.resourceFormat,
      files,
      assetBase: assetBase('vanilla', opened.generation)
    }
  }
}

export function registerIpcHandlers(): void {
  registerHandlers(ipcMain, handlers)
}
