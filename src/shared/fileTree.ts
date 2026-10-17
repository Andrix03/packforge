export interface TreeFolder {
  name: string
  /** Posix path from the pack root ('' for the root). */
  path: string
  folders: TreeFolder[]
  /** File names directly inside this folder, sorted. */
  files: string[]
  /** Number of files in this folder and all subfolders. */
  totalFiles: number
}

/** Builds a sorted folder tree from pack-relative posix file paths. */
export function buildFileTree(paths: readonly string[]): TreeFolder {
  const root = makeFolder('', '')
  for (const path of paths) {
    const segments = path.split('/')
    const fileName = segments.pop()
    if (!fileName) continue
    let folder = root
    folder.totalFiles++
    for (const segment of segments) {
      let child = folder.folders.find((f) => f.name === segment)
      if (!child) {
        child = makeFolder(segment, folder.path === '' ? segment : `${folder.path}/${segment}`)
        folder.folders.push(child)
      }
      folder = child
      folder.totalFiles++
    }
    folder.files.push(fileName)
  }
  sortTree(root)
  return root
}

export function findFolder(root: TreeFolder, path: string): TreeFolder | null {
  if (path === '') return root
  let folder: TreeFolder | undefined = root
  for (const segment of path.split('/')) {
    folder = folder.folders.find((f) => f.name === segment)
    if (!folder) return null
  }
  return folder
}

/** Parent folder of a pack-relative path ('' for root-level files). */
export function parentPath(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function makeFolder(name: string, path: string): TreeFolder {
  return { name, path, folders: [], files: [], totalFiles: 0 }
}

function sortTree(folder: TreeFolder): void {
  folder.folders.sort((a, b) => compareNames(a.name, b.name))
  folder.files.sort(compareNames)
  folder.folders.forEach(sortTree)
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

// Stems first, so `stone.png` sorts before `stone_n.png`.
function compareNames(a: string, b: string): number {
  return (
    collator.compare(stem(a), stem(b)) || collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)
  )
}

function stem(name: string): string {
  const dot = name.indexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}
