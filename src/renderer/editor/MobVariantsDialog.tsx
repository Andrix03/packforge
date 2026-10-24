import { useEffect, useState } from 'react'
import { tr } from '../../shared/i18n'
import { assetUrl } from '../../shared/ipc'
import {
  buildRandomProperties,
  emptyRule,
  existingVariants,
  nextVariant,
  parseRandomProperties,
  randomPropertiesPath,
  randomVariantPath,
  ruleProblems,
  type RandomRule
} from '../../shared/randomEntities'
import { backupBefore } from '../packs/backup'
import { errorMessage, fetchText, loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

const PROBLEMS: Record<ReturnType<typeof ruleProblems>[number], () => string> = {
  empty: () => tr('Scegli almeno una texture.'),
  weights: () => tr('I pesi devono essere tanti quante le texture.'),
  missing: () => tr('Usa un numero di variante che non esiste.')
}

const numbers = (text: string): number[] =>
  text
    .split(/[\s,]+/)
    .filter((part) => /^\d+$/.test(part))
    .map(Number)

/**
 * Random textures of a mob (OptiFine / Entity Texture Features): its variants (number 1 is this
 * texture), a new one copied from it to paint, and optional rules choosing them by biome,
 * height or name. Without rules every variant is equally likely.
 */
export function MobVariantsDialog({
  path,
  sources,
  onClose,
  onOpen
}: {
  path: string
  sources: AssetSources
  onClose: () => void
  onOpen: (variant: string, written: string[]) => void
}): React.JSX.Element {
  const files = sources.pack.files
  const variants = existingVariants(files, path)
  const highest = variants.length === 0 ? 1 : variants[variants.length - 1]!
  const propertiesPath = randomPropertiesPath(path)!
  const [rules, setRules] = useState<RandomRule[] | null>(null)
  const [edited, setEdited] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEscape(onClose)

  useEffect(() => {
    let current = true
    void (
      files.has(propertiesPath)
        ? fetchText(sources.pack, propertiesPath).then(parseRandomProperties)
        : Promise.resolve([] as RandomRule[])
    )
      .catch(() => [] as RandomRule[])
      .then((read) => current && setRules(read))
    return () => {
      current = false
    }
  }, [files, propertiesPath, sources.pack])

  const add = useSingleFlight(async (): Promise<void> => {
    setError(null)
    const target = randomVariantPath(path, nextVariant(files, path))!
    try {
      const image = await loadPng(sources.pack, path)
      const saved = await window.api.invoke(
        'texture:save',
        target,
        image.width,
        image.height,
        new Uint8Array(image.data)
      )
      if (!saved.ok) throw new Error(saved.error)
      onOpen(target, [target])
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  const saveRules = useSingleFlight(async (): Promise<void> => {
    if (!rules) return
    setError(null)
    if (
      files.has(propertiesPath) &&
      !(await backupBefore(tr('Regole delle varianti'), [propertiesPath]))
    )
      return
    const result = await window.api.invoke(
      'pack:saveRandomProperties',
      propertiesPath,
      buildRandomProperties(rules)
    )
    if (result.ok) {
      setEdited(false)
      setMessage(tr('Regole salvate in {0}', propertiesPath))
    } else setError(result.error)
  })

  const update = (index: number, change: Partial<RandomRule>): void => {
    if (!rules) return
    setRules(rules.map((rule, i) => (i === index ? { ...rule, ...change } : rule)))
    setEdited(true)
    setMessage(null)
  }
  const thumb = (p: string): string | null =>
    files.has(p)
      ? assetUrl(sources.pack.base, p, sources.pack.versions[p] ?? 0)
      : resolveAssetUrl(sources, p)
  const all = [1, ...variants]
  const blocked = (rules ?? []).some((rule) => ruleProblems(rule, highest).length > 0)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form mob-variants"
        role="dialog"
        aria-label={tr('Varianti del mob')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="dice" />
          {tr('Varianti del mob')}
        </h2>
        <p className="muted small">
          {tr(
            'Con OptiFine o Entity Texture Features ogni mob prende a caso una di queste texture. La 1 è questa; le altre stanno in optifine/random/entity/.'
          )}
        </p>
        <ul className="mob-variant-list" data-testid="mob-variants">
          {all.map((n) => {
            const variant = n === 1 ? path : randomVariantPath(path, n)!
            const url = thumb(variant)
            return (
              <li key={n}>
                {url && <img src={url} alt="" className="mob-variant-thumb sunken" />}
                <span className="small">{n}</span>
                {n > 1 && (
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => onOpen(variant, [])}
                  >
                    {tr('Apri')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <div className="row">
          <button type="button" onClick={() => add()}>
            {tr('Aggiungi la variante {0}', nextVariant(files, path))}
          </button>
        </div>

        <h3 className="lbl">{tr('Regole (facoltative)')}</h3>
        {rules === null ? (
          <p className="muted">{tr('Leggo le regole…')}</p>
        ) : rules.length === 0 ? (
          <p className="muted small">
            {tr('Nessuna regola: ogni variante ha la stessa probabilità ovunque.')}
          </p>
        ) : (
          <ol className="mob-rules">
            {rules.map((rule, i) => {
              const problems = ruleProblems(rule, highest)
              return (
                <li key={i} className="mob-rule">
                  <label className="small">
                    {tr('Texture')}
                    <input
                      value={rule.textures.join(' ')}
                      aria-label={tr('Texture della regola {0}', i + 1)}
                      onChange={(event) => update(i, { textures: numbers(event.target.value) })}
                    />
                  </label>
                  <label className="small">
                    {tr('Pesi')}
                    <input
                      value={rule.weights.join(' ')}
                      placeholder={tr('uguali')}
                      onChange={(event) => update(i, { weights: numbers(event.target.value) })}
                    />
                  </label>
                  <label className="small">
                    {tr('Biomi')}
                    <input
                      value={rule.biomes.join(' ')}
                      placeholder={tr('ovunque (es. desert badlands)')}
                      onChange={(event) =>
                        update(i, { biomes: event.target.value.split(/\s+/).filter(Boolean) })
                      }
                    />
                  </label>
                  <label className="checkbox-inline small">
                    <input
                      type="checkbox"
                      checked={rule.invertBiomes}
                      onChange={(event) => update(i, { invertBiomes: event.target.checked })}
                    />
                    {tr('tranne questi')}
                  </label>
                  <label className="small">
                    {tr('Altezza')}
                    <input
                      value={rule.heights}
                      placeholder={tr('es. 0-64')}
                      onChange={(event) => update(i, { heights: event.target.value })}
                    />
                  </label>
                  <label className="small">
                    {tr('Nome')}
                    <input
                      value={rule.name}
                      placeholder={tr('nome dato col cartellino')}
                      onChange={(event) => update(i, { name: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => {
                      setRules(rules.filter((_, j) => j !== i))
                      setEdited(true)
                    }}
                  >
                    {tr('Elimina')}
                  </button>
                  {problems.map((p) => (
                    <p key={p} className="field-error small">
                      {PROBLEMS[p]()}
                    </p>
                  ))}
                </li>
              )
            })}
          </ol>
        )}
        {rules && (
          <div className="row wrap">
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setRules([...rules, emptyRule(all)])
                setEdited(true)
              }}
            >
              {tr('Aggiungi una regola')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!edited || blocked}
              onClick={() => saveRules()}
            >
              {tr('Salva le regole')}
            </button>
          </div>
        )}
        {rules && rules.length > 0 && (
          <p className="muted small">
            {tr('Le regole si provano in ordine: vale la prima che va bene.')}
          </p>
        )}
        {message && (
          <p className="small ok-text" data-testid="mob-message">
            {message}
          </p>
        )}
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button type="button" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        </div>
      </div>
    </div>
  )
}
