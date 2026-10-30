import { useCommands } from '../shell/commandContext'
import { useEffect, useMemo, useState } from 'react'
import { buildFileTree, findFolder, parentPath } from '../../shared/fileTree'
import { assetUrl, type PackSummary, type VanillaVersionInfo } from '../../shared/ipc'
import { mapKindOf } from '../../shared/labpbr'
import { compatibleFormatRange, compatibleReleases } from '../../shared/mcmeta'
import { OverridesDialog } from './OverridesDialog'
import { PackDoctorDialog } from './PackDoctorDialog'
import { EmissiveDialog } from './EmissiveDialog'
import { LangDialog } from './LangDialog'
import { PolytoneDialog } from './PolytoneDialog'
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
import { PackHealth } from './PackHealth'
import { coverageReport } from '../../shared/coverage'
import { SectionBrowser } from './SectionBrowser'
import { PixelIcon, ProgressBar, ToolList, type Tool } from '../ui/components'
import { SECTION_ICONS } from '../ui/sectionIcons'
import { CMD_ICONS, NAV_ICONS } from '../ui/icons'
import { SECTION_FOLDER, SECTION_IDS, sectionOf, type SectionId } from '../../shared/sections'
import { sectionName } from '../shell/sectionNames'
import { tr } from '../../shared/i18n'

const DEFAULT_FOLDER = 'assets/minecraft/textures/block'
const MAX_SEARCH_RESULTS = 500

const NO_SECTIONS: ReadonlySet<SectionId> = new Set()

/** Where the textures come from: the pack, or the game (reference only). */
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

