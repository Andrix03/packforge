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
import type { SettingsView } from './settings'
import type { CreatePackRequest } from './validate'

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
      /** Vanilla texture files (`assets/minecraft/textures/…`). */
      files: string[]
      assetBase: string
    }
  | { ok: false; error: string }

export type SettingsUpdateResult = { ok: true; view: SettingsView } | { ok: false; error: string }

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
  /** Installed game versions with a client jar (reference textures). */
  'vanilla:listVersions': { args: []; result: ListVanillaVersionsResult }
  /** Loads a jar in memory, read-only; textures are never copied anywhere. */
  'vanilla:load': { args: [versionId: string]; result: LoadVanillaResult }
  'settings:get': { args: []; result: SettingsView }
  /** null restores the launcher default. */
  'settings:setMinecraftDir': { args: [path: string | null]; result: SettingsUpdateResult }
  /** null removes the editor. */
  'settings:setExternalEditor': { args: [path: string | null]; result: SettingsUpdateResult }
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
  'vanilla:listVersions': true,
  'vanilla:load': true,
  'settings:get': true,
  'settings:setMinecraftDir': true,
  'settings:setExternalEditor': true
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

/** API exposed to the renderer as `window.api`. */
export interface PackForgeApi {
  invoke: IpcInvoke
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
