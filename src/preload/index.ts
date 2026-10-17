import { contextBridge, ipcRenderer } from 'electron'
import { createInvoke, type PackForgeApi } from '../shared/ipc'

const api: PackForgeApi = {
  invoke: createInvoke(ipcRenderer)
}

contextBridge.exposeInMainWorld('api', api)
