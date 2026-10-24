import { useEffect, useState } from 'react'
import { DIRECTIONS, modelPath, namespaced, type Direction } from '../../shared/blockModel'
import { tr } from '../../shared/i18n'
import {
  FACE_ORDER,
  cubeElement,
  editableModel,
  elementsOf,
  type EditElement,
  type EditFace,
  type Vec3
} from '../../shared/modelEdit'
import { checkModel, modelCost, type FormatRange } from '../../shared/modelRules'
import { backupBefore } from '../packs/backup'
import { errorMessage } from '../packs/packFetch'
import { ModelView } from '../preview/ModelView'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

const ANY_RANGE: FormatRange = { min: { major: 1, minor: 0 }, max: { major: 999, minor: 0 } }

const FACE_LABELS: Record<Direction, () => string> = {
  north: () => tr('Nord'),
  south: () => tr('Sud'),
  east: () => tr('Est'),
  west: () => tr('Ovest'),
  up: () => tr('Sopra'),
  down: () => tr('Sotto')
}

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

function NumberRow({
  label,
  value,
  step,
  onChange
}: {
  label: string
  value: Vec3
  step: number
  onChange: (next: Vec3) => void
}): React.JSX.Element {
  return (
    <div className="model-row">
      <span className="lbl">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <input
          key={axis}
          type="number"
          step={step}
          value={value[i]}
          aria-label={`${label} ${axis}`}
          onChange={(event) => {
            const n = Number(event.target.value)
            if (!Number.isFinite(n)) return
            const next = [...value] as Vec3
            next[i] = n
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}

/**
 * The element editor: the block model's cuboids (from, to, rotation) and their faces (texture
 * variable, UV, cull, tint), checked while editing against the versions the pack targets, with
 * the model drawn live. Elements inherited from a parent are copied into the model first.
 */
export function ModelEditorDialog({
  model: initialModel,
  sources,
  range,
  onClose,
  onDone
}: {
  /** The model to edit, e.g. `minecraft:block/stone`. */
  model: string
  sources: AssetSources
  range: FormatRange | null
  onClose: () => void
  onDone: (written: string[]) => void
}): React.JSX.Element {
  const id = namespaced(initialModel)
  const file = modelPath(id)
  const [loaded, setLoaded] = useState<{
    json: Record<string, unknown>
    variables: string[]
    inherited: boolean
  } | null>(null)
  const [missing, setMissing] = useState(false)
  const [json, setJson] = useState<Record<string, unknown> | null>(null)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEscape(onClose, !saving)

  useEffect(() => {
    let current = true
    void editableModel(id, (p) => loadJson(sources, p)).then((edit) => {
      if (!current) return
      if (edit) setLoaded(edit)
      else setMissing(true)
    })
    return () => {
      current = false
    }
  }, [id, sources])

  const model = json ?? loaded?.json ?? null
  const elements = model ? elementsOf(model) : []
  const element = elements[selected] ?? null
  const variables = loaded?.variables ?? []
  const issues = model ? checkModel(model, range ?? ANY_RANGE) : []
  const errors = issues.filter((i) => i.severity === 'error')
  const cost = model ? modelCost(model) : { elements: 0, faces: 0 }

  const setElements = (next: EditElement[]): void => {
    if (model) setJson({ ...model, elements: next })
  }
  const updateElement = (change: (e: EditElement) => EditElement): void => {
    setElements(elements.map((e, i) => (i === selected ? change(e) : e)))
  }
  const updateFace = (face: Direction, change: (f: EditFace | null) => EditFace | null): void => {
    updateElement((e) => {
      const faces = { ...e.faces }
      const next = change(faces[face] ?? null)
      if (next) faces[face] = next
      else delete faces[face]
      return { ...e, faces }
    })
  }

  const save = useSingleFlight(async (): Promise<void> => {
    if (!model || errors.length > 0) return
    if (sources.pack.files.has(file) && !(await backupBefore(tr('Elementi di {0}', id), [file])))
      return
    setSaving(true)
    setError(null)
    try {
      const saved = await window.api.invoke(
        'model:saveJson',
        file,
        `${JSON.stringify(model, null, 2)}\n`
      )
      if (saved.ok) onDone([file])
      else setError(saved.error)
    } catch (e) {
      setError(errorMessage(e))
    }
    setSaving(false)
  })

  const firstVariable = variables[0] ?? '#all'
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form model-editor"
        role="dialog"
        aria-label={tr('Elementi del modello')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="gear" />
          {tr('Elementi: {0}', id.replace(/^minecraft:/, ''))}
        </h2>
        {missing ? (
          <p className="field-error small">{tr('Modello non trovato: {0}', file)}</p>
        ) : !model ? (
          <p className="muted">{tr('Leggo il modello…')}</p>
        ) : (
          <>
            {loaded?.inherited && (
              <p className="muted small">
                {tr('Gli elementi venivano dal modello padre: salvando, il modello li avrà suoi.')}
              </p>
            )}
            <div className="model-editor-body">
              <div className="model-list">
                <ol>
                  {elements.map((e, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className={i === selected ? 'tab active' : 'tab'}
                        aria-pressed={i === selected}
                        onClick={() => setSelected(i)}
                      >
                        {i + 1}: {e.from.join(',')} / {e.to.join(',')}
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="row wrap">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => {
                      setElements([...elements, cubeElement(firstVariable)])
                      setSelected(elements.length)
                    }}
                  >
                    {tr('Aggiungi')}
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    disabled={!element}
                    onClick={() => {
                      if (!element) return
                      setElements([...elements, structuredClone(element)])
                      setSelected(elements.length)
                    }}
                  >
                    {tr('Duplica')}
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    disabled={!element}
                    onClick={() => {
                      setElements(elements.filter((_, i) => i !== selected))
                      setSelected(Math.max(0, selected - 1))
                    }}
                  >
                    {tr('Elimina')}
                  </button>
                </div>
              </div>

              <div className="model-fields">
                {element ? (
                  <>
                    <NumberRow
                      label={tr('Da')}
                      value={element.from}
                      step={0.5}
                      onChange={(from) => updateElement((e) => ({ ...e, from }))}
                    />
                    <NumberRow
                      label={tr('A')}
                      value={element.to}
                      step={0.5}
                      onChange={(to) => updateElement((e) => ({ ...e, to }))}
                    />
                    <div className="model-row">
                      <span className="lbl">{tr('Rotazione')}</span>
                      <select
                        aria-label={tr('Asse di rotazione')}
                        value={element.rotation?.axis ?? ''}
                        onChange={(event) => {
                          const axis = event.target.value as 'x' | 'y' | 'z' | ''
                          updateElement((e) => {
                            const rest = without(e, 'rotation')
                            return axis === ''
                              ? rest
                              : {
                                  ...rest,
                                  rotation: {
                                    origin: e.rotation?.origin ?? [8, 8, 8],
                                    axis,
                                    angle: e.rotation?.angle ?? 22.5
                                  }
                                }
                          })
                        }}
                      >
                        <option value="">{tr('Nessuna')}</option>
                        <option value="x">X</option>
                        <option value="y">Y</option>
                        <option value="z">Z</option>
                      </select>
                      {element.rotation && (
                        <input
                          type="number"
                          step={22.5}
                          value={element.rotation.angle}
                          aria-label={tr('Angolo')}
                          onChange={(event) => {
                            const angle = Number(event.target.value)
                            if (!Number.isFinite(angle)) return
                            updateElement((e) => ({
                              ...e,
                              rotation: { ...e.rotation!, angle }
                            }))
                          }}
                        />
                      )}
                    </div>
                    {element.rotation && (
                      <NumberRow
                        label={tr('Perno')}
                        value={element.rotation.origin}
                        step={0.5}
                        onChange={(origin) =>
                          updateElement((e) => ({ ...e, rotation: { ...e.rotation!, origin } }))
                        }
                      />
                    )}
                    <table className="model-faces">
                      <thead>
                        <tr>
                          <th>{tr('Faccia')}</th>
                          <th>{tr('Texture')}</th>
                          <th>UV</th>
                          <th>{tr('Nascosta da')}</th>
                          <th>{tr('Tinta')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FACE_ORDER.map((dir) => {
                          const face = element.faces[dir] ?? null
                          return (
                            <tr key={dir}>
                              <td>
                                <label className="checkbox-inline">
                                  <input
                                    type="checkbox"
                                    checked={face !== null}
                                    aria-label={tr('Faccia {0}', FACE_LABELS[dir]())}
                                    onChange={(event) =>
                                      updateFace(dir, () =>
                                        event.target.checked ? { texture: firstVariable } : null
                                      )
                                    }
                                  />
                                  {FACE_LABELS[dir]()}
                                </label>
                              </td>
                              <td>
                                {face && (
                                  <select
                                    value={face.texture}
                                    aria-label={tr('Texture {0}', FACE_LABELS[dir]())}
                                    onChange={(event) =>
                                      updateFace(dir, (f) => ({
                                        ...f!,
                                        texture: event.target.value
                                      }))
                                    }
                                  >
                                    {[...new Set([face.texture, ...variables])].map((v) => (
                                      <option key={v} value={v}>
                                        {v}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="model-uv">
                                {face &&
                                  ([0, 1, 2, 3] as const).map((k) => (
                                    <input
                                      key={k}
                                      type="number"
                                      step={0.5}
                                      placeholder={tr('auto')}
                                      value={face.uv?.[k] ?? ''}
                                      aria-label={`UV ${FACE_LABELS[dir]()} ${k + 1}`}
                                      onChange={(event) =>
                                        updateFace(dir, (f) => {
                                          const raw = event.target.value
                                          const { uv: old, ...rest } = f!
                                          if (raw === '') return rest
                                          const uv = [...(old ?? [0, 0, 16, 16])] as [
                                            number,
                                            number,
                                            number,
                                            number
                                          ]
                                          uv[k] = Number(raw)
                                          return { ...rest, uv }
                                        })
                                      }
                                    />
                                  ))}
                              </td>
                              <td>
                                {face && (
                                  <select
                                    value={face.cullface ?? ''}
                                    aria-label={tr('Nascosta da {0}', FACE_LABELS[dir]())}
                                    onChange={(event) =>
                                      updateFace(dir, (f) => {
                                        const rest = without(f!, 'cullface')
                                        const value = event.target.value as Direction | ''
                                        return value === '' ? rest : { ...rest, cullface: value }
                                      })
                                    }
                                  >
                                    <option value="">{tr('Mai')}</option>
                                    {DIRECTIONS.map((d) => (
                                      <option key={d} value={d}>
                                        {FACE_LABELS[d]()}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td>
                                {face && (
                                  <input
                                    type="checkbox"
                                    checked={face.tintindex !== undefined && face.tintindex >= 0}
                                    aria-label={tr('Tinta {0}', FACE_LABELS[dir]())}
                                    onChange={(event) =>
                                      updateFace(dir, (f) => {
                                        const rest = without(f!, 'tintindex')
                                        return event.target.checked
                                          ? { ...rest, tintindex: 0 }
                                          : rest
                                      })
                                    }
                                  />
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="muted">{tr('Nessun elemento: aggiungine uno.')}</p>
                )}
              </div>

              <div className="model-side">
                <ModelView
                  id={id}
                  json={model}
                  sources={sources}
                  selected={element ? selected : null}
                />
                <p className="small" data-testid="model-cost">
                  {tr('{0} elementi, {1} facce.', cost.elements, cost.faces)}
                </p>
                <div className="model-issues" data-testid="model-issues">
                  {issues.length === 0 ? (
                    <p className="small ok-text">
                      <Glyph name="check" />
                      {tr('Nessun problema per le versioni del pack.')}
                    </p>
                  ) : (
                    issues.map((issue, i) => (
                      <p
                        key={i}
                        className={issue.severity === 'error' ? 'field-error small' : 'small'}
                      >
                        {issue.element !== null && `${issue.element + 1}. `}
                        {issue.message}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        <p className="muted small path">{file}</p>
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!json || errors.length > 0 || saving}
            onClick={() => save()}
          >
            {tr('Salva il modello')}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A copy of `value` without `key` (only used on optional fields). */
function without<T extends object>(value: T, key: keyof T): T {
  const copy = { ...value }
  delete copy[key]
  return copy
}
