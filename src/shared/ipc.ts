// Typed IPC contract shared by main, preload and renderer.
// Pure module: must not import electron or node APIs so it stays testable.
//
// To add a channel:
//   1. add an entry to `IpcContract`
//   2. add it to `channelRegistry` (the compiler enforces this)
//   3. implement it in the main-process handlers
//   4. validate renderer-provided args at runtime in main (they are untrusted)

import type {
  ExportCheck,
  ExportResult,
  ExportVariant,
  ListingResult,
  ProjectInfo
} from './exportPlan'
import type { McmetaAnalysis } from './mcmeta'
import type { PackVersion } from './packFormat'
import type { Language } from './i18n'
import type { EditorMode, RecentPackStatus, SavedPalette, SettingsView } from './settings'
import type { CreatePackRequest } from './validate'
import type { TutorialState } from './tutorial'
import type { VersionRangeRequest } from './versionRange'
import { tr } from './i18n'

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
}

export type CreatePackResult = { ok: true; path: string } | { ok: false; error: string }

export interface PackSummary {
  path: string
  kind: 'folder' | 'zip'
  name: string
  mcmeta: McmetaAnalysis
  /** `data:image/png;base64,…` of pack.png, or null when missing/invalid. */
  iconDataUrl: string | null
}

export type OpenPackResult = { ok: true; pack: PackSummary } | { ok: false; error: string }

export type ListPackFilesResult =
  | {
      ok: true
      /** Posix paths relative to the pack root, sorted. */
      files: string[]
      /** True when the pack has more files than PackForge lists. */
      truncated: boolean
      /** Prefix for PNG URLs: `${assetBase}${encodePackPath(path)}`. */
      assetBase: string
    }
  | { ok: false; error: string }

export interface VanillaVersionInfo {
  /** Launcher version id, e.g. `26.3` or `26.4-snapshot-4`. */
  id: string
  /** Launcher type: `release`, `snapshot`, … */
  type: string
}

export type ListVanillaVersionsResult =
  { ok: true; minecraftDir: string; versions: VanillaVersionInfo[] } | { ok: false; error: string }

export type TextureHashesResult =
  { ok: true; hashes: Record<string, string> } | { ok: false; error: string }

export type LoadVanillaResult =
  | {
      ok: true
      versionId: string
      /** From the jar's version.json; null if unreadable. */
      resourceFormat: PackVersion | null
      /** Vanilla textures, models and block states (`assets/minecraft/…`). */
      files: string[]
      assetBase: string
    }
  | { ok: false; error: string }

/** An image picked for the pack icon, read by main; null when the dialog was cancelled. */
export type PickImageResult =
  { ok: true; name: string; dataUrl: string } | { ok: false; error: string } | null

export type SaveTextureResult = { ok: true } | { ok: false; error: string }

/** Unsaved editor work kept outside the pack (see main/drafts.ts). */
export interface TextureDraft {
  /** ISO timestamp of the autosave. */
  savedAt: string
  width: number
  height: number
  rgba: Uint8Array
  /** The painted LabPBR maps, when there were unsaved changes in them too. */
  maps: DraftMaps
}

export interface DraftImage {
  width: number
  height: number
  rgba: Uint8Array
}

export type DraftMaps = Partial<Record<'normal' | 'specular', DraftImage>>

export type SettingsUpdateResult = { ok: true; view: SettingsView } | { ok: false; error: string }

/** Asset URL; a non-zero version is appended so changed files bypass caches. */
export function assetUrl(assetBase: string, path: string, version = 0): string {
  return assetBase + encodePackPath(path) + (version > 0 ? `?v=${version}` : '')
}

/** Encodes a pack-relative path for use after `assetBase`. */
export function encodePackPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** Why a folder is being picked; main maps it to the dialog title. */
export type DirectoryPurpose = 'packDestination' | 'openPack' | 'minecraftDir' | 'exportDestination'

