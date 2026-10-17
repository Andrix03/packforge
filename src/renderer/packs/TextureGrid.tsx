import { useEffect, useRef } from 'react'
import { encodePackPath } from '../../shared/ipc'
import type { TextureEntry } from '../../shared/textures'

interface TextureGridProps {
  textures: readonly TextureEntry[]
  assetBase: string
  /** Albedo or map path to highlight and scroll into view. */
  highlight: string | null
  showFolder: boolean
  /** Extra badge for textures whose key is in `keys` (e.g. "also in the pack"). */
  marker?: TextureMarker | undefined
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
  marker
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
          <li
            key={texture.key}
            ref={isHighlighted ? highlightRef : undefined}
            className={`texture-tile${isHighlighted ? ' highlighted' : ''}`}
            title={texture.albedo}
          >
            <img
              src={assetBase + encodePackPath(texture.albedo)}
              alt={texture.name}
              loading="lazy"
              decoding="async"
            />
            <span className="texture-name">{texture.name}</span>
            {showFolder && <span className="texture-folder">{texture.folder}</span>}
            <span className="texture-badges">
              <Badge on={texture.normal !== null} label="N" title="Mappa normal (_n)" />
              <Badge on={texture.specular !== null} label="S" title="Mappa specular (_s)" />
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
