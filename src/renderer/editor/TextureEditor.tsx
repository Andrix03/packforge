import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, type DraftMaps, type TextureDraft } from '../../shared/ipc'
import { decodePng } from '../../shared/pngCodec'
import type { EditorMode } from '../../shared/settings'
import { NewTextureDialog } from '../packs/NewTextureDialog'
import { useCommands } from '../shell/commandContext'
import {
  guessBlockForTexture,
  listBlocks,
  type AssetSources,
  type GrowthStage
} from '../preview/modelSource'
import { PlantShapeDialog } from './PlantShapeDialog'
import { GrowthTabs } from './GrowthTabs'
import { RandomVariantsDialog } from './RandomVariantsDialog'
import { splitHalves, stackHalves, tallHalves } from './tallPlant'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import { GuiPreview } from '../preview/GuiPreview'
import { guiTextureKind } from '../../shared/guiScaling'
import { ArmorPreview } from '../preview/ArmorPreview'
import { Item3dDialog } from './Item3dDialog'
import { ItemPreview } from '../preview/ItemPreview'
import { NameVariantDialog } from './NameVariantDialog'
import { DefinitionDialog } from './DefinitionDialog'
import { PopOutDialog } from './PopOutDialog'
import { DisplayDialog } from './DisplayDialog'
import { BlockShapesDialog } from './BlockShapesDialog'
import { presetsFor } from '../../shared/blockPresets'
import { item3dPlan } from '../../shared/item3d'
import { isItemTexture } from '../../shared/itemPreview'
import type { FormatRange } from '../../shared/modelRules'
import { armorPreviewRole } from '../../shared/trims'
import type { TestLive } from '../testscreen/TestScreen'
import { analyzeTexture } from './advice'
import { AdvicePanel } from './AdvicePanel'
import { dialogOpen, isTyping, putBuffer } from './canvasDraw'
import { addRecent, toRamp, usedColors } from './color'
import { PalettesPanel } from './PalettesPanel'
import type { SavedPalette } from '../../shared/settings'
import { EditorDocument } from './document'
import { FramesPanel } from './FramesPanel'
import { ShortcutsHelp } from './ShortcutsHelp'
import {
  animationFromMcmeta,
  buildMcmeta,
  frameAfter,
  mapMcmeta,
  type AnimationSettings
} from './frames'
import { EditorTools, type SelectionAction } from './EditorTools'
import type { Floating } from './selection'
import * as selectionActions from './selectionActions'
import { combine, History, pixelCommand, type Command } from './history'
import { LayersPanel } from './LayersPanel'
import { replacePixels, TRANSPARENT, type Rgba } from './pixels'
import { PixelCanvas, type Tools } from './PixelCanvas'
import { DEFAULT_RAMP, generateRamp, type RampOptions } from './ramp'
import { RampPanel } from './RampPanel'
import { ReferencePanel, type LoadedReference } from './ReferencePanel'
import { TilingPreview } from './TilingPreview'
import { maxBrushSize, toolByShortcut, visibleTools } from './tools'
import { mapKindOf, mapPath, type MapKind } from '../../shared/labpbr'
import type { MapGrid } from '../../shared/pbrGenerator'
import { DEFAULT_HEIGHT, DEFAULT_NORMALS, DEFAULT_OCCLUSION } from '../../shared/pbrGenerator'
import { DEFAULT_EFFECTS, type EffectSettings } from '../preview/effects'
import { EffectsControls } from '../preview/EffectsControls'
import type { LiveMaps } from '../preview/BlockPreview'
import {
  CHANNELS,
  channelDef,
  EditedMap,
  gray,
  grayRamp,
  newMap,
  type ChannelDef,
  type ChannelId
} from './channels'
import { MapTabs, ValuePanel, type ChannelValues, type Surface } from './ChannelPanel'
import { GeneratorPanel, type GenerateAction, type GeneratorSettings } from './GeneratorPanel'
import {
  applyMaterialPreset,
  generateFromHeight,
  generateHeight,
  normalsAreFlat,
  writeMap
} from './mapGenerate'
import { MaterialPanel } from './MaterialPanel'
import { backupBefore } from '../packs/backup'
import { announceStep } from '../tutorialEvents'
import { CompareDialog } from './CompareDialog'
import type { Image } from '../../shared/textureCompare'
import {
  accentMask,
  cropParts,
  DEFAULT_MATERIAL,
  type MaterialOptions
} from '../../shared/materialPresets'
import { Glyph } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { locale, tr } from '../../shared/i18n'

export interface EditorTarget {
  /** Pack-relative path of the albedo PNG. */
  path: string
  /** Path without `.png`, used by the 3D preview to guess the block. */
  textureKey: string
  name: string
  url: string
  mcmetaUrl: string | null
  /** Models and textures for the live 3D preview (pack first, then vanilla). */
  sources: AssetSources
  /** Asset URL prefix of the open pack. */
  packBase: string
  /** Zip packs are opened read-only. */
  readOnly: boolean
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      /** The texture's .png.mcmeta as read (null when there is none). */
      mcmeta: unknown
      /** A whole tall plant: rows of the upper half, and one canvas per half (3D previews). */
      tall: { split: number; upper: HTMLCanvasElement; lower: HTMLCanvasElement } | null
      doc: EditorDocument
      /** Display copy of the composite (also the live 3D texture). */
      source: HTMLCanvasElement
      reducedFrom16Bit: boolean
      /** The texture's LabPBR maps (new, neutral ones when the file doesn't exist yet). */
      maps: Partial<Record<MapKind, EditedMap>>
      mapErrors: Partial<Record<MapKind, string>>
      /** Display copy of each channel being painted. */
      channelCanvases: Partial<Record<ChannelId, HTMLCanvasElement>>
    }

/** Copied pixels, shared by every texture opened in this session. */
let clipboard: Floating | null = null

/** Autosave delay after the last change. */
const DRAFT_DELAY_MS = 2000

