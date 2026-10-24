import { useState } from 'react'
import { MAX_PALETTE_COLORS, MAX_PALETTES, type SavedPalette } from '../../shared/settings'
import { toHex8 } from './color'
import { fromHex, type Rgba } from './pixels'
import { tr } from '../../shared/i18n'
import { exportPalette, importPalette, type PaletteFormat } from '../../shared/paletteFiles'

/**
 * Saved palettes (kept in the settings, shared by every texture): save the ramp or the texture's
 * colors, pick from a palette (left → primary, right → secondary), use one as the shading ramp,
 * import palette files (.gpl, .hex, .txt) and export them next to the pack's exports.
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
  const [format, setFormat] = useState<PaletteFormat>('gpl')
  const [message, setMessage] = useState<string | null>(null)
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
      <div className="row palette-files">
        <label
          className="small-button palette-import"
          title={tr('.gpl (GIMP, Aseprite, Krita), .hex (Lospec), .txt (Paint.NET)')}
        >
          {tr('Importa…')}
          <input
            type="file"
            accept=".gpl,.hex,.txt"
            disabled={full}
            aria-label={tr('Importa una palette')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void file.text().then((text) => {
                const imported = importPalette(text, file.name)
                if (!imported.ok) {
                  setMessage(imported.error)
                  return
                }
                onChange([...palettes, imported.palette])
                setMessage(
                  imported.skipped > 0
                    ? tr(
                        '«{0}» importata, colori saltati: {1}.',
                        imported.palette.name,
                        imported.skipped
                      )
                    : tr('«{0}» importata.', imported.palette.name)
                )
              })
            }}
          />
        </label>
        <label className="small select-field">
          {tr('Esporta come')}{' '}
          <select
            value={format}
            aria-label={tr('Formato di esportazione')}
            onChange={(event) => setFormat(event.target.value as PaletteFormat)}
          >
            <option value="gpl">.gpl</option>
            <option value="hex">.hex</option>
            <option value="txt">.txt</option>
          </select>
        </label>
      </div>
      {message && (
        <p className="muted small" data-testid="palette-message">
          {message}
        </p>
      )}
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
                  aria-label={tr('Esporta {0}', palette.name)}
                  title={tr('Salva la palette come file, nella cartella delle esportazioni')}
                  onClick={() =>
                    void window.api
                      .invoke(
                        'palette:export',
                        palette.name,
                        format,
                        exportPalette(palette, format)
                      )
                      .then((result) =>
                        setMessage(result.ok ? tr('Salvata in {0}', result.path) : result.error)
                      )
                  }
                >
                  {tr('Esporta')}
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
