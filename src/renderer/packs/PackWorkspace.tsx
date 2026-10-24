import { useCommands } from '../shell/commandContext'
import { useEffect, useMemo, useState } from 'react'
import { buildFileTree, findFolder, parentPath } from '../../shared/fileTree'
import { assetUrl, type PackSummary, type VanillaVersionInfo } from '../../shared/ipc'
import { mapKindOf } from '../../shared/labpbr'
import { compatibleFormatRange, compatibleReleases } from '../../shared/mcmeta'
import { OverridesDialog } from './OverridesDialog'
import { PackDoctorDialog } from './PackDoctorDialog'
import { EmissiveDialog } from './EmissiveDialog'
import type { FormatRange } from '../../shared/modelRules'
import { formatPackVersion, type PackVersion } from '../../shared/packFormat'
import { groupTextures, type TextureEntry } from '../../shared/textures'
import type { EditorTarget } from '../editor/TextureEditor'
import type { AssetSources } from '../preview/modelSource'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import { FileTree } from './FileTree'
import { GuiMockScreen } from './GuiMockScreen'
import { TitleScreensDialog } from './TitleScreensDialog'
import { GuiRecolorDialog } from './GuiRecolorDialog'
import { NewTextureDialog, type NewTextureRequest } from './NewTextureDialog'
import { TextureGrid, type TextureMarker } from './TextureGrid'
import { ValidatorDialog } from './ValidatorDialog'
import { BatchDialog } from './BatchDialog'
import { CoverageDialog } from './CoverageDialog'
import { ResizeDialog } from './ResizeDialog'
import { CtmDialog } from './CtmDialog'
import { InGameDialog } from './InGameDialog'
import { BackupsDialog } from './BackupsDialog'
import { ExportDialog } from './ExportDialog'
import { VariantsDialog } from './VariantsDialog'
import type { ValidatorSource } from './runValidator'
import { Glyph } from '../ui/components'
import { CMD_ICONS, NAV_ICONS } from '../ui/icons'
import { tr } from '../../shared/i18n'

const DEFAULT_FOLDER = 'assets/minecraft/textures/block'
const MAX_SEARCH_RESULTS = 500

type Mode = 'pack' | 'vanilla' | 'gui'

/** Where the GUI tab opens: the widget sprites (buttons, sliders…); the tree has only the GUI. */
const GUI_FOLDER = 'assets/minecraft/textures/gui/sprites/widget'
const GUI_PREFIX = 'assets/minecraft/textures/gui/'

interface SourceFiles {
  files: string[]
  assetBase: string
  truncated: boolean
}

type Loadable<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T }

interface VanillaState {
  minecraftDir: string
  versions: VanillaVersionInfo[]
}

interface VanillaJar extends SourceFiles {
  versionId: string
  resourceFormat: PackVersion | null
}

