import { useEffect, useState } from 'react'
import type { AppInfo, PackSummary } from '../shared/ipc'
import { TextureEditor, type EditorTarget } from './editor/TextureEditor'
import { ErrorBoundary } from './ErrorBoundary'
import { NewPackForm } from './packs/NewPackForm'
import { OpenPackCard } from './packs/OpenPackCard'
import { PackOverview } from './packs/PackOverview'
import { PackWorkspace } from './packs/PackWorkspace'
import { RecentPacksCard } from './packs/RecentPacksCard'
import { SettingsPanel } from './settings/SettingsPanel'

export function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackSummary | null>(null)
  /** Bumped to remount the workspace (new pack opened, settings changed). */
  const [workspaceKey, setWorkspaceKey] = useState(0)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<EditorTarget | null>(null)

  useEffect(() => {
    window.api
      .invoke('app:getInfo')
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  // External edits to pack.mcmeta / pack.png refresh the overview.
  useEffect(
    () =>
      window.api.on('pack:filesChanged', ({ paths }) => {
        if (!paths.some((path) => path === 'pack.mcmeta' || path === 'pack.png')) return
        void window.api.invoke('pack:refreshSummary').then((result) => {
          if (result.ok) setPack(result.pack)
        })
      }),
    []
  )

  async function openPack(path: string): Promise<void> {
    setOpening(true)
    setOpenError(null)
    try {
      const result = await window.api.invoke('pack:open', path)
      if (result.ok) {
        setPack(result.pack)
        setEditing(null)
        setWorkspaceKey((key) => key + 1)
      } else setOpenError(result.error)
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  async function closePack(): Promise<void> {
    setPack(null)
    setEditing(null)
    await window.api.invoke('pack:close')
  }

  function closeSettings(changed: boolean): void {
    setShowSettings(false)
    // The .minecraft folder may have changed: reload the vanilla reference.
    if (changed) setWorkspaceKey((key) => key + 1)
  }

  const editorOpen = pack !== null && editing !== null

  return (
    <>
      {/* Full-screen editor; the workspace below stays mounted (hidden) to keep its state. */}
      {editorOpen && (
        <ErrorBoundary key={editing.url} what="L'editor" onReset={() => setEditing(null)}>
          <TextureEditor target={editing} onClose={() => setEditing(null)} onSwitch={setEditing} />
        </ErrorBoundary>
      )}
      <main className={pack && !showSettings ? 'app wide' : 'app'} hidden={editorOpen}>
        <header className="app-header">
          <div>
            <h1>PackForge</h1>
            <p>Studio per resource pack Minecraft Java con anteprima LabPBR</p>
          </div>
          {!showSettings && (
            <button type="button" onClick={() => setShowSettings(true)}>
              Impostazioni
            </button>
          )}
        </header>

        {showSettings && <SettingsPanel onClose={closeSettings} />}

        {/* Hidden, not unmounted, while settings are open: keeps tree/grid state. */}
        <div className="stack" hidden={showSettings}>
          {pack ? (
            <>
              <PackOverview
                pack={pack}
                onClose={() => void closePack()}
                onUpdated={(updated, filesChanged) => {
                  setPack(updated)
                  if (filesChanged) setWorkspaceKey((key) => key + 1)
                }}
              />
              <PackWorkspace key={workspaceKey} pack={pack} onEditTexture={setEditing} />
            </>
          ) : (
            <>
              <RecentPacksCard
                // Remount when returning home so the list reflects the last open.
                key={workspaceKey}
                onOpen={(path) => void openPack(path)}
                busy={opening}
              />
              <OpenPackCard
                onPick={(path) => void openPack(path)}
                busy={opening}
                error={openError}
              />
              <NewPackForm onCreated={(path) => void openPack(path)} />
            </>
          )}
        </div>

        {info && (
          <footer>
            PackForge {info.version} · Electron {info.electron} · Node {info.node}
          </footer>
        )}
      </main>
    </>
  )
}
