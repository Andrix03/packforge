import { join } from 'node:path'
import { app, BrowserWindow, protocol, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { handlePackRequest, PACK_SCHEME } from './packProtocol'
import { getSource } from './session'

// Must run before `ready`. `standard` gives pack:// URLs a host and normal path parsing.
protocol.registerSchemesAsPrivileged([
  { scheme: PACK_SCHEME, privileges: { standard: true, secure: true } }
])

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'PackForge',
    backgroundColor: '#1b1d22',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // Never open new Electron windows; external http(s) links go to the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  protocol.handle(PACK_SCHEME, (request) => handlePackRequest(request, getSource))
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