export function PackWorkspace({
  pack,
  onEditTexture,
  onTestTexture,
  overview,
  visible
}: {
  pack: PackSummary
  /** False while the editor or the test screen covers it: its commands are withdrawn. */
  visible?: boolean
  /** The pack card, shown at the top of the dock. */
  overview?: React.ReactNode
  onEditTexture: (target: EditorTarget) => void
  /** Opens the test screen on a pack texture. */
  onTestTexture: (target: EditorTarget) => void
}): React.JSX.Element {
  const [packFiles, setPackFiles] = useState<Loadable<SourceFiles>>({ status: 'loading' })
  const [vanilla, setVanilla] = useState<Loadable<VanillaState>>({ status: 'loading' })
  const [jar, setJar] = useState<Loadable<VanillaJar>>({ status: 'idle' })
  /** Bumped per pack file changed on disk, appended to its URL to bypass caches. */
  const [fileVersions, setFileVersions] = useState<Readonly<Record<string, number>>>({})

  // Live updates from the folder watcher in main.
  useEffect(
    () =>
      window.api.on('pack:filesChanged', ({ paths, structureChanged }) => {
        setFileVersions((current) => {
          const next = { ...current }
          for (const path of paths) next[path] = (next[path] ?? 0) + 1
          return next
        })
        if (structureChanged) {
          void window.api.invoke('pack:listFiles').then((result) => {
            if (result.ok) setPackFiles({ status: 'ready', value: result })
          })
        }
      }),
    []
  )

  useEffect(() => {
    let cancelled = false
    void window.api.invoke('pack:listFiles').then((result) => {
      if (cancelled) return
      setPackFiles(
        result.ok ? { status: 'ready', value: result } : { status: 'error', message: result.error }
      )
    })
    void window.api.invoke('vanilla:listVersions').then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setVanilla({ status: 'error', message: result.error })
        return
      }
      setVanilla({ status: 'ready', value: result })
      const versionId = pickVanillaVersion(result.versions, pack)
      if (versionId) void loadJar(versionId)
    })
    return () => {
      cancelled = true
    }
    // Runs once per mount; the workspace is remounted for every opened pack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadJar(versionId: string): Promise<void> {
    setJar({ status: 'loading' })
    const result = await window.api.invoke('vanilla:load', versionId)
    setJar(
      result.ok
        ? { status: 'ready', value: { ...result, truncated: false } }
        : { status: 'error', message: result.error }
    )
  }

  if (packFiles.status === 'loading' || packFiles.status === 'idle') {
    return (
      <>
        {overview}
        <section className="card muted">{tr('Lettura dei file…')}</section>
      </>
    )
  }
  if (packFiles.status === 'error') {
    return (
      <>
        {overview}
        <section className="card field-error">{packFiles.message}</section>
      </>
    )
  }
  const base = packFiles.value.assetBase
  const targetOf = (texture: TextureEntry, previewSources: AssetSources): EditorTarget => {
    // A texture just created may not be listed yet: the 3D preview must still find it in the pack.
    const sources = previewSources.pack.files.has(texture.albedo)
      ? previewSources
      : {
          ...previewSources,
          pack: {
            ...previewSources.pack,
            files: new Set([...previewSources.pack.files, texture.albedo])
          }
        }
    return {
      path: texture.albedo,
      textureKey: texture.key,
      name: texture.name,
      url: assetUrl(base, texture.albedo, fileVersions[texture.albedo] ?? 0),
      mcmetaUrl: texture.mcmeta
        ? assetUrl(base, texture.mcmeta, fileVersions[texture.mcmeta] ?? 0)
        : null,
      readOnly: pack.kind === 'zip',
      packBase: base,
      sources
    }
  }

  return (
    <Workspace
      packFiles={packFiles.value}
      fileVersions={fileVersions}
      vanilla={vanilla}
      jar={jar}
      onSelectVersion={(id) => void loadJar(id)}
      canCreate={pack.kind === 'folder'}
      packName={pack.name}
      formatRange={compatibleFormatRange(pack.mcmeta.formats)}
      onEditTexture={(texture, previewSources) => onEditTexture(targetOf(texture, previewSources))}
      onTestTexture={(texture, previewSources) => onTestTexture(targetOf(texture, previewSources))}
      overview={overview}
      visible={visible ?? true}
    />
  )
}

