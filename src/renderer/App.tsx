import { useEffect, useState } from 'react'
import type { AppInfo, PackSummary } from '../shared/ipc'
import { NewPackForm } from './packs/NewPackForm'
import { OpenPackCard } from './packs/OpenPackCard'
import { PackOverview } from './packs/PackOverview'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackSummary | null>(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .invoke('app:getInfo')
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  async function openPack(path: string): Promise<void> {
    setOpening(true)
    setOpenError(null)
    try {
      const result = await window.api.invoke('pack:open', path)
      if (result.ok) setPack(result.pack)
      else setOpenError(result.error)
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  return (
    <main className="app">
      <header>
        <h1>PackForge</h1>
        <p>Studio per resource pack Minecraft Java con anteprima LabPBR</p>
      </header>

      {pack ? (
        <PackOverview pack={pack} onClose={() => setPack(null)} />
      ) : (
        <div className="stack">
          <OpenPackCard onPick={(path) => void openPack(path)} busy={opening} error={openError} />
          <NewPackForm onCreated={(path) => void openPack(path)} />
        </div>
      )}

      {info && (
        <footer>
          PackForge {info.version} · Electron {info.electron} · Node {info.node}
        </footer>
      )}
    </main>
  )
}
