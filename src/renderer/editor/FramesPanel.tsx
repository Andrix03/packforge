import { useEffect, useRef, useState } from 'react'
import { TICKS_PER_SECOND } from '../../shared/animation'
import type { EditorDocument } from './document'
import { MAX_FRAMES, MAX_FRAMETIME, type AnimationSettings } from './frames'
import type { Command } from './history'

const THUMB = 48
const MS_PER_TICK = 1000 / TICKS_PER_SECOND

/**
 * Animation timeline: one thumbnail per frame (click to edit it), frame operations, timing,
 * onion skin and a looping preview. Frames are stacked vertically in the PNG (Minecraft layout).
 */
export function FramesPanel({
  doc,
  source,
  revision,
  settings,
  current,
  onionSkin,
  readOnly,
  onSelect,
  onCommand,
  onSettings,
  onOnionSkin,
  onStopAnimating
}: {
  doc: EditorDocument
  /** Display copy of the whole strip. */
  source: HTMLCanvasElement
  revision: number
  settings: AnimationSettings
  current: number
  onionSkin: boolean
  readOnly: boolean
  onSelect: (frame: number) => void
  /** A frame operation (already applied) and the frame to show afterwards. */
  onCommand: (command: Command | null, select: number) => void
  onSettings: (settings: AnimationSettings) => void
  onOnionSkin: (on: boolean) => void
  /** Turns a single-frame animation back into a plain texture. */
  onStopAnimating: () => void
}): React.JSX.Element {
  const { frameHeight } = settings
  const count = Math.max(1, Math.round(doc.height / frameHeight))
  const [playing, setPlaying] = useState(false)
  const thumbs = useRef<Array<HTMLCanvasElement | null>>([])
  const previewRef = useRef<HTMLCanvasElement>(null)

  // Thumbnails follow every change of the strip.
  useEffect(() => {
    thumbs.current.forEach((canvas, index) => {
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      context.clearRect(0, 0, THUMB, THUMB)
      context.imageSmoothingEnabled = false
      const scale = Math.min(THUMB / doc.width, THUMB / frameHeight)
      const w = doc.width * scale
      const h = frameHeight * scale
      context.drawImage(
        source,
        0,
        index * frameHeight,
        doc.width,
        frameHeight,
        (THUMB - w) / 2,
        (THUMB - h) / 2,
        w,
        h
      )
    })
  }, [source, revision, count, frameHeight, doc.width])

  // Looping preview at the real speed (with the interpolation blend, like the game).
  useEffect(() => {
    if (!playing) return
    const canvas = previewRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const start = performance.now()
    let frame = requestAnimationFrame(function draw(now) {
      const ticks = (now - start) / MS_PER_TICK
      const position = (ticks / settings.frametime) % count
      const index = Math.floor(position)
      const next = (index + 1) % count
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingEnabled = false
      const drawFrame = (i: number, alpha: number): void => {
        context.globalAlpha = alpha
        context.drawImage(
          source,
          0,
          i * frameHeight,
          doc.width,
          frameHeight,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }
      drawFrame(index, 1)
      if (settings.interpolate) drawFrame(next, position - index)
      context.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, settings, count, frameHeight, source, doc.width])

  const seconds = ((count * settings.frametime) / TICKS_PER_SECOND).toFixed(2)

  return (
    <section className="card frames-panel">
      <div className="row frames-header">
        <strong className="small">Animazione</strong>
        <span className="muted small">
          {count} frame · {seconds} s per giro
        </span>
        <label className="inline-check small" title="Durata di ogni frame (20 tick = 1 secondo)">
          Tick per frame
          <input
            type="number"
            min={1}
            max={MAX_FRAMETIME}
            value={settings.frametime}
            disabled={readOnly}
            onChange={(event) => {
              const value = Math.round(Number(event.target.value))
              if (value >= 1 && value <= MAX_FRAMETIME)
                onSettings({ ...settings, frametime: value })
            }}
          />
        </label>
        <label className="inline-check small" title="Sfuma gradualmente da un frame al successivo">
          <input
            type="checkbox"
            checked={settings.interpolate}
            disabled={readOnly}
            onChange={(event) => onSettings({ ...settings, interpolate: event.target.checked })}
          />
          Interpola
        </label>
        <label className="inline-check small" title="Mostra il frame precedente in trasparenza">
          <input
            type="checkbox"
            checked={onionSkin}
            onChange={(event) => onOnionSkin(event.target.checked)}
          />
          Onion skin
        </label>
        <button type="button" className="small-button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '■ Ferma' : '▶ Anteprima'}
        </button>
      </div>
      <div className="frames-row">
        {playing && (
          <canvas ref={previewRef} width={96} height={96} className="frames-preview checker" />
        )}
        <ol className="frame-list">
          {Array.from({ length: count }, (_, index) => (
            <li key={index}>
              <button
                type="button"
                className={index === current ? 'frame-thumb active' : 'frame-thumb'}
                onClick={() => onSelect(index)}
                title={`Frame ${index + 1}`}
              >
                <canvas
                  ref={(canvas) => {
                    thumbs.current[index] = canvas
                  }}
                  width={THUMB}
                  height={THUMB}
                  className="checker"
                />
                <span className="small muted">{index + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      {!readOnly && (
        <div className="frame-actions">
          <button
            type="button"
            disabled={count >= MAX_FRAMES}
            onClick={() =>
              onCommand(doc.insertFrame(frameHeight, current + 1, current), current + 1)
            }
            title="Copia il frame attuale subito dopo"
          >
            Duplica
          </button>
          <button
            type="button"
            disabled={count >= MAX_FRAMES}
            onClick={() => onCommand(doc.insertFrame(frameHeight, current + 1, null), current + 1)}
            title="Nuovo frame vuoto dopo quello attuale"
          >
            + Vuoto
          </button>
          <button
            type="button"
            disabled={current === 0}
            onClick={() => onCommand(doc.moveFrame(frameHeight, current, -1), current - 1)}
            title="Sposta prima"
            aria-label="Sposta il frame prima"
          >
            ◀
          </button>
          <button
            type="button"
            disabled={current === count - 1}
            onClick={() => onCommand(doc.moveFrame(frameHeight, current, 1), current + 1)}
            title="Sposta dopo"
            aria-label="Sposta il frame dopo"
          >
            ▶
          </button>
          <button
            type="button"
            disabled={count === 1}
            onClick={() =>
              onCommand(doc.removeFrame(frameHeight, current), Math.max(0, current - 1))
            }
            title="Elimina il frame attuale"
          >
            Elimina
          </button>
          {count === 1 && (
            <button type="button" onClick={onStopAnimating} title="Torna a una texture normale">
              Togli animazione
            </button>
          )}
        </div>
      )}
    </section>
  )
}
