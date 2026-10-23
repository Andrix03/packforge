import { useState } from 'react'
import { MAX_PALETTE_COLORS, MAX_PALETTES, type SavedPalette } from '../../shared/settings'
import { toHex8 } from './color'
import { fromHex, type Rgba } from './pixels'
import { tr } from '../../shared/i18n'

/**
 * Saved palettes (kept in the settings, shared by every texture): save the ramp or the texture's
 * colors, pick from a palette (left → primary, right → secondary), use one as the shading ramp.
 */
export function PalettesPanel({
  palettes,
  onChange,
  ramp,
  textureColors,
  onPick,
  onUseAsRamp
}: {
  palettes: readonly SavedPalette[]
  onChange: (palettes: SavedPalette[]) => void
  ramp: readonly Rgba[]
  textureColors: readonly Rgba[]
  onPick: (slot: 'primary' | 'secondary', color: Rgba) => void
  onUseAsRamp: (colors: Rgba[]) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const full = palettes.length >= MAX_PALETTES

  function save(colors: readonly Rgba[]): void {
    if (full || colors.length === 0) return
    const palette: SavedPalette = {
      name: name.trim() || tr('Palette {0}', palettes.length + 1),
      colors: colors.slice(0, MAX_PALETTE_COLORS).map(toHex8)
    }
    onChange([...palettes, palette])
    setName('')
  }

  const pick = (event: React.MouseEvent, color: Rgba): void => {
    event.preventDefault()
    onPick(event.button === 2 ? 'secondary' : 'primary', color)
  }

  return (
    <section className="palettes-panel">
      <h3 className="panel-title">
        {tr('Palette salvate')}{' '}
        <span className="muted">
          ({palettes.length}/{MAX_PALETTES})
        </span>
      </h3>
      <input
        className="palette-name"
        placeholder={tr('Nome della nuova palette')}
        value={name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="row">
        <button
          type="button"
          className="small-button"
          disabled={full}
          onClick={() => save(ramp)}
          title={tr('Salva le tonalità della rampa come palette')}
        >
          {tr('Salva rampa')}
        </button>
        <button
          type="button"
          className="small-button"
          disabled={full || textureColors.length === 0}
          onClick={() => save(textureColors)}
          title={tr('Salva i colori usati dalla texture')}
        >
          {tr('Salva colori texture')}
        </button>
      </div>
      {palettes.map((palette, index) => {
        const colors = palette.colors
          .map((hex) => fromHex(hex))
          .filter((c): c is Rgba => c !== null)
        return (
          <div key={`${palette.name}-${index}`} className="saved-palette">
            <div className="row">
              <span className="small">{palette.name}</span>
              <span className="row">
                <button
                  type="button"
                  className="small-button"
                  onClick={() => onUseAsRamp(colors)}
                  title={tr('Usa questi colori come rampa per Ombra e Rumore')}
                >
                  {tr('Usa come rampa')}
                </button>
                <button
                  type="button"
                  className="small-button"
                  aria-label={tr('Elimina {0}', palette.name)}
                  title={tr('Elimina la palette')}
                  onClick={() => onChange(palettes.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </span>
            </div>
            <div className="ramp-swatches">
              {colors.map((color, i) => (
                <button
                  key={i}
                  type="button"
                  className="ramp-swatch"
                  style={{
                    background: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`
                  }}
                  title={tr('Sinistro: primario, destro: secondario')}
                  onClick={(event) => pick(event, color)}
                  onContextMenu={(event) => pick(event, color)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}
