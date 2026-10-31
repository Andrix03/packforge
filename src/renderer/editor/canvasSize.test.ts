import { afterEach, expect, it, vi } from 'vitest'
import { observeCanvasSize } from './canvasSize'

afterEach(() => vi.unstubAllGlobals())

it('measures on attachment even when Chromium never delivers the first resize', () => {
  let resize = (): void => {}
  const disconnect = vi.fn()
  const observe = vi.fn()
  vi.stubGlobal('window', { devicePixelRatio: 2 })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe = observe
      disconnect = disconnect
    }
  )
  const container = { clientWidth: 320, clientHeight: 240 }
  const measured = vi.fn()
  const stop = observeCanvasSize(container as HTMLElement, measured)
  expect(measured).toHaveBeenCalledExactlyOnceWith({ width: 640, height: 480 })
  expect(observe).toHaveBeenCalledWith(container)
  container.clientWidth = 400
  resize()
  expect(measured).toHaveBeenLastCalledWith({ width: 800, height: 480 })
  stop()
  expect(disconnect).toHaveBeenCalledOnce()
})