function Workspace({
  packFiles,
  fileVersions,
  vanilla,
  jar,
  onSelectVersion,
  canCreate,
  packName,
  formatRange,
  onEditTexture,
  onTestTexture,
  overview,
  visible
}: {
  overview: React.ReactNode
  visible: boolean
  packFiles: SourceFiles
  fileVersions: Readonly<Record<string, number>>
  vanilla: Loadable<VanillaState>
  jar: Loadable<VanillaJar>
  onSelectVersion: (versionId: string) => void
  onEditTexture: (texture: TextureEntry, sources: AssetSources) => void
  onTestTexture: (texture: TextureEntry, sources: AssetSources) => void
  /** Folder packs can get new textures; zip packs are read-only. */
  canCreate: boolean
  packName: string
  /** The formats of the releases that load the pack (null: none). */
  formatRange: FormatRange | null
}): React.JSX.Element {
  const packTextures = useMemo(() => groupTextures(packFiles.files), [packFiles.files])
  const jarFiles = jar.status === 'ready' ? jar.value.files : null
  const vanillaTextures = useMemo(() => (jarFiles ? groupTextures(jarFiles) : []), [jarFiles])
  /** Pack textures that can get maps (not a `_n` / `_s` of a game texture listed on its own). */
  const mapLessTextures = useMemo(
    () => packTextures.filter((t) => mapKindOf(t.albedo) === null),
    [packTextures]
  )
  const packKeys = useMemo(() => new Set(packTextures.map((t) => t.key)), [packTextures])
  const vanillaKeys = useMemo(() => new Set(vanillaTextures.map((t) => t.key)), [vanillaTextures])
  // The GUI tab: the game's GUI textures (sprites, containers, title…), vanilla as a reference.
  const guiSource = useMemo<SourceFiles | null>(
    () =>
      jar.status === 'ready'
        ? { ...jar.value, files: jar.value.files.filter((f) => f.startsWith(GUI_PREFIX)) }
        : null,
    [jar]
  )
  const guiTextures = useMemo(
    () => vanillaTextures.filter((t) => t.albedo.includes('/textures/gui/')),
    [vanillaTextures]
  )

  const initialFolder = useMemo(
    () => pickInitialFolder(packFiles.files, packTextures),
    [packFiles.files, packTextures]
  )
  const [mode, setMode] = useState<Mode>('pack')
  const [selectedFolder, setSelectedFolder] = useState(initialFolder)
  const [guiFolder, setGuiFolder] = useState(GUI_FOLDER)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection | null>(null)
  const [creating, setCreating] = useState<NewTextureRequest | null>(null)
  const [validating, setValidating] = useState(false)
  /** The batch dialog, with the textures and maps it starts with (null selection = the folder). */
  const [batching, setBatching] = useState<{
    selection: string[] | null
    maps: { specular: boolean; normal: boolean }
  } | null>(null)
  const [covering, setCovering] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [connecting, setConnecting] = useState<TextureEntry | null>(null)
  const [inGame, setInGame] = useState(false)
  const [showBackups, setShowBackups] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [doctoring, setDoctoring] = useState(false)
  const [emissive, setEmissive] = useState(false)
  const [recoloringAll, setRecoloringAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [varying, setVarying] = useState<TextureEntry | null>(null)
  const [titleScreens, setTitleScreens] = useState(false)
  const [recoloring, setRecoloring] = useState(false)
  const previewVersion = previewSelection?.isPack ? (fileVersions[previewSelection.albedo] ?? 0) : 0
  const previewMcmetaVersion =
    previewSelection?.isPack && previewSelection.mcmeta
      ? (fileVersions[previewSelection.mcmeta] ?? 0)
      : 0
  // The URL carries the file version, so the 3D preview reloads on external edits.
  const previewTarget = useMemo<PreviewTarget | null>(
    () =>
      previewSelection && {
        key: previewSelection.key,
        textureKey: previewSelection.textureKey,
        url: assetUrl(previewSelection.base, previewSelection.albedo, previewVersion),
        mcmetaUrl: previewSelection.mcmeta
          ? assetUrl(previewSelection.base, previewSelection.mcmeta, previewMcmetaVersion)
          : null,
        name: previewSelection.name,
        sourceLabel: previewSelection.sourceLabel
      },
    [previewSelection, previewVersion, previewMcmetaVersion]
  )
  // Only pack textures can be tested (vanilla ones are the reference).
  const testable = previewSelection?.isPack
    ? (packTextures.find((t) => t.key === previewSelection.textureKey) ?? null)
    : null

  // Models and textures for the 3D preview: the pack first, then vanilla.
  const packFileSet = useMemo(() => new Set(packFiles.files), [packFiles.files])
  const jarFileSet = useMemo(() => (jarFiles ? new Set(jarFiles) : null), [jarFiles])
  const jarBase = jar.status === 'ready' ? jar.value.assetBase : null
  const previewSources = useMemo<AssetSources>(
    () => ({
      pack: { base: packFiles.assetBase, files: packFileSet, versions: fileVersions },
      vanilla: jarBase && jarFileSet ? { base: jarBase, files: jarFileSet } : null
    }),
    [packFiles.assetBase, packFileSet, fileVersions, jarBase, jarFileSet]
  )
  // Item models of the pack (they may carry old `overrides` to turn into items/ definitions).
  const hasItemModels = packFiles.files.some((f) =>
    /^assets\/[^/]+\/models\/item\/[^/]+\.json$/.test(f)
  )
  const validatorPack = useMemo<ValidatorSource>(
    () => ({ base: packFiles.assetBase, files: packFileSet, versions: fileVersions }),
    [packFiles.assetBase, packFileSet, fileVersions]
  )
  const validatorVanilla = useMemo<ValidatorSource | null>(
    () => (jarBase && jarFileSet ? { base: jarBase, files: jarFileSet } : null),
    [jarBase, jarFileSet]
  )
  /** The pack texture a validator issue is about (a map opens its texture). */
  const textureOfIssue = (path: string): TextureEntry | null => {
    const albedo = path.replace(/_[ns]\.png$/i, '.png')
    return packTextures.find((t) => t.albedo === albedo && albedo !== path) ?? null
  }

  const vanillaReady = jar.status === 'ready'
  const activeMode: Mode = mode !== 'pack' && vanillaReady ? mode : 'pack'
  const fromJar = activeMode !== 'pack'
  const jarSource: SourceFiles | null =
    jar.status !== 'ready' ? null : activeMode === 'gui' ? (guiSource ?? jar.value) : jar.value
  const source: SourceFiles = fromJar && jarSource ? jarSource : packFiles
  const textures =
    activeMode === 'vanilla' ? vanillaTextures : activeMode === 'gui' ? guiTextures : packTextures
  const marker: TextureMarker | undefined = fromJar
    ? { keys: packKeys, label: 'P', title: tr('Questa texture è già nel tuo pack') }
    : vanillaReady
      ? { keys: vanillaKeys, label: 'V', title: tr('Sostituisce la texture vanilla') }
      : undefined

  const zipNote = tr('I pack .zip si aprono in sola lettura')
  // Published only while the screen is visible (hidden under the editor its dialogs would not show).
  useCommands(
    visible
      ? [
          {
            id: 'pack:export',
            label: tr('Esporta il pack (zip)…'),
            menu: 'Pack',
            area: 'Pubblica',
            enabled: canCreate,
            why: zipNote,
            run: () => setExporting(true)
          },
          {
            id: 'pack:ingame',
            label: tr('Copia nel gioco…'),
            menu: 'Pack',
            area: 'Pubblica',
            run: () => setInGame(true)
          },
          {
            id: 'pack:backups',
            label: tr('Backup…'),
            menu: 'Pack',
            area: 'Pack',
            enabled: canCreate,
            why: zipNote,
            run: () => setShowBackups(true)
          },
          {
            id: 'pack:validate',
            label: tr('Controlla mappe'),
            menu: 'Mappe PBR',
            area: 'Pack',
            run: () => setValidating(true)
          },
          {
            id: 'pack:coverage',
            label: tr('Copertura: cosa manca'),
            menu: 'Mappe PBR',
            area: 'Pack',
            run: () => setCovering(true)
          },
          {
            id: 'pack:batch',
            label: tr('Applica in blocco…'),
            menu: 'Mappe PBR',
            area: 'Pack',
            enabled: canCreate,
            why: zipNote,
            run: () => setBatching({ selection: null, maps: { specular: true, normal: false } })
          },
          {
            id: 'pack:guiRecolor',
            label: tr('Ricolora GUI…'),
            menu: 'Pack',
            area: 'Pack',
            enabled: canCreate,
            why: zipNote,
            run: () => setRecoloring(true)
          },
          {
            id: 'pack:title',
            label: tr('Titolo e caricamento…'),
            menu: 'Pack',
            area: 'Pack',
            enabled: vanillaReady,
            why: tr('Serve il jar vanilla'),
            run: () => setTitleScreens(true)
          },
          {
            id: 'pack:resize',
            label: tr('Ridimensiona il pack…'),
            menu: 'Pack',
            area: 'Pack',
            enabled: canCreate,
            why: zipNote,
            run: () => setResizing(true)
          }
        ]
      : []
  )

  return (
    <section className="workspace-wrap pack-screen">
      <div className="pack-main">
        <div className="mode-bar">
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'pack'}
              className={activeMode === 'pack' ? 'tab active' : 'tab'}
              onClick={() => setMode('pack')}
            >
              {tr('Pack')} <span className="count">{packTextures.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'vanilla'}
              className={activeMode === 'vanilla' ? 'tab active' : 'tab'}
              onClick={() => setMode('vanilla')}
              disabled={!vanillaReady}
              title={vanillaReady ? undefined : vanillaHint(vanilla, jar)}
            >
              {tr('Vanilla')}{' '}
              {vanillaReady && <span className="count">{vanillaTextures.length}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'gui'}
              className={activeMode === 'gui' ? 'tab active' : 'tab'}
              onClick={() => setMode('gui')}
              disabled={!vanillaReady}
              title={
                vanillaReady
                  ? tr('Le texture della GUI del gioco, con una schermata di prova')
                  : vanillaHint(vanilla, jar)
              }
            >
              {tr('GUI')} {vanillaReady && <span className="count">{guiTextures.length}</span>}
            </button>
          </div>
          <VanillaPicker vanilla={vanilla} jar={jar} onSelect={onSelectVersion} />
        </div>
        <div className="workspace-row">
          <TextureBrowser
            // Remount per source: tree expansion is rebuilt around the shared folder.
            key={
              fromJar && jar.status === 'ready' ? `${activeMode}:${jar.value.assetBase}` : 'pack'
            }
            selectedKey={
              previewSelection?.base === source.assetBase ? previewSelection.textureKey : null
            }
            versionOf={activeMode === 'pack' ? (path) => fileVersions[path] ?? 0 : undefined}
            onSelectTexture={(texture) =>
              setPreviewSelection({
                key: `${source.assetBase}|${texture.key}`,
                base: source.assetBase,
                textureKey: texture.key,
                albedo: texture.albedo,
                mcmeta: texture.mcmeta,
                name: texture.name,
                isPack: activeMode === 'pack',
                sourceLabel:
                  fromJar && jar.status === 'ready' ? `Vanilla ${jar.value.versionId}` : 'Pack'
              })
            }
            // Only pack textures are editable: vanilla pixels never enter the pack. Double-clicking
            // a vanilla texture opens the pack's version, or offers to create one with that name.
            onOpenTexture={(texture) => {
              if (activeMode === 'pack') {
                onEditTexture(texture, previewSources)
                return
              }
              const own = packTextures.find((entry) => entry.key === texture.key)
              if (own) onEditTexture(own, previewSources)
              else if (canCreate) {
                setCreating({
                  folder: texture.folder,
                  name: texture.name,
                  fromVanilla: true,
                  // Only its size is read: a 200×20 button gets a 200×20 (or 2×, 4×) texture.
                  vanillaUrl: assetUrl(source.assetBase, texture.albedo)
                })
              }
            }}
            onNewTexture={
              canCreate
                ? () =>
                    setCreating({
                      folder: selectedFolder.startsWith('assets/')
                        ? selectedFolder
                        : DEFAULT_FOLDER,
                      name: '',
                      fromVanilla: false
                    })
                : undefined
            }
            source={source}
            textures={textures}
            marker={marker}
            coverageKeys={fromJar ? packKeys : null}
            selectedFolder={activeMode === 'gui' ? guiFolder : selectedFolder}
            onSelectFolder={activeMode === 'gui' ? setGuiFolder : setSelectedFolder}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            query={query}
            onQuery={setQuery}
          />
        </div>
      </div>
      {/* Dock: the pack, the 3D preview (outside the browser so it survives Pack/Vanilla switches), the tools. */}
      <aside className="pack-dock">
        {overview}
        {activeMode === 'gui' ? (
          <GuiMockScreen
            sources={previewSources}
            onOpenTitle={() => setTitleScreens(true)}
            onRecolor={canCreate ? () => setRecoloring(true) : null}
          />
        ) : (
          <PreviewPanel
            target={previewTarget}
            sources={previewSources}
            onTest={testable ? () => onTestTexture(testable, previewSources) : null}
          />
        )}
        <section className="pack-tools">
          <h3 className="ph">{tr('Strumenti del pack')}</h3>
          <div className="tool-bar" role="toolbar" aria-label={tr('Strumenti')}>
            <div className="tool-group">
              <span className="tool-group-label">{tr('Pack')}</span>
              <button
                type="button"
                className="small-button"
                title={tr(
                  'Copia il pack nella cartella resourcepacks del gioco e i tasti per provarlo (F3 + T, Iris)'
                )}
                onClick={() => setInGame(true)}
              >
                <Glyph name="gamepad" />
                {tr('Copia nel gioco')}
              </button>
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'Crea lo zip da pubblicare: versione, licenza, crediti, changelog, controlli e varianti'
                  )}
                  onClick={() => setExporting(true)}
                >
                  <Glyph icon={NAV_ICONS.chest} />
                  {tr('Esporta')}
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'I backup presi prima di sovrascrivere file: ripristina una versione precedente'
                  )}
                  onClick={() => setShowBackups(true)}
                >
                  <Glyph name="clock" />
                  {tr('Backup')}
                </button>
              )}
              <button
                type="button"
                className="small-button"
                title={tr(
                  'File che il gioco ignora, riferimenti rotti, texture che mancano, cambio di versione'
                )}
                onClick={() => setDoctoring(true)}
              >
                <Glyph icon={NAV_ICONS.search} />
                {tr('Diagnosi')}
              </button>
              {canCreate && hasItemModels && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'Crea le definizioni in items/ dagli overrides dei modelli degli oggetti (1.21.4+)'
                  )}
                  onClick={() => setOverriding(true)}
                >
                  <Glyph name="swap" />
                  {tr('Overrides in items/')}
                </button>
              )}
            </div>
            <div className="tool-group">
              <span className="tool-group-label">{tr('Mappe')}</span>
              <button
                type="button"
                className="small-button"
                title={tr(
                  'Controlla le mappe _n / _s del pack: dimensioni, animazione, emissione, altezza, file orfani'
                )}
                onClick={() => setValidating(true)}
              >
                <Glyph icon={NAV_ICONS.search} />
                {tr('Controlla mappe')}
              </button>
              <button
                type="button"
                className="small-button"
                title={tr('Quante texture del pack hanno già _n e _s, e quali mancano')}
                onClick={() => setCovering(true)}
              >
                <Glyph name="chart" />
                {tr('Copertura')}
              </button>
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'Crea le texture _e (luce senza shader, OptiFine / Continuity) dalle mappe _s che emettono'
                  )}
                  onClick={() => setEmissive(true)}
                >
                  <Glyph name="dot" />
                  {tr('Luce _e')}
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr('Cambia insieme i colori di tante texture (blocchi, oggetti, entità…)')}
                  onClick={() => setRecoloringAll(true)}
                >
                  <Glyph icon={CMD_ICONS.color} />
                  {tr('Ricolora texture')}
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'Crea le mappe _s / _n di tante texture insieme, con un preset materiale e/o il generatore di rilievo'
                  )}
                  onClick={() =>
                    setBatching({ selection: null, maps: { specular: true, normal: false } })
                  }
                >
                  <Glyph name="gear" />
                  {tr('Applica in blocco')}
                </button>
              )}
              {canCreate && (
                <button
                  type="button"
                  className="small-button"
                  title={tr(
                    'Porta le texture a una sola risoluzione (16×, 32×, 64×…) a pixel netti, con le loro mappe'
                  )}
                  onClick={() => setResizing(true)}
                >
                  <Glyph name="resize" />
                  {tr('Ridimensiona')}
                </button>
              )}
            </div>
            {canCreate && (
              <div className="tool-group">
                <span className="tool-group-label" data-testid="selected-texture">
                  {testable ? testable.name : tr('Scegli una texture')}
                </span>
                <button
                  type="button"
                  className="small-button"
                  disabled={!testable || mapKindOf(testable.albedo) !== null}
                  title={
                    testable
                      ? tr(
                          'Crea le versioni di {0} in tutti i colori (lana, cemento, vetro colorato…)',
                          testable.name
                        )
                      : tr('Seleziona prima una texture del pack')
                  }
                  onClick={() => setVarying(testable)}
                >
                  <Glyph icon={CMD_ICONS.color} />
                  {tr('Varianti di colore')}
                </button>
                <button
                  type="button"
                  className="small-button"
                  disabled={!testable || mapKindOf(testable.albedo) !== null}
                  title={
                    testable
                      ? tr(
                          'Crea i 47 tile delle texture connesse di {0} (Continuity / OptiFine)',
                          testable.name
                        )
                      : tr('Seleziona prima una texture del pack')
                  }
                  onClick={() => setConnecting(testable)}
                >
                  <Glyph name="connected" />
                  {tr('Texture connesse')}
                </button>
              </div>
            )}
          </div>
        </section>
      </aside>
      {recoloring && <GuiRecolorDialog pack={validatorPack} onClose={() => setRecoloring(false)} />}
      {recoloringAll && (
        <GuiRecolorDialog pack={validatorPack} anyArea onClose={() => setRecoloringAll(false)} />
      )}
      {titleScreens && (
        <TitleScreensDialog
          sources={previewSources}
          canCreate={canCreate}
          onClose={() => setTitleScreens(false)}
          onOpen={(path) => {
            const own = packTextures.find((entry) => entry.albedo === path)
            setTitleScreens(false)
            if (own) onEditTexture(own, previewSources)
            else if (canCreate && jar.status === 'ready') {
              setCreating({
                folder: path.slice(0, path.lastIndexOf('/')),
                name: path.slice(path.lastIndexOf('/') + 1, -'.png'.length),
                fromVanilla: true,
                vanillaUrl: assetUrl(jar.value.assetBase, path)
              })
            }
          }}
        />
      )}
      {varying && (
        <VariantsDialog
          source={varying}
          pack={validatorPack}
          vanilla={validatorVanilla}
          onClose={() => setVarying(null)}
        />
      )}
      {batching && (
        <BatchDialog
          pack={validatorPack}
          sources={previewSources}
          textures={mapLessTextures}
          initialFolder={selectedFolder}
          initialSelection={batching.selection}
          initialMaps={batching.maps}
          onClose={() => setBatching(null)}
        />
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {showBackups && <BackupsDialog onClose={() => setShowBackups(false)} />}
      {emissive && <EmissiveDialog pack={validatorPack} onClose={() => setEmissive(false)} />}
      {doctoring && (
        <PackDoctorDialog
          sources={previewSources}
          versionId={jar.status === 'ready' ? jar.value.versionId : null}
          canWrite={canCreate}
          onClose={() => setDoctoring(false)}
        />
      )}
      {overriding && (
        <OverridesDialog
          sources={previewSources}
          range={formatRange}
          onClose={() => setOverriding(false)}
          onDone={() => setOverriding(false)}
        />
      )}
      {inGame && <InGameDialog packName={packName} onClose={() => setInGame(false)} />}
      {connecting && (
        <CtmDialog
          source={connecting}
          textures={mapLessTextures}
          pack={validatorPack}
          onClose={() => setConnecting(null)}
        />
      )}
      {resizing && (
        <ResizeDialog
          pack={validatorPack}
          textures={mapLessTextures}
          onClose={() => setResizing(false)}
        />
      )}
      {covering && (
        <CoverageDialog
          files={packFiles.files}
          canCreate={canCreate}
          onOpen={(texture) => {
            setCovering(false)
            onEditTexture(texture, previewSources)
          }}
          onBatch={(textures, maps) => {
            setCovering(false)
            setBatching({ selection: textures.map((t) => t.albedo), maps })
          }}
          onClose={() => setCovering(false)}
        />
      )}
      {validating && (
        <ValidatorDialog
          pack={validatorPack}
          vanilla={validatorVanilla}
          canOpen={(path) => textureOfIssue(path) !== null}
          onOpen={(path) => {
            const texture = textureOfIssue(path)
            if (!texture) return
            setValidating(false)
            onEditTexture(texture, previewSources)
          }}
          onClose={() => setValidating(false)}
        />
      )}
      {creating && (
        <NewTextureDialog
          request={creating}
          existing={packFileSet}
          onCancel={() => setCreating(null)}
          onCreated={(path) => {
            setCreating(null)
            const key = path.replace(/\.png$/, '')
            const slash = key.lastIndexOf('/')
            onEditTexture(
              {
                key,
                folder: key.slice(0, slash),
                name: key.slice(slash + 1),
                albedo: path,
                normal: null,
                specular: null,
                mcmeta: null
              },
              previewSources
            )
          }}
        />
      )}
    </section>
  )
}

