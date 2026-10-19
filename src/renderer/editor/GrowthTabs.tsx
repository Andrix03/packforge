import { resolveAssetUrl, type AssetSources, type GrowthStage } from '../preview/modelSource'

/** The textures of a growing block's stages, in age order (stages may share one texture). */
function stageTextures(stages: readonly GrowthStage[]): string[] {
  return [...new Set(stages.flatMap((stage) => stage.textures))]
}

/**
 * Tabs for the growth stages of a crop (seed → grown): each stage has its own texture. Stages the
 * pack does not have yet are offered for creation (vanilla thumbnails are only a reference).
 */
export function GrowthTabs({
  stages,
  current,
  sources,
  readOnly,
  onOpen,
  onCreate
}: {
  stages: readonly GrowthStage[]
  current: string
  sources: AssetSources
  readOnly: boolean
  onOpen: (path: string) => void
  /** `previous`: the closest earlier stage in the pack, to start the new one from. */
  onCreate: (path: string, previous: string | null) => void
}): React.JSX.Element | null {
  const textures = stageTextures(stages)
  if (textures.length < 2 || !textures.includes(current)) return null
  // Random variants (`_v2`…) share their stage's number: `2·v2`.
  const bases = [...new Set(textures.map((path) => path.replace(/_v\d+\.png$/, '.png')))]
  const labelOf = (path: string): string => {
    const stage = bases.indexOf(path.replace(/_v\d+\.png$/, '.png')) + 1
    const variant = /_(v\d+)\.png$/.exec(path)?.[1]
    return variant ? `${stage}·${variant}` : `${stage}`
  }
  return (
    <div className="face-tabs growth-tabs" role="tablist" aria-label="Stadi di crescita">
      <span className="muted small">🌱 Stadi di crescita:</span>
      {textures.map((path, index) => {
        const inPack = sources.pack.files.has(path)
        const name = path.slice(path.lastIndexOf('/') + 1, -'.png'.length)
        const url = resolveAssetUrl(sources, path)
        const previous =
          textures
            .slice(0, index)
            .reverse()
            .find((p) => sources.pack.files.has(p)) ?? null
        return (
          <button
            key={path}
            type="button"
            role="tab"
            aria-selected={path === current}
            className={path === current ? 'tab active' : inPack ? 'tab' : 'tab missing'}
            title={
              inPack
                ? `${path} — stadio ${labelOf(path)} di ${bases.length}`
                : `${path} — non è ancora nel pack: clicca per crearla`
            }
            disabled={readOnly && !inPack}
            onClick={() => (inPack ? onOpen(path) : onCreate(path, previous))}
          >
            {url && <img src={url} alt="" className="growth-thumb" draggable={false} />}
            {inPack ? labelOf(path) : `+ ${labelOf(path)}`}
            <span className="visually-hidden"> {name}</span>
          </button>
        )
      })}
    </div>
  )
}
