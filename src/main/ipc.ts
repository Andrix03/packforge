import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import {
  registerHandlers,
  type DirectoryPurpose,
  type IpcEventChannel,
  type IpcEvents,
  type IpcHandlers,
  type SettingsUpdateResult,
  type SyncStatus
} from '../shared/ipc'
import { mirrorPack, syncState, syncTargetFor } from './packSync'
import { BackupStore } from './backups'
import {
  buildExport,
  checkExport,
  defaultExportDir,
  readProject,
  saveProject,
  writeListing
} from './exporter'
import { parseProject, parseVariant } from '../shared/exportPlan'
import { isPng } from '../shared/png'
import {
  addRecentPack,
  isEditorMode,
  parsePalettes,
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
import { packPngFile, saveCtmProperties, saveTexture, saveTextureMcmeta } from './textureFile'
import { DraftStore } from './drafts'
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
  minecraftDir: 'Scegli la cartella .minecraft',
  exportDestination: 'Scegli dove salvare gli export'
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
let draftStore: DraftStore | null = null

function drafts(): DraftStore {
  draftStore ??= new DraftStore(join(app.getPath('userData'), 'drafts'))
  return draftStore
}

/** A Prova screenshot is a PNG of the view: a few MB at most. */
const MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024

let backupStore: BackupStore | null = null

function backups(): BackupStore {
  backupStore ??= new BackupStore(join(app.getPath('userData'), 'backups'))
  return backupStore
}

/** Root of the open folder pack; drafts don't apply to read-only zip packs. */
function folderPackRoot(): string | null {
  const current = getSource('pack')
  return current?.source.kind === 'folder' ? current.source.root : null
}

function sendEvent<C extends IpcEventChannel>(channel: C, payload: IpcEvents[C]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload)
}

/** Watches folder packs for live updates; zip packs are read-only snapshots. */
async function watchPack(source: PackSource | null): Promise<void> {
  const previous = packWatcher
  packWatcher = null
  await previous?.close()
  // A new pack starts without automatic copy (it is turned on per pack, by hand).
  autoSync = false
  lastSync = null
  if (source?.kind === 'folder') {
    packWatcher = new PackWatcher(source.root, (batch) => {
      sendEvent('pack:filesChanged', batch)
      if (autoSync) scheduleAutoSync()
    })
  }
}

// --- copy into resourcepacks (see packSync.ts) ---------------------------------------------

let autoSync = false
let lastSync: SyncStatus['last'] = null
let syncTimer: ReturnType<typeof setTimeout> | null = null
/** Saves of several files in a row become one copy. */
const AUTO_SYNC_DELAY_MS = 600

async function syncStatus(): Promise<SyncStatus> {
  const current = getSource('pack')
  const empty = { target: null, state: null, auto: false, last: null }
  if (!current) return { available: false, reason: 'Nessun pack aperto.', ...empty }
  const check = await syncTargetFor(await minecraftDir(), current.source)
  if (!check.ok) return { available: false, reason: check.error, ...empty }
  return {
    available: true,
    reason: null,
    target: check.target.path,
    state: await syncState(check.target),
    auto: autoSync,
    last: lastSync
  }
}

async function runSync(): Promise<SyncStatus> {
  const current = getSource('pack')
  if (current) {
    const check = await syncTargetFor(await minecraftDir(), current.source)
    if (check.ok) {
      try {
        const mirrored = await mirrorPack(current.source, check.target)
        lastSync = mirrored.ok
          ? { at: Date.now(), ...mirrored.result, error: null }
          : { at: Date.now(), copied: 0, removed: 0, error: mirrored.error }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        lastSync = { at: Date.now(), copied: 0, removed: 0, error: `Copia non riuscita: ${detail}` }
      }
      // A failed copy stops the automatic one (it would fail again on every save).
      if (lastSync.error) autoSync = false
    }
  }
  return syncStatus()
}

