import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  registerHandlers,
  type DirectoryPurpose,
  type IpcEventChannel,
  type IpcEvents,
  type IpcHandlers,
  type SettingsUpdateResult
} from '../shared/ipc'
import {
  addRecentPack,
  isEditorMode,
  removeRecentPack,
  type RecentPack,
  type RecentPackStatus,
  type SettingsView
} from '../shared/settings'
import { validatePackDescription } from '../shared/validate'
import {
  applyFormatFields,
  buildOverlayEntries,
  formatFieldsForRange,
  parseVersionRangeRequest
} from '../shared/versionRange'
import { editPackObject } from './editMcmeta'
import { openPack } from './openPack'
import { ICON_IMAGE_EXTENSIONS, readIconSource, writePackIcon } from './packIcon'
import { createPack } from './pack'
import { saveTexture } from './textureFile'
import { assetBase } from './packProtocol'
import { listPackFiles } from './packSource'
import { PackWatcher } from './packWatcher'
import { closeSource, getSource, setSource } from './session'
import type { PackSource } from './packSource'
import {
  detectEditors,
  fileExists,
  minecraftDirStatus,
  SettingsStore,
  validateEditorPath,
  validateMinecraftDir
} from './settings'
import {
  defaultMinecraftDir,
  listInstalledVersions,
  loadVanillaJar,
  VANILLA_ASSET_PREFIXES
} from './vanilla'

const DIRECTORY_TITLES: Record<DirectoryPurpose, string> = {
  packDestination: 'Scegli la cartella di destinazione',
  openPack: 'Apri la cartella di un resource pack',
  minecraftDir: 'Scegli la cartella .minecraft'
}

const CASE_INSENSITIVE_PATHS = process.platform === 'win32'