export function TextureEditor({
  target,
  onClose,
  onSwitch,
  onTest,
  suspended = false,
  formats = null
}: {
  target: EditorTarget
  /** The formats of the releases that load the pack (null: none). */
  formats?: FormatRange | null
  onClose: () => void
  /** Opens the test screen on the texture as it is now (unsaved changes included). */
  onTest: (live: TestLive) => void
  /** Hidden under the test screen: keyboard shortcuts are off. */
  suspended?: boolean
  /** Opens another texture of the pack in the editor (block tabs). */
  onSwitch: (target: EditorTarget) => void
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })
  const [tools, setTools] = useState<Omit<Tools, 'ramp'>>({
    tool: 'pencil',
    pixelPerfect: false,
    brushSize: 1,
    fillMode: 'contiguous',
    noiseStrength: 'soft',
    shapeFilled: false,
    mirror: { x: false, y: false },
    tiling: false,
    primary: [255, 255, 255, 255],
    // Secondary defaults to transparent: right click erases.
    secondary: TRANSPARENT
  })
  const [modified, setModified] = useState(false)
  const [history] = useState(() => new History())
  const [saving, setSaving] = useState(false)
  /** A file of this texture changed outside PackForge while there was unsaved work. */
  const [externalChange, setExternalChange] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  /** Bumped on every change of the document, to redraw and refresh the previews. */
  const [revision, setRevision] = useState(0)
  const [recent, setRecent] = useState<Rgba[]>([])
  const [mode, setMode] = useState<EditorMode>('beginner')
  const [proTips, setProTips] = useState(false)
  /** The external editor of the settings (null = the system's default program). */
  const [externalEditor, setExternalEditor] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [reference, setReference] = useState<LoadedReference | null>(null)
  /** Snapshot of my texture for the vanilla comparison (null = closed). */
  const [comparing, setComparing] = useState<Image | null>(null)
  /** Textures of the block shown in the 3D preview, for the face tabs. */
  const [blockTextures, setBlockTextures] = useState<string[]>([])
  /** Growth stages of the crop shown in the 3D preview, for the stage tabs. */
  const [growthStages, setGrowthStages] = useState<GrowthStage[]>([])
  const [creatingPath, setCreatingPath] = useState<string | null>(null)
  const [randomVariants, setRandomVariants] = useState(false)
  const [plantShape, setPlantShape] = useState(false)
  const [item3dOpen, setItem3dOpen] = useState(false)
  const [nameVariantOpen, setNameVariantOpen] = useState(false)
  const [definitionOpen, setDefinitionOpen] = useState(false)
  const [popOutOpen, setPopOutOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [shapesOpen, setShapesOpen] = useState(false)
  // Only textures of an item the game knows (its definition in the pack or vanilla).
  const itemPlan = item3dPlan(target.path)
  const item3d =
    itemPlan &&
    (target.sources.pack.files.has(itemPlan.definitionPath) ||
      target.sources.vanilla?.files.has(itemPlan.definitionPath))
      ? itemPlan
      : null
  /** The crop drawn by this texture (for its plant shape), when it has growth stages. */
  const crop = useMemo(
    () =>
      growthStages.length > 0
        ? guessBlockForTexture(target.textureKey, listBlocks(target.sources))
        : null,
    [growthStages, target.textureKey, target.sources]
  )
  /** Pack texture the new one starts as a copy of (the previous growth stage). */
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null)
  /** Tall plants: both halves painted as one canvas (false = only the opened half). */
  const [wholePlant, setWholePlant] = useState(true)
  const halves = useMemo(
    () => tallHalves(target.path, (path) => target.sources.pack.files.has(path)),
    [target.path, target.sources]
  )
  const tall = wholePlant && !target.readOnly ? halves : null
  const urlOf = (path: string): string =>
    assetUrl(target.packBase, path, target.sources.pack.versions[path] ?? 0)
  const tallUrls = tall ? { upper: urlOf(tall.upper), lower: urlOf(tall.lower) } : null
  const tallKey = tallUrls ? `${tallUrls.upper}|${tallUrls.lower}` : ''
  // The whole plant is edited from its lower half (the one the previews draw for the target).
  useEffect(() => {
    if (tall && target.path === tall.upper) onSwitch(targetFor(target, tall.lower))
  }, [tall, target, onSwitch])
  /** A draft found for this texture, waiting for the user to restore or discard it. */
  const [draftOffer, setDraftOffer] = useState<TextureDraft | null>(null)
  const [traceOpacity, setTraceOpacity] = useState(0)
  /** Animation being edited (null = plain texture). */
  const [animation, setAnimation] = useState<AnimationSettings | null>(null)
  /** The same, readable at once by refresh() (state updates land on the next render). */
  const animationNow = useRef<AnimationSettings | null>(null)
  const changeAnimation = useCallback((settings: AnimationSettings | null) => {
    animationNow.current = settings
    setAnimation(settings)
  }, [])
  /** Why an existing animation can't be edited here. */
  const [animationNote, setAnimationNote] = useState<string | null>(null)
  /** The mcmeta on disk and its frame count, to keep its other fields when saving. */
  const [mcmetaOnDisk, setMcmetaOnDisk] = useState<{ value: unknown; frames: number }>({
    value: null,
    frames: 1
  })
  const [onionSkin, setOnionSkin] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [bigPreview, setBigPreview] = useState(false)
  /** Animation settings changed since the last save (frame edits are in the history). */
  const animationDirty = useRef(false)
  /** The albedo as on disk: saving skips the PNG when only the maps changed. */
  const savedAlbedo = useRef<Uint8Array | null>(null)
  /** What is being painted: the colors, or a channel of `_n` / `_s`. */
  const [chosenSurface, setSurface] = useState<Surface>('color')
  /** LabPBR effects of the 3D preview while painting the maps (the Effetti workspace). */
  const [effects, setEffects] = useState<EffectSettings>(DEFAULT_EFFECTS)
  const [channelOf, setChannelOf] = useState<Record<MapKind, ChannelId>>({
    normal: 'height',
    specular: 'smoothness'
  })
  const [channelValues, setChannelValues] = useState<Record<ChannelId, ChannelValues>>(
    () =>
      Object.fromEntries(
        CHANNELS.map((def) => [
          def.id,
          { primary: def.presets[1]?.value ?? def.neutral, secondary: def.neutral }
        ])
      ) as Record<ChannelId, ChannelValues>
  )
  const [rampStep, setRampStep] = useState(16)
  const [colorOverlay, setColorOverlay] = useState(0)
  const [generator, setGenerator] = useState<GeneratorSettings>({
    height: DEFAULT_HEIGHT,
    normals: DEFAULT_NORMALS,
    occlusion: DEFAULT_OCCLUSION,
    withOcclusion: true,
    wrap: true,
    auto: false
  })
  const [material, setMaterial] = useState<MaterialOptions>(DEFAULT_MATERIAL)
  /** The file is itself a `_n` / `_s` (of a game texture): it has no maps of its own. */
  const isMapFile = mapKindOf(target.path) !== null
  const normalPath = mapPath(target.path, 'normal')
  const specularPath = mapPath(target.path, 'specular')
  const packFiles = target.sources.pack
  const normalUrl = packFiles.files.has(normalPath)
    ? assetUrl(target.packBase, normalPath, packFiles.versions[normalPath] ?? 0)
    : null
  const specularUrl = packFiles.files.has(specularPath)
    ? assetUrl(target.packBase, specularPath, packFiles.versions[specularPath] ?? 0)
    : null
  const vanilla = target.sources.vanilla
  const referenceUrl = vanilla?.files.has(target.path) ? assetUrl(vanilla.base, target.path) : null
  const pro = mode === 'pro'
  const showTips = !pro || proTips
  /** Ramp base color; null = follow the primary color until the ramp is used or picked from. */
  const [rampBase, setRampBase] = useState<Rgba | null>(null)
  const [rampOptions, setRampOptions] = useState<RampOptions>(DEFAULT_RAMP)
  /** A ramp edited by hand or taken from a palette (overrides the generated one). */
  const [customRamp, setCustomRamp] = useState<Rgba[] | null>(null)
  const [palettes, setPalettes] = useState<SavedPalette[]>([])
  const generatedRamp = useMemo(
    () => generateRamp(rampBase ?? tools.primary, rampOptions),
    [rampBase, tools.primary, rampOptions]
  )
  const ramp = customRamp ?? generatedRamp
  const lockRamp = (): void => setRampBase((base) => base ?? tools.primary)
  const doc = loaded.status === 'ready' ? loaded.doc : null
  const source = loaded.status === 'ready' ? loaded.source : null
  const maps = loaded.status === 'ready' ? loaded.maps : null
  const channelCanvases = loaded.status === 'ready' ? loaded.channelCanvases : null
  /** Whole tall plant: where the halves meet, and one canvas per half for the 3D previews. */
  const tallCanvases = loaded.status === 'ready' ? loaded.tall : null
  /** What is painted. A whole tall plant has no maps here: always its colors. */
  const surface: Surface = tallCanvases ? 'color' : chosenSurface
  const editedMap = surface !== 'color' ? (maps?.[surface] ?? null) : null
  const channel: ChannelDef | null =
    surface !== 'color' && editedMap ? channelDef(channelOf[surface]) : null
  /** The document the tools paint on: the color layers, or a channel's gray proxy. */
  const editDoc = channel && editedMap ? editedMap.proxy(channel) : doc
  const editSource = channel ? (channelCanvases?.[channel.id] ?? null) : source
  const values = channel ? channelValues[channel.id] : null
  /** Pixel grid of a map for the generator (animation frames scale with the map). */
  const mapGrid = useCallback(
    (map: EditedMap): MapGrid => {
      const sameShape = doc !== null && map.height * doc.width === map.width * doc.height
      return {
        width: map.width,
        height: map.height,
        frameHeight:
          animation && sameShape && doc
            ? Math.round((animation.frameHeight * map.height) / doc.height)
            : map.height,
        wrap: generator.wrap
      }
    },
    [doc, animation, generator.wrap]
  )
  // The maps are mutated in place: `revision` tells when to look at them again.
  const liveMaps = useMemo<LiveMaps | null>(
    () =>
      maps && {
        normal: maps.normal?.present ? maps.normal.buffer : null,
        specular: maps.specular?.present ? maps.specular.buffer : null
      },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maps, revision]
  )
  // The composite is mutated in place: `revision` is what tells us it changed. One pass over the
  // pixels each, cheap even at 64×.
  // Deferred: while a stroke on a big texture keeps the main thread busy, React skips the
  // in-between revisions instead of recounting every pixel on each pointer move.
  const settledRevision = useDeferredValue(revision)
  const palette = useMemo(
    () => (editDoc ? usedColors(editDoc.composite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editDoc, settledRevision]
  )
  const advice = useMemo(
    () => (doc && showTips && surface === 'color' ? analyzeTexture(doc.composite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, settledRevision, showTips, surface]
  )
  const previewTarget = useMemo<PreviewTarget>(
    () => ({
      key: `editor|${target.url}`,
      textureKey: target.textureKey,
      url: target.url,
      mcmetaUrl: target.mcmetaUrl,
      name: target.name,
      sourceLabel: tr('In modifica')
    }),
    [target]
  )
  const channelId = channel?.id ?? null
  const swap = useCallback(() => {
    if (channelId) {
      setChannelValues((all) => ({
        ...all,
        [channelId]: { primary: all[channelId].secondary, secondary: all[channelId].primary }
      }))
    } else {
      setTools((t) => ({ ...t, primary: t.secondary, secondary: t.primary }))
    }
  }, [channelId])

  /**
   * Recomposites, updates the display canvases and re-renders everything that depends on them.
   * `painted`: what a stroke in progress changed (the colors or one channel): only that is
   * recomposited. Without it (undo, commit, frames…) everything is.
   */
  const refresh = useCallback(
    (painted?: 'color' | ChannelId) => {
      if (!doc || !source) return
      const animation = animationNow.current
      // Keep the editable area on a whole frame (frames may have been added/removed by undo).
      if (animation) {
        const count = Math.max(1, Math.round(doc.height / animation.frameHeight))
        const index = Math.min(count - 1, Math.floor(doc.view.y0 / animation.frameHeight))
        const aligned =
          doc.view.y0 === index * animation.frameHeight &&
          doc.view.y1 === (index + 1) * animation.frameHeight - 1
        if (!aligned) doc.setFrameView(animation.frameHeight, index)
      } else if (doc.view.y0 !== 0 || doc.view.y1 !== doc.height - 1) {
        doc.setFrameView(null)
      }
      if (painted === undefined || painted === 'color') {
        doc.recomposite()
        putBuffer(source, doc.composite)
      }
      if (tallCanvases && (painted === undefined || painted === 'color')) {
        const rows = tallCanvases.split * doc.width * 4
        const { width, height, data } = doc.composite
        putBuffer(tallCanvases.upper, {
          width,
          height: tallCanvases.split,
          data: data.subarray(0, rows)
        })
        putBuffer(tallCanvases.lower, {
          width,
          height: height - tallCanvases.split,
          data: data.subarray(rows)
        })
      }
      let floating = doc.floating !== null
      if (painted === undefined) {
        for (const map of Object.values(maps ?? {})) map.sync()
      } else if (painted !== 'color') {
        maps?.[channelDef(painted).map]?.sync(painted)
      }
      for (const def of CHANNELS) {
        const canvas = channelCanvases?.[def.id]
        const map = maps?.[def.map]
        if (!canvas || !map) continue
        const proxy = map.proxy(def)
        if (painted === undefined || painted === def.id) putBuffer(canvas, proxy.composite)
        floating ||= proxy.floating !== null
      }
      setRevision((r) => r + 1)
      // A moved piece not yet put down, or new animation settings, are changes too.
      setModified(history.modified || floating || animationDirty.current)
    },
    [doc, source, history, maps, channelCanvases, tallCanvases]
  )

  const autoRegenerate = channel?.id === 'height' && generator.auto && editedMap !== null
  const commit = useCallback(
    (command: Command | null) => {
      // Painting the height with "update while painting": normals (and AO) follow in the same step.
      const follow =
        command && autoRegenerate && editedMap
          ? generateFromHeight(
              editedMap,
              mapGrid(editedMap),
              generator.normals,
              generator.withOcclusion ? generator.occlusion : null,
              doc?.composite ?? null
            )
          : null
      history.push(follow ? combine([command, follow]) : command)
      refresh()
    },
    [history, refresh, autoRegenerate, editedMap, mapGrid, generator, doc]
  )
  /** Puts down a moved/pasted piece (one undo step) before anything else changes the layer. */
  const settle = useCallback(() => {
    if (editDoc?.floating) commit(selectionActions.drop(editDoc))
  }, [editDoc, commit])
  const undo = useCallback(() => {
    // While moving, Ctrl+Z cancels the move instead of undoing the previous step.
    if (editDoc?.floating) {
      selectionActions.cancel(editDoc)
      refresh()
      return
    }
    if (history.undo()) refresh()
  }, [editDoc, history, refresh])
  const redo = useCallback(() => {
    settle()
    if (history.redo()) refresh()
  }, [history, refresh, settle])
  const [canPaste, setCanPaste] = useState(clipboard !== null)

  const runSelectionAction = useCallback(
    (action: SelectionAction) => {
      // Read-only packs: selections could still change pixels in memory (Canc, flip…).
      const doc = editDoc
      if (!doc || target.readOnly || (channel && !channel.paintable)) return
      const actions = selectionActions
      switch (action) {
        case 'all':
          commit(actions.selectAll(doc))
          break
        case 'none':
          commit(actions.deselect(doc))
          break
        case 'copy':
          clipboard = actions.copy(doc)
          setCanPaste(clipboard !== null)
          break
        case 'cut': {
          const { piece, command } = actions.cut(doc)
          clipboard = piece
          setCanPaste(clipboard !== null)
          commit(command)
          break
        }
        case 'paste':
          if (!clipboard) return
          commit(actions.paste(doc, clipboard))
          setTools((t) => ({ ...t, tool: 'move' }))
          break
        case 'flipH':
        case 'flipV':
        case 'rotate':
          actions.transform(doc, action)
          refresh()
          break
        case 'delete':
          commit(actions.erase(doc))
          break
        case 'drop':
          commit(actions.drop(doc))
          break
        case 'cancel':
          if (doc.floating) actions.cancel(doc)
          else actions.clearSelection(doc)
          refresh()
          break
      }
    },
    [editDoc, channel, commit, refresh, target.readOnly]
  )

  useEffect(() => {
    let cancelled = false
    void window.api.invoke('settings:get').then(
      (view) => {
        if (cancelled) return
        setMode(view.settings.editorMode)
        setPalettes(view.settings.palettes)
        setExternalEditor(view.settings.externalEditor)
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [])

  function savePalettes(next: SavedPalette[]): void {
    setPalettes(next)
    void window.api.invoke('settings:setPalettes', next)
  }

  function editRamp(index: number, action: 'replace' | 'remove'): void {
    const next = [...ramp]
    if (action === 'replace') next[index] = tools.primary
    else if (next.length > 2) next.splice(index, 1)
    setCustomRamp(toRamp(next))
  }

  function changeMode(next: EditorMode): void {
    setMode(next)
    const pro = next === 'pro'
    // Beginner mode: small brushes, no mirror, and back to a basic tool if a Pro one was active.
    setTools((t) => ({
      ...t,
      brushSize: Math.min(t.brushSize, maxBrushSize(pro)),
      mirror: pro ? t.mirror : { x: false, y: false },
      tool: pro || visibleTools(false).some((tool) => tool.id === t.tool) ? t.tool : 'pencil'
    }))
    void window.api.invoke('settings:setEditorMode', next)
  }

  useEffect(() => {
    let cancelled = false
    loadDocument(
      target.url,
      target.mcmetaUrl,
      { normal: normalUrl, specular: specularUrl },
      tallKey ? { upper: tallKey.split('|')[0]!, lower: tallKey.split('|')[1]! } : null
    ).then(
      (value) => {
        if (cancelled) return
        setLoaded({ status: 'ready', ...value })
        savedAlbedo.current = new Uint8Array(value.doc.composite.data)
        // A reload in place (whole/half plant, files a dialog wrote) starts a new document: the
        // old steps point at the old buffers. The callers save first, so nothing is lost.
        history.reset()
        setModified(false)
        animationDirty.current = false
        // Regenerating normals while painting is safe only when there is nothing hand-made.
        const normal = value.maps.normal
        setGenerator((g) => ({
          ...g,
          auto: normal !== undefined && (!normal.existed || normalsAreFlat(normal.buffer))
        }))
        const read = animationFromMcmeta(value.mcmeta, value.doc.width, value.doc.height)
        if (read.kind === 'editable') {
          changeAnimation(read.settings)
          setAnimationNote(null)
          setMcmetaOnDisk({ value: value.mcmeta, frames: read.frameCount })
          value.doc.setFrameView(read.settings.frameHeight, 0)
        } else {
          changeAnimation(null)
          setAnimationNote(read.kind === 'unsupported' ? read.reason : null)
          setMcmetaOnDisk({ value: value.mcmeta, frames: 1 })
        }
      },
      (error: unknown) =>
        !cancelled &&
        setLoaded({
          status: 'error',
          message:
            tr('Impossibile leggere la texture: ') +
            (error instanceof Error ? error.message : String(error))
        })
    )
    return () => {
      cancelled = true
    }
  }, [target.url, target.mcmetaUrl, normalUrl, specularUrl, tallKey, history, changeAnimation])

  const canSave = doc !== null && !target.readOnly
  /** Writes the texture (and its maps / .mcmeta); true when everything was saved. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!doc || target.readOnly || saving) return false
    settle()
    const version = history.version
    setSaving(true)
    setSaveError(null)
    try {
      // The composite = all visible layers flattened. A copy: the user may keep painting.
      const rgba = new Uint8Array(doc.composite.data)
      if (tallCanvases && tall) {
        // Whole tall plant: each half goes to its own file (only the changed ones).
        const image = { width: doc.width, height: doc.height }
        const now = splitHalves({ ...image, data: rgba }, tallCanvases.split)
        const before = savedAlbedo.current
          ? splitHalves({ ...image, data: savedAlbedo.current }, tallCanvases.split)
          : null
        const writes = (
          [
            [tall.upper, now.upper, before?.upper, tallCanvases.split],
            [tall.lower, now.lower, before?.lower, doc.height - tallCanvases.split]
          ] as const
        ).filter(([, bytes, old]) => !old || !sameBytes(bytes, old))
        if (
          !(await backupBefore(
            tr('Salvataggio di {0}', target.name),
            writes.map(([path]) => path)
          ))
        )
          return false
        for (const [path, bytes, , rows] of writes) {
          const result = await window.api.invoke('texture:save', path, doc.width, rows, bytes)
          if (!result.ok) {
            setSaveError(result.error)
            return false
          }
        }
        savedAlbedo.current = rgba
        if (history.version === version) history.markSaved()
        announceStep('save')
        setModified(history.modified)
        setSavedOnce(true)
        return true
      }
      // What this save overwrites goes into a backup first (🕘 Backup in the workspace).
      const albedoChanged = !sameBytes(rgba, savedAlbedo.current)
      const animated =
        animation !== null || mcmetaOnDisk.frames > 1 || isAnimated(mcmetaOnDisk.value)
      const dirtyMaps = Object.values(maps ?? {}).filter((map) => map.dirty)
      const touched = [
        ...(albedoChanged ? [target.path] : []),
        ...dirtyMaps.map((map) => mapPath(target.path, map.kind)),
        ...(animated
          ? [
              `${target.path}.mcmeta`,
              ...Object.values(maps ?? {})
                .filter((map) => map.present)
                .map((map) => `${mapPath(target.path, map.kind)}.mcmeta`)
            ]
          : [])
      ]
      if (!(await backupBefore(tr('Salvataggio di {0}', target.name), touched))) return false
      if (albedoChanged) {
        const result = await window.api.invoke(
          'texture:save',
          target.path,
          doc.width,
          doc.height,
          rgba
        )
        if (!result.ok) {
          setSaveError(result.error)
          return false
        }
        savedAlbedo.current = rgba
      }
      // Maps: only the painted ones (a new map is created on its first save).
      for (const map of Object.values(maps ?? {})) {
        if (!map.dirty) continue
        const bytes = new Uint8Array(map.buffer.data)
        const written = await window.api.invoke(
          'texture:save',
          mapPath(target.path, map.kind),
          map.width,
          map.height,
          bytes
        )
        if (!written.ok) {
          setSaveError(written.error)
          return false
        }
        map.markSaved(bytes)
      }
      // The .png.mcmeta follows the animation (kept untouched for textures never animated).
      const hadAnimation = mcmetaOnDisk.frames > 1 || isAnimated(mcmetaOnDisk.value)
      if (animation || hadAnimation) {
        const frames = animation ? Math.round(doc.height / animation.frameHeight) : 1
        const content = buildMcmeta(
          mcmetaOnDisk.value,
          animation,
          doc.width,
          frames,
          mcmetaOnDisk.frames
        )
        const written = await window.api.invoke('texture:saveMcmeta', target.path, content)
        if (!written.ok) {
          setSaveError(written.error)
          return false
        }
        setMcmetaOnDisk({ value: content === null ? null : JSON.parse(content), frames })
        animationDirty.current = false
        // Iris animates `_n` / `_s` from their own .png.mcmeta: keep them in step.
        for (const map of Object.values(maps ?? {})) {
          if (!map.present || map.width * doc.height !== map.height * doc.width) continue
          const mapWritten = await window.api.invoke(
            'texture:saveMcmeta',
            mapPath(target.path, map.kind),
            mapMcmeta(content, map.width / doc.width)
          )
          if (!mapWritten.ok) {
            setSaveError(mapWritten.error)
            return false
          }
        }
      }
      // If something changed during the save, the file holds the older state: stay modified.
      if (history.version === version) history.markSaved()
      announceStep('save')
      setModified(history.modified)
      setSavedOnce(true)
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
      return false
    } finally {
      setSaving(false)
    }
  }, [doc, maps, target, saving, history, settle, animation, mcmetaOnDisk, tall, tallCanvases])

  /**
   * Before something that reloads the editor or reads the files: saves the unsaved work (after
   * asking `question`). False when the user said no or the save failed: don't go on then.
   */
  async function saveFirst(question: string): Promise<boolean> {
    if (!modified) return true
    if (!window.confirm(question)) return false
    return save()
  }

  // The texture (or its maps) changed on disk: another program saved it (e.g. the external
  // editor). Our own saves come back too: they match the saved bytes and are ignored.
  const modifiedRef = useRef(false)
  useEffect(() => {
    modifiedRef.current = modified
    if (modified) announceStep('paint')
  }, [modified])
  useEffect(() => {
    if (target.readOnly) return
    // A whole tall plant watches its two halves (it has no maps in that view).
    const watched =
      tallCanvases && tall ? [tall.upper, tall.lower] : [target.path, normalPath, specularPath]
    /** The saved albedo of a watched file: the whole image, or its half of the plant. */
    const savedOf = (path: string): Uint8Array | null => {
      const saved = savedAlbedo.current
      if (!tallCanvases || !tall || !saved || !doc) return saved
      const halves = splitHalves(
        { width: doc.width, height: doc.height, data: saved },
        tallCanvases.split
      )
      return path === tall.upper ? halves.upper : halves.lower
    }
    return window.api.on('pack:filesChanged', ({ paths }) => {
      const hit = paths.filter((path) => watched.includes(path))
      if (hit.length === 0) return
      void (async () => {
        for (const path of hit) {
          const bytes = await readFromDisk(target.packBase, path)
          const map =
            path === normalPath ? maps?.normal : path === specularPath ? maps?.specular : null
          const ours =
            path === target.path || (tall !== null && path === tall.upper)
              ? bytes !== null && sameBytes(bytes, savedOf(path))
              : (map?.matchesSaved(bytes) ?? true)
          if (ours) continue
          if (modifiedRef.current) setExternalChange(path)
          else onSwitch(reloadedTarget(target, watched))
          return
        }
      })()
    })
  }, [target, normalPath, specularPath, maps, onSwitch, tallCanvases, tall, doc])

  useEffect(() => {
    if (suspended) return
    const onKeyDown = (event: KeyboardEvent): void => {
      // Behind a dialog (batch, export, compare…) the editor stays still, Ctrl+S included.
      if (dialogOpen()) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
        return
      }
      if (isTyping(event)) return
      if (event.key === '?' || event.key === 'F1') {
        event.preventDefault()
        setShowShortcuts((open) => !open)
        return
      }
      if (showShortcuts) {
        if (event.key === 'Escape') setShowShortcuts(false)
        return
      }
      if (pro && !target.readOnly) {
        const action = selectionShortcut(event)
        if (action) {
          event.preventDefault()
          runSelectionAction(action)
          return
        }
      }
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
      const tool = toolByShortcut(event.key, pro)
      if (tool) {
        if (tool !== 'move' && tool !== 'select') settle()
        setTools((t) => ({ ...t, tool }))
      } else if (event.key.toLowerCase() === 'x') swap()
      else if (event.key.toLowerCase() === 't' && !target.readOnly) {
        setTools((t) => ({ ...t, tiling: !t.tiling }))
      } else if ((event.key === ',' || event.key === '.') && animation && doc && !channel) {
        const count = Math.round(doc.height / animation.frameHeight)
        const current = Math.floor(doc.view.y0 / animation.frameHeight)
        const next = (current + (event.key === '.' ? 1 : -1) + count) % count
        settle()
        doc.setFrameView(animation.frameHeight, next)
        refresh()
      } else if (event.key === '[' || event.key === ']') {
        const step = event.key === ']' ? 1 : -1
        setTools((t) => ({
          ...t,
          brushSize: Math.min(maxBrushSize(pro), Math.max(1, t.brushSize + step))
        }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    swap,
    save,
    pro,
    runSelectionAction,
    settle,
    showShortcuts,
    animation,
    doc,
    refresh,
    target,
    suspended,
    channel
  ])

  // Offer a draft left by an earlier session (crash, closed without saving).
  useEffect(() => {
    if (!doc || target.readOnly) return
    let cancelled = false
    void window.api.invoke('draft:load', target.path).then((draft) => {
      if (cancelled || !draft) return
      if (draft.width === doc.width && draft.height === doc.height) setDraftOffer(draft)
    })
    return () => {
      cancelled = true
    }
  }, [doc, target.path, target.readOnly])

  // Autosave a draft (the flattened image and the painted maps) a moment after the last change;
  // drop it once the file is saved (or the changes were undone back to the file).
  useEffect(() => {
    if (!doc || target.readOnly || draftOffer) return
    const timer = window.setTimeout(() => {
      if (modified) {
        const rgba = new Uint8Array(doc.composite.data)
        const painted: DraftMaps = {}
        for (const map of Object.values(maps ?? {})) {
          if (!map.dirty) continue
          const { width, height, data } = map.buffer
          painted[map.kind] = { width, height, rgba: new Uint8Array(data) }
        }
        void window.api.invoke('draft:save', target.path, doc.width, doc.height, rgba, painted)
      } else {
        void window.api.invoke('draft:discard', target.path)
      }
    }, DRAFT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [doc, revision, modified, target.path, target.readOnly, draftOffer, maps])

  function restoreDraft(): void {
    const draft = draftOffer
    setDraftOffer(null)
    if (!draft || !doc) return
    // One undoable step: the active layer (a freshly opened texture has only one) and the maps.
    const layer = doc.active.pixels
    const mapSteps = Object.entries(draft.maps).map(([kind, image]) => {
      const map = maps?.[kind as MapKind]
      return map && image
        ? writeMap(map, {
            width: image.width,
            height: image.height,
            data: new Uint8ClampedArray(image.rgba)
          })
        : null
    })
    commit(combine([pixelCommand(layer, replacePixels(layer, draft.rgba)), ...mapSteps]))
  }

  function discardDraft(): void {
    setDraftOffer(null)
    void window.api.invoke('draft:discard', target.path)
  }

  /** Opens another texture; `added`: pack files just written that the editor must see. */
  async function switchTo(path: string, added: readonly string[] = []): Promise<void> {
    if (path === target.path) return
    if (
      !(await saveFirst(tr('Ci sono modifiche non salvate. Salvarle prima di cambiare texture?')))
    )
      return
    onSwitch(targetFor(target, path, added))
  }

  /**
   * The selection follows the user across Colore and the channels (same pixels, same size), so
   * pixels picked by color on the albedo can be painted or given a material on `_n` / `_s`.
   */
  function carrySelection(to: EditorDocument | null): void {
    if (!editDoc || !to || to === editDoc) return
    if (to.width !== editDoc.width || to.height !== editDoc.height) return
    to.selection = editDoc.selection
  }

  function changeSurface(next: Surface): void {
    settle()
    const map = next === 'color' ? null : maps?.[next]
    carrySelection(next === 'color' ? doc : (map?.proxy(channelDef(channelOf[next])) ?? null))
    setSurface(next)
  }

  function setValue(slot: 'primary' | 'secondary', color: Rgba): void {
    if (!channel) return
    const id = channel.id
    const value = color[3] === 0 ? channel.neutral : Math.min(channel.max, color[0])
    setChannelValues((all) => ({ ...all, [id]: { ...all[id], [slot]: value } }))
  }

  function generate(action: GenerateAction): void {
    const map = maps?.normal
    if (!map || !doc) return
    settle()
    const grid = mapGrid(map)
    const commands: Array<Command | null> = []
    if (action !== 'fromHeight')
      commands.push(generateHeight(map, doc.composite, grid, generator.height))
    if (action !== 'height') {
      commands.push(
        generateFromHeight(
          map,
          grid,
          generator.normals,
          generator.withOcclusion ? generator.occlusion : null,
          doc.composite
        )
      )
    }
    history.push(combine(commands))
    refresh()
  }

  function applyMaterial(): void {
    const map = maps?.specular
    if (!map || !doc) return
    settle()
    history.push(
      applyMaterialPreset(map, doc.composite, material, editDoc?.selection?.mask ?? null)
    )
    refresh()
  }

  function close(): void {
    if (
      modified &&
      !window.confirm(tr('Ci sono modifiche non salvate: andranno perse. Chiudere?'))
    ) {
      return
    }
    if (modified) void window.api.invoke('draft:discard', target.path)
    onClose()
  }

  const canTest = doc !== null && source !== null
  /** Opens the test screen on the texture as it is now (unsaved work included). */
  function test(): void {
    if (!doc || !source) return
    settle()
    onTest({
      canvas: tallCanvases?.lower ?? source,
      ...(tallCanvases && tallUrls
        ? { extras: [{ url: tallUrls.upper, canvas: tallCanvases.upper }] }
        : {}),
      // An animation the editor cannot handle keeps playing from the file.
      animation: tallCanvases ? null : animationNote ? undefined : animation,
      pixels: doc.composite,
      maps: liveMaps,
      modified
    })
  }

  useCommands([
    {
      id: 'editor:save',
      label: tr('Salva la texture'),
      menu: 'File',
      area: 'Disegna',
      keys: 'Ctrl S',
      enabled: canSave && modified && !saving,
      why: canSave ? tr('Nessuna modifica da salvare') : tr('Pack in sola lettura'),
      run: () => void save()
    },
    { id: 'editor:close', label: tr('Chiudi l’editor'), menu: 'File', area: 'Disegna', run: close },
    {
      id: 'editor:undo',
      label: tr('Annulla'),
      menu: 'Modifica',
      area: 'Disegna',
      keys: 'Ctrl Z',
      // While moving pasted pixels, undo cancels the move.
      enabled: history.canUndo || editDoc?.floating != null,
      why: tr('Niente da annullare'),
      run: undo
    },
    {
      id: 'editor:redo',
      label: tr('Ripeti'),
      menu: 'Modifica',
      area: 'Disegna',
      keys: 'Ctrl Y',
      enabled: history.canRedo,
      why: tr('Niente da ripetere'),
      run: redo
    },
    {
      id: 'editor:test',
      label: tr('Prova la texture'),
      menu: 'Visualizza',
      area: 'Prova',
      enabled: canTest,
      run: test
    },
    // Effetti = painting the LabPBR maps of this texture (the shell's Effetti tab).
    ...(maps && !isMapFile && !tallCanvases
      ? [
          {
            id: 'editor:effects',
            label: tr('Mappe PBR: rilievo _n e materiale _s'),
            menu: 'Mappe PBR',
            area: 'Effetti',
            enabled: surface === 'color',
            why: tr('Stai già dipingendo una mappa'),
            run: () =>
              changeSurface(maps.normal?.existed || !maps.specular?.existed ? 'normal' : 'specular')
          },
          {
            id: 'editor:color',
            label: tr('Torna ai colori della texture'),
            menu: 'Mappe PBR',
            area: 'Disegna',
            enabled: surface !== 'color',
            why: tr('Stai già dipingendo i colori'),
            run: () => changeSurface('color')
          }
        ]
      : []),
    {
      id: 'editor:beginner',
      label: tr('Modalità Principiante'),
      menu: 'Visualizza',
      area: 'Disegna',
      enabled: mode !== 'beginner',
      why: tr('Già attiva'),
      run: () => changeMode('beginner')
    },
    {
      id: 'editor:pro',
      label: tr('Modalità Pro'),
      menu: 'Visualizza',
      area: 'Disegna',
      enabled: mode !== 'pro',
      why: tr('Già attiva'),
      run: () => changeMode('pro')
    }
  ])

  const paintedPath =
    surface === 'normal' ? normalPath : surface === 'specular' ? specularPath : target.path
  /** Opens the file in the external editor; unsaved work is saved first (it would not see it). */
  async function openExternal(): Promise<void> {
    setOpenError(null)
    if (modified && !(await save())) return
    const result = await window.api.invoke('texture:openExternal', paintedPath)
    if (!result.ok) setOpenError(result.error)
  }

  /** Throws the unsaved work away and loads the files as they are on disk now. */
  function reloadFromDisk(): void {
    void window.api.invoke('draft:discard', target.path)
    setExternalChange(null)
    onSwitch(reloadedTarget(target, [target.path, normalPath, specularPath]))
  }

  return (
    <section className="editor">
      <header className="editor-header">
        <div>
          <strong>{target.name}</strong>
          <span className="muted small"> {target.path}</span>
          {doc && (
            <span className="badge">
              {doc.width}×{doc.height}
            </span>
          )}
          {modified && (
            <span className="badge unsaved" title={tr('Ci sono modifiche non salvate (Ctrl+S)')}>
              <Glyph name="dot" />
              {tr('modificata')}
            </span>
          )}
          {saving && <span className="badge">{tr('Salvataggio…')}</span>}
          {!modified && savedOnce && (
            <span className="success small">{tr('Salvata nel pack')}</span>
          )}
          {loaded.status === 'ready' && loaded.reducedFrom16Bit && (
            <span
              className="badge"
              title={tr(
                'Il file originale ha canali a 16 bit: salvando diventa a 8 bit, come le texture vanilla.'
              )}
            >
              {tr('16 bit')} <Glyph name="arrowRight" /> {tr('8 bit')}
            </span>
          )}
          {target.readOnly && (
            <span className="badge" title={tr('I pack .zip si aprono in sola lettura.')}>
              {tr('sola lettura')}
            </span>
          )}
        </div>
        <div className="row">
          {pro && (
            <label
              className="inline-check small"
              title={tr('Mostra consigli e avvisi anche in modalità Pro')}
            >
              <input
                type="checkbox"
                checked={proTips}
                onChange={(event) => setProTips(event.target.checked)}
              />
              {tr('Consigli')}
            </label>
          )}
          {saveError && <span className="field-error small">{saveError}</span>}
          {openError && <span className="field-error small">{openError}</span>}
          {!target.readOnly && (
            <button
              type="button"
              title={tr(
                'Apre {0} in {1} (Impostazioni, editor esterno). Quando lì salvi, qui si ricarica da sola.',
                paintedPath.slice(paintedPath.lastIndexOf('/') + 1),
                externalEditor ? editorName(externalEditor) : tr('il programma predefinito')
              )}
              data-external-editor=""
              onClick={() => void openExternal()}
            >
              <Glyph icon={NAV_ICONS.pencil} />
              {externalEditor ? editorName(externalEditor) : tr('Apri fuori')}
            </button>
          )}
          {externalChange && (
            <span className="external-change small" role="alert">
              {tr(
                '{0} è cambiato fuori da PackForge.',
                externalChange.slice(externalChange.lastIndexOf('/') + 1)
              )}{' '}
              <button type="button" className="small-button" onClick={reloadFromDisk}>
                {tr('Ricarica dal file')}
              </button>{' '}
              <button
                type="button"
                className="small-button"
                title={tr('Salvando, la tua versione sostituirà quella sul disco')}
                onClick={() => setExternalChange(null)}
              >
                {tr('Tieni le mie modifiche')}
              </button>
            </span>
          )}
          {doc && source && (
            <button
              type="button"
              title={tr(
                'Guarda la texture come apparirà nel gioco: scene, distanza, confronto con vanilla'
              )}
              onClick={test}
            >
              <Glyph icon={NAV_ICONS.cube} />
              {tr('Prova')}
            </button>
          )}
          <button type="button" onClick={close}>
            {tr('Chiudi editor')}
          </button>
        </div>
      </header>
      {draftOffer && (
        <div className="draft-banner" role="status">
          <span>
            {tr(
              'Trovata una bozza non salvata di questa texture ({0}).',
              formatTime(draftOffer.savedAt)
            )}
          </span>
          <button type="button" className="primary" onClick={restoreDraft}>
            {tr('Ripristina')}
          </button>
          <button type="button" onClick={discardDraft}>
            {tr('Scarta')}
          </button>
        </div>
      )}
      {blockTextures.length > 1 && (
        <div className="face-tabs" role="tablist" aria-label={tr('Texture del blocco')}>
          <span className="muted small">{tr('Texture del blocco:')}</span>
          {blockTextures.map((path) => {
            const inPack = target.sources.pack.files.has(path)
            const name = path.slice(path.lastIndexOf('/') + 1, -'.png'.length)
            return (
              <button
                key={path}
                type="button"
                role="tab"
                aria-selected={path === target.path}
                className={path === target.path ? 'tab active' : inPack ? 'tab' : 'tab missing'}
                title={inPack ? path : tr('{0} — non è ancora nel pack: clicca per crearla', path)}
                disabled={target.readOnly && !inPack}
                onClick={() => {
                  if (inPack) return void switchTo(path)
                  setCreatingFrom(null)
                  setCreatingPath(path)
                }}
              >
                {inPack ? name : `+ ${name}`}
              </button>
            )
          })}
        </div>
      )}
      <GrowthTabs
        stages={growthStages}
        current={target.path}
        sources={target.sources}
        readOnly={target.readOnly}
        onOpen={(path) => void switchTo(path)}
        onCreate={(path, previous) => {
          // The copy is read from the file: save first when it is this texture.
          if (previous === target.path && modified) {
            void saveFirst(tr('Salvare le modifiche prima di copiarle nel nuovo stadio?')).then(
              (ok) => {
                if (!ok) return
                setCreatingFrom(previous)
                setCreatingPath(path)
              }
            )
            return
          }
          setCreatingFrom(previous)
          setCreatingPath(path)
        }}
      />
      {halves && (
        <div className="face-tabs" data-testid="tall-mode">
          <span className="muted small">
            <Glyph name="leaf" />
            {tr('Pianta alta:')}
          </span>
          {(
            [
              [
                true,
                tr('Pianta intera'),
                tr('Le due metà come una sola tela: sopra la parte alta, sotto quella bassa')
              ],
              [
                false,
                tr('Solo questa metà'),
                tr('Per le mappe _n/_s o un’animazione di una sola metà')
              ]
            ] as const
          ).map(([whole, label, hint]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={wholePlant === whole}
              className={wholePlant === whole ? 'tab active' : 'tab'}
              title={hint}
              onClick={() => {
                if (wholePlant === whole) return
                // The editor reloads in the other view: only once the work is on disk.
                void saveFirst(tr('Salvare le modifiche prima di cambiare vista?')).then(
                  (ok) => ok && setWholePlant(whole)
                )
              }}
            >
              {label}
            </button>
          ))}
          {tall && (
            <span className="muted small">
              {tr(
                'Sopra: {0}, sotto: {1}',
                tall.upper.slice(tall.upper.lastIndexOf('/') + 1),
                tall.lower.slice(tall.lower.lastIndexOf('/') + 1)
              )}
            </span>
          )}
        </div>
      )}
      {maps && !isMapFile && !tallCanvases && (
        <MapTabs
          surface={surface}
          channel={channel?.id ?? null}
          maps={(['normal', 'specular'] as const).map((kind) => ({
            kind,
            error: loaded.status === 'ready' ? (loaded.mapErrors[kind] ?? null) : null,
            existed: maps[kind]?.existed ?? false,
            dirty: maps[kind]?.dirty ?? false
          }))}
          onSurface={changeSurface}
          onChannel={(id) => {
            if (surface === 'color') return
            settle()
            carrySelection(editedMap?.proxy(channelDef(id)) ?? null)
            setChannelOf((all) => ({ ...all, [surface]: id }))
          }}
        />
      )}
      {comparing && reference && (
        <CompareDialog
          name={target.name}
          mine={comparing}
          vanilla={reference.pixels}
          onClose={() => setComparing(null)}
        />
      )}
      {showShortcuts && <ShortcutsHelp pro={pro} onClose={() => setShowShortcuts(false)} />}
      {plantShape && crop && (
        <PlantShapeDialog
          block={crop}
          path={target.path}
          stages={growthStages}
          sources={target.sources}
          onClose={() => setPlantShape(false)}
          onDone={(written) => {
            setPlantShape(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {item3dOpen && item3d && (
        <Item3dDialog
          path={target.path}
          plan={item3d}
          sources={target.sources}
          range={formats}
          onClose={() => setItem3dOpen(false)}
          onDone={(written) => {
            setItem3dOpen(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {shapesOpen && (
        <BlockShapesDialog
          path={target.path}
          sources={target.sources}
          onClose={() => setShapesOpen(false)}
          onDone={(written) => {
            setShapesOpen(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {displayOpen && (
        <DisplayDialog
          path={target.path}
          sources={target.sources}
          range={formats}
          canvas={source}
          revision={revision}
          onClose={() => setDisplayOpen(false)}
          onSaved={(written) => {
            setDisplayOpen(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {popOutOpen && (
        <PopOutDialog
          path={target.path}
          sources={target.sources}
          onClose={() => setPopOutOpen(false)}
          onDone={(written) => {
            setPopOutOpen(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {definitionOpen && item3d && (
        <DefinitionDialog
          path={target.path}
          plan={item3d}
          sources={target.sources}
          range={formats}
          canvas={source}
          revision={revision}
          onClose={() => setDefinitionOpen(false)}
          onSaved={(written) => {
            setDefinitionOpen(false)
            onSwitch(withWritten(target, written))
          }}
        />
      )}
      {nameVariantOpen && item3d && (
        <NameVariantDialog
          path={target.path}
          plan={item3d}
          sources={target.sources}
          range={formats}
          onClose={() => setNameVariantOpen(false)}
          onCreated={(path, written) => {
            setNameVariantOpen(false)
            void switchTo(path, written)
          }}
        />
      )}
      {randomVariants && (
        <RandomVariantsDialog
          path={target.path}
          sources={target.sources}
          onClose={() => setRandomVariants(false)}
          onCreated={(path, written) => {
            setRandomVariants(false)
            void switchTo(path, written)
          }}
        />
      )}
      {creatingPath && (
        <NewTextureDialog
          request={{
            folder: creatingPath.slice(0, creatingPath.lastIndexOf('/')),
            name: creatingPath.slice(creatingPath.lastIndexOf('/') + 1, -'.png'.length),
            fromVanilla: true,
            copyFrom: creatingFrom
              ? {
                  path: creatingFrom,
                  url: assetUrl(
                    target.sources.pack.base,
                    creatingFrom,
                    target.sources.pack.versions[creatingFrom] ?? 0
                  )
                }
              : null
          }}
          existing={target.sources.pack.files}
          onCancel={() => setCreatingPath(null)}
          onCreated={(path) => {
            setCreatingPath(null)
            void switchTo(path)
          }}
        />
      )}
      {loaded.status === 'loading' && <p className="muted">{tr('Caricamento della texture…')}</p>}
      {loaded.status === 'error' && <p className="field-error">{loaded.message}</p>}
      {doc && source && editDoc && editSource && (
        <div className={bigPreview ? 'editor-main big-preview' : 'editor-main'}>
          <EditorTools
            tool={tools.tool}
            onTool={(tool) => {
              if (tool !== 'move' && tool !== 'select') settle()
              setTools((t) => ({ ...t, tool }))
            }}
            pixelPerfect={tools.pixelPerfect}
            onPixelPerfect={(pixelPerfect) => setTools((t) => ({ ...t, pixelPerfect }))}
            brushSize={tools.brushSize}
            onBrushSize={(brushSize) => setTools((t) => ({ ...t, brushSize }))}
            shapeFilled={tools.shapeFilled}
            onShapeFilled={(shapeFilled) => setTools((t) => ({ ...t, shapeFilled }))}
            mirror={tools.mirror}
            onMirror={(mirror) => setTools((t) => ({ ...t, mirror }))}
            selection={{
              active: doc.selection !== null,
              floating: doc.floating !== null,
              canPaste
            }}
            onSelectionAction={runSelectionAction}
            {...(channel && values
              ? {
                  valuePanel: (
                    <>
                      <ValuePanel
                        channel={channel}
                        values={values}
                        onValues={(next) =>
                          setChannelValues((all) => ({ ...all, [channel.id]: next }))
                        }
                        rampStep={rampStep}
                        onRampStep={setRampStep}
                        overlay={colorOverlay}
                        onOverlay={setColorOverlay}
                        readOnly={target.readOnly}
                      />
                      {/* Effetti: how the maps look under a LabPBR shader (canvas: the right docks). */}
                      <EffectsControls
                        effects={effects}
                        onChange={(change) => setEffects((old) => ({ ...old, ...change }))}
                        hasNormal={maps?.normal?.existed === true || maps?.normal?.dirty === true}
                      />
                    </>
                  )
                }
              : {})}
            rampPanel={
              <>
                <RampPanel
                  ramp={ramp}
                  options={rampOptions}
                  onOptions={setRampOptions}
                  locked={rampBase !== null}
                  pro={pro}
                  custom={customRamp !== null}
                  onEditShade={editRamp}
                  onAddShade={() => setCustomRamp(toRamp([...ramp, tools.primary]))}
                  onResetAuto={() => setCustomRamp(null)}
                  onFromPrimary={() => {
                    setCustomRamp(null)
                    setRampBase(tools.primary)
                  }}
                  onPick={(slot, color) => {
                    lockRamp()
                    setTools((t) => ({ ...t, [slot]: color }))
                  }}
                />
                {pro && (
                  <PalettesPanel
                    palettes={palettes}
                    onChange={savePalettes}
                    ramp={ramp}
                    textureColors={palette.map((entry) => entry.color)}
                    onPick={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
                    onUseAsRamp={(colors) => setCustomRamp(toRamp(colors))}
                  />
                )}
              </>
            }
            fillMode={tools.fillMode}
            onFillMode={(fillMode) => setTools((t) => ({ ...t, fillMode }))}
            noiseStrength={tools.noiseStrength}
            onNoiseStrength={(noiseStrength) => setTools((t) => ({ ...t, noiseStrength }))}
            primary={tools.primary}
            secondary={tools.secondary}
            onColor={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            recent={recent}
            palette={palette}
            onSwap={swap}
            disabled={target.readOnly || (channel !== null && !channel.paintable)}
            pro={pro}
            showTips={showTips}
          />
          <div className="editor-center">
            <PixelCanvas
              doc={editDoc}
              source={editSource}
              tools={
                target.readOnly || (channel && !channel.paintable)
                  ? null
                  : channel && values
                    ? {
                        ...tools,
                        primary: gray(values.primary),
                        secondary: gray(values.secondary),
                        ramp: grayRamp(values.primary, rampStep, channel.max),
                        eraseColor: gray(channel.neutral)
                      }
                    : { ...tools, ramp }
              }
              revision={revision}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={undo}
              onRedo={redo}
              onPainted={() => refresh(channel?.id ?? 'color')}
              onCommit={commit}
              trace={
                channel
                  ? colorOverlay > 0
                    ? { canvas: source, opacity: colorOverlay / 100 }
                    : null
                  : reference && traceOpacity > 0
                    ? { canvas: reference.canvas, opacity: traceOpacity / 100 }
                    : null
              }
              onPickColor={(slot, color) =>
                channel ? setValue(slot, color) : setTools((t) => ({ ...t, [slot]: color }))
              }
              onColorUsed={(color) => !channel && setRecent((list) => addRecent(list, color))}
              onRampUsed={() => !channel && lockRamp()}
              {...(channel
                ? { describePixel: (color: Rgba) => describeValue(channel, color) }
                : {})}
              onSettle={settle}
              onShowShortcuts={() => setShowShortcuts(true)}
              onionY={
                !channel && animation && onionSkin && doc.view.y0 > 0
                  ? doc.view.y0 - animation.frameHeight
                  : null
              }
              suspended={suspended}
              {...(target.readOnly
                ? {}
                : { onTiling: (tiling: boolean) => setTools((t) => ({ ...t, tiling })) })}
            />
            {animation && !channel && (
              <FramesPanel
                doc={doc}
                source={source}
                revision={revision}
                settings={animation}
                current={Math.floor(doc.view.y0 / animation.frameHeight)}
                onionSkin={onionSkin}
                readOnly={target.readOnly}
                onSelect={(index) => {
                  settle()
                  doc.setFrameView(animation.frameHeight, index)
                  refresh()
                }}
                onFrameOp={(op) => {
                  settle()
                  const { frameHeight } = animation
                  // The maps follow (Iris animates them from their own strip): same frames, at
                  // their resolution. Maps of another shape are left alone (the validator says so).
                  const followers = Object.values(maps ?? {}).flatMap((map) => {
                    const height = (frameHeight * map.height) / doc.height
                    const sameShape = map.width * doc.height === map.height * doc.width
                    return sameShape && Number.isInteger(height) ? [{ map, height }] : []
                  })
                  const albedo = doc.frameOp(frameHeight, op)
                  if (!albedo) return
                  history.push(
                    combine([
                      albedo,
                      ...followers.map(({ map, height }) => map.frameOp(height, op))
                    ])
                  )
                  doc.setFrameView(frameHeight, frameAfter(op))
                  refresh()
                }}
                onSettings={(settings) => {
                  changeAnimation(settings)
                  animationDirty.current = true
                  setModified(true)
                }}
                onOnionSkin={setOnionSkin}
                onStopAnimating={() => {
                  settle()
                  // An undo step like the frame operations (Ctrl+Z brings the animation back).
                  const previous = animation
                  const apply = (settings: AnimationSettings | null): void => {
                    changeAnimation(settings)
                    animationDirty.current = true
                    doc.setFrameView(settings ? settings.frameHeight : null, 0)
                  }
                  apply(null)
                  history.push({ undo: () => apply(previous), redo: () => apply(null) })
                  refresh()
                }}
              />
            )}
            {!animation && animationNote && (
              <p className="muted small animation-note">
                {tr('Animazione non modificabile qui: {0}', animationNote)}
              </p>
            )}
            {!animation &&
              !animationNote &&
              pro &&
              !target.readOnly &&
              !channel &&
              !tallCanvases && (
                <button
                  type="button"
                  className="small-button animate-button"
                  title={tr(
                    "Trasforma la texture in un'animazione: i frame stanno uno sotto l'altro nel PNG"
                  )}
                  onClick={() => {
                    settle()
                    // A strip without mcmeta already holds square frames; else one frame.
                    const frameHeight = doc.height % doc.width === 0 ? doc.width : doc.height
                    const settings = { frameHeight, frametime: 4, interpolate: false }
                    changeAnimation(settings)
                    animationDirty.current = true
                    doc.setFrameView(frameHeight, 0)
                    refresh()
                    setModified(true)
                  }}
                >
                  <Glyph name="film" />
                  {tr('Anima questa texture')}
                </button>
              )}
          </div>
          <div className="editor-side">
            {guiTextureKind(target.path) && (
              <GuiPreview
                key={target.path}
                path={target.path}
                canvas={source}
                revision={revision}
                mcmeta={mcmetaOnDisk.value}
                sources={target.sources}
                readOnly={target.readOnly}
                onSaveMcmeta={async (content) => {
                  const written = await window.api.invoke(
                    'texture:saveMcmeta',
                    target.path,
                    content
                  )
                  if (!written.ok) return false
                  setMcmetaOnDisk((current) => ({
                    value: content === null ? null : (JSON.parse(content) as unknown),
                    frames: current.frames
                  }))
                  return true
                }}
              />
            )}
            {armorPreviewRole(target.path) && (
              <ArmorPreview
                key={target.path}
                path={target.path}
                canvas={source}
                revision={revision}
                sources={target.sources}
              />
            )}
            {isItemTexture(target.path) && (
              <ItemPreview
                key={target.path}
                path={target.path}
                canvas={source}
                revision={revision}
                sources={target.sources}
                range={formats}
              />
            )}
            {!guiTextureKind(target.path) &&
              !armorPreviewRole(target.path) &&
              !isItemTexture(target.path) && (
                <>
                  <button
                    type="button"
                    className="small-button preview-size"
                    aria-pressed={bigPreview}
                    onClick={() => setBigPreview((big) => !big)}
                    title={tr('Allarga la colonna di destra per vedere meglio il blocco')}
                  >
                    <Glyph name="resize" />
                    {bigPreview ? tr('3D piccolo') : tr('3D grande')}
                  </button>
                  <PreviewPanel
                    target={previewTarget}
                    sources={target.sources}
                    live={
                      tallCanvases && tallUrls
                        ? {
                            url: tallUrls.lower,
                            canvas: tallCanvases.lower,
                            revision,
                            maps: null,
                            animation: null,
                            extras: [{ url: tallUrls.upper, canvas: tallCanvases.upper }]
                          }
                        : {
                            url: target.url,
                            canvas: source,
                            revision,
                            maps: liveMaps,
                            // An animation the editor cannot handle keeps playing from the file.
                            ...(animationNote ? {} : { animation })
                          }
                    }
                    initialShape="block"
                    onBlockTextures={setBlockTextures}
                    onGrowthStages={setGrowthStages}
                    effects={surface === 'color' ? null : effects}
                  />
                </>
              )}
            {surface === 'normal' && maps?.normal && !target.readOnly && (
              <GeneratorPanel
                settings={generator}
                onSettings={setGenerator}
                onGenerate={generate}
                heightFromColor={
                  maps.normal.width === doc.width && maps.normal.height === doc.height
                    ? null
                    : tr(
                        'L’altezza dai colori serve una mappa grande come la texture ({0}×{1} contro {2}×{3}).',
                        maps.normal.width,
                        maps.normal.height,
                        doc.width,
                        doc.height
                      )
                }
              />
            )}
            {surface === 'specular' && maps?.specular && !target.readOnly && (
              <MaterialPanel
                options={material}
                onOptions={setMaterial}
                onApply={applyMaterial}
                disabled={
                  maps.specular.width === doc.width && maps.specular.height === doc.height
                    ? null
                    : tr(
                        'I materiali dai colori servono una mappa grande come la texture ({0}×{1} contro {2}×{3}).',
                        maps.specular.width,
                        maps.specular.height,
                        doc.width,
                        doc.height
                      )
                }
                selectionActive={editDoc?.selection != null}
                accentCount={
                  material.preset === 'ore'
                    ? accentMask(
                        doc.composite.data,
                        doc.width * doc.height,
                        material.accentThreshold
                      ).reduce((sum, v) => sum + v, 0)
                    : null
                }
                cropCounts={
                  material.preset === 'crop'
                    ? cropParts(doc.composite.data, doc.width * doc.height).reduce(
                        (counts, part) => {
                          if (part > 0) counts[part - 1]! += 1
                          return counts
                        },
                        [0, 0, 0]
                      )
                    : null
                }
              />
            )}
            {!channel && (pro || doc.layers.length > 1) && !target.readOnly && (
              <LayersPanel
                doc={doc}
                onCommand={commit}
                onBeforeChange={settle}
                onSelect={(id) => {
                  doc.setActive(id)
                  setRevision((r) => r + 1)
                }}
              />
            )}
            {showTips && <AdvicePanel advice={advice} />}

            <ReferencePanel
              url={referenceUrl}
              label={vanilla ? '' : tr('jar non caricato')}
              traceOpacity={traceOpacity}
              onTraceOpacity={setTraceOpacity}
              onLoaded={setReference}
              onPick={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            />
            {reference && (
              <button
                type="button"
                className="small-button"
                title={tr(
                  'La tua texture accanto a quella vanilla, con i pixel cambiati evidenziati'
                )}
                onClick={() => {
                  const { width, height, data } = doc.composite
                  setComparing({ width, height, data: new Uint8ClampedArray(data) })
                }}
              >
                <Glyph name="swap" />
                {tr('Confronta con vanilla')}
              </button>
            )}
            {target.path.includes('/textures/block/') && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr(
                  'Più versioni di questa texture: il gioco ne sceglie una a caso per ogni blocco'
                )}
                onClick={() =>
                  void saveFirst(tr('Salvare le modifiche prima di creare le varianti?')).then(
                    (ok) => ok && setRandomVariants(true)
                  )
                }
              >
                <Glyph name="dice" />
                {tr('Varianti casuali')}
              </button>
            )}
            {target.path.includes('/textures/block/') && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Alcuni colori escono dal blocco in 3D (minerali, gemme)')}
                onClick={() =>
                  void saveFirst(tr('Salvare le modifiche prima di creare il modello?')).then(
                    (ok) => ok && setPopOutOpen(true)
                  )
                }
              >
                <Glyph name="up" />
                {tr('Pixel in rilievo')}
              </button>
            )}
            {presetsFor(target.path).length > 0 && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Forme 3D pronte per questo blocco (foglie folte, erba sui lati, scala)')}
                onClick={() =>
                  void saveFirst(tr('Salvare le modifiche prima di creare il modello?')).then(
                    (ok) => ok && setShapesOpen(true)
                  )
                }
              >
                <Glyph icon={NAV_ICONS.cube} />
                {tr('Forme 3D')}
              </button>
            )}
            {item3d && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Piatto nell’inventario, 3D in mano: un modello fatto dai pixel')}
                onClick={() =>
                  void saveFirst(tr('Salvare le modifiche prima di creare il modello 3D?')).then(
                    (ok) => ok && setItem3dOpen(true)
                  )
                }
              >
                <Glyph icon={NAV_ICONS.cube} />
                {tr('3D in mano')}
              </button>
            )}
            {item3d && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Una texture diversa quando l’oggetto ha un certo nome nell’incudine')}
                onClick={() =>
                  void saveFirst(tr('Salvare le modifiche prima di creare la variante?')).then(
                    (ok) => ok && setNameVariantOpen(true)
                  )
                }
              >
                <Glyph name="book" />
                {tr('Variante per nome')}
              </button>
            )}
            {item3d && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Il file items/ che dice al gioco cosa disegnare e quando')}
                onClick={() => setDefinitionOpen(true)}
              >
                <Glyph name="gear" />
                {tr('Definizione')}
              </button>
            )}
            {isItemTexture(target.path) && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Come sta l’oggetto in mano, nell’inventario, a terra, in testa')}
                onClick={() => setDisplayOpen(true)}
              >
                <Glyph name="resize" />
                {tr('Posizioni')}
              </button>
            )}
            {crop && !target.readOnly && (
              <button
                type="button"
                className="small-button"
                title={tr('Il modello 3D della pianta: vanilla, croce, cespuglio o alta')}
                onClick={() =>
                  // The editor reloads with the models / halves it writes: save first.
                  void saveFirst(tr('Salvare le modifiche prima di cambiare la forma?')).then(
                    (ok) => ok && setPlantShape(true)
                  )
                }
              >
                <Glyph name="leaf" />
                {tr('Forma della pianta')}
              </button>
            )}
            <TilingPreview
              source={source}
              revision={revision}
              region={{ y: doc.view.y0, height: doc.view.y1 - doc.view.y0 + 1 }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Decodes the PNG exactly (shared codec, straight alpha) into a one-layer document, plus a canvas
 * used only to draw the composite scaled: a 2D canvas stores premultiplied alpha, so it is never
 * read back.
 */
/** True when an mcmeta object has an "animation" section. */
function isAnimated(mcmeta: unknown): boolean {
  return typeof mcmeta === 'object' && mcmeta !== null && 'animation' in mcmeta
}

async function loadDocument(
  url: string,
  mcmetaUrl: string | null,
  mapUrls: Record<MapKind, string | null>,
  /** A whole tall plant: its two halves stacked into one image (upper on top). */
  tall: { upper: string; lower: string } | null = null
): Promise<{
  tall: { split: number; upper: HTMLCanvasElement; lower: HTMLCanvasElement } | null
  doc: EditorDocument
  source: HTMLCanvasElement
  reducedFrom16Bit: boolean
  mcmeta: unknown
  maps: Partial<Record<MapKind, EditedMap>>
  mapErrors: Partial<Record<MapKind, string>>
  channelCanvases: Partial<Record<ChannelId, HTMLCanvasElement>>
}> {
  // no-store: the file may have been saved moments ago under the same versioned URL.
  const read = async (from: string) => {
    const response = await fetch(from, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
    if (!decoded.ok) throw new Error(decoded.error)
    return decoded.image
  }
  let image = await read(tall ? tall.lower : url)
  let halves: { split: number; upper: HTMLCanvasElement; lower: HTMLCanvasElement } | null = null
  if (tall) {
    const upper = await read(tall.upper)
    const stacked = stackHalves(upper, image)
    if (!stacked) throw new Error(tr('le due metà della pianta hanno larghezze diverse.'))
    const canvasOf = (w: number, h: number): HTMLCanvasElement => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      return canvas
    }
    halves = {
      split: upper.height,
      upper: canvasOf(upper.width, upper.height),
      lower: canvasOf(image.width, image.height)
    }
    image = { ...stacked, reducedFrom16Bit: image.reducedFrom16Bit || upper.reducedFrom16Bit }
  }
  const { width, height, data, reducedFrom16Bit } = image
  const doc = new EditorDocument(width, height, data)
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  putBuffer(source, doc.composite)
  let mcmeta: unknown = null
  if (mcmetaUrl) {
    try {
      const meta = await fetch(mcmetaUrl, { cache: 'no-store' })
      if (meta.ok) mcmeta = await meta.json()
    } catch {
      // Unreadable mcmeta: the texture still opens; the 3D preview reports the problem.
    }
  }
  const maps: Partial<Record<MapKind, EditedMap>> = {}
  const mapErrors: Partial<Record<MapKind, string>> = {}
  for (const kind of ['normal', 'specular'] as const) {
    const mapUrl = mapUrls[kind]
    if (!mapUrl) {
      maps[kind] = new EditedMap(kind, false, newMap(kind, width, height))
      continue
    }
    try {
      const answer = await fetch(mapUrl, { cache: 'no-store' })
      if (!answer.ok) throw new Error(`HTTP ${answer.status}`)
      const map = decodePng(new Uint8Array(await answer.arrayBuffer()))
      if (!map.ok) throw new Error(map.error)
      const { width: w, height: h, data: bytes } = map.image
      maps[kind] = new EditedMap(kind, true, {
        width: w,
        height: h,
        data: new Uint8ClampedArray(bytes)
      })
    } catch (error) {
      mapErrors[kind] = error instanceof Error ? error.message : String(error)
    }
  }
  // Every channel gets its proxy and display canvas now: undo steps keep pointing at them.
  const channelCanvases: Partial<Record<ChannelId, HTMLCanvasElement>> = {}
  for (const def of CHANNELS) {
    const map = maps[def.map]
    if (!map) continue
    const canvas = document.createElement('canvas')
    canvas.width = map.width
    canvas.height = map.height
    putBuffer(canvas, map.proxy(def).composite)
    channelCanvases[def.id] = canvas
  }
  if (halves) {
    const rows = halves.split * width * 4
    const all = doc.composite.data
    putBuffer(halves.upper, { width, height: halves.split, data: all.subarray(0, rows) })
    putBuffer(halves.lower, { width, height: height - halves.split, data: all.subarray(rows) })
  }
  return { doc, source, reducedFrom16Bit, mcmeta, maps, mapErrors, channelCanvases, tall: halves }
}

/** "Aseprite" for C:\…\Aseprite.exe. */
function editorName(path: string): string {
  return path.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '')
}

/** A pack file's pixels as they are on disk now (null when it is gone or unreadable). */
async function readFromDisk(packBase: string, path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(assetUrl(packBase, path, Date.now()))
    if (!response.ok) return null
    const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
    return decoded.ok ? new Uint8Array(decoded.image.data) : null
  } catch {
    return null
  }
}

/** The same texture with fresh URLs, so the files are read again from disk. */
function reloadedTarget(current: EditorTarget, paths: readonly string[]): EditorTarget {
  const stamp = Date.now()
  const { pack } = current.sources
  const versions = { ...pack.versions }
  for (const path of [...paths, `${current.path}.mcmeta`]) versions[path] = stamp
  return targetFor(
    { ...current, sources: { ...current.sources, pack: { ...pack, versions } } },
    current.path
  )
}

/** The same texture, seeing files a dialog just wrote (new or changed: their URLs change). */
function withWritten(current: EditorTarget, written: readonly string[]): EditorTarget {
  const stamp = Date.now()
  const { pack } = current.sources
  const versions = { ...pack.versions }
  for (const path of written) if (path !== current.path) versions[path] = stamp
  return targetFor(
    { ...current, sources: { ...current.sources, pack: { ...pack, versions } } },
    current.path,
    written
  )
}

function sameBytes(a: Uint8Array, b: Uint8Array | null): boolean {
  if (!b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Status-bar text of a hovered channel pixel. */
function describeValue(channel: ChannelDef, color: Rgba): string {
  if (channel.id === 'normal') return tr('Normale X {0}, Y {1}', color[0], color[1])
  return `${channel.label}: ${color[3] === 0 ? channel.neutral : color[0]}`
}

/** Editor target for another PNG of the same pack (the file may have just been created). */
function targetFor(
  current: EditorTarget,
  path: string,
  added: readonly string[] = []
): EditorTarget {
  const { pack } = current.sources
  const mcmeta = `${path}.mcmeta`
  const files =
    pack.files.has(path) && added.every((file) => pack.files.has(file))
      ? pack.files
      : new Set([...pack.files, path, ...added])
  return {
    ...current,
    path,
    textureKey: path.slice(0, -'.png'.length),
    name: path.slice(path.lastIndexOf('/') + 1, -'.png'.length),
    url: assetUrl(current.packBase, path, pack.versions[path] ?? 0),
    mcmetaUrl: pack.files.has(mcmeta)
      ? assetUrl(current.packBase, mcmeta, pack.versions[mcmeta] ?? 0)
      : null,
    sources: { ...current.sources, pack: { ...pack, files } }
  }
}

/** Keyboard shortcut → selection action (Pro mode). */
function selectionShortcut(event: KeyboardEvent): SelectionAction | null {
  const key = event.key.toLowerCase()
  if (event.ctrlKey || event.metaKey) {
    const byKey: Record<string, SelectionAction> = {
      a: 'all',
      d: 'none',
      c: 'copy',
      x: 'cut',
      v: 'paste'
    }
    return byKey[key] ?? null
  }
  if (event.shiftKey && !event.altKey) {
    if (key === 'h') return 'flipH'
    if (key === 'v') return 'flipV'
    if (key === 'r') return 'rotate'
  }
  if (event.key === 'Delete' || event.key === 'Backspace') return 'delete'
  if (event.key === 'Enter') return 'drop'
  if (event.key === 'Escape') return 'cancel'
  return null
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? tr('data sconosciuta')
    : date.toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })
}