function VanillaPicker({
  vanilla,
  jar,
  onSelect
}: {
  vanilla: Loadable<VanillaState>
  jar: Loadable<VanillaJar>
  onSelect: (versionId: string) => void
}): React.JSX.Element | null {
  if (vanilla.status !== 'ready') return null
  const { versions, minecraftDir } = vanilla.value
  if (versions.length === 0) {
    return (
      <span className="muted small">
        {tr(
          'Nessuna versione di Minecraft trovata in {0}: avvia il gioco una volta dal launcher.',
          minecraftDir
        )}
      </span>
    )
  }
  const currentId = jar.status === 'ready' ? jar.value.versionId : ''
  return (
    <label className="vanilla-picker">
      <span className="muted small">{tr('Riferimento vanilla')}</span>
      <select
        value={currentId}
        onChange={(event) => onSelect(event.target.value)}
        disabled={jar.status === 'loading'}
      >
        {currentId === '' && <option value="">—</option>}
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id}
            {v.type === 'release' ? '' : ` (${v.type})`}
          </option>
        ))}
      </select>
      {jar.status === 'loading' && <span className="muted small">{tr('Caricamento…')}</span>}
      {jar.status === 'error' && <span className="field-error">{jar.message}</span>}
      {jar.status === 'ready' && jar.value.resourceFormat && (
        <span className="muted small">
          {tr('formato {0}', formatPackVersion(jar.value.resourceFormat))}
        </span>
      )}
      <span
        className="muted small"
        title={tr('Le texture vanilla sono solo di riferimento: non vengono copiate né esportate.')}
      >
        {tr('solo riferimento')}
      </span>
    </label>
  )
}