/** Adds an `exists` flag so the start screen can grey out moved/deleted packs. */
async function recentStatuses(list: RecentPack[]): Promise<RecentPackStatus[]> {
  return Promise.all(
    list.map(async (entry) => ({ ...entry, exists: await pathExists(entry.path) }))
  )
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

let packWatcher: PackWatcher | null = null

function sendEvent<C extends IpcEventChannel>(channel: C, payload: IpcEvents[C]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

/** Watches folder packs for live updates; zip packs are read-only snapshots. */
async function watchPack(source: PackSource | null): Promise<void> {
  const previous = packWatcher
  packWatcher = null
  await previous?.close()
  if (source?.kind === 'folder') {
    packWatcher = new PackWatcher(source.root, (batch) => sendEvent('pack:filesChanged', batch))
  }
}

let settingsStore: SettingsStore | null = null

// Created lazily: userData is only reliable once the app is ready.
function settings(): SettingsStore {
  settingsStore ??= new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  return settingsStore
}

async function minecraftDir(): Promise<string> {
  return (await settings().get()).minecraftDir ?? defaultMinecraftDir()
}

async function settingsView(): Promise<SettingsView> {
  const current = await settings().get()
  const effective = current.minecraftDir ?? defaultMinecraftDir()
  return {
    settings: current,
    defaultMinecraftDir: defaultMinecraftDir(),
    effectiveMinecraftDir: effective,
    minecraft: await minecraftDirStatus(effective),
    externalEditorExists: current.externalEditor ? await fileExists(current.externalEditor) : true,
    detectedEditors:
      process.platform === 'win32'
        ? await detectEditors({
            programFiles: process.env['ProgramFiles'],
            programFilesX86: process.env['ProgramFiles(x86)']
          })
        : []
  }
}

/** Validates (unless clearing), saves and returns the refreshed view. */
async function updateSetting(
  value: unknown,
  validate: (value: unknown) => Promise<string | null>,
  save: (value: string | null) => Promise<unknown>
): Promise<SettingsUpdateResult> {
  if (value !== null) {
    const error = await validate(value)
    if (error) return { ok: false, error }
  }
  try {
    await save(value as string | null)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Impossibile salvare le impostazioni: ${detail}` }
  }
  return { ok: true, view: await settingsView() }
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

  'dialog:pickExecutable': () =>
    showOpenDialog({
      title: "Scegli l'editor di immagini",
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Programmi', extensions: ['exe'] }] : []
    }),

  // Renderer input is untrusted: createPack/openPack re-validate everything.
  'pack:create': (request) => createPack(request),

  'pack:open': async (path) => {
    const result = await openPack(path)
    if (!result.ok) return result
    setSource('pack', result.source)
    await watchPack(result.source)
    const { path: packPath, name, kind } = result.pack
    try {
      await settings().modify((current) => ({
        recentPacks: addRecentPack(
          current.recentPacks,
          { path: packPath, name, kind, openedAt: new Date().toISOString() },
          CASE_INSENSITIVE_PATHS
        )
      }))
    } catch {
      // Failing to remember a recent pack must not block opening it.
    }
    return { ok: true, pack: result.pack }
  },

  'recent:list': async () => recentStatuses((await settings().get()).recentPacks),

  'recent:remove': async (path) => {
    const next = await settings().modify((current) => ({
      recentPacks: removeRecentPack(current.recentPacks, String(path), CASE_INSENSITIVE_PATHS)
    }))
    return recentStatuses(next.recentPacks)
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

  'pack:close': async () => {
    closeSource('pack')
    await watchPack(null)
  },

  'pack:refreshSummary': async () => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    if (current.source.kind !== 'folder') return { ok: false, error: 'Solo i pack in cartella.' }
    // The session source is unchanged, so thumbnail URLs stay valid.
    const reopened = await openPack(current.source.root)
    return reopened.ok ? { ok: true, pack: reopened.pack } : reopened
  },

  'pack:updateDescription': async (description) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    if (typeof description !== 'string') return { ok: false, error: 'Descrizione non valida.' }
    const invalid = validatePackDescription(description)
    if (invalid) return { ok: false, error: invalid }

    const edited = await editPackObject(current.source, (pack) => {
      pack['description'] = description
    })
    if (!edited.ok) return edited
    // Re-read for a fresh summary; the session source (a folder) is unchanged,
    // so thumbnail URLs stay valid.
    const reopened = await openPack(current.source.root)
    return reopened.ok ? { ok: true, pack: reopened.pack } : reopened
  },

  'pack:pickIconSource': async () => {
    const path = await showOpenDialog({
      title: "Scegli un'immagine per l'icona del pack",
      properties: ['openFile'],
      filters: [{ name: 'Immagini', extensions: ICON_IMAGE_EXTENSIONS }]
    })
    return path ? readIconSource(path) : null
  },

  'pack:setIcon': async (pngBase64) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    const written = await writePackIcon(current.source, pngBase64)
    if (!written.ok) return written
    const reopened = await openPack(current.source.root)
    return reopened.ok ? { ok: true, pack: reopened.pack } : reopened
  },

  'texture:save': async (path, width, height, rgba) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    return saveTexture(current.source, path, width, height, rgba)
  },

  'pack:updateVersions': async (request) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    const parsed = parseVersionRangeRequest(request)
    if (!parsed.ok) return parsed
    const { min, max, overlays } = parsed.value

    const edited = await editPackObject(current.source, (pack, root) => {
      applyFormatFields(pack, formatFieldsForRange(min.resourceFormat, max.resourceFormat))
      if (overlays.length > 0) {
        const section = typeof root['overlays'] === 'object' && root['overlays'] !== null
        root['overlays'] = {
          ...(section ? (root['overlays'] as Record<string, unknown>) : {}),
          entries: buildOverlayEntries(overlays)
        }
      } else {
        delete root['overlays']
      }
    })
    if (!edited.ok) return edited

    try {
      // Names are validated (a-z0-9_.-), so they stay inside the pack folder.
      for (const overlay of overlays) {
        await mkdir(join(current.source.root, overlay.directory), { recursive: true })
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        error: `pack.mcmeta salvato, ma non è stato possibile creare le cartelle overlay: ${detail}`
      }
    }
    const reopened = await openPack(current.source.root)
    return reopened.ok ? { ok: true, pack: reopened.pack } : reopened
  },

  'vanilla:listVersions': async () => {
    const dir = await minecraftDir()
    return { ok: true, minecraftDir: dir, versions: await listInstalledVersions(dir) }
  },

  'vanilla:load': async (versionId) => {
    const loaded = await loadVanillaJar(await minecraftDir(), versionId)
    if (!loaded.ok) return loaded
    const { files } = await listPackFiles(loaded.source, VANILLA_ASSET_PREFIXES)
    const opened = setSource('vanilla', loaded.source)
    return {
      ok: true,
      versionId: String(versionId),
      resourceFormat: loaded.resourceFormat,
      files,
      assetBase: assetBase('vanilla', opened.generation)
    }
  },

  'settings:get': () => settingsView(),

  // Paths come from the renderer: validated on disk before saving.
  'settings:setMinecraftDir': (path) =>
    updateSetting(path, validateMinecraftDir, (value) =>
      settings().update({ minecraftDir: value })
    ),

  'settings:setExternalEditor': (path) =>
    updateSetting(path, validateEditorPath, (value) =>
      settings().update({ externalEditor: value })
    ),

  'settings:setEditorMode': async (mode) => {
    if (!isEditorMode(mode)) return { ok: false, error: 'Modalità non valida.' }
    try {
      await settings().update({ editorMode: mode })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Impossibile salvare le impostazioni: ${detail}` }
    }
    return { ok: true, view: await settingsView() }
  }
}

export function registerIpcHandlers(): void {
  registerHandlers(ipcMain, handlers)
}
