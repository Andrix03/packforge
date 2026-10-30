// Textures that look like variants of another texture in the same folder: `iron_sword_excalibur`
// of `iron_sword` (name variant), `dirt_v2` of `dirt` (random variant). The export compares their
// pixels: a variant never repainted is a copy, and in game nothing changes (found in the playtest).
// Pure.

const MAP_SUFFIX = /_[nse]$/

/** [variant, original] pairs of PNGs in the same folder, maps (_n, _s, _e) left out. */
export function variantPairs(files: Iterable<string>): Array<[string, string]> {
  const pngs = [...files].filter((f) => f.endsWith('.png') && f.includes('/textures/'))
  const byFolder = new Map<string, Set<string>>()
  for (const path of pngs) {
    const slash = path.lastIndexOf('/')
    const name = path.slice(slash + 1, -'.png'.length)
    if (MAP_SUFFIX.test(name)) continue
    const folder = path.slice(0, slash)
    const names = byFolder.get(folder)
    if (names) names.add(name)
    else byFolder.set(folder, new Set([name]))
  }
  const pairs: Array<[string, string]> = []
  for (const [folder, names] of byFolder) {
    for (const name of names) {
      // The longest other name this one extends with "_…" (iron_sword for iron_sword_excalibur).
      let original: string | null = null
      for (const other of names) {
        if (
          other !== name &&
          name.startsWith(`${other}_`) &&
          other.length > (original?.length ?? 0)
        )
          original = other
      }
      if (original) pairs.push([`${folder}/${name}.png`, `${folder}/${original}.png`])
    }
  }
  return pairs.sort((a, b) => a[0].localeCompare(b[0]))
}
