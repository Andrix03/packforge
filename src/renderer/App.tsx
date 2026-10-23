import { useEffect, useState } from 'react'
import type { AppInfo, PackSummary, UpdateCheck } from '../shared/ipc'
import { compatibleReleases } from '../shared/mcmeta'
import { summarizeReleaseSpans } from '../shared/packFormat'
import { TextureEditor, type EditorTarget } from './editor/TextureEditor'
import { ErrorBoundary } from './ErrorBoundary'
import { ExportDialog } from './packs/ExportDialog'
import { InGameDialog } from './packs/InGameDialog'
import { NewPackForm } from './packs/NewPackForm'
import { OpenPackCard } from './packs/OpenPackCard'
import { PackOverview } from './packs/PackOverview'
import { PackWorkspace } from './packs/PackWorkspace'
import { RecentPacksCard } from './packs/RecentPacksCard'
import { SettingsPanel } from './settings/SettingsPanel'
import {
  CommandContext,
  useCommandList,
  useCommands,
  useCommandStore
} from './shell/commandContext'
import { EditorHotbar } from './shell/EditorHotbar'
import { PixelIcon } from './ui/components'
import { NAV_ICONS } from './ui/icons'
import { Shell, type WorkspaceTab } from './shell/Shell'
import { TestScreen, type TestLive } from './testscreen/TestScreen'
import { TutorialCard } from './TutorialCard'
import { announceStep } from './tutorialEvents'
import type { Workspace } from './ui/commands'
import { CommandStore } from './ui/commandStore'
import { tr } from '../shared/i18n'

export function App(): React.JSX.Element {
  const [store] = useState(() => new CommandStore())
  return (
    <CommandContext.Provider value={store}>
      <Window />
    </CommandContext.Provider>
  )
}

