import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { registerHandlers, type DirectoryPurpose, type IpcHandlers } from '../shared/ipc'
import { openPack } from './openPack'
import { createPack } from './pack'

const DIRECTORY_TITLES: Record<DirectoryPurpose, string> = {
  packDestination: 'Scegli la cartella di destinazione',
  openPack: 'Apri la cartella di un resource pack'
}

async function showOpenDialog(options: Electron.OpenDialogOptions): Promise<string | null> {
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
  'pack:open': (path) => openPack(path)
}

export function registerIpcHandlers(): void {
  registerHandlers(ipcMain, handlers)
}
