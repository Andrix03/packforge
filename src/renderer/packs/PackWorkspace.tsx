import { useEffect, useMemo, useState } from 'react'
import { buildFileTree, findFolder, parentPath } from '../../shared/fileTree'
import { assetUrl, type PackSummary, type VanillaVersionInfo } from '../../shared/ipc'
import { compatibleReleases } from '../../shared/mcmeta'
import { formatPackVersion, type PackVersion } from '../../shared/packFormat'
import { groupTextures, type TextureEntry } from '../../shared/textures'
import type { AssetSources } from '../preview/modelSource'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import { FileTree } from './FileTree'
import { TextureGrid, type TextureMarker } from './TextureGrid'

const DEFAULT_FOLDER = 'assets/minecraft/textures/block'
const MAX_SEARCH_RESULTS = 500

type Mode = 'pack' | 'vanilla'

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

export function PackWorkspace({ pack }: { pack: PackSummary }): React.JSX.Element {
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
    return <section className="card muted">Lettura dei file…</section>
  }
  if (packFiles.status === 'error') {
    return <section className="card field-error">{packFiles.message}</section>
  }
  return (
    <Workspace
      packFiles={packFiles.value}
      fileVersions={fileVersions}
      vanilla={vanilla}
      jar={jar}
      onSelectVersion={(id) => void loadJar(id)}
    />
  )
}

function Workspace({
  packFiles,
  fileVersions,
  vanilla,
  jar,
  onSelectVersion
}: {
  packFiles: SourceFiles
  fileVersions: Readonly<Record<string, number>>
  vanilla: Loadable<VanillaState>
  jar: Loadable<VanillaJar>
  onSelectVersion: (versionId: string) => void
}): React.JSX.Element {
  const packTextures = useMemo(() => groupTextures(packFiles.files), [packFiles.files])
  const jarFiles = jar.status === 'ready' ? jar.value.files : null
  const vanillaTextures = useMemo(() => (jarFiles ? groupTextures(jarFiles) : []), [jarFiles])
  const packKeys = useMemo(() => new Set(packTextures.map((t) => t.key)), [packTextures])
  const vanillaKeys = useMemo(() => new Set(vanillaTextures.map((t) => t.key)), [vanillaTextures])

  const initialFolder = useMemo(
    () => pickInitialFolder(packFiles.files, packTextures),
    [packFiles.files, packTextures]
  )
  const [mode, setMode] = useState<Mode>('pack')
  const [selectedFolder, setSelectedFolder] = useState(initialFolder)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [previewSelection, setPreviewSelection] = useState<PreviewSelection | null>(null)
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

  const vanillaReady = jar.status === 'ready'
  const activeMode: Mode = mode === 'vanilla' && vanillaReady ? 'vanilla' : 'pack'
  const source: SourceFiles =
    activeMode === 'vanilla' && jar.status === 'ready' ? jar.value : packFiles
  const textures = activeMode === 'vanilla' ? vanillaTextures : packTextures
  const marker: TextureMarker | undefined =
    activeMode === 'vanilla'
      ? { keys: packKeys, label: 'P', title: 'Questa texture è già nel tuo pack' }
      : vanillaReady
        ? { keys: vanillaKeys, label: 'V', title: 'Sostituisce la texture vanilla' }
        : undefined

  return (
    <section className="workspace-wrap">
      <div className="mode-bar">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeMode === 'pack'}
            className={activeMode === 'pack' ? 'tab active' : 'tab'}
            onClick={() => setMode('pack')}
          >
            Pack <span className="count">{packTextures.length}</span>
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
            Vanilla {vanillaReady && <span className="count">{vanillaTextures.length}</span>}
          </button>
        </div>
        <VanillaPicker vanilla={vanilla} jar={jar} onSelect={onSelectVersion} />
      </div>

      <div className="workspace-row">
        <TextureBrowser
          // Remount per source: tree expansion is rebuilt around the shared folder.
          key={
            activeMode === 'vanilla' && jar.status === 'ready' ? `v:${jar.value.assetBase}` : 'pack'
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
                activeMode === 'vanilla' && jar.status === 'ready'
                  ? `Vanilla ${jar.value.versionId}`
                  : 'Pack'
            })
          }
          source={source}
          textures={textures}
          marker={marker}
          coverageKeys={activeMode === 'vanilla' ? packKeys : null}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          query={query}
          onQuery={setQuery}
        />
        {/* Outside the browser so it survives Pack/Vanilla switches. */}
        <PreviewPanel target={previewTarget} sources={previewSources} />
      </div>
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
        Nessuna versione di Minecraft trovata in {minecraftDir}: avvia il gioco una volta dal
        launcher.
      </span>
    )
  }
  const currentId = jar.status === 'ready' ? jar.value.versionId : ''
  return (
    <label className="vanilla-picker">
      <span className="muted small">Riferimento vanilla</span>
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
      {jar.status === 'loading' && <span className="muted small">Caricamento…</span>}
      {jar.status === 'error' && <span className="field-error">{jar.message}</span>}
      {jar.status === 'ready' && jar.value.resourceFormat && (
        <span className="muted small">formato {formatPackVersion(jar.value.resourceFormat)}</span>
      )}
      <span
        className="muted small"
        title="Le texture vanilla sono solo di riferimento: non vengono copiate né esportate."
      >
        · solo riferimento
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
    : `${selectedFolder || 'radice'} · ${matches.length} texture`
  const detail =
    covered !== null
      ? ` · ${covered} di ${matches.length} già nel pack`
      : matches.length > 0
        ? ` · ${withMaps} con mappe PBR`
        : ''

  return (
    <div className="workspace">
      <aside className="card tree-panel">
        {findFolder(tree, selectedFolder) === null && selectedFolder !== '' && (
          <p className="muted small">La cartella {selectedFolder} non esiste qui.</p>
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
          <p className="muted small">Il pack contiene troppi file: l'elenco è incompleto.</p>
        )}
      </aside>

      <div className="card grid-panel">
        <div className="grid-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder="Cerca texture…"
            aria-label="Cerca texture"
          />
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
            versionOf={props.versionOf}
          />
        ) : (
          <p className="muted">
            {trimmedQuery ? 'Nessuna texture trovata.' : 'Nessuna texture PNG in questa cartella.'}
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
  if (jar.status === 'loading' || vanilla.status === 'loading') return 'Caricamento del jar…'
  if (jar.status === 'error') return jar.message
  if (vanilla.status === 'error') return vanilla.message
  return 'Nessuna versione di Minecraft installata.'
}

/** Vanilla block textures if present, else the first folder that has textures. */
function pickInitialFolder(files: string[], textures: TextureEntry[]): string {
  if (findFolder(buildFileTree(files), DEFAULT_FOLDER)) return DEFAULT_FOLDER
  return (
    textures.find((t) => t.folder.includes('/textures'))?.folder ??
    textures[0]?.folder ??
    DEFAULT_FOLDER
  )
}

function ancestors(path: string): string[] {
  if (path === '') return []
  const segments = path.split('/')
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'))
}