interface TextureBrowserProps {
  source: SourceFiles
  textures: TextureEntry[]
  marker: TextureMarker | undefined
  /** Vanilla mode: keys already in the pack, for the coverage count. */
  coverageKeys: ReadonlySet<string> | null
  selectedFolder: string
  onSelectFolder: (path: string) => void
  selectedFile: string | null
  onSelectFile: (path: string | null) => void
  query: string
  onQuery: (query: string) => void
  selectedKey: string | null
  onSelectTexture: (texture: TextureEntry) => void
  /** Double-click: edit (pack) or create the pack's version (vanilla). */
  onOpenTexture: (texture: TextureEntry) => void
  /** Opens the new-texture wizard; undefined for read-only packs. */
  onNewTexture: (() => void) | undefined
  /** Pack only: file version for cache-busting URLs. */
  versionOf: ((path: string) => number) | undefined
}

function TextureBrowser(props: TextureBrowserProps): React.JSX.Element {
  const { source, textures, selectedFolder, selectedFile, query } = props
  const tree = useMemo(() => buildFileTree(source.files), [source.files])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestors(selectedFolder)))

  const trimmedQuery = query.trim().toLowerCase()
  const matches = trimmedQuery
    ? textures.filter((t) => t.name.toLowerCase().includes(trimmedQuery))
    : textures.filter((t) => t.folder === selectedFolder)
  const visible = trimmedQuery ? matches.slice(0, MAX_SEARCH_RESULTS) : matches
  const withMaps = matches.filter((t) => t.normal || t.specular).length
  const covered = props.coverageKeys
    ? matches.filter((t) => props.coverageKeys?.has(t.key)).length
    : null

  function toggle(path: string): void {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function selectFile(path: string): void {
    const folder = parentPath(path)
    props.onSelectFile(path)
    props.onSelectFolder(folder)
    props.onQuery('')
    setExpanded((previous) => new Set([...previous, ...ancestors(folder)]))
  }

  const summary = trimmedQuery
    ? `${matches.length} risultati${matches.length > MAX_SEARCH_RESULTS ? ` (mostrati ${MAX_SEARCH_RESULTS})` : ''}`
    : tr('{0}: {1} texture', selectedFolder || tr('radice'), matches.length)
  const detail =
    covered !== null
      ? tr(', {0} di {1} già nel pack', covered, matches.length)
      : matches.length > 0
        ? tr(', {0} con mappe PBR', withMaps)
        : ''

  return (
    <div className="workspace">
      <aside className="card tree-panel">
        {findFolder(tree, selectedFolder) === null && selectedFolder !== '' && (
          <p className="muted small">{tr('La cartella {0} non esiste qui.', selectedFolder)}</p>
        )}
        <FileTree
          root={tree}
          selectedFolder={selectedFolder}
          selectedFile={selectedFile}
          expanded={expanded}
          onToggle={toggle}
          onSelectFolder={(path) => {
            props.onSelectFolder(path)
            props.onSelectFile(null)
            props.onQuery('')
          }}
          onSelectFile={selectFile}
        />
        {source.truncated && (
          <p className="muted small">
            {tr("Il pack contiene troppi file: l'elenco è incompleto.")}
          </p>
        )}
      </aside>

      <div className="card grid-panel">
        <div className="grid-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder={tr('Cerca texture…')}
            aria-label={tr('Cerca texture')}
          />
          {props.onNewTexture && (
            <button
              type="button"
              onClick={props.onNewTexture}
              title={tr('Crea una nuova texture nel pack')}
            >
              {tr('+ Nuova texture')}
            </button>
          )}
          <span className="muted small">
            {summary}
            {detail}
          </span>
        </div>
        {visible.length > 0 ? (
          <TextureGrid
            textures={visible}
            assetBase={source.assetBase}
            highlight={selectedFile}
            showFolder={trimmedQuery !== ''}
            marker={props.marker}
            selectedKey={props.selectedKey}
            onSelect={props.onSelectTexture}
            onOpen={props.onOpenTexture}
            versionOf={props.versionOf}
          />
        ) : (
          <p className="muted">
            {trimmedQuery
              ? tr('Nessuna texture trovata.')
              : tr('Nessuna texture PNG in questa cartella.')}
          </p>
        )}
      </div>
    </div>
  )
}

