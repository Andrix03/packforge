// Typed IPC contract shared by main, preload and renderer.
// Pure module: must not import electron or node APIs so it stays testable.
//
// To add a channel:
//   1. add an entry to `IpcContract`
//   2. add it to `channelRegistry` (the compiler enforces this)
//   3. implement it in the main-process handlers
//   4. validate renderer-provided args at runtime in main (they are untrusted)

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

export interface IpcContract {
  'app:getInfo': { args: []; result: AppInfo }
  'dialog:pickDirectory': { args: []; result: string | null }
  'pack:create': { args: [request: CreatePackRequest]; result: CreatePackResult }
}

export type IpcChannel = keyof IpcContract
export type IpcArgs<C extends IpcChannel> = IpcContract[C]['args']
export type IpcResult<C extends IpcChannel> = IpcContract[C]['result']

// Record keyed by every channel, so forgetting one is a compile error.
const channelRegistry: Record<IpcChannel, true> = {
  'app:getInfo': true,
  'dialog:pickDirectory': true,
  'pack:create': true
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
