import { useEffect, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'
import {
  POLYTONE_GROUPS,
  generateColormap,
  polytoneColormapPath,
  polytoneModifier,
  polytoneModifierPath,
  polytoneNameProblem
} from '../../shared/polytone'
import { backupBefore } from './backup'
import { errorMessage, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

type Rgb = [number, number, number]

const toRgb = (hex: string): Rgb => {
  const v = Number.parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * Biome colours with the Polytone mod: a colormap of the pack's own (generated from three
 * colours, then painted in the editor) used by the chosen blocks, spruce and birch leaves
 * included (vanilla gives them a fixed colour). Without the mod the pack looks as before.
 */
export function PolytoneDialog({
  pack,
  onClose,
  onCreated
}: {
  pack: FileSource
  onClose: () => void
  /** The colormap PNG written: opened in the editor. */
  onCreated: (path: string) => void
}): React.JSX.Element {
  const [name, setName] = useState('leaves')
  const [groups, setGroups] = useState<ReadonlySet<string>>(new Set(['leaves']))
  const [hot, setHot] = useState('#c8b43c')
  const [cold, setCold] = useState('#5a8278')
  const [wet, setWet] = useState('#289b28')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEscape(onClose, !working)

  const problem = polytoneNameProblem(name)
  const png = polytoneColormapPath(name)
  const blocks = POLYTONE_GROUPS.filter((g) => groups.has(g.id)).flatMap((g) => g.blocks)
  const exists = pack.files.has(png)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(generateColormap(toRgb(hot), toRgb(cold), toRgb(wet))),
        256,
        256
      ),
      0,
      0
    )
  }, [hot, cold, wet])

  const create = useSingleFlight(async (): Promise<void> => {
    if (problem || blocks.length === 0) return
    const modifiers = blocks.map((b) => polytoneModifierPath(b))
    const replaced = modifiers.filter((p) => pack.files.has(p))
    if (!(await backupBefore(tr('Polytone: {0}', name), replaced))) return
    setWorking(true)
    setError(null)
    try {
      // An existing map is kept as painted; only new ones start from the three colours.
      if (!exists) {
        const pixels = generateColormap(toRgb(hot), toRgb(cold), toRgb(wet))
        const saved = await window.api.invoke('texture:save', png, 256, 256, new Uint8Array(pixels))
        if (!saved.ok) throw new Error(saved.error)
      }
      for (const file of modifiers) {
        const saved = await window.api.invoke(
          'model:saveJson',
          file,
          `${JSON.stringify(polytoneModifier(name), null, 2)}\n`
        )
        if (!saved.ok) throw new Error(`${file}: ${saved.error}`)
      }
      onCreated(png)
    } catch (e) {
      setError(errorMessage(e))
    }
    setWorking(false)
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form polytone-dialog"
        role="dialog"
        aria-label={tr('Colori dei biomi (Polytone)')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="leaf" />
          {tr('Colori dei biomi (Polytone)')}
        </h2>
        <p className="muted small">
          {tr(
            'Con la mod Polytone i blocchi scelti prendono il colore da una colormap del tuo pack, bioma per bioma (anche abete e betulla). Senza la mod il pack resta com’è.'
          )}
        </p>
        <label className="field">
          {tr('Nome della colormap')}
          <input
            value={name}
            maxLength={40}
            aria-label={tr('Nome della colormap')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {problem && <p className="field-error small">{problem}</p>}
        {POLYTONE_GROUPS.map((group) => (
          <label key={group.id} className="checkbox-inline small">
            <input
              type="checkbox"
              checked={groups.has(group.id)}
              onChange={(event) => {
                const next = new Set(groups)
                if (event.target.checked) next.add(group.id)
                else next.delete(group.id)
                setGroups(next)
              }}
            />
            {group.label}
          </label>
        ))}
        <div className="polytone-body">
          <canvas
            ref={ref}
            width={256}
            height={256}
            className="polytone-map sunken"
            aria-hidden="true"
          />
          <div className="polytone-colors">
            {(
              [
                [tr('Caldo e secco'), hot, setHot],
                [tr('Freddo'), cold, setCold],
                [tr('Caldo e piovoso'), wet, setWet]
              ] as const
            ).map(([label, value, set]) => (
              <label key={label} className="row small">
                <input
                  type="color"
                  value={value}
                  aria-label={label}
                  disabled={exists}
                  onChange={(event) => set(event.target.value)}
                />
                {label}
              </label>
            ))}
            {exists && (
              <p className="muted small">{tr('La colormap esiste già: la tengo com’è.')}</p>
            )}
          </div>
        </div>
        <p className="muted small path" data-testid="polytone-plan">
          {png}
          <br />
          {tr('{0} blocchi in polytone/block_modifiers/', blocks.length)}
        </p>
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={problem !== null || blocks.length === 0 || working}
            onClick={() => create()}
          >
            {tr('Crea e disegna la colormap')}
          </button>
          <button type="button" onClick={onClose} disabled={working}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
