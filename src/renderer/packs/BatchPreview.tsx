// "Anteprima" step of Applica in blocco: one texture before (colour only, no shader) and after
// (the maps the batch would write, LabPBR effects on), as 3D blocks. Nothing is written here.
import { useEffect, useState } from 'react'
import { buildNormal, buildSpecular } from '../../shared/batchMaps'
import { assetUrl } from '../../shared/ipc'
import type { TextureEntry } from '../../shared/textures'
import { DEFAULT_EFFECTS } from '../preview/effects'
import type { LiveMaps } from '../preview/BlockPreview'
import type { AssetSources } from '../preview/modelSource'
import { PreviewPanel, type LiveTexture, type PreviewTarget } from '../preview/PreviewPanel'
import { Switch } from '../ui/components'
import { errorMessage, loadPng } from './packFetch'
import type { BatchSettings } from './runBatch'
import type { ValidatorSource } from './runValidator'
import { tr } from '../../shared/i18n'

type After =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; live: LiveTexture }

export function BatchPreview({
  pack,
  sources,
  texture,
  settings,
  maps
}: {
  pack: ValidatorSource
  sources: AssetSources
  texture: TextureEntry
  /** Must be stable (useMemo): a new object rebuilds the maps. */
  settings: BatchSettings
  /** Which maps the batch writes for this texture (the others stay as their files). */
  maps: { normal: boolean; specular: boolean }
}): React.JSX.Element {
  const [after, setAfter] = useState<After>({ status: 'loading' })
  const [showAfter, setShowAfter] = useState(true)
  const [both, setBoth] = useState(false)

  const target: PreviewTarget = {
    key: `batch|${texture.albedo}`,
    textureKey: texture.key,
    url: assetUrl(pack.base, texture.albedo, pack.versions?.[texture.albedo] ?? 0),
    mcmetaUrl: texture.mcmeta ? assetUrl(pack.base, texture.mcmeta, 0) : null,
    name: texture.name,
    sourceLabel: 'Pack'
  }

  // Builds the maps in memory with the current settings (same code as the batch).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const albedo = await loadPng(pack, texture.albedo)
        const { width, height } = albedo
        const pixels = Uint8ClampedArray.from(albedo.data)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0)
        const live: LiveMaps = {
          normal: maps.normal
            ? {
                width,
                height,
                data: buildNormal(
                  pixels,
                  { width, height, frameHeight: height, wrap: settings.wrap },
                  null,
                  settings.relief
                )
              }
            : null,
          specular: maps.specular
            ? { width, height, data: buildSpecular(pixels, width, height, null, settings.material) }
            : null
        }
        if (!cancelled)
          setAfter({
            status: 'ready',
            live: { url: target.url, canvas, revision: Date.now(), maps: live }
          })
      } catch (error) {
        if (!cancelled) setAfter({ status: 'error', message: errorMessage(error) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pack, texture.albedo, settings, maps.normal, maps.specular, target.url])

  const beforeView = (
    <figure className="before-after-view">
      <figcaption className="ph">{tr('Prima')}</figcaption>
      <PreviewPanel target={target} sources={sources} />
    </figure>
  )
  const afterView = (
    <figure className="before-after-view">
      <figcaption className="ph after">{tr('Dopo')}</figcaption>
      {after.status === 'ready' ? (
        <PreviewPanel
          target={target}
          sources={sources}
          live={after.live}
          effects={DEFAULT_EFFECTS}
        />
      ) : after.status === 'error' ? (
        <p className="field-error small">{after.message}</p>
      ) : (
        <p className="muted small">{tr('Calcolo le mappe…')}</p>
      )}
    </figure>
  )

  return (
    <div className="before-after">
      <div className="before-after-bar">
        <span className="lbl" style={{ opacity: both ? 0.4 : 1 }}>
          {tr('Prima')}
        </span>
        <Switch
          checked={showAfter}
          onChange={setShowAfter}
          label={tr('Mostra il risultato')}
          disabled={both}
        />
        <span className="lbl" style={{ opacity: both ? 0.4 : 1 }}>
          {tr('Dopo')}
        </span>
        <label className="inline-check small" title={tr('Prima e dopo uno accanto all’altro')}>
          <input
            type="checkbox"
            checked={both}
            onChange={(event) => setBoth(event.target.checked)}
          />
          {tr('Affiancati')}
        </label>
      </div>
      <div className={both ? 'before-after-views both' : 'before-after-views'}>
        {(both || !showAfter) && beforeView}
        {(both || showAfter) && afterView}
      </div>
      <p className="muted small">
        {tr(
          'Prima = come la vede il gioco senza shader. Dopo = con le mappe che verranno scritte, come con uno shader LabPBR (Iris): senza shader in gioco non cambia niente.'
        )}
      </p>
    </div>
  )
}
