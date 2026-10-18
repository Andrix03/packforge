// Typed IPC contract shared by main, preload and renderer.
// Pure module: must not import electron or node APIs so it stays testable.
//
// To add a channel:
//   1. add an entry to `IpcContract`
//   2. add it to `channelRegistry` (the compiler enforces this)
//   3. implement it in the main-process handlers
//   4. validate renderer-provided args at runtime in main (they are untrusted)

import type { McmetaAnalysis } from './mcmeta'
import type { PackVersion } from './packFormat'
import type { RecentPackStatus, SettingsView } from './settings'
import type { CreatePackRequest } from './validate'
import type { VersionRangeRequest } from './versionRange'

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
export type DirectoryPurpose = 'packDestination' | 'openPack' | 'minecraftDir'

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
  /** Installed game versions with a client jar (reference textures). */
  'vanilla:listVersions': { args: []; result: ListVanillaVersionsResult }
  /** Loads a jar in memory, read-only; textures are never copied anywhere. */
  'vanilla:load': { args: [versionId: string]; result: LoadVanillaResult }
  'settings:get': { args: []; result: SettingsView }
  /** null restores the launcher default. */
  'settings:setMinecraftDir': { args: [path: string | null]; result: SettingsUpdateResult }
  /** null removes the editor. */
  'settings:setExternalEditor': { args: [path: string | null]; result: SettingsUpdateResult }
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
  'vanilla:listVersions': true,
  'vanilla:load': true,
  'settings:get': true,
  'settings:setMinecraftDir': true,
  'settings:setExternalEditor': true,
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
}

export type IpcEventChannel = keyof IpcEvents

const eventRegistry: Record<IpcEventChannel, true> = {
  'pack:filesChanged': true
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
}

/** Minimal shape of `ipcRenderer` needed to receive events. */
export interface EventTransport {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown
}

/** Builds the renderer-side subscribe, rejecting channels outside the contract. */
export function createSubscribe(transport: EventTransport): IpcSubscribe {
  return (channel, listener) => {
    if (!isIpcEventChannel(channel)) {
      throw new Error(`Evento IPC non consentito: ${String(channel)}`)
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
      return Promise.reject(new Error(`Canale IPC non consentito: ${String(channel)}`))
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
