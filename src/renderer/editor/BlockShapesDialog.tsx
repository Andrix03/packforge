import { useState } from 'react'
import { modelPath } from '../../shared/blockModel'
import {
  bushyLeavesModel,
  grassSidesModel,
  ladder3dModel,
  presetsFor,
  type BlockPresetId
} from '../../shared/blockPresets'
import { tr } from '../../shared/i18n'
import { backupBefore } from '../packs/backup'
import { errorMessage, loadPng } from '../packs/packFetch'
import type { AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'

const SPREADS = [2, 3, 4] as const

/**
 * Ready-made 3D shapes for the open block texture (bushy leaves, grass on the sides, a 3D
 * ladder), written as the block's model in the pack: vanilla JSON, no mods.
 */
export function BlockShapesDialog({
  path,
  sources,
  onClose,
  onDone
}: {
  path: string
  sources: AssetSources
  onClose: () => void
  onDone: (written: string[]) => void
}): React.JSX.Element {
  const presets = presetsFor(path)
  const [chosen, setChosen] = useState<BlockPresetId>(presets[0]?.id ?? 'bushy_leaves')
  const [spread, setSpread] = useState<number>(3)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEscape(onClose, !working)
  const preset = presets.find((p) => p.id === chosen) ?? presets[0]
  const texture = path.replace(/^assets\/([^/]+)\/textures\/(.+)\.png$/, '$1:$2')

  const apply = useSingleFlight(async (): Promise<void> => {
    if (!preset) return
    const file = modelPath(preset.model)
    setWorking(true)
    setError(null)
    try {
      let model: Record<string, unknown>
      if (preset.id === 'bushy_leaves') model = bushyLeavesModel(texture, spread)
      else if (preset.id === 'grass_sides') model = grassSidesModel()
      else {
        const image = await loadPng(sources.pack, path)
        const result = ladder3dModel(
          image.width,
          image.height,
          (x, y) => image.data[(y * image.width + x) * 4 + 3]! > 0,
          texture
        )
        if (!result.ok) throw new Error(result.error)
        model = result.model
      }
      if (
        sources.pack.files.has(file) &&
        !(await backupBefore(tr('Forma 3D: {0}', preset.label), [file]))
      ) {
        setWorking(false)
        return
      }
      const saved = await window.api.invoke(
        'model:saveJson',
        file,
        `${JSON.stringify(model, null, 2)}\n`
      )
      if (!saved.ok) throw new Error(saved.error)
      onDone([file])
    } catch (e) {
      setError(errorMessage(e))
    }
    setWorking(false)
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form"
        role="dialog"
        aria-label={tr('Forme 3D')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph icon={NAV_ICONS.cube} />
          {tr('Forme 3D')}
        </h2>
        <p className="muted small">
          {tr(
            'Forme pronte, come i pack 3D più scaricati: scritte come modello del blocco nel pack, funzionano senza mod.'
          )}
        </p>
        <div className="tabs small-tabs wrap" role="radiogroup" aria-label={tr('Forma')}>
          {presets.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen === option.id}
              className={chosen === option.id ? 'tab active' : 'tab'}
              onClick={() => setChosen(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {preset && <p className="small">{preset.hint}</p>}
        {preset?.id === 'bushy_leaves' && (
          <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Quanto escono')}>
            {SPREADS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={spread === value}
                className={spread === value ? 'tab active' : 'tab'}
                onClick={() => setSpread(value)}
              >
                {tr('{0} pixel', value)}
              </button>
            ))}
          </div>
        )}
        {preset && <p className="muted small path">{modelPath(preset.model)}</p>}
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!preset || working}
            onClick={() => apply()}
          >
            {tr('Scrivi il modello')}
          </button>
          <button type="button" onClick={onClose} disabled={working}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
