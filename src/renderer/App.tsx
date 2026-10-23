import { useEffect, useState } from 'react'
import type { AppInfo, PackSummary, UpdateCheck } from '../shared/ipc'
import { compatibleReleases } from '../shared/mcmeta'
import { summarizeReleaseSpans } from '../shared/packFormat'
import { TextureEditor, type EditorTarget } from './editor/TextureEditor'
import { ErrorBoundary } from './ErrorBoundary'
import { NewPackForm } from './packs/NewPackForm'
import { OpenPackCard } from './packs/OpenPackCard'
import { PackOverview } from './packs/PackOverview'
import { PackWorkspace } from './packs/PackWorkspace'
import { RecentPacksCard } from './packs/RecentPacksCard'
import { SettingsPanel } from './settings/SettingsPanel'
import { CommandContext, useCommands, useCommandStore } from './shell/commandContext'
import { Shell, type WorkspaceTab } from './shell/Shell'
import { TestScreen, type TestLive } from './testscreen/TestScreen'
import { TutorialCard } from './TutorialCard'
import { announceStep } from './tutorialEvents'
import type { Workspace } from './ui/commands'
import { CommandStore } from './ui/commandStore'

export function App(): React.JSX.Element {
  const [store] = useState(() => new CommandStore())
  return (
    <CommandContext.Provider value={store}>
      <Window />
    </CommandContext.Provider>
  )
}

const SOON = 'Arriva con la nuova interfaccia'

