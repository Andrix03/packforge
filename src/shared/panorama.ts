// The title screen panorama is one cubemap of six faces: the game loads them together and, if a
// pack has only some of them or faces of different sizes, it rejects the WHOLE pack ("Resource
// reload failed": "Image dimensions of cubemap … sides do not match", seen on 26.3, where the jar's
// own faces are 16×16 placeholders). Pure.
import { tr } from './i18n'

export const PANORAMA_FACES: readonly string[] = [0, 1, 2, 3, 4, 5].map(
  (i) => `assets/minecraft/textures/gui/title/background/panorama_${i}.png`
)

const faceName = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.png'.length)

/** Some faces in the pack but not all six: the message to show, else null. */
export function panoramaMissing(files: Iterable<string>): string | null {
  const have = new Set(files)
  const present = PANORAMA_FACES.filter((face) => have.has(face))
  if (present.length === 0 || present.length === PANORAMA_FACES.length) return null
  const missing = PANORAMA_FACES.filter((face) => !have.has(face)).map(faceName)
  return tr(
    'Il panorama del titolo ha {0} facce su 6: il gioco scarta tutto il pack («Resource reload failed»). Aggiungi le facce che mancano ({1}) o togli quelle che ci sono.',
    present.length,
    missing.join(', ')
  )
}

/** All six faces present but not all of the same size: the message to show, else null. */
export function panoramaSizes(
  sizes: ReadonlyArray<readonly [number, number] | null>
): string | null {
  const known = sizes.filter((size): size is readonly [number, number] => size !== null)
  if (known.length < 2) return null
  const [w, h] = known[0]!
  if (known.every(([x, y]) => x === w && y === h)) return null
  return tr(
    'Le 6 facce del panorama hanno misure diverse ({0}): il gioco scarta tutto il pack. Devono essere tutte della stessa misura.',
    sizes.map((size, i) => `${i}: ${size ? `${size[0]}×${size[1]}` : '?'}`).join(', ')
  )
}
