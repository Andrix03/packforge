import { useCallback, useEffect, useMemo, useState } from 'react'
import { assetUrl, type TextureDraft } from '../../shared/ipc'
import { decodePng } from '../../shared/pngCodec'
import type { EditorMode } from '../../shared/settings'
import { NewTextureDialog } from '../packs/NewTextureDialog'
import type { AssetSources } from '../preview/modelSource'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import { analyzeTexture } from './advice'
import { AdvicePanel } from './AdvicePanel'
import { isTyping, putBuffer } from './canvasDraw'
import { addRecent, usedColors } from './color'
import { EditorDocument } from './document'
import { EditorTools, type SelectionAction } from './EditorTools'
import type { Floating } from './selection'
import * as selectionActions from './selectionActions'
import { History, pixelCommand, type Command } from './history'
import { LayersPanel } from './LayersPanel'
import { replacePixels, TRANSPARENT, type Rgba } from './pixels'
import { PixelCanvas, type Tools } from './PixelCanvas'
import { DEFAULT_RAMP, generateRamp, type RampOptions } from './ramp'
import { RampPanel } from './RampPanel'
import { ReferencePanel, type LoadedReference } from './ReferencePanel'
import { TilingPreview } from './TilingPreview'
import { maxBrushSize, toolByShortcut, visibleTools } from './tools'

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
      doc: EditorDocument
      /** Display copy of the composite (also the live 3D texture). */
      source: HTMLCanvasElement
      reducedFrom16Bit: boolean
    }

/** Copied pixels, shared by every texture opened in this session. */
let clipboard: Floating | null = null

/** Autosave delay after the last change. */
const DRAFT_DELAY_MS = 2000