interface PreviewSelection {
  key: string
  base: string
  textureKey: string
  albedo: string
  mcmeta: string | null
  name: string
  isPack: boolean
  sourceLabel: string
}

/** Newest installed release compatible with the pack, else newest release, else newest. */
function pickVanillaVersion(versions: VanillaVersionInfo[], pack: PackSummary): string | null {
  const compatible = new Set(compatibleReleases(pack.mcmeta.formats).map((r) => r.version))
  return (
    versions.find((v) => compatible.has(v.id))?.id ??
    versions.find((v) => v.type === 'release')?.id ??
    versions[0]?.id ??
    null
  )
}

function vanillaHint(vanilla: Loadable<VanillaState>, jar: Loadable<VanillaJar>): string {
  if (jar.status === 'loading' || vanilla.status === 'loading') return tr('Caricamento del jar…')
  if (jar.status === 'error') return jar.message
  if (vanilla.status === 'error') return vanilla.message
  return tr('Nessuna versione di Minecraft installata.')
}

/**
 * Vanilla block textures if present, else the first folder that has textures. A new pack (only
 * pack.png at the root) opens on the block folder too: that is where new textures go.
 */
function pickInitialFolder(files: string[], textures: TextureEntry[]): string {
  if (findFolder(buildFileTree(files), DEFAULT_FOLDER)) return DEFAULT_FOLDER
  return textures.find((t) => t.folder.includes('/textures'))?.folder ?? DEFAULT_FOLDER
}

function ancestors(path: string): string[] {
  if (path === '') return []
  const segments = path.split('/')
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'))
}
