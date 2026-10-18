import { useEffect, useRef } from 'react'
import { assetUrl } from '../../shared/ipc'
import { mapKindOf } from '../../shared/labpbr'
import type { TextureEntry } from '../../shared/textures'

interface TextureGridProps {
  textures: readonly TextureEntry[]
  assetBase: string
  /** Albedo or map path to highlight and scroll into view. */
  highlight: string | null
  showFolder: boolean
  /** Extra badge for textures whose key is in `keys` (e.g. "also in the pack"). */
  marker?: TextureMarker | undefined
  /** Key of the texture shown in the 3D preview. */
  selectedKey?: string | null
  onSelect?: (texture: TextureEntry) => void
  /** Double-click: open the texture in the editor. */
  onOpen?: ((texture: TextureEntry) => void) | undefined
  /** File version for cache-busting (bumped when the file changes on disk). */
  versionOf?: ((path: string) => number) | undefined
}

export interface TextureMarker {
  keys: ReadonlySet<string>
  label: string
  title: string
}

export function TextureGrid({
  textures,
  assetBase,
  highlight,
  showFolder,
  marker,
  selectedKey = null,
  onSelect,
  onOpen,
  versionOf
}: TextureGridProps): React.JSX.Element {
  const highlightRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  return (
    <ul className="texture-grid">
      {textures.map((texture) => {
        const isHighlighted =
          highlight !== null &&
          [texture.albedo, texture.normal, texture.specular, texture.mcmeta].includes(highlight)
        return (
          <li key={texture.key} ref={isHighlighted ? highlightRef : undefined}>
            <button
              type="button"
              className={`texture-tile${isHighlighted ? ' highlighted' : ''}${selectedKey === texture.key ? ' selected' : ''}`}
              title={texture.albedo}
              aria-pressed={selectedKey === texture.key}
              onClick={() => onSelect?.(texture)}
              onDoubleClick={onOpen && (() => onOpen(texture))}
            >
              <img
                src={assetUrl(assetBase, texture.albedo, versionOf?.(texture.albedo) ?? 0)}
                alt={texture.name}
                loading="lazy"
                decoding="async"
              />
              <span className="texture-name">{texture.name}</span>
              {showFolder && <span className="texture-folder">{texture.folder}</span>}
              <span className="texture-badges">
                {mapKindOf(texture.albedo) ? (
                  // A map whose texture is not in the pack (the game's): no maps of its own.
                  <span
                    className="map-badge on"
                    title="Mappa LabPBR di una texture che il pack non contiene (di solito quella del gioco): si modifica come immagine"
                  >
                    mappa
                  </span>
                ) : (
                  <>
                    <Badge on={texture.normal !== null} label="N" title="Mappa normal (_n)" />
                    <Badge on={texture.specular !== null} label="S" title="Mappa specular (_s)" />
                  </>
                )}
                {marker?.keys.has(texture.key) && (
                  <span className="map-badge marker" title={marker.title}>
                    {marker.label}
                  </span>
                )}
                {texture.mcmeta && (
                  <span
                    className="map-badge on"
                    title="Ha un file .png.mcmeta (animazione o altre proprietà)"
                  >
                    M
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Badge({
  on,
  label,
  title
}: {
  on: boolean
  label: string
  title: string
}): React.JSX.Element {
  return (
    <span className={`map-badge${on ? ' on' : ''}`} title={on ? title : `${title}: mancante`}>
      {label}
    </span>
  )
}