export interface IpcContract {
  'app:getInfo': { args: []; result: AppInfo }
  'dialog:pickDirectory': { args: [purpose: DirectoryPurpose]; result: string | null }
  'dialog:pickPackZip': { args: []; result: string | null }
  'dialog:pickExecutable': { args: []; result: string | null }
  'pack:create': { args: [request: CreatePackRequest]; result: CreatePackResult }
  'pack:open': { args: [path: string]; result: OpenPackResult }
  /** Lists files of the pack opened with `pack:open`. */
  'pack:listFiles': { args: []; result: ListPackFilesResult }
  'pack:close': { args: []; result: void }
  /** Re-reads pack.mcmeta/pack.png of the open pack (after external edits). */
  'pack:refreshSummary': { args: []; result: OpenPackResult }
  /** Folder packs only: rewrites pack.description, returns the refreshed summary. */
  'pack:updateDescription': { args: [description: string]; result: OpenPackResult }
  /** Folder packs only: rewrites format fields and root overlays, creates overlay folders. */
  'pack:updateVersions': { args: [request: VersionRangeRequest]; result: OpenPackResult }
  /** Opens an image picker in main and returns the image for cropping. */
  'pack:pickIconSource': { args: []; result: PickImageResult }
  /** Folder packs only: writes base64 PNG data (square, 16–1024 px) as pack.png. */
  'pack:setIcon': { args: [pngBase64: string]; result: OpenPackResult }
  /**
   * Folder packs only: writes straight RGBA8 pixels as a PNG at a pack-relative path (folders are
   * created). Main re-validates everything and encodes the PNG itself.
   */
  'texture:save': {
    args: [path: string, width: number, height: number, rgba: Uint8Array]
    result: SaveTextureResult
  }
  /**
   * Folder packs only: writes the texture's `.png.mcmeta` (a JSON object as text), or deletes it
   * with null. `path` is the PNG's path.
   */
  'texture:saveMcmeta': { args: [path: string, content: string | null]; result: SaveTextureResult }
  /**
   * Folder packs only: opens a PNG of the pack in the external editor of the settings (or the
   * system's default program when none is set).
   */
  'texture:openExternal': { args: [path: string]; result: SaveTextureResult }
  /**
   * Folder packs only: writes a CTM `.properties` (text) under `assets/<ns>/optifine/ctm/`.
   */
  'ctm:saveProperties': { args: [path: string, content: string]; result: SaveTextureResult }
  /**
   * Folder packs only: writes a model, block state or item definition (JSON object as text)
   * under `assets/<ns>/models/`, `blockstates/` or `items/` (random variants, plant shapes, 3D
   * in hand).
   */
  'model:saveJson': { args: [path: string, content: string]; result: SaveTextureResult }
  /** Autosaves editor pixels as a draft for this pack texture (folder packs only). */
  'draft:save': {
    args: [path: string, width: number, height: number, rgba: Uint8Array, maps: DraftMaps]
    result: SaveTextureResult
  }
  /** The draft for this texture of the open pack, or null. */
  'draft:load': { args: [path: string]; result: TextureDraft | null }
  'draft:discard': { args: [path: string]; result: void }
  /** Installed game versions with a client jar (reference textures). */
  'vanilla:listVersions': { args: []; result: ListVanillaVersionsResult }
  /** Loads a jar in memory, read-only; textures are never copied anywhere. */
  'vanilla:load': { args: [versionId: string]; result: LoadVanillaResult }
  'settings:get': { args: []; result: SettingsView }
  /** null restores the launcher default. */
  'settings:setMinecraftDir': { args: [path: string | null]; result: SettingsUpdateResult }
  /** null removes the editor. */
  'settings:setExternalEditor': { args: [path: string | null]; result: SettingsUpdateResult }
  'settings:setEditorMode': { args: [mode: EditorMode]; result: SettingsUpdateResult }
  'settings:setCheckUpdates': { args: [on: boolean]; result: SettingsUpdateResult }
  'settings:setTutorial': { args: [state: TutorialState]; result: SettingsUpdateResult }
  /** Saved for the next start (the language is fixed while the app runs). */
  'settings:setLanguage': { args: [language: Language]; result: SettingsUpdateResult }
  /** Folder packs: the title screen splashes, one per line (empty deletes the file). */
  'pack:saveSplashes': { args: [content: string]; result: SaveTextureResult }
  /** Folder packs: moves one file (porting a renamed texture); never onto an existing file. */
  'pack:moveFile': { args: [from: string, to: string]; result: SaveTextureResult }
  /**
   * Pixel hashes of an installed version's textures (pack path → hash of the decoded RGBA), to
   * compare two versions. Nothing of the jar leaves main but the hashes.
   */
  'vanilla:textureHashes': { args: [versionId: string]; result: TextureHashesResult }
  /** Restarts PackForge (after changing the language). */
  'app:restart': { args: []; result: void }
  /** Asks GitHub for the latest release (skipped when turned off in the settings). */
  'app:checkUpdate': { args: []; result: UpdateCheck }
  /** Opens a release page of this project in the browser (other links are refused). */
  'app:openRelease': { args: [url: string]; result: { ok: boolean } }
  /** Replaces the saved palettes (main keeps only valid ones). */
  'settings:setPalettes': { args: [palettes: SavedPalette[]]; result: SettingsUpdateResult }
  /**
   * Folder packs only: copies the files among `paths` that exist (and notes the others) before an
   * operation changes them. Kept in the app's user data, not in the pack.
   */
  'backup:create': {
    args: [label: string, paths: string[]]
    result: { ok: true; id: string } | { ok: false; error: string }
  }
  /** The open pack's backups, newest first. */
  'backup:list': { args: []; result: BackupInfo[] }
  /** Puts a backup's files back (a backup of the current state is taken first). */
  'backup:restore': {
    args: [id: string]
    result: { ok: true; restored: number; removed: number } | { ok: false; error: string }
  }
  'backup:delete': { args: [id: string]; result: { ok: boolean } }
  /** The open folder pack's packforge.json (defaults when missing). */
  'project:get': { args: []; result: ProjectInfo }
  'project:save': { args: [info: ProjectInfo]; result: { ok: boolean; error?: string } }
  /** Problems to fix before publishing (vanilla copies need the jar loaded). */
  'export:check': { args: []; result: ExportCheck }
  /** Builds the zip of a variant into `dir` (null = next to the pack). */
  'export:build': {
    args: [variant: ExportVariant, dir: string | null, overwrite: boolean]
    result: ExportResult
  }
  'export:defaultDir': { args: []; result: string | null }
  /** Descriptions and tags for Modrinth / CurseForge into `<dir>/listing/<version>/`. */
  'export:listing': { args: [dir: string | null]; result: ListingResult }
  /** Saves a Prova screenshot (PNG) into `<export folder>/screenshots/`. */
  'export:saveScreenshot': {
    args: [name: string, png: Uint8Array]
    result: { ok: true; path: string } | { ok: false; error: string }
  }
  /** Opens a folder that holds exports in the file manager. */
  'export:openFolder': { args: [dir: string]; result: { ok: boolean } }
  /** The open pack's copy in resourcepacks. */
  'sync:status': { args: []; result: SyncStatus }
  /** Copies (mirrors) the open folder pack into resourcepacks now. */
  'sync:now': { args: []; result: SyncStatus }
  /** Turns the automatic copy after every change on or off. */
  'sync:setAuto': { args: [on: boolean]; result: SyncStatus }
  /** Opens the resourcepacks folder in the file manager. */
  'sync:openFolder': { args: []; result: { ok: boolean; error: string | null } }
  /** Recently opened packs, newest first; `pack:open` adds to it. */
  'recent:list': { args: []; result: RecentPackStatus[] }
  'recent:remove': { args: [path: string]; result: RecentPackStatus[] }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

// Record keyed by every channel, so forgetting one is a compile error.
const channelRegistry: Record<IpcChannel, true> = {
  'app:getInfo': true,
  'dialog:pickDirectory': true,
  'dialog:pickPackZip': true,
  'dialog:pickExecutable': true,
  'pack:create': true,
  'pack:open': true,
  'pack:listFiles': true,
  'pack:close': true,
  'pack:refreshSummary': true,
  'pack:updateDescription': true,
  'pack:updateVersions': true,
  'pack:pickIconSource': true,
  'pack:setIcon': true,
  'texture:save': true,
  'texture:saveMcmeta': true,
  'ctm:saveProperties': true,
  'model:saveJson': true,
  'texture:openExternal': true,
  'draft:save': true,
  'draft:load': true,
  'draft:discard': true,
  'vanilla:listVersions': true,
  'vanilla:load': true,
  'settings:get': true,
  'settings:setMinecraftDir': true,
  'settings:setExternalEditor': true,
  'settings:setEditorMode': true,
  'settings:setCheckUpdates': true,
  'settings:setTutorial': true,
  'settings:setLanguage': true,
  'pack:saveSplashes': true,
  'pack:moveFile': true,
  'vanilla:textureHashes': true,
  'app:restart': true,
  'app:checkUpdate': true,
  'app:openRelease': true,
  'settings:setPalettes': true,
  'project:get': true,
  'project:save': true,
  'export:check': true,
  'export:build': true,
  'export:defaultDir': true,
  'export:listing': true,
  'export:saveScreenshot': true,
  'export:openFolder': true,
  'backup:create': true,
  'backup:list': true,
  'backup:restore': true,
  'backup:delete': true,
  'sync:status': true,
  'sync:now': true,
  'sync:setAuto': true,
  'sync:openFolder': true,
  'recent:list': true,
  'recent:remove': true
}

export const IPC_CHANNELS: readonly IpcChannel[] = Object.freeze(
  Object.keys(channelRegistry) as IpcChannel[]
)

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(channelRegistry, value)
}

