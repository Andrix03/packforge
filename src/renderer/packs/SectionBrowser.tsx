// The browser of a section (v3): the pack / game switch, a search, the section's groups on the
// left (Pietre, Minerali, Legni…), the grid of the chosen group in the middle.
import { useMemo } from 'react'
import { tr } from '../../shared/i18n'
import { SECTION_GROUPS, groupOf, type SectionId } from '../../shared/sections'
import type { TextureEntry } from '../../shared/textures'
import { groupName, sectionName } from '../shell/sectionNames'
import { TextureGrid, type TextureMarker } from './TextureGrid'

const MAX_RESULTS = 500

export function SectionBrowser({
  section,
  textures,
  assetBase,
  source,
  group,
  onGroup,
  query,
  onQuery,
  marker,
  coverageKeys,
  selectedKey,
  onSelect,
  onOpen,
  onNewTexture,
  versionOf,
  loading
}: {
  section: SectionId
  /** The section's textures from the current source (pack or game). */
  textures: readonly TextureEntry[]
  assetBase: string
  /** The pack / game switch and the version picker. */
  source: React.ReactNode
  /** Chosen group, null = all of them. */
  group: string | null
  onGroup: (group: string | null) => void
  query: string
  onQuery: (query: string) => void
  marker: TextureMarker | undefined
  /** Game textures: keys already in the pack (for the count). */
  coverageKeys: ReadonlySet<string> | null
  selectedKey: string | null
  onSelect: (texture: TextureEntry) => void
  onOpen: (texture: TextureEntry) => void
  onNewTexture: (() => void) | undefined
  versionOf: ((path: string) => number) | undefined
  /** The game's textures are still being read. */
  loading?: React.ReactNode
}): React.JSX.Element {
  const byGroup = useMemo(() => {
    const groups = new Map<string, TextureEntry[]>()
    for (const texture of textures) {
      const id = groupOf(section, texture.albedo)
      const list = groups.get(id)
      if (list) list.push(texture)
      else groups.set(id, [texture])
    }
    return groups
  }, [section, textures])
  const order = useMemo(() => {
    const listed = SECTION_GROUPS[section].filter((id) => byGroup.has(id))
    const extra = [...byGroup.keys()].filter((id) => !listed.includes(id)).sort()
    return [...listed, ...extra]
  }, [section, byGroup])

  const activeGroup = group !== null && byGroup.has(group) ? group : null
  const needle = query.trim().toLowerCase()
  const matches = needle
    ? textures.filter((t) => t.name.toLowerCase().includes(needle))
    : activeGroup
      ? (byGroup.get(activeGroup) ?? [])
      : textures
  const shown = matches.slice(0, MAX_RESULTS)
  const withMaps = matches.filter((t) => t.normal || t.specular).length
  const covered = coverageKeys ? matches.filter((t) => coverageKeys.has(t.key)).length : null
  const title = needle
    ? tr('Ricerca: {0}', query.trim())
    : activeGroup
      ? groupName(activeGroup)
      : tr('Tutte')

  return (
    <div className="section-browser">
      <aside className="card section-groups" aria-label={tr('Sfoglia: {0}', sectionName(section))}>
        {source}
        <input
          type="search"
          className="ui-field"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={tr('Cerca texture…')}
          aria-label={tr('Cerca texture')}
        />
        <div className="group-list" role="listbox" aria-label={tr('Gruppi')}>
          <button
            type="button"
            role="option"
            aria-selected={activeGroup === null && !needle}
            className={activeGroup === null && !needle ? 'group-row active' : 'group-row'}
            onClick={() => {
              onQuery('')
              onGroup(null)
            }}
          >
            <span>{tr('Tutte')}</span>
            <span className="group-count">{textures.length}</span>
          </button>
          {order.map((id) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={activeGroup === id && !needle}
              className={activeGroup === id && !needle ? 'group-row active' : 'group-row'}
              data-group={id}
              onClick={() => {
                onQuery('')
                onGroup(id)
              }}
            >
              <span>{groupName(id)}</span>
              <span className="group-count">{byGroup.get(id)?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="card grid-panel">
        <div className="grid-toolbar">
          <span className="ph">{title}</span>
          <span className="muted small">
            {covered !== null
              ? tr('{0} texture, {1} già nel pack', matches.length, covered)
              : tr('{0} texture, {1} con mappe PBR', matches.length, withMaps)}
            {matches.length > MAX_RESULTS && tr(' (mostrate {0})', MAX_RESULTS)}
          </span>
          <span style={{ flex: 1 }} />
          {onNewTexture && (
            <button
              type="button"
              className="ore-on"
              onClick={onNewTexture}
              title={tr('Crea una nuova texture nel pack')}
            >
              {tr('+ Nuova texture')}
            </button>
          )}
        </div>
        {loading}
        {shown.length > 0 ? (
          <TextureGrid
            textures={shown}
            assetBase={assetBase}
            highlight={null}
            showFolder={needle !== ''}
            marker={marker}
            selectedKey={selectedKey}
            onSelect={onSelect}
            onOpen={onOpen}
            versionOf={versionOf}
          />
        ) : (
          !loading && (
            <p className="muted section-empty">
              {needle
                ? tr('Nessuna texture trovata.')
                : tr(
                    'Il pack non ha ancora texture di questa sezione. Passa a Gioco per sceglierne una da rifare, o crea una texture nuova.'
                  )}
            </p>
          )
        )}
      </div>
    </div>
  )
}
