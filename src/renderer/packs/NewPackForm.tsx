import { useState, type FormEvent } from 'react'
import { buildPackMcmeta, serializeMcmeta } from '../../shared/mcmeta'
import { formatPackVersion, GAME_RELEASES, LATEST_RELEASE } from '../../shared/packFormat'
import { validatePackDescription, validatePackName } from '../../shared/validate'
import { DescriptionEditor } from './DescriptionEditor'
import { tr } from '../../shared/i18n'

type SubmitState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'done'; path: string }
  | { status: 'error'; message: string }

interface NewPackFormProps {
  /** Called with the new pack folder after it has been created. */
  onCreated: (path: string) => void
}

export function NewPackForm({ onCreated }: NewPackFormProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [gameVersion, setGameVersion] = useState(LATEST_RELEASE.version)
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })

  const release = GAME_RELEASES.find((r) => r.version === gameVersion) ?? LATEST_RELEASE
  const nameError = touched ? validatePackName(name) : null
  const descriptionError = validatePackDescription(description)
  const canSubmit =
    validatePackName(name) === null &&
    descriptionError === null &&
    parentDir !== null &&
    submit.status !== 'saving'
  const mcmetaPreview = serializeMcmeta(buildPackMcmeta(description, release.resourceFormat))

  async function pickDirectory(): Promise<void> {
    const dir = await window.api.invoke('dialog:pickDirectory', 'packDestination')
    if (dir) setParentDir(dir)
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setTouched(true)
    if (!canSubmit || parentDir === null) return
    setSubmit({ status: 'saving' })
    try {
      const result = await window.api.invoke('pack:create', {
        parentDir,
        name,
        description,
        gameVersion
      })
      if (result.ok) {
        setSubmit({ status: 'done', path: result.path })
        onCreated(result.path)
      } else {
        setSubmit({ status: 'error', message: result.error })
      }
    } catch (error) {
      setSubmit({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return (
    <form className="card form" onSubmit={(event) => void handleSubmit(event)} noValidate>
      <h2>{tr('Nuovo pack')}</h2>

      <label>
        {tr('Nome')}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={tr('Il mio pack PBR')}
          aria-invalid={nameError !== null}
          autoFocus
        />
        {nameError && <span className="field-error">{nameError}</span>}
      </label>

      <div className="field">
        <span>{tr('Descrizione')}</span>
        <DescriptionEditor
          value={description}
          onChange={setDescription}
          invalid={descriptionError !== null}
        />
        {descriptionError && <span className="field-error">{descriptionError}</span>}
      </div>

      <label>
        {tr('Versione di Minecraft')}
        <select value={gameVersion} onChange={(event) => setGameVersion(event.target.value)}>
          {GAME_RELEASES.map((r) => (
            <option key={r.version} value={r.version}>
              {tr('{0} — formato {1}', r.version, formatPackVersion(r.resourceFormat))}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>{tr('Cartella di destinazione')}</span>
        <div className="row">
          <code className="path">{parentDir ?? tr('Nessuna cartella scelta')}</code>
          <button type="button" onClick={() => void pickDirectory()}>
            {tr('Sfoglia…')}
          </button>
        </div>
      </div>

      <details>
        <summary>{tr('Anteprima pack.mcmeta')}</summary>
        <pre>{mcmetaPreview}</pre>
      </details>

      <div className="row">
        <button type="submit" className="primary" disabled={!canSubmit}>
          {submit.status === 'saving' ? 'Creazione…' : tr('Crea pack')}
        </button>
        {submit.status === 'done' && (
          <span className="success">{tr('Pack creato in {0}', submit.path)}</span>
        )}
        {submit.status === 'error' && <span className="field-error">{submit.message}</span>}
      </div>
    </form>
  )
}
