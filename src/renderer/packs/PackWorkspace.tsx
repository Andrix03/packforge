import { useEffect, useMemo, useState } from 'react'
import { buildFileTree, findFolder, parentPath, type TreeFolder } from '../../shared/fileTree'
import { groupTextures } from '../../shared/textures'
import { FileTree } from './FileTree'
import { TextureGrid } from './TextureGrid'

const DEFAULT_FOLDER = 'assets/minecraft/textures/block'
const MAX_SEARCH_RESULTS = 500

type Listing =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; files: string[]; truncated: boolean; assetBase: string }

export function PackWorkspace(): React.JSX.Element {
  const [listing, setListing] = useState<Listing>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    window.api
      .invoke('pack:listFiles')
      .then((result) => {
        if (cancelled) return
        setListing(
          result.ok
            ? {
                status: 'ready',
                files: result.files,
                truncated: result.truncated,
                assetBase: result.assetBase
              }
            : { status: 'error', message: result.error }
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) setListing({ status: 'error', message: String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (listing.status === 'loading')
    return <section className="card muted">Lettura dei file…</section>
  if (listing.status === 'error') {
    return <section className="card field-error">{listing.message}</section>
  }
  return (
    <Workspace files={listing.files} truncated={listing.truncated} assetBase={listing.assetBase} />
  )
}

function Workspace({
  files,
  truncated,
  assetBase
}: {
  files: string[]
  truncated: boolean
  assetBase: string
}): React.JSX.Element {
  const tree = useMemo(() => buildFileTree(files), [files])
  const textures = useMemo(() => groupTextures(files), [files])
  const initialFolder = useMemo(() => pickInitialFolder(tree, textures), [tree, textures])

  const [selectedFolder, setSelectedFolder] = useState(initialFolder)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestors(initialFolder)))
  const [query, setQuery] = useState('')

  const trimmedQuery = query.trim().toLowerCase()
  const matches = trimmedQuery
    ? textures.filter((t) => t.name.toLowerCase().includes(trimmedQuery))
    : textures.filter((t) => t.folder === selectedFolder)
  const visible = trimmedQuery ? matches.slice(0, MAX_SEARCH_RESULTS) : matches
  const withMaps = matches.filter((t) => t.normal || t.specular).length

  function toggle(path: string): void {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function selectFile(path: string): void {
    const folder = parentPath(path)
    setSelectedFile(path)
    setSelectedFolder(folder)
    setQuery('')
    setExpanded((previous) => new Set([...previous, ...ancestors(folder)]))
  }

  return (
    <section className="workspace">
      <aside className="card tree-panel">
        <FileTree
          root={tree}
          selectedFolder={selectedFolder}
          selectedFile={selectedFile}
          expanded={expanded}
          onToggle={toggle}
          onSelectFolder={(path) => {
            setSelectedFolder(path)
            setSelectedFile(null)
            setQuery('')
          }}
          onSelectFile={selectFile}
        />
        {truncated && (
          <p className="muted small">Il pack contiene troppi file: l'elenco è incompleto.</p>
        )}
      </aside>

      <div className="card grid-panel">
        <div className="grid-toolbar">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca texture in tutto il pack…"
            aria-label="Cerca texture"
          />
          <span className="muted small">
            {trimmedQuery
              ? `${matches.length} risultati${matches.length > MAX_SEARCH_RESULTS ? ` (mostrati ${MAX_SEARCH_RESULTS})` : ''}`
              : `${selectedFolder || 'radice'} · ${matches.length} texture`}
            {matches.length > 0 && ` · ${withMaps} con mappe PBR`}
          </span>
        </div>
        {visible.length > 0 ? (
          <TextureGrid
            textures={visible}
            assetBase={assetBase}
            highlight={selectedFile}
            showFolder={trimmedQuery !== ''}
          />
        ) : (
          <p className="muted">
            {trimmedQuery ? 'Nessuna texture trovata.' : 'Nessuna texture PNG in questa cartella.'}
          </p>
        )}
      </div>
    </section>
  )
}

/** Vanilla block textures if present, else the first folder that has textures. */
function pickInitialFolder(tree: TreeFolder, textures: ReturnType<typeof groupTextures>): string {
  if (findFolder(tree, DEFAULT_FOLDER)) return DEFAULT_FOLDER
  return textures.find((t) => t.folder.includes('/textures'))?.folder ?? textures[0]?.folder ?? ''
}

function ancestors(path: string): string[] {
  if (path === '') return []
  const segments = path.split('/')
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'))
}
