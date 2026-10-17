import { contextBridge, ipcRenderer } from 'electron'
import { createInvoke, createSubscribe, type PackForgeApi } from '../shared/ipc'

const api: PackForgeApi = {
  invoke: createInvoke(ipcRenderer),
  on: createSubscribe(ipcRenderer)
}

contextBridge.exposeInMainWorld('api', api)
