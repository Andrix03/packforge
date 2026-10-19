// Growth stages of a crop as the editor lists them.

/** The textures of a growing block's stages, in age order (stages may share one texture). */
export function stageTextures(stages: ReadonlyArray<{ textures: readonly string[] }>): string[] {
  return [...new Set(stages.flatMap((stage) => stage.textures))]
}