function scheduleAutoSync(): void {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    void runSync().then((status) => sendEvent('sync:changed', status))
  }, AUTO_SYNC_DELAY_MS)
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

  'texture:saveMcmeta': async (path, content) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    return saveTextureMcmeta(current.source, path, content)
  },

  'texture:openExternal': async (path) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    const file = await packPngFile(current.source, path)
    if (!file)
      return { ok: false, error: 'File non trovato nel pack (i pack zip non si aprono fuori).' }
    const editor = (await settings().get()).externalEditor
    if (!editor) {
      const error = await shell.openPath(file)
      return error ? { ok: false, error } : { ok: true }
    }
    if (!(await fileExists(editor))) {
      return { ok: false, error: 'Il programma scelto nelle Impostazioni non esiste più.' }
    }
    // No shell: the path is one argument, whatever characters it has.
    return new Promise((done) => {
      const child = spawn(editor, [file], {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: true
      })
      child.once('error', (error) =>
        done({ ok: false, error: `Avvio non riuscito: ${error.message}` })
      )
      child.once('spawn', () => {
        child.unref()
        done({ ok: true })
      })
    })
  },

  'ctm:saveProperties': async (path, content) => {
    const current = getSource('pack')
    if (!current) return { ok: false, error: 'Nessun pack aperto.' }
    return saveCtmProperties(current.source, path, content)
  },

  'draft:save': async (path, width, height, rgba) => {
    const root = folderPackRoot()
    if (!root) return { ok: false, error: 'Nessun pack in cartella aperto.' }
    return drafts().save(root, path, width, height, rgba)
  },

  'draft:load': async (path) => {
    const root = folderPackRoot()
    return root ? drafts().load(root, path) : null
  },

  'draft:discard': async (path) => {
    const root = folderPackRoot()
    if (root) await drafts().discard(root, path)
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

  'project:get': async () => {
    const root = folderPackRoot()
    return root ? readProject(root) : parseProject(null)
  },

  'project:save': async (info) => {
    const root = folderPackRoot()
    if (!root) return { ok: false, error: 'Solo i pack in cartella hanno un progetto.' }
    return saveProject(root, info)
  },

  'export:check': async () => {
    const current = getSource('pack')
    if (!current) {
      return {
        errors: ['Nessun pack aperto.'],
        warnings: [],
        vanillaCopies: [],
        stray: [],
        files: 0
      }
    }
    return checkExport(current.source, getSource('vanilla')?.source ?? null)
  },

  'export:build': async (variant, dir, overwrite) => {
    const current = getSource('pack')
    if (!current || current.source.kind !== 'folder') {
      return { ok: false, error: 'Solo i pack in cartella si esportano.' }
    }
    const parsed = parseVariant(variant)
    if (!parsed) return { ok: false, error: 'Variante non valida.' }
    if (dir !== null && (typeof dir !== 'string' || !isAbsolute(dir))) {
      return { ok: false, error: 'Cartella di destinazione non valida.' }
    }
    const root = current.source.root
    return buildExport(current.source, {
      packName: basename(root),
      info: await readProject(root),
      variant: parsed,
      dir: dir ?? defaultExportDir(root),
      overwrite: overwrite === true
    })
  },

  'export:listing': async (dir) => {
    const current = getSource('pack')
    if (!current || current.source.kind !== 'folder')
      return { ok: false, error: 'Solo i pack in cartella.' }
    if (dir !== null && (typeof dir !== 'string' || !isAbsolute(dir))) {
      return { ok: false, error: 'Cartella non valida.' }
    }
    const root = current.source.root
    return writeListing(current.source, {
      packName: basename(root),
      info: await readProject(root),
      dir: dir ?? defaultExportDir(root)
    })
  },

  'export:defaultDir': () => {
    const root = folderPackRoot()
    return root ? defaultExportDir(root) : null
  },

  'export:saveScreenshot': async (name, png) => {
    const root = folderPackRoot()
    const current = getSource('pack')
    const base = root ?? (current ? dirname(current.source.root) : null)
    if (!base) return { ok: false, error: 'Nessun pack aperto.' }
    if (!(png instanceof Uint8Array) || png.length > MAX_SCREENSHOT_BYTES || !isPng(png)) {
      return { ok: false, error: 'Immagine non valida.' }
    }
    const safe =
      (typeof name === 'string' ? name : 'screenshot')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '')
        .slice(0, 60) || 'screenshot'
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const dir = join(root ? defaultExportDir(root) : base, 'screenshots')
    const path = join(dir, `${safe}-${stamp}.png`)
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(path, png, { flag: 'wx' })
      return { ok: true, path }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  'export:openFolder': async (dir) => {
    if (typeof dir !== 'string' || !isAbsolute(dir)) return { ok: false }
    try {
      if (!(await stat(dir)).isDirectory()) return { ok: false }
      return { ok: (await shell.openPath(dir)) === '' }
    } catch {
      return { ok: false }
    }
  },

  'backup:create': async (label, paths) => {
    const root = folderPackRoot()
    if (!root) return { ok: false, error: 'Solo i pack in cartella hanno i backup.' }
    return backups().create(root, label, paths)
  },

  'backup:list': async () => {
    const root = folderPackRoot()
    return root ? backups().list(root) : []
  },

  'backup:restore': async (id) => {
    const root = folderPackRoot()
    if (!root) return { ok: false, error: 'Nessun pack in cartella aperto.' }
    return backups().restore(root, id)
  },

  'backup:delete': async (id) => {
    const root = folderPackRoot()
    if (root) await backups().remove(root, id)
    return { ok: root !== null }
  },

  'sync:status': () => syncStatus(),

  'sync:now': () => runSync(),

  'sync:setAuto': async (on) => {
    const status = await syncStatus()
    // Only PackForge's own copy is kept in step automatically.
    autoSync = on === true && status.available && status.state === 'ours'
    return { ...status, auto: autoSync }
  },

  'sync:openFolder': async () => {
    const folder = join(await minecraftDir(), 'resourcepacks')
    try {
      await mkdir(folder, { recursive: true })
      const error = await shell.openPath(folder)
      return { ok: error === '', error: error || null }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  'settings:setPalettes': async (palettes) => {
    try {
      await settings().update({ palettes: parsePalettes(palettes) })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Impossibile salvare le palette: ${detail}` }
    }
    return { ok: true, view: await settingsView() }
  },

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