export function PackWorkspace({
  pack,
  section = 'pack',
  visited,
  onSection,
  onEditTexture,
  onTestTexture,
  overview,
  visible
}: {
  pack: PackSummary
  /** The hotbar section to show (v3). */
  section?: SectionId
  visited?: ReadonlySet<SectionId>
  onSection?: (section: SectionId) => void
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
      section={section}
      visited={visited ?? NO_SECTIONS}
      onSection={onSection ?? (() => undefined)}
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
  visible,
  section,
  visited,
  onSection
}: {
  overview: React.ReactNode
  visible: boolean
  section: SectionId
  /** Sections opened since the pack was: their pages stay mounted. */
  visited: ReadonlySet<SectionId>
  onSection: (section: SectionId) => void
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

  const initialFolder = useMemo(
    () => pickInitialFolder(packFiles.files, packTextures),
    [packFiles.files, packTextures]
  )
  const [mode, setMode] = useState<Mode>('pack')
  const [selectedFolder, setSelectedFolder] = useState(initialFolder)
  /** The group chosen in each section's browser (null = all). */
  const [groups, setGroups] = useState<Partial<Record<SectionId, string | null>>>({})
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  /** Each section keeps its own search. */
  const [queries, setQueries] = useState<Partial<Record<SectionId, string>>>({})
  const query = queries[section] ?? ''
  const setQuery = (next: string): void => setQueries((all) => ({ ...all, [section]: next }))
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
  const [polytoneOpen, setPolytoneOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [varying, setVarying] = useState<TextureEntry | null>(null)
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
  const jarSource: SourceFiles | null = jar.status !== 'ready' ? null : jar.value
  const source: SourceFiles = fromJar && jarSource ? jarSource : packFiles
  const textures = activeMode === 'vanilla' ? vanillaTextures : packTextures
  // The section's own textures (Blocchi, Oggetti…), from the same source.
  const sectionTextures = useMemo(
    () => textures.filter((t) => sectionOf(t.albedo) === section),
    [textures, section]
  )
  // One count of the maps for the whole app: the same as Copertura.
  const coverage = useMemo(() => coverageReport(packFiles.files), [packFiles.files])
  /** Pack files (textures, models, texts) per section, for the Pack overview. */
  const sectionCounts = useMemo(() => {
    // Textures as the grids count them (a texture with its maps is one), plus the text files
    // (lang, splashes) that Testi and Schermate edit.
    const counts = new Map<SectionId, number>()
    const add = (id: SectionId | null): void => {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    for (const texture of packTextures) add(sectionOf(texture.albedo))
    for (const file of packFiles.files) {
      if (!file.endsWith('.png') && /\/(lang|texts)\//.test(file)) add(sectionOf(file))
    }
    return counts
  }, [packTextures, packFiles.files])
  const packSectionCount = useMemo(
    () => packTextures.filter((t) => sectionOf(t.albedo) === section).length,
    [packTextures, section]
  )
  const vanillaSectionCount = useMemo(
    () => vanillaTextures.filter((t) => sectionOf(t.albedo) === section).length,
    [vanillaTextures, section]
  )
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
            run: () => onSection('screens')
          },
          {
            id: 'pack:lang',
            label: tr('Testi del gioco…'),
            menu: 'Pack',
            area: 'Pack',
            run: () => onSection('texts')
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

  const selectTexture = (texture: TextureEntry): void =>
    setPreviewSelection({
      key: `${source.assetBase}|${texture.key}`,
      base: source.assetBase,
      textureKey: texture.key,
      albedo: texture.albedo,
      mcmeta: texture.mcmeta,
      name: texture.name,
      isPack: activeMode === 'pack',
      sourceLabel: fromJar && jar.status === 'ready' ? `Vanilla ${jar.value.versionId}` : 'Pack'
    })
  // Only pack textures are editable: vanilla pixels never enter the pack. Double-clicking a vanilla
  // texture opens the pack's version, or offers to create one with that name.
  const openTexture = (texture: TextureEntry): void => {
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
  }
  const newTextureIn = (folder: string): (() => void) | undefined =>
    canCreate ? () => setCreating({ folder, name: '', fromVanilla: false }) : undefined

  const zipWhy = canCreate ? null : zipNote
  /** A pack texture chosen in the grid (not a _n / _s map): what per-texture tools work on. */
  const chosen =
    testable &&
    mapKindOf(testable.albedo) === null &&
    (section === 'pack' || sectionOf(testable.albedo) === section)
      ? testable
      : null
  const chooseFirst = tr('Scegli prima una texture del pack nella griglia')
  /** Tools that live in the editor: they open the chosen texture there. */
  const inEditor = (id: string, label: string, tip: string, glyph: Tool['glyph']): Tool => ({
    id,
    label,
    tip: tr('{0} (nell’editor della texture)', tip),
    glyph,
    why: chosen ? zipWhy : chooseFirst,
    run: () => chosen && onEditTexture(chosen, previewSources)
  })
  const packTools: Tool[] = [
    {
      id: 'doctor',
      label: tr('Diagnosi'),
      tip: tr(
        'File che il gioco ignora, riferimenti rotti, texture che mancano, cambio di versione'
      ),
      icon: NAV_ICONS.search,
      run: () => setDoctoring(true)
    },
    {
      id: 'validate',
      label: tr('Controlla mappe'),
      tip: tr(
        'Controlla le mappe _n / _s del pack: dimensioni, animazione, emissione, altezza, file orfani'
      ),
      glyph: 'check',
      run: () => setValidating(true)
    },
    {
      id: 'coverage',
      label: tr('Copertura'),
      tip: tr('Quante texture del pack hanno già _n e _s, e quali mancano'),
      glyph: 'chart',
      run: () => setCovering(true)
    },
    {
      id: 'batch',
      label: tr('Applica in blocco'),
      tip: tr(
        'Crea le mappe _s / _n di tante texture insieme, con un preset materiale e/o il generatore di rilievo'
      ),
      glyph: 'gear',
      why: zipWhy,
      run: () => setBatching({ selection: null, maps: { specular: true, normal: false } })
    },
    {
      id: 'recolor',
      label: tr('Ricolora texture'),
      tip: tr('Cambia insieme i colori di tante texture (blocchi, oggetti, entità…)'),
      icon: CMD_ICONS.color,
      why: zipWhy,
      run: () => setRecoloringAll(true)
    },
    {
      id: 'resize',
      label: tr('Ridimensiona'),
      tip: tr(
        'Porta le texture a una sola risoluzione (16×, 32×, 64×…) a pixel netti, con le loro mappe'
      ),
      glyph: 'resize',
      why: zipWhy,
      run: () => setResizing(true)
    },
    {
      id: 'backup',
      label: tr('Backup'),
      tip: tr('I backup presi prima di sovrascrivere file: ripristina una versione precedente'),
      glyph: 'clock',
      why: zipWhy,
      run: () => setShowBackups(true)
    },
    {
      id: 'export',
      label: tr('Esporta'),
      tip: tr(
        'Crea lo zip da pubblicare: versione, licenza, crediti, changelog, controlli e varianti'
      ),
      icon: NAV_ICONS.chest,
      why: zipWhy,
      run: () => setExporting(true)
    }
  ]
  const emissiveTool: Tool = {
    id: 'emissive',
    label: tr('Luce _e'),
    tip: tr(
      'Crea le texture _e (luce senza shader, OptiFine / Continuity) dalle mappe _s che emettono'
    ),
    glyph: 'dot',
    why: zipWhy,
    run: () => setEmissive(true)
  }
  const variantsTool: Tool = {
    id: 'variants',
    label: tr('Varianti di colore'),
    tip: chosen
      ? tr(
          'Crea le versioni di {0} in tutti i colori (lana, cemento, vetro colorato…)',
          chosen.name
        )
      : tr('La stessa texture nei 16 colori del gioco'),
    icon: CMD_ICONS.color,
    why: chosen ? zipWhy : chooseFirst,
    run: () => setVarying(chosen)
  }
  const sectionTools: Partial<Record<SectionId, Tool[]>> = {
    blocks: [
      {
        id: 'connected',
        label: tr('Texture connesse'),
        tip: chosen
          ? tr('Crea i 47 tile delle texture connesse di {0} (Continuity / OptiFine)', chosen.name)
          : tr('I 47 pezzi che si uniscono (Continuity / OptiFine)'),
        glyph: 'connected',
        why: chosen ? zipWhy : chooseFirst,
        run: () => setConnecting(chosen)
      },
      variantsTool,
      emissiveTool,
      inEditor(
        'random',
        tr('Varianti casuali'),
        tr('Più versioni: il gioco ne sceglie una per blocco'),
        'dice'
      ),
      inEditor(
        'popout',
        tr('Pixel in rilievo'),
        tr('Alcuni colori escono dal blocco in 3D (minerali, gemme)'),
        'up'
      ),
      inEditor(
        'shapes',
        tr('Forme 3D ed elementi'),
        tr('Foglie folte, erba sui lati, binari, i cubetti del modello'),
        'gear'
      ),
      inEditor('plant', tr('Forma della pianta'), tr('Croce, cespuglio o pianta alta'), 'leaf')
    ],
    items: [
      variantsTool,
      inEditor(
        'item3d',
        tr('3D in mano'),
        tr('Piatto nell’inventario, in rilievo nella mano'),
        'up'
      ),
      inEditor(
        'name',
        tr('Variante per nome'),
        tr('Una texture diversa quando l’oggetto ha un certo nome nell’incudine'),
        'book'
      ),
      inEditor(
        'display',
        tr('Posizioni e definizione'),
        tr('Come sta in mano, a terra, in testa, e il file items/'),
        'resize'
      ),
      {
        id: 'overrides',
        label: tr('Overrides in items/'),
        tip: tr(
          'Crea le definizioni in items/ dagli overrides dei modelli degli oggetti (1.21.4+)'
        ),
        glyph: 'swap',
        why: !canCreate ? zipNote : hasItemModels ? null : tr('Il pack non ha modelli di oggetti'),
        run: () => setOverriding(true)
      }
    ],
    armor: [
      inEditor(
        'trims',
        tr('Armatura e finiture'),
        tr('Il giocatore 3D con motivo e materiale della finitura'),
        'gear'
      ),
      emissiveTool
    ],
    entities: [
      variantsTool,
      inEditor(
        'mobs',
        tr('Varianti del mob'),
        tr('Più texture per questo mob, scelte a caso o con regole'),
        'dice'
      ),
      emissiveTool
    ],
    gui: [
      {
        id: 'guiRecolor',
        label: tr('Ricolora GUI'),
        tip: tr('Tutti i pannelli e i pulsanti in un’altra tinta'),
        icon: CMD_ICONS.color,
        why: zipWhy,
        run: () => setRecoloring(true)
      },
      {
        id: 'title',
        label: tr('Titolo e caricamento'),
        tip: tr('Panorama, logo, schermata di caricamento: nella sezione Schermate'),
        glyph: 'arrowRight',
        run: () => onSection('screens')
      }
    ],
    world: [
      {
        id: 'polytone',
        label: tr('Polytone'),
        tip: tr('Colori dei biomi con la mod Polytone: una colormap tua per foglie ed erba'),
        glyph: 'leaf',
        why: zipWhy,
        run: () => setPolytoneOpen(true)
      },
      {
        id: 'recolorWorld',
        label: tr('Ricolora texture'),
        tip: tr('Cambia insieme i colori di tante texture (blocchi, oggetti, entità…)'),
        icon: CMD_ICONS.color,
        why: zipWhy,
        run: () => setRecoloringAll(true)
      }
    ]
  }

  const sourceSwitch = (
    <div className="source-switch">
      <div className="joined" role="radiogroup" aria-label={tr('Da dove')}>
        <button
          type="button"
          role="radio"
          aria-checked={activeMode === 'pack'}
          className={activeMode === 'pack' ? 'ore-on' : 'ore'}
          onClick={() => setMode('pack')}
        >
          {tr('Il tuo pack')}
          <span className="count">{packSectionCount}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={activeMode === 'vanilla'}
          className={activeMode === 'vanilla' ? 'ore-on' : 'ore'}
          disabled={!vanillaReady}
          title={vanillaReady ? undefined : vanillaHint(vanilla, jar)}
          onClick={() => setMode('vanilla')}
        >
          {tr('Gioco')}
          {vanillaReady && <span className="count">{vanillaSectionCount}</span>}
        </button>
      </div>
      <VanillaPicker vanilla={vanilla} jar={jar} onSelect={onSelectVersion} />
    </div>
  )
  const jarLoading =
    activeMode === 'pack' && (jar.status === 'loading' || vanilla.status === 'loading') ? (
      <ProgressBar label={tr('Leggo le texture del gioco')} />
    ) : null
  const selectedKey =
    previewSelection?.base === source.assetBase ? previewSelection.textureKey : null
  const marker2 = marker
  const tools = sectionTools[section] ?? []

  const preview =
    section === 'gui' ? (
      <GuiMockScreen
        sources={previewSources}
        onOpenTitle={() => onSection('screens')}
        onRecolor={canCreate ? () => setRecoloring(true) : null}
      />
    ) : (
      <PreviewPanel
        target={previewTarget}
        sources={previewSources}
        onTest={testable ? () => onTestTexture(testable, previewSources) : null}
      />
    )

  return (
    <section
      className={`workspace-wrap pack-screen section-${section}`}
      data-section={section}
      aria-label={sectionName(section)}
    >
      {/* Schermate and Testi stay mounted once opened: unsaved splashes or texts survive a
          visit to another section. */}
      {(section === 'screens' || visited.has('screens')) && (
        <div className="section-page" hidden={section !== 'screens'}>
          <TitleScreensDialog
            embedded
            active={section === 'screens' && visible}
            sources={previewSources}
            // "Create yours" copies only the size of the game's texture: it needs the jar.
            canCreate={canCreate && jar.status === 'ready'}
            canWrite={canCreate}
            onClose={() => onSection('pack')}
            onOpen={(path) => {
              const own = packTextures.find((entry) => entry.albedo === path)
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
        </div>
      )}
      {(section === 'texts' || visited.has('texts')) && (
        <div className="section-page" hidden={section !== 'texts'}>
          <LangDialog
            embedded
            gameVersion={jar.status === 'ready' ? jar.value.versionId : null}
            pack={validatorPack}
            canWrite={canCreate}
            onClose={() => onSection('pack')}
          />
        </div>
      )}
      {section === 'screens' || section === 'texts' ? null : section === 'pack' ? (
        <>
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
              </div>
              <VanillaPicker vanilla={vanilla} jar={jar} onSelect={onSelectVersion} />
            </div>
            <div className="workspace-row">
              <TextureBrowser
                // Remount per source: tree expansion is rebuilt around the shared folder.
                key={fromJar && jar.status === 'ready' ? `vanilla:${jar.value.assetBase}` : 'pack'}
                selectedKey={selectedKey}
                versionOf={activeMode === 'pack' ? (path) => fileVersions[path] ?? 0 : undefined}
                onSelectTexture={selectTexture}
                onOpenTexture={openTexture}
                onNewTexture={newTextureIn(
                  selectedFolder.startsWith('assets/') ? selectedFolder : DEFAULT_FOLDER
                )}
                source={source}
                textures={textures}
                marker={marker2}
                coverageKeys={fromJar ? packKeys : null}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                query={query}
                onQuery={setQuery}
              />
            </div>
          </div>
          {/* Dock: the pack, the 3D preview (outside the browser so it survives source switches), the tools. */}
          <aside className="pack-dock">
            {overview}
            <PackHealth
              withMaps={coverage.complete}
              textures={coverage.total}
              remade={packTextures.filter((t) => vanillaKeys.has(t.key)).length}
              gameTextures={vanillaReady ? vanillaTextures.length : null}
              canBackup={canCreate}
              revision={packFiles.files.length}
            />
            <section className="pack-sections" aria-label={tr('Le sezioni del pack')}>
              <h3 className="ph">{tr('Le sezioni del pack')}</h3>
              <div className="pack-section-list">
                {SECTION_IDS.filter((id) => id !== 'pack').map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="pack-section-row"
                    data-section={id}
                    onClick={() => onSection(id)}
                  >
                    <PixelIcon icon={SECTION_ICONS[id]} />
                    <span>{sectionName(id)}</span>
                    <span className="group-count">{sectionCounts.get(id) ?? 0}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="pack-tools">
              <h3 className="ph">{tr('Strumenti per tutto il pack')}</h3>
              <ToolList label={tr('Strumenti')} tools={[...packTools, variantsTool]} />
            </section>
            {preview}
          </aside>
        </>
      ) : (
        <>
          <div className="pack-main">
            <SectionBrowser
              // A new section starts with its own search and scroll.
              key={section}
              section={section}
              textures={sectionTextures}
              assetBase={source.assetBase}
              source={sourceSwitch}
              group={groups[section] ?? null}
              onGroup={(group) => setGroups((all) => ({ ...all, [section]: group }))}
              query={query}
              onQuery={setQuery}
              marker={marker2}
              coverageKeys={fromJar ? packKeys : null}
              selectedKey={selectedKey}
              onSelect={selectTexture}
              onOpen={openTexture}
              onNewTexture={newTextureIn(SECTION_FOLDER[section])}
              versionOf={activeMode === 'pack' ? (path) => fileVersions[path] ?? 0 : undefined}
              loading={jarLoading}
            />
          </div>
          {/* Tools first: they are what a section is for; the preview follows. */}
          <aside className="pack-dock">
            <section className="pack-tools">
              <h3 className="ph">
                {tr('Strumenti: {0}', sectionName(section))}
                <span className="muted small" data-testid="selected-texture">
                  {chosen ? chosen.name : ''}
                </span>
              </h3>
              <ToolList label={tr('Strumenti')} tools={tools} />
            </section>
            {preview}
          </aside>
        </>
      )}
      {recoloring && <GuiRecolorDialog pack={validatorPack} onClose={() => setRecoloring(false)} />}
      {recoloringAll && (
        <GuiRecolorDialog pack={validatorPack} anyArea onClose={() => setRecoloringAll(false)} />
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
      {polytoneOpen && (
        <PolytoneDialog
          pack={validatorPack}
          onClose={() => setPolytoneOpen(false)}
          onCreated={(path) => {
            setPolytoneOpen(false)
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
  const withMaps = matches.filter((t) => t.normal && t.specular).length
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
        ? tr(', {0} con _n e _s', withMaps)
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
