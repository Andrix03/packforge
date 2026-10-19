// What to show around a growth stage being drawn: the other half of a tall plant (its `_top`
// above, or the lower texture below) and the previous stage, faintly, as a reference.

/** The textures of a growing block's stages, in age order (stages may share one texture). */
export function stageTextures(stages: ReadonlyArray<{ textures: readonly string[] }>): string[] {
  return [...new Set(stages.flatMap((stage) => stage.textures))]
}

export interface StageContext {
  /** The upper block of a tall plant, drawn above the canvas. */
  above: string | null
  /** The lower block, drawn below the canvas while painting a `_top`. */
  below: string | null
  /** The previous growth stage (same half), for the faint overlay. */
  previous: string | null
}

const stageOf = (path: string): string => path.replace(/(_v\d+|_top)\.png$/, '.png')
const topOf = (path: string): string => path.replace(/\.png$/, '_top.png')

/**
 * Neighbours of `path` among a crop's stage textures (in age order; variants and tops included).
 * `exists` tells which files can be shown (pack or game).
 */
export function stageContext(
  path: string,
  stageTextures: readonly string[],
  exists: (path: string) => boolean
): StageContext {
  const isTop = /_top\.png$/.test(path)
  // A variant's upper block is its stage's (the variant model inherits it).
  const stage = stageOf(path)
  const above = !isTop && exists(topOf(stage)) ? topOf(stage) : null
  const below = isTop ? stage : null
  const stages = [...new Set(stageTextures.map(stageOf))]
  const index = stages.indexOf(stage)
  const previousStage = index > 0 ? stages[index - 1]! : null
  const previous = previousStage
    ? isTop
      ? exists(topOf(previousStage))
        ? topOf(previousStage)
        : null
      : previousStage
    : null
  return { above, below, previous }
}
