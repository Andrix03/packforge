// First: sets the interface language before any module builds its texts.
import './language'
import { join } from 'node:path'
import { app, BrowserWindow, Menu, protocol, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { handlePackRequest, PACK_SCHEME } from './packProtocol'
import { getSource } from './session'
import { tr } from '../shared/i18n'

// Must run before `ready`. `standard` gives pack:// URLs a host and normal path parsing.
protocol.registerSchemesAsPrivileged([
  {
    scheme: PACK_SCHEME,
    privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true }
  }
])

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: tr('PackForge'),
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
  // PackForge draws its own menu bar: no native one (it would also expose reload and DevTools).
  // macOS keeps the standard app menu, which copy/paste and Cmd+Q rely on.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
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
