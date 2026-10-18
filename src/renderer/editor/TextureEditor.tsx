import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl, type TextureDraft } from '../../shared/ipc'
import { decodePng } from '../../shared/pngCodec'
import type { EditorMode } from '../../shared/settings'
import { NewTextureDialog } from '../packs/NewTextureDialog'
import type { AssetSources } from '../preview/modelSource'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import type { TestLive } from '../testscreen/TestScreen'
import { analyzeTexture } from './advice'
import { AdvicePanel } from './AdvicePanel'
import { isTyping, putBuffer } from './canvasDraw'
import { addRecent, toRamp, usedColors } from './color'
import { PalettesPanel } from './PalettesPanel'
import type { SavedPalette } from '../../shared/settings'
import { EditorDocument } from './document'
import { FramesPanel } from './FramesPanel'
import { ShortcutsHelp } from './ShortcutsHelp'
import { animationFromMcmeta, buildMcmeta, mapMcmeta, type AnimationSettings } from './frames'
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
import { DEFAULT_EFFECTS } from '../preview/effects'
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
  normalsAreFlat
} from './mapGenerate'
import { MaterialPanel } from './MaterialPanel'
import { accentMask, DEFAULT_MATERIAL, type MaterialOptions } from '../../shared/materialPresets'

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
  suspended = false
}: {
  target: EditorTarget
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  /** Bumped on every change of the document, to redraw and refresh the previews. */
  const [revision, setRevision] = useState(0)
  const [recent, setRecent] = useState<Rgba[]>([])
  const [mode, setMode] = useState<EditorMode>('beginner')
  const [proTips, setProTips] = useState(false)
  const [reference, setReference] = useState<LoadedReference | null>(null)
  /** Textures of the block shown in the 3D preview, for the face tabs. */
  const [blockTextures, setBlockTextures] = useState<string[]>([])
  const [creatingPath, setCreatingPath] = useState<string | null>(null)
  /** A draft found for this texture, waiting for the user to restore or discard it. */
  const [draftOffer, setDraftOffer] = useState<TextureDraft | null>(null)
  const [traceOpacity, setTraceOpacity] = useState(0)
  /** Animation being edited (null = plain texture). */
  const [animation, setAnimation] = useState<AnimationSettings | null>(null)
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
  const [surface, setSurface] = useState<Surface>('color')
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
  const palette = useMemo(
    () => (editDoc ? usedColors(editDoc.composite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editDoc, revision]
  )
  const advice = useMemo(
    () => (doc && showTips && surface === 'color' ? analyzeTexture(doc.composite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, revision, showTips, surface]
  )
  const previewTarget = useMemo<PreviewTarget>(
    () => ({
      key: `editor|${target.url}`,
      textureKey: target.textureKey,
      url: target.url,
      mcmetaUrl: target.mcmetaUrl,
      name: target.name,
      sourceLabel: 'In modifica'
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

  /** Recomposites, updates the display canvas and re-renders everything that depends on it. */
  const refresh = useCallback(() => {
    if (!doc || !source) return
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
    doc.recomposite()
    putBuffer(source, doc.composite)
    let floating = doc.floating !== null
    for (const map of Object.values(maps ?? {})) map.sync()
    for (const def of CHANNELS) {
      const canvas = channelCanvases?.[def.id]
      const map = maps?.[def.map]
      if (!canvas || !map) continue
      const proxy = map.proxy(def)
      putBuffer(canvas, proxy.composite)
      floating ||= proxy.floating !== null
    }
    setRevision((r) => r + 1)
    // A moved piece not yet put down, or new animation settings, are changes too.
    setModified(history.modified || floating || animationDirty.current)
  }, [doc, source, history, animation, maps, channelCanvases])

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
              generator.withOcclusion ? generator.occlusion : null
            )
          : null
      history.push(follow ? combine([command, follow]) : command)
      refresh()
    },
    [history, refresh, autoRegenerate, editedMap, mapGrid, generator]
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
    loadDocument(target.url, target.mcmetaUrl, { normal: normalUrl, specular: specularUrl }).then(
      (value) => {
        if (cancelled) return
        setLoaded({ status: 'ready', ...value })
        savedAlbedo.current = new Uint8Array(value.doc.composite.data)
        // Regenerating normals while painting is safe only when there is nothing hand-made.
        const normal = value.maps.normal
        setGenerator((g) => ({
          ...g,
          auto: normal !== undefined && (!normal.existed || normalsAreFlat(normal.buffer))
        }))
        const read = animationFromMcmeta(value.mcmeta, value.doc.width, value.doc.height)
        if (read.kind === 'editable') {
          setAnimation(read.settings)
          setMcmetaOnDisk({ value: value.mcmeta, frames: read.frameCount })
          value.doc.setFrameView(read.settings.frameHeight, 0)
        } else {
          setMcmetaOnDisk({ value: value.mcmeta, frames: 1 })
          if (read.kind === 'unsupported') setAnimationNote(read.reason)
        }
      },
      (error: unknown) =>
        !cancelled &&
        setLoaded({
          status: 'error',
          message:
            'Impossibile leggere la texture: ' +
            (error instanceof Error ? error.message : String(error))
        })
    )
    return () => {
      cancelled = true
    }
  }, [target.url, target.mcmetaUrl, normalUrl, specularUrl])

  const canSave = doc !== null && !target.readOnly
  const save = useCallback(async () => {
    if (!doc || target.readOnly || saving) return
    settle()
    const version = history.version
    setSaving(true)
    setSaveError(null)
    try {
      // The composite = all visible layers flattened. A copy: the user may keep painting.
      const rgba = new Uint8Array(doc.composite.data)
      if (!sameBytes(rgba, savedAlbedo.current)) {
        const result = await window.api.invoke(
          'texture:save',
          target.path,
          doc.width,
          doc.height,
          rgba
        )
        if (!result.ok) {
          setSaveError(result.error)
          return
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
          return
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
          return
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
            return
          }
        }
      }
      // If something changed during the save, the file holds the older state: stay modified.
      if (history.version === version) history.markSaved()
      setModified(history.modified)
      setSavedOnce(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [doc, maps, target, saving, history, settle, animation, mcmetaOnDisk])

  useEffect(() => {
    if (suspended) return
    const onKeyDown = (event: KeyboardEvent): void => {
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

  // Autosave a draft (the flattened image) a moment after the last change; drop it once the file
  // is saved (or the changes were undone back to the file).
  useEffect(() => {
    if (!doc || target.readOnly || draftOffer) return
    const timer = window.setTimeout(() => {
      if (modified) {
        const rgba = new Uint8Array(doc.composite.data)
        void window.api.invoke('draft:save', target.path, doc.width, doc.height, rgba)
      } else {
        void window.api.invoke('draft:discard', target.path)
      }
    }, DRAFT_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [doc, revision, modified, target.path, target.readOnly, draftOffer])

  function restoreDraft(): void {
    const draft = draftOffer
    setDraftOffer(null)
    if (!draft || !doc) return
    // One undoable step on the active layer (a freshly opened texture has only one).
    const layer = doc.active.pixels
    commit(pixelCommand(layer, replacePixels(layer, draft.rgba)))
  }

  function discardDraft(): void {
    setDraftOffer(null)
    void window.api.invoke('draft:discard', target.path)
  }

  async function switchTo(path: string): Promise<void> {
    if (path === target.path) return
    if (modified) {
      if (!window.confirm('Ci sono modifiche non salvate. Salvarle prima di cambiare texture?'))
        return
      await save()
      if (history.modified) return
    }
    onSwitch(targetFor(target, path))
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
          generator.withOcclusion ? generator.occlusion : null
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
    if (modified && !window.confirm('Ci sono modifiche non salvate: andranno perse. Chiudere?')) {
      return
    }
    if (modified) void window.api.invoke('draft:discard', target.path)
    onClose()
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
            <span className="badge unsaved" title="Ci sono modifiche non salvate (Ctrl+S)">
              ● modificata
            </span>
          )}
          {!modified && savedOnce && <span className="success small">Salvata nel pack</span>}
          {loaded.status === 'ready' && loaded.reducedFrom16Bit && (
            <span
              className="badge"
              title="Il file originale ha canali a 16 bit: salvando diventa a 8 bit, come le texture vanilla."
            >
              16 bit → 8 bit
            </span>
          )}
          {target.readOnly && (
            <span className="badge" title="I pack .zip si aprono in sola lettura.">
              sola lettura
            </span>
          )}
        </div>
        <div className="row">
          <div className="tabs small-tabs" role="radiogroup" aria-label="Modalità dell'editor">
            {(
              [
                ['beginner', 'Principiante', 'Meno strumenti, consigli e avvisi'],
                ['pro', 'Pro', 'Tutti gli strumenti e le opzioni']
              ] as const
            ).map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                className={mode === value ? 'tab active' : 'tab'}
                title={title}
                onClick={() => changeMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {pro && (
            <label
              className="inline-check small"
              title="Mostra consigli e avvisi anche in modalità Pro"
            >
              <input
                type="checkbox"
                checked={proTips}
                onChange={(event) => setProTips(event.target.checked)}
              />
              Consigli
            </label>
          )}
          {saveError && <span className="field-error small">{saveError}</span>}
          {canSave && (
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={saving || !modified}
              title="Salva la texture nel pack (Ctrl+S)"
            >
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
          )}
          {doc && source && (
            <button
              type="button"
              title="Guarda la texture come apparirà nel gioco: scene, distanza, confronto con vanilla"
              onClick={() => {
                settle()
                onTest({
                  canvas: source,
                  // An animation the editor cannot handle keeps playing from the file.
                  animation: animationNote ? undefined : animation,
                  pixels: doc.composite,
                  maps: liveMaps,
                  modified
                })
              }}
            >
              🧪 Prova
            </button>
          )}
          <button type="button" onClick={close}>
            Chiudi editor
          </button>
        </div>
      </header>
      {draftOffer && (
        <div className="draft-banner" role="status">
          <span>
            Trovata una bozza non salvata di questa texture ({formatTime(draftOffer.savedAt)}).
          </span>
          <button type="button" className="primary" onClick={restoreDraft}>
            Ripristina
          </button>
          <button type="button" onClick={discardDraft}>
            Scarta
          </button>
        </div>
      )}
      {blockTextures.length > 1 && (
        <div className="face-tabs" role="tablist" aria-label="Texture del blocco">
          <span className="muted small">Texture del blocco:</span>
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
                title={inPack ? path : `${path} — non è ancora nel pack: clicca per crearla`}
                disabled={target.readOnly && !inPack}
                onClick={() => (inPack ? void switchTo(path) : setCreatingPath(path))}
              >
                {inPack ? name : `+ ${name}`}
              </button>
            )
          })}
        </div>
      )}
      {maps && !isMapFile && (
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
      {showShortcuts && <ShortcutsHelp pro={pro} onClose={() => setShowShortcuts(false)} />}
      {creatingPath && (
        <NewTextureDialog
          request={{
            folder: creatingPath.slice(0, creatingPath.lastIndexOf('/')),
            name: creatingPath.slice(creatingPath.lastIndexOf('/') + 1, -'.png'.length),
            fromVanilla: true
          }}
          existing={target.sources.pack.files}
          onCancel={() => setCreatingPath(null)}
          onCreated={(path) => {
            setCreatingPath(null)
            void switchTo(path)
          }}
        />
      )}
      {loaded.status === 'loading' && <p className="muted">Caricamento della texture…</p>}
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
              onPainted={refresh}
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
                onCommand={(command, select) => {
                  settle()
                  history.push(command)
                  doc.setFrameView(animation.frameHeight, select)
                  refresh()
                }}
                onSettings={(settings) => {
                  setAnimation(settings)
                  animationDirty.current = true
                  setModified(true)
                }}
                onOnionSkin={setOnionSkin}
                onStopAnimating={() => {
                  setAnimation(null)
                  animationDirty.current = true
                  doc.setFrameView(null)
                  refresh()
                  setModified(true)
                }}
              />
            )}
            {!animation && animationNote && (
              <p className="muted small animation-note">
                Animazione non modificabile qui: {animationNote}
              </p>
            )}
            {!animation && !animationNote && pro && !target.readOnly && !channel && (
              <button
                type="button"
                className="small-button animate-button"
                title="Trasforma la texture in un'animazione: i frame stanno uno sotto l'altro nel PNG"
                onClick={() => {
                  settle()
                  // A strip without mcmeta already holds square frames; else one frame.
                  const frameHeight = doc.height % doc.width === 0 ? doc.width : doc.height
                  const settings = { frameHeight, frametime: 4, interpolate: false }
                  setAnimation(settings)
                  animationDirty.current = true
                  doc.setFrameView(frameHeight, 0)
                  refresh()
                  setModified(true)
                }}
              >
                🎞 Anima questa texture
              </button>
            )}
          </div>
          <div className="editor-side">
            <button
              type="button"
              className="small-button preview-size"
              aria-pressed={bigPreview}
              onClick={() => setBigPreview((big) => !big)}
              title="Allarga la colonna di destra per vedere meglio il blocco"
            >
              {bigPreview ? '⤡ 3D piccolo' : '⤢ 3D grande'}
            </button>
            <PreviewPanel
              target={previewTarget}
              sources={target.sources}
              live={{
                url: target.url,
                canvas: source,
                revision,
                maps: liveMaps,
                // An animation the editor cannot handle keeps playing from the file.
                ...(animationNote ? {} : { animation })
              }}
              initialShape="block"
              onBlockTextures={setBlockTextures}
              effects={surface === 'color' ? null : DEFAULT_EFFECTS}
            />
            {surface === 'normal' && maps?.normal && !target.readOnly && (
              <GeneratorPanel
                settings={generator}
                onSettings={setGenerator}
                onGenerate={generate}
                heightFromColor={
                  maps.normal.width === doc.width && maps.normal.height === doc.height
                    ? null
                    : `L’altezza dai colori serve una mappa grande come la texture (${maps.normal.width}×${maps.normal.height} contro ${doc.width}×${doc.height}).`
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
                    : `I materiali dai colori servono una mappa grande come la texture (${maps.specular.width}×${maps.specular.height} contro ${doc.width}×${doc.height}).`
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
              label={vanilla ? '' : 'jar non caricato'}
              traceOpacity={traceOpacity}
              onTraceOpacity={setTraceOpacity}
              onLoaded={setReference}
              onPick={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            />
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
  mapUrls: Record<MapKind, string | null>
): Promise<{
  doc: EditorDocument
  source: HTMLCanvasElement
  reducedFrom16Bit: boolean
  mcmeta: unknown
  maps: Partial<Record<MapKind, EditedMap>>
  mapErrors: Partial<Record<MapKind, string>>
  channelCanvases: Partial<Record<ChannelId, HTMLCanvasElement>>
}> {
  // no-store: the file may have been saved moments ago under the same versioned URL.
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
  if (!decoded.ok) throw new Error(decoded.error)
  const { width, height, data, reducedFrom16Bit } = decoded.image
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
  return { doc, source, reducedFrom16Bit, mcmeta, maps, mapErrors, channelCanvases }
}

function sameBytes(a: Uint8Array, b: Uint8Array | null): boolean {
  if (!b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Status-bar text of a hovered channel pixel. */
function describeValue(channel: ChannelDef, color: Rgba): string {
  if (channel.id === 'normal') return `Normale X ${color[0]} · Y ${color[1]}`
  return `${channel.label}: ${color[3] === 0 ? channel.neutral : color[0]}`
}

/** Editor target for another PNG of the same pack (the file may have just been created). */
function targetFor(current: EditorTarget, path: string): EditorTarget {
  const { pack } = current.sources
  const mcmeta = `${path}.mcmeta`
  const files = pack.files.has(path) ? pack.files : new Set([...pack.files, path])
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
    ? 'data sconosciuta'
    : date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
}
