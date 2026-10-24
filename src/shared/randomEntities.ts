// Random entity textures (OptiFine "Random Entities", also read by Entity Texture Features):
// alternatives of `textures/entity/<path>/<name>.png` live at
// `optifine/random/entity/<path>/<name>N.png` (N from 2, the vanilla texture is 1, no gaps; a
// name ending in a digit takes a dot: `spots_2.2.png`), and an optional `<name>.properties`
// beside them gives rules (`textures.N`, `weights.N`, `biomes.N`, `heights.N`, `name.N`), the
// first matching rule winning. Without the file every variant is equally likely.
// Source: optifine.readthedocs.io/random_entities.html (2026-10-24). Pure.

const ENTITY = /^assets\/minecraft\/textures\/entity\/(.+)\.png$/

/** True for an entity texture that can have random variants (not a LabPBR map). */
export function isEntityTexture(path: string): boolean {
  return ENTITY.test(path) && !/_(n|s|e)\.png$/.test(path)
}

/** `…/entity/zombie/zombie.png`, 3 → `assets/minecraft/optifine/random/entity/zombie/zombie3.png`. */
export function randomVariantPath(texturePath: string, n: number): string | null {
  const m = ENTITY.exec(texturePath)
  if (!m) return null
  const base = m[1]!
  const separator = /\d$/.test(base) ? '.' : ''
  return `assets/minecraft/optifine/random/entity/${base}${separator}${n}.png`
}

/** The rules file beside the variants. */
export function randomPropertiesPath(texturePath: string): string | null {
  const m = ENTITY.exec(texturePath)
  return m ? `assets/minecraft/optifine/random/entity/${m[1]}.properties` : null
}

/** The variant numbers the pack has for a texture (2, 3…), in order. */
export function existingVariants(files: ReadonlySet<string>, texturePath: string): number[] {
  const out: number[] = []
  for (let n = 2; n < 1000; n++) {
    const path = randomVariantPath(texturePath, n)
    if (!path || !files.has(path)) break
    out.push(n)
  }
  return out
}

/** The number the next variant takes: the first after the contiguous run (OptiFine stops at a gap). */
export function nextVariant(files: ReadonlySet<string>, texturePath: string): number {
  const have = existingVariants(files, texturePath)
  return have.length === 0 ? 2 : have[have.length - 1]! + 1
}

export interface RandomRule {
  /** Texture numbers (1 = the vanilla texture). */
  textures: number[]
  /** One weight per texture, or empty (equal chances). */
  weights: number[]
  /** Biome ids (`minecraft:` optional); a leading `!` in the file inverts them. */
  biomes: string[]
  invertBiomes: boolean
  /** Heights: `64`, `0-64`, `(-3)-64`; several separated by spaces. */
  heights: string
  /** Custom name matcher (exact, or OptiFine's `pattern:` / `regex:`). */
  name: string
}

export function emptyRule(textures: number[]): RandomRule {
  return { textures, weights: [], biomes: [], invertBiomes: false, heights: '', name: '' }
}

/** The `.properties` text of the rules (numbered from 1, empty fields left out). */
export function buildRandomProperties(rules: readonly RandomRule[]): string {
  const lines: string[] = []
  rules.forEach((rule, i) => {
    const n = i + 1
    lines.push(`textures.${n}=${rule.textures.join(' ')}`)
    if (rule.weights.length > 0) lines.push(`weights.${n}=${rule.weights.join(' ')}`)
    if (rule.biomes.length > 0)
      lines.push(`biomes.${n}=${rule.invertBiomes ? '!' : ''}${rule.biomes.join(' ')}`)
    if (rule.heights.trim()) lines.push(`heights.${n}=${rule.heights.trim()}`)
    if (rule.name.trim()) lines.push(`name.${n}=${rule.name.trim()}`)
  })
  return `${lines.join('\n')}\n`
}

/** Reads a `.properties` back into rules (`skins.N` is the old name of `textures.N`). */
export function parseRandomProperties(text: string): RandomRule[] {
  const rules = new Map<number, RandomRule>()
  const rule = (n: number): RandomRule => {
    let r = rules.get(n)
    if (!r) {
      r = emptyRule([])
      rules.set(n, r)
    }
    return r
  }
  const numbers = (value: string): number[] =>
    value.split(/[\s,]+/).flatMap((part) => {
      const range = /^(\d+)-(\d+)$/.exec(part)
      if (range) {
        const out: number[] = []
        for (let v = Number(range[1]); v <= Number(range[2]) && out.length < 1000; v++) out.push(v)
        return out
      }
      return /^\d+$/.test(part) ? [Number(part)] : []
    })
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const m = /^(textures|skins|weights|biomes|heights|name)\.(\d+)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    const r = rule(Number(m[2]))
    const value = m[3]!.trim()
    switch (m[1]) {
      case 'textures':
      case 'skins':
        r.textures = numbers(value)
        break
      case 'weights':
        r.weights = numbers(value)
        break
      case 'biomes':
        r.invertBiomes = value.startsWith('!')
        r.biomes = value.replace(/^!/, '').split(/\s+/).filter(Boolean)
        break
      case 'heights':
        r.heights = value
        break
      case 'name':
        r.name = value
        break
    }
  }
  return [...rules.entries()].sort(([a], [b]) => a - b).map(([, r]) => r)
}

/** Rule problems OptiFine would trip on, in Italian-free codes for the UI to word. */
export function ruleProblems(
  rule: RandomRule,
  highest: number
): Array<'empty' | 'weights' | 'missing'> {
  const out: Array<'empty' | 'weights' | 'missing'> = []
  if (rule.textures.length === 0) out.push('empty')
  if (rule.weights.length > 0 && rule.weights.length !== rule.textures.length) out.push('weights')
  if (rule.textures.some((t) => t < 1 || t > highest)) out.push('missing')
  return out
}
