import type { PackForgeApi } from '../shared/ipc'

declare global {
  interface Window {
    api: PackForgeApi
  }
}