export type IpcHandlers = {
  [C in IpcChannel]: (...args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>
}

export type IpcInvoke = <C extends IpcChannel>(
  channel: C,
  ...args: IpcArgs<C>
) => Promise<IpcResult<C>>

// ---------------------------------------------------------------------------
// Events: main → renderer
// ---------------------------------------------------------------------------

export interface PackFilesChanged {
  /** Pack-relative posix paths that were added, changed or removed. */
  paths: string[]
  /** True when files/folders were added or removed (the file list must reload). */
  structureChanged: boolean
}

export interface IpcEvents {
  /** Files of the open folder pack changed on disk. */
  'pack:filesChanged': PackFilesChanged
  /** The copy in resourcepacks was updated (automatic copy). */
  'sync:changed': SyncStatus
}

export type UpdateCheck =
  | { status: 'newer'; current: string; version: string; url: string }
  | { status: 'current' | 'off' | 'unavailable' }

/** A backup taken before an operation changed pack files. */
export interface BackupInfo {
  id: string
  label: string
  /** ISO timestamp. */
  at: string
  /** Files that existed and were copied. */
  saved: number
  /** Files the operation created (removed on restore). */
  created: number
}

/** The open pack's copy in `<.minecraft>/resourcepacks`. */
export interface SyncStatus {
  /** The pack can be copied (a folder pack outside resourcepacks). */
  available: boolean
  /** Why not, in Italian. */
  reason: string | null
  /** Absolute path of the copy. */
  target: string | null
  /** missing = not copied yet; ours = PackForge's copy; foreign = a folder PackForge did not make. */
  state: 'missing' | 'ours' | 'foreign' | null
  /** Copy again after every change of the pack. */
  auto: boolean
  last: { at: number; copied: number; removed: number; error: string | null } | null
}

export type IpcEventChannel = keyof IpcEvents

const eventRegistry: Record<IpcEventChannel, true> = {
  'pack:filesChanged': true,
  'sync:changed': true
}

export const IPC_EVENT_CHANNELS: readonly IpcEventChannel[] = Object.freeze(
  Object.keys(eventRegistry) as IpcEventChannel[]
)

export function isIpcEventChannel(value: unknown): value is IpcEventChannel {
  return typeof value === 'string' && Object.hasOwn(eventRegistry, value)
}

/** Subscribes to a main → renderer event; returns the unsubscribe function. */
export type IpcSubscribe = <C extends IpcEventChannel>(
  channel: C,
  listener: (payload: IpcEvents[C]) => void
) => () => void

/** API exposed to the renderer as `window.api`. */
export interface PackForgeApi {
  invoke: IpcInvoke
  on: IpcSubscribe
  /** Interface language of this run, read by shared/i18n before any module uses it. */
  language: Language
}

/** Synchronous channel the preload asks the language on (not an invoke channel). */
export const LANGUAGE_CHANNEL = 'i18n:language'

/** Minimal shape of `ipcRenderer` needed to receive events. */
export interface EventTransport {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/** Builds the renderer-side subscribe, rejecting channels outside the contract. */
export function createSubscribe(transport: EventTransport): IpcSubscribe {
  return (channel, listener) => {
    if (!isIpcEventChannel(channel)) {
      throw new Error(tr('Evento IPC non consentito: {0}', String(channel)))
    }
    // The Electron event object is not passed on (it exposes sender internals).
    const wrapped = (_event: unknown, payload: unknown): void =>
      listener(payload as IpcEvents[typeof channel])
    transport.on(channel, wrapped)
    return () => {
      transport.removeListener(channel, wrapped)
    }
  }
}

/** Minimal shape of `ipcRenderer` needed by the bridge. */
export interface InvokeTransport {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** Minimal shape of `ipcMain` needed to register handlers. */
export interface HandleTransport {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

/** Builds the renderer-side invoke, rejecting channels outside the contract. */
export function createInvoke(transport: InvokeTransport): IpcInvoke {
  return (channel, ...args) => {
    if (!isIpcChannel(channel)) {
      return Promise.reject(new Error(tr('Canale IPC non consentito: {0}', String(channel))))
    }
    return transport.invoke(channel, ...args) as Promise<IpcResult<typeof channel>>
  }
}

/** Registers one handler per channel; the event object is not passed to handlers. */
export function registerHandlers(transport: HandleTransport, handlers: IpcHandlers): void {
  for (const channel of IPC_CHANNELS) {
    const handler = handlers[channel] as (...args: unknown[]) => unknown
    transport.handle(channel, (_event, ...args) => handler(...args))
  }
}
