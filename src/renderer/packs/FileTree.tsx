import type { TreeFolder } from '../../shared/fileTree'
import { Glyph } from '../ui/components'
import { tr } from '../../shared/i18n'

interface FileTreeProps {
  root: TreeFolder
  selectedFolder: string
  selectedFile: string | null
  expanded: ReadonlySet<string>
  onToggle: (path: string) => void
  onSelectFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

export function FileTree(props: FileTreeProps): React.JSX.Element {
  return (
    <ul className="tree" role="tree" aria-label={tr('File del pack')}>
      <FolderItem {...props} folder={props.root} depth={0} />
    </ul>
  )
}

function FolderItem(
  props: FileTreeProps & { folder: TreeFolder; depth: number }
): React.JSX.Element {
  const { folder, depth, expanded, selectedFolder, selectedFile } = props
  const isRoot = folder.path === ''
  const isOpen = isRoot || expanded.has(folder.path)

  return (
    <li role="treeitem" aria-expanded={isOpen}>
      {!isRoot && (
        <button
          type="button"
          className={`tree-row folder${selectedFolder === folder.path ? ' selected' : ''}`}
          style={{ paddingLeft: depth * 14 }}
          onClick={() => {
            props.onSelectFolder(folder.path)
            if (!isOpen || selectedFolder === folder.path) props.onToggle(folder.path)
          }}
          title={folder.path}
        >
          <span className="caret">
            <Glyph name={isOpen ? 'caretDown' : 'caretRight'} alone />
          </span>
          <span className="name">{folder.name}</span>
          <span className="count">{folder.totalFiles}</span>
        </button>
      )}
      {isOpen && (
        <ul role="group">
          {folder.folders.map((child) => (
            <FolderItem {...props} key={child.path} folder={child} depth={isRoot ? 0 : depth + 1} />
          ))}
          {folder.files.map((name) => {
            const path = isRoot ? name : `${folder.path}/${name}`
            return (
              <li key={path} role="treeitem">
                <button
                  type="button"
                  className={`tree-row file${selectedFile === path ? ' selected' : ''}`}
                  style={{ paddingLeft: (isRoot ? 0 : depth + 1) * 14 + 14 }}
                  onClick={() => props.onSelectFile(path)}
                  title={path}
                >
                  <span className="name">{name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
