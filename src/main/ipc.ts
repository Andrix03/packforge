import { app, ipcMain } from 'electron'
import { registerHandlers, type IpcHandlers } from '../shared/ipc'

const handlers: IpcHandlers = {
  'app:getInfo': () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
  })
}

export function registerIpcHandlers(): void {
  registerHandlers(ipcMain, handlers)
}