export function TextureEditor({
  target,
  onClose,
  onSwitch
}: {
  target: EditorTarget
  onClose: () => void
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
  const vanilla = target.sources.vanilla
  const referenceUrl = vanilla?.files.has(target.path) ? assetUrl(vanilla.base, target.path) : null
  const pro = mode === 'pro'
  const showTips = !pro || proTips
  /** Ramp base color; null = follow the primary color until the ramp is used or picked from. */
  const [rampBase, setRampBase] = useState<Rgba | null>(null)
  const [rampOptions, setRampOptions] = useState<RampOptions>(DEFAULT_RAMP)
  const ramp = useMemo(
    () => generateRamp(rampBase ?? tools.primary, rampOptions),
    [rampBase, tools.primary, rampOptions]
  )
  const lockRamp = (): void => setRampBase((base) => base ?? tools.primary)
  const doc = loaded.status === 'ready' ? loaded.doc : null
  const source = loaded.status === 'ready' ? loaded.source : null
  // The composite is mutated in place: `revision` is what tells us it changed. One pass over the
  // pixels each, cheap even at 64×.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => (doc ? usedColors(doc.composite) : []), [doc, revision])
  const advice = useMemo(
    () => (doc && showTips ? analyzeTexture(doc.composite) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, revision, showTips]
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
  const swap = useCallback(
    () => setTools((t) => ({ ...t, primary: t.secondary, secondary: t.primary })),
    []
  )

  /** Recomposites, updates the display canvas and re-renders everything that depends on it. */
  const refresh = useCallback(() => {
    if (!doc || !source) return
    doc.recomposite()
    putBuffer(source, doc.composite)
    setRevision((r) => r + 1)
    // A moved piece not yet put down is a change too.
    setModified(history.modified || doc.floating !== null)
  }, [doc, source, history])

  const commit = useCallback(
    (command: Command | null) => {
      history.push(command)
      refresh()
    },
    [history, refresh]
  )
  /** Puts down a moved/pasted piece (one undo step) before anything else changes the layer. */
  const settle = useCallback(() => {
    if (doc?.floating) commit(selectionActions.drop(doc))
  }, [doc, commit])
  const undo = useCallback(() => {
    // While moving, Ctrl+Z cancels the move instead of undoing the previous step.
    if (doc?.floating) {
      selectionActions.cancel(doc)
      refresh()
      return
    }
    if (history.undo()) refresh()
  }, [doc, history, refresh])
  const redo = useCallback(() => {
    settle()
    if (history.redo()) refresh()
  }, [history, refresh, settle])
  const [canPaste, setCanPaste] = useState(clipboard !== null)

  const runSelectionAction = useCallback(
    (action: SelectionAction) => {
      if (!doc) return
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
    [doc, commit, refresh]
  )

  useEffect(() => {
    let cancelled = false
    void window.api.invoke('settings:get').then(
      (view) => !cancelled && setMode(view.settings.editorMode),
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [])

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
    loadDocument(target.url).then(
      (value) => !cancelled && setLoaded({ status: 'ready', ...value }),
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
  }, [target.url])

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
      // If something changed during the save, the file holds the older state: stay modified.
      if (history.version === version) history.markSaved()
      setModified(history.modified)
      setSavedOnce(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [doc, target, saving, history, settle])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
        return
      }
      if (isTyping(event)) return
      if (pro) {
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
      else if (event.key === '[' || event.key === ']') {
        const step = event.key === ']' ? 1 : -1
        setTools((t) => ({
          ...t,
          brushSize: Math.min(maxBrushSize(pro), Math.max(1, t.brushSize + step))
        }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [swap, save, pro, runSelectionAction, settle])

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
      {doc && source && (
        <div className="editor-main">
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
            rampPanel={
              <RampPanel
                ramp={ramp}
                options={rampOptions}
                onOptions={setRampOptions}
                locked={rampBase !== null}
                pro={pro}
                onFromPrimary={() => setRampBase(tools.primary)}
                onPick={(slot, color) => {
                  lockRamp()
                  setTools((t) => ({ ...t, [slot]: color }))
                }}
              />
            }
            fillMode={tools.fillMode}
            onFillMode={(fillMode) => setTools((t) => ({ ...t, fillMode }))}
            primary={tools.primary}
            secondary={tools.secondary}
            onColor={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            recent={recent}
            palette={palette}
            onSwap={swap}
            disabled={target.readOnly}
            pro={pro}
            showTips={showTips}
          />
          <PixelCanvas
            doc={doc}
            source={source}
            tools={target.readOnly ? null : { ...tools, ramp }}
            revision={revision}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={undo}
            onRedo={redo}
            onPainted={refresh}
            onCommit={commit}
            trace={
              reference && traceOpacity > 0
                ? { canvas: reference.canvas, opacity: traceOpacity / 100 }
                : null
            }
            onPickColor={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            onColorUsed={(color) => setRecent((list) => addRecent(list, color))}
            onRampUsed={lockRamp}
            onSettle={settle}
          />
          <div className="editor-side">
            {(pro || doc.layers.length > 1) && !target.readOnly && (
              <LayersPanel
                doc={doc}
                onCommand={commit}
                onBeforeChange={settle}
                onSelect={(id) => {
                  doc.setActive(id)
                  setRevision((r) => r + 1)
                }}
                onLiveChange={refresh}
              />
            )}
            {showTips && <AdvicePanel advice={advice} />}
            <PreviewPanel
              target={previewTarget}
              sources={target.sources}
              live={{ url: target.url, canvas: source, revision }}
              initialShape="block"
              onBlockTextures={setBlockTextures}
            />
            <ReferencePanel
              url={referenceUrl}
              label={vanilla ? '' : 'jar non caricato'}
              traceOpacity={traceOpacity}
              onTraceOpacity={setTraceOpacity}
              onLoaded={setReference}
              onPick={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            />
            <TilingPreview source={source} revision={revision} />
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
async function loadDocument(
  url: string
): Promise<{ doc: EditorDocument; source: HTMLCanvasElement; reducedFrom16Bit: boolean }> {
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
  return { doc, source, reducedFrom16Bit }
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