function Window(): React.JSX.Element {
  const store = useCommandStore()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackSummary | null>(null)
  /** Bumped to remount the workspace (new pack opened, settings changed). */
  const [workspaceKey, setWorkspaceKey] = useState(0)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<EditorTarget | null>(null)
  /** Test screen, over the editor (live = opened from it) or over the workspace. */
  const [testing, setTesting] = useState<{ target: EditorTarget; live: TestLive | null } | null>(
    null
  )

  useEffect(() => {
    window.api
      .invoke('app:getInfo')
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  // Tutorial steps the app itself sees.
  useEffect(() => {
    if (pack) announceStep('pack')
  }, [pack])
  useEffect(() => {
    if (editing) announceStep('texture')
  }, [editing])
  useEffect(() => {
    if (testing) announceStep('test')
  }, [testing])

  /** A newer release on GitHub (checked once at start, if allowed in the settings). */
  const [update, setUpdate] = useState<Extract<UpdateCheck, { status: 'newer' }> | null>(null)
  useEffect(() => {
    void window.api
      .invoke('app:checkUpdate')
      .then((result) => result.status === 'newer' && setUpdate(result))
      .catch(() => undefined)
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
        setTesting(null)
        setWorkspaceKey((key) => key + 1)
      } else setOpenError(result.error)
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : String(error))
    } finally {
      setOpening(false)
    }
  }

  async function pickAndOpen(kind: 'folder' | 'zip'): Promise<void> {
    const path =
      kind === 'folder'
        ? await window.api.invoke('dialog:pickDirectory', 'openPack')
        : await window.api.invoke('dialog:pickPackZip')
    if (path) await openPack(path)
  }

  async function closePack(): Promise<void> {
    setPack(null)
    setEditing(null)
    setTesting(null)
    await window.api.invoke('pack:close')
  }

  function closeSettings(changed: boolean): void {
    setShowSettings(false)
    // The .minecraft folder may have changed: reload the vanilla reference.
    if (changed) setWorkspaceKey((key) => key + 1)
  }

  const editorOpen = pack !== null && editing !== null
  const testOpen = pack !== null && testing !== null
  const workspace: Workspace | null = !pack
    ? null
    : testOpen
      ? 'prova'
      : editorOpen
        ? 'disegna'
        : 'pack'

  /** Leaves the test screen the way its own "back" button does. */
  function leaveTest(): void {
    if (!testing) return
    if (!testing.live) setEditing(testing.target)
    setTesting(null)
  }

  function goTo(next: Workspace): void {
    if (next === workspace) return
    setShowSettings(false)
    if (next === 'pack') {
      setTesting(null)
      // The editor asks before throwing unsaved work away.
      if (editorOpen) store.run('editor:close')
    } else if (next === 'disegna') {
      if (testOpen) leaveTest()
    } else if (next === 'prova') {
      store.run('editor:test')
    }
  }

  const tabs: WorkspaceTab[] = [
    { id: 'pack', enabled: pack !== null, why: 'Apri o crea un pack' },
    {
      id: 'disegna',
      enabled: editorOpen || testOpen,
      why: 'Scegli una texture nel Pack e premi Disegna'
    },
    { id: 'prova', enabled: editorOpen, why: 'Apri una texture per provarla' },
    { id: 'effetti', enabled: false, why: SOON },
    { id: 'pubblica', enabled: false, why: SOON }
  ]

  const WORKSPACES: [Workspace, string][] = [
    ['pack', 'Vai a Pack'],
    ['disegna', 'Vai a Disegna'],
    ['prova', 'Vai a Prova']
  ]
  useCommands([
    {
      id: 'app:openFolder',
      label: 'Apri un pack (cartella)…',
      menu: 'File',
      area: 'Pack',
      enabled: !opening,
      run: () => void pickAndOpen('folder')
    },
    {
      id: 'app:openZip',
      label: 'Apri un pack .zip (sola lettura)…',
      menu: 'File',
      area: 'Pack',
      enabled: !opening,
      run: () => void pickAndOpen('zip')
    },
    {
      id: 'app:closePack',
      label: 'Chiudi il pack',
      menu: 'File',
      area: 'Pack',
      enabled: pack !== null && !editorOpen && !testOpen,
      why: pack ? 'Prima chiudi l’editor' : 'Nessun pack aperto',
      run: () => void closePack()
    },
    {
      id: 'app:settings',
      label: 'Impostazioni…',
      menu: 'File',
      area: 'PackForge',
      enabled: !editorOpen && !testOpen && !showSettings,
      why: 'Prima chiudi l’editor',
      run: () => setShowSettings(true)
    },
    ...WORKSPACES.map(([id, label]) => {
      const tab = tabs.find((t) => t.id === id)
      return {
        id: `ws:${id}`,
        label,
        menu: 'Visualizza',
        area: 'Spazi di lavoro',
        enabled: (tab?.enabled ?? false) && workspace !== id,
        why: tab?.why,
        run: () => goTo(id)
      }
    }),
    ...(update
      ? [
          {
            id: 'app:update',
            label: `Scarica PackForge ${update.version}`,
            menu: 'Aiuto',
            area: 'PackForge',
            run: () => void window.api.invoke('app:openRelease', update.url)
          }
        ]
      : [])
  ])

  const versions = pack
    ? summarizeReleaseSpans(compatibleReleases(pack.mcmeta.formats)).join(', ')
    : ''

  return (
    <Shell
      title={pack ? pack.name : 'Nessun pack aperto'}
      subtitle={
        pack ? versions || 'versione del gioco non indicata' : 'apri o crea un pack per iniziare'
      }
      workspace={workspace}
      tabs={tabs}
      onWorkspace={goTo}
      right={
        !showSettings &&
        !editorOpen &&
        !testOpen && (
          <button type="button" className="ore" onClick={() => setShowSettings(true)}>
            Impostazioni
          </button>
        )
      }
      status={{
        left: pack
          ? `${pack.kind === 'zip' ? 'zip, sola lettura' : 'cartella'} · ${pack.path}`
          : 'PackForge',
        right: info ? `PackForge ${info.version} · non è un prodotto ufficiale di Minecraft` : ''
      }}
    >
      <TutorialCard compact={editorOpen || testOpen} />
      {/* Full-screen editor; the workspace below stays mounted (hidden) to keep its state. */}
      {testOpen && (
        <ErrorBoundary key={testing.target.url} what="La prova" onReset={() => setTesting(null)}>
          <TestScreen
            target={testing.target}
            live={testing.live}
            onBack={leaveTest}
            onClose={testing.live ? null : () => setTesting(null)}
          />
        </ErrorBoundary>
      )}
      {/* The editor stays mounted under the test screen: its history and unsaved work stay. */}
      {editorOpen && (
        <div className="shell-fill" hidden={testOpen}>
          <ErrorBoundary key={editing.url} what="L'editor" onReset={() => setEditing(null)}>
            <TextureEditor
              target={editing}
              onClose={() => setEditing(null)}
              onSwitch={setEditing}
              onTest={(live) => setTesting({ target: editing, live })}
              suspended={testOpen}
            />
          </ErrorBoundary>
        </div>
      )}
      <main className={pack && !showSettings ? 'app wide' : 'app'} hidden={editorOpen || testOpen}>
        {update && (
          <div className="update-banner" role="status" data-testid="update-banner">
            È disponibile PackForge {update.version} (tu hai {update.current}).
            <button
              type="button"
              className="small-button primary"
              onClick={() => void window.api.invoke('app:openRelease', update.url)}
            >
              Scarica
            </button>
            <button type="button" className="small-button" onClick={() => setUpdate(null)}>
              Più tardi
            </button>
          </div>
        )}

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
              <PackWorkspace
                key={workspaceKey}
                pack={pack}
                onEditTexture={setEditing}
                onTestTexture={(target) => setTesting({ target, live: null })}
              />
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
      </main>
    </Shell>
  )
}
