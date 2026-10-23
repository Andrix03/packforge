import { contextBridge, ipcRenderer } from 'electron'
import { createInvoke, createSubscribe, LANGUAGE_CHANNEL, type PackForgeApi } from '../shared/ipc'

const api: PackForgeApi = {
  invoke: createInvoke(ipcRenderer),
  on: createSubscribe(ipcRenderer),
  // Synchronous: shared/i18n reads it when the page's first module loads.
  language: ipcRenderer.sendSync(LANGUAGE_CHANNEL) === 'en' ? 'en' : 'it'
}

contextBridge.exposeInMainWorld('api', api)
