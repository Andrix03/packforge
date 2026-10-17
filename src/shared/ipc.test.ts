import { describe, expect, it, vi } from 'vitest'
import {
  createInvoke,
  IPC_CHANNELS,
  isIpcChannel,
  registerHandlers,
  type AppInfo,
  type HandleTransport,
  type IpcHandlers
} from './ipc'

const sampleInfo: AppInfo = {
  name: 'PackForge',
  version: '0.1.0',
  electron: '1.0.0',
  chrome: '1.0.0',
  node: '1.0.0',
  platform: 'win32'
}

describe('isIpcChannel', () => {
  it('accepts every declared channel', () => {
    for (const channel of IPC_CHANNELS) expect(isIpcChannel(channel)).toBe(true)
  })

  it('rejects unknown values and prototype keys', () => {
    expect(isIpcChannel('fs:readFile')).toBe(false)
    expect(isIpcChannel('toString')).toBe(false)
    expect(isIpcChannel('__proto__')).toBe(false)
    expect(isIpcChannel(42)).toBe(false)
    expect(isIpcChannel(undefined)).toBe(false)
  })
})

describe('createInvoke', () => {
  it('forwards allowed channels and arguments to the transport', async () => {
    const transport = { invoke: vi.fn().mockResolvedValue(sampleInfo) }
    const invoke = createInvoke(transport)

    await expect(invoke('app:getInfo')).resolves.toEqual(sampleInfo)
    expect(transport.invoke).toHaveBeenCalledWith('app:getInfo')
  })

  it('rejects channels outside the contract without calling the transport', async () => {
    const transport = { invoke: vi.fn() }
    const invoke = createInvoke(transport)

    // Simulates an untyped caller (e.g. devtools) bypassing the compiler.
    const untyped = invoke as unknown as (channel: string) => Promise<unknown>
    await expect(untyped('fs:readFile')).rejects.toThrow('fs:readFile')
    expect(transport.invoke).not.toHaveBeenCalled()
  })
})

describe('registerHandlers', () => {
  it('registers exactly one handler per channel and strips the event', async () => {
    const listeners = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const transport: HandleTransport = {
      handle: (channel, listener) => {
        expect(listeners.has(channel)).toBe(false)
        listeners.set(channel, listener)
      }
    }
    const getInfo = vi.fn(() => sampleInfo)
    const handlers: IpcHandlers = {
      'app:getInfo': getInfo,
      'dialog:pickDirectory': () => null,
      'dialog:pickPackZip': () => null,
      'pack:create': () => ({ ok: false, error: 'unused' }),
      'pack:open': () => ({ ok: false, error: 'unused' }),
      'pack:listFiles': () => ({ ok: false, error: 'unused' }),
      'pack:close': () => undefined,
      'vanilla:listVersions': () => ({ ok: false, error: 'unused' }),
      'vanilla:load': () => ({ ok: false, error: 'unused' }),
      'dialog:pickExecutable': () => null,
      'settings:get': () => {
        throw new Error('unused')
      },
      'settings:setMinecraftDir': () => ({ ok: false, error: 'unused' }),
      'settings:setExternalEditor': () => ({ ok: false, error: 'unused' }),
      'pack:updateDescription': () => ({ ok: false, error: 'unused' }),
      'pack:updateVersions': () => ({ ok: false, error: 'unused' }),
      'pack:pickIconSource': () => null,
      'pack:setIcon': () => ({ ok: false, error: 'unused' }),
      'recent:list': () => [],
      'recent:remove': () => []
    }

    registerHandlers(transport, handlers)

    expect([...listeners.keys()].sort()).toEqual([...IPC_CHANNELS].sort())
    const result = await listeners.get('app:getInfo')?.({ sender: 'fake-event' })
    expect(result).toEqual(sampleInfo)
    expect(getInfo).toHaveBeenCalledWith()
  })
})