function Window(): React.JSX.Element {
  const store = useCommandStore()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pack, setPack] = useState<PackSummary | null>(null)
  /** Bumped to remount the workspace (new pack opened, settings changed). */
  const [workspaceKey, setWorkspaceKey] = useState(0)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  /** The Pubblica screen (export + in-game copy) over the pack screen. */
  const [publishing, setPublishing] = useState(false)
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
        setPublishing(false)
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
    setPublishing(false)
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
  const commands = useCommandList()
  const command = (id: string) => commands.find((c) => c.id === id)
  /** The editor is on a _n / _s map: that is the Effetti workspace. */
  const onMaps = command('editor:color')?.enabled === true
  const workspace: Workspace | null = !pack
    ? null
    : testOpen
      ? 'prova'
      : editorOpen
        ? onMaps
          ? 'effetti'
          : 'disegna'
        : publishing
          ? 'pubblica'
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
    setPublishing(next === 'pubblica')
    if (next === 'pack') {
      setTesting(null)
      // The editor asks before throwing unsaved work away.
      if (editorOpen) store.run('editor:close')
    } else if (next === 'disegna') {
      if (testOpen) leaveTest()
      else if (onMaps) store.run('editor:color')
    } else if (next === 'effetti') {
      if (testOpen) leaveTest()
      store.run('editor:effects')
    } else if (next === 'prova') {
      store.run('editor:test')
    }
  }

  const tabs: WorkspaceTab[] = [
    { id: 'pack', enabled: pack !== null, why: tr('Apri o crea un pack') },
    {
      id: 'disegna',
      enabled: editorOpen || testOpen,
      why: tr('Scegli una texture nel Pack e premi Disegna')
    },
    { id: 'prova', enabled: editorOpen, why: tr('Apri una texture per provarla') },
    {
      id: 'effetti',
      enabled: editorOpen && command('editor:effects') !== undefined,
      why: tr('Apri una texture per dipingerne le mappe PBR')
    },
    {
      id: 'pubblica',
      enabled: pack?.kind === 'folder' && !editorOpen && !testOpen,
      why:
        editorOpen || testOpen
          ? tr('Torna al Pack per esportare')
          : tr('I pack .zip si aprono in sola lettura')
    }
  ]

  const WORKSPACES: [Workspace, string][] = [
    ['pack', tr('Vai a Pack')],
    ['disegna', tr('Vai a Disegna')],
    ['prova', tr('Vai a Prova')]
  ]
  useCommands([
    {
      id: 'app:openFolder',
      label: tr('Apri un pack (cartella)…'),
      menu: 'File',
      area: 'Pack',
      enabled: !opening,
      run: () => void pickAndOpen('folder')
    },
    {
      id: 'app:openZip',
      label: tr('Apri un pack .zip (sola lettura)…'),
      menu: 'File',
      area: 'Pack',
      enabled: !opening,
      run: () => void pickAndOpen('zip')
    },
    {
      id: 'app:closePack',
      label: tr('Chiudi il pack'),
      menu: 'File',
      area: 'Pack',
      enabled: pack !== null && !editorOpen && !testOpen,
      why: pack ? tr('Prima chiudi l’editor') : tr('Nessun pack aperto'),
      run: () => void closePack()
    },
    {
      id: 'app:settings',
      label: tr('Impostazioni…'),
      menu: 'File',
      area: 'PackForge',
      enabled: !editorOpen && !testOpen && !showSettings,
      why: tr('Prima chiudi l’editor'),
      run: () => setShowSettings(true)
    },
    ...WORKSPACES.map(([id, label]) => {
      const tab = tabs.find((t) => t.id === id)
      return {
        id: `ws:${id}`,
        label,
        menu: 'Visualizza',
        area: tr('Spazi di lavoro'),
        enabled: (tab?.enabled ?? false) && workspace !== id,
        why: tab?.why,
        run: () => goTo(id)
      }
    }),
    ...(update
      ? [
          {
            id: 'app:update',
            label: tr('Scarica PackForge {0}', update.version),
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
      title={pack ? pack.name : tr('Nessun pack aperto')}
      subtitle={
        pack
          ? versions || tr('versione del gioco non indicata')
          : tr('apri o crea un pack per iniziare')
      }
      workspace={workspace}
      tabs={tabs}
      onWorkspace={goTo}
      right={
        editorOpen && !testOpen ? (
          <EditorHotbar />
        ) : (
          !showSettings &&
          !editorOpen &&
          !testOpen && (
            <button type="button" className="ore" onClick={() => setShowSettings(true)}>
              {tr('Impostazioni')}
            </button>
          )
        )
      }
      status={{
        left: pack
          ? `${pack.kind === 'zip' ? tr('zip, sola lettura') : tr('cartella')}: ${pack.path}`
          : 'PackForge',
        right: info
          ? tr('PackForge {0}, non è un prodotto ufficiale di Minecraft', info.version)
          : ''
      }}
    >
      <TutorialCard compact={editorOpen || testOpen} />
      {/* Full-screen editor; the workspace below stays mounted (hidden) to keep its state. */}
      {testOpen && (
        <ErrorBoundary
          key={testing.target.url}
          what={tr('La prova')}
          onReset={() => setTesting(null)}
        >
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
          <ErrorBoundary key={editing.url} what={tr("L'editor")} onReset={() => setEditing(null)}>
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
      {publishing && pack && !editorOpen && !testOpen && (
        // Pubblica (canvas): the export in the middle, the in-game copy beside it.
        <div className="publish-screen">
          <ExportDialog embedded onClose={() => setPublishing(false)} />
          <InGameDialog embedded packName={pack.name} onClose={() => setPublishing(false)} />
        </div>
      )}
      <main
        className={pack && !showSettings ? 'app wide' : 'app'}
        hidden={editorOpen || testOpen || (publishing && pack !== null)}
      >
        {update && (
          <div className="update-banner" role="status" data-testid="update-banner">
            {tr('È disponibile PackForge {0} (tu hai {1}).', update.version, update.current)}
            <button
              type="button"
              className="small-button primary"
              onClick={() => void window.api.invoke('app:openRelease', update.url)}
            >
              {tr('Scarica')}
            </button>
            <button type="button" className="small-button" onClick={() => setUpdate(null)}>
              {tr('Più tardi')}
            </button>
          </div>
        )}

        {showSettings && <SettingsPanel onClose={closeSettings} version={info?.version} />}

        {/* Hidden, not unmounted, while settings are open: keeps tree/grid state. */}
        <div className="stack" hidden={showSettings}>
          {pack ? (
            <>
              <PackWorkspace
                key={workspaceKey}
                visible={!editorOpen && !testOpen && !showSettings && !publishing}
                overview={
                  <PackOverview
                    pack={pack}
                    onClose={() => void closePack()}
                    onUpdated={(updated, filesChanged) => {
                      setPack(updated)
                      if (filesChanged) setWorkspaceKey((key) => key + 1)
                    }}
                  />
                }
                pack={pack}
                onEditTexture={setEditing}
                onTestTexture={(target) => setTesting({ target, live: null })}
              />
            </>
          ) : (
            // Start screen (canvas: Avvio): logo, open and recent packs on the left, a new pack on the right.
            <div className="start-screen">
              <div className="start-left">
                <header className="start-hero">
                  <PixelIcon icon={NAV_ICONS.logo} size={48} />
                  <div>
                    <h1>{tr('PackForge')}</h1>
                    <p className="muted">
                      {tr('Officina per resource pack di Minecraft Java, con anteprima LabPBR')}
                    </p>
                  </div>
                </header>
                <OpenPackCard
                  onPick={(path) => void openPack(path)}
                  busy={opening}
                  error={openError}
                />
                <RecentPacksCard
                  // Remount when returning home so the list reflects the last open.
                  key={workspaceKey}
                  onOpen={(path) => void openPack(path)}
                  busy={opening}
                />
              </div>
              <div className="start-right">
                <NewPackForm onCreated={(path) => void openPack(path)} />
              </div>
            </div>
          )}
        </div>
      </main>
    </Shell>
  )
}
