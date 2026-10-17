import { useEffect, useState } from 'react'
import type { AppInfo } from '../shared/ipc'
import { NewPackForm } from './packs/NewPackForm'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api
      .invoke('app:getInfo')
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  return (
    <main className="app">
      <header>
        <h1>PackForge</h1>
        <p>Studio per resource pack Minecraft Java con anteprima LabPBR</p>
      </header>

      <NewPackForm />

      {info && (
        <footer>
          PackForge {info.version} · Electron {info.electron} · Node {info.node}
        </footer>
      )}
    </main>
  )
}
