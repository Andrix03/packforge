import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { registerHandlers, type IpcHandlers } from '../shared/ipc'
import { createPack } from './pack'

const handlers: IpcHandlers = {
  'app:getInfo': () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  }),

  'dialog:pickDirectory': async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Scegli la cartella di destinazione',
      properties: ['openDirectory', 'createDirectory']
    }
    const window = BrowserWindow.getFocusedWindow()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  },

  // Renderer input is untrusted: createPack re-validates everything.
  'pack:create': (request) => createPack(request)
}

export function registerIpcHandlers(): void {
  registerHandlers(ipcMain, handlers)
}
