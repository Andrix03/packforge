import { useEffect, useState } from 'react'
import { language, tr } from '../../shared/i18n'
import { mergeLang, parseLang, searchLang } from '../../shared/langFile'
import { backupBefore } from './backup'
import { errorMessage, fetchText, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

const LIMIT = 150

/**
 * The game's texts in a language (item and block names, messages…): search them, change a line,
 * and the pack's `lang/<code>.json` keeps only the lines that differ from the game.
 */
export function LangDialog({
  pack,
  canWrite,
  onClose,
  embedded = false,
  gameVersion = null
}: {
  pack: FileSource
  canWrite: boolean
  onClose: () => void
  /** Shown as the Testi section instead of a modal (no backdrop, no close button). */
  embedded?: boolean
  /** The game version whose texts are shown: they are read again when it changes or loads. */
  gameVersion?: string | null
}): React.JSX.Element {
  // The interface's language first: an Italian user edits it_it.
  const [code, setCode] = useState(language() === 'it' ? 'it_it' : 'en_us')
  const [codes, setCodes] = useState<string[]>(['en_us'])
  const [vanilla, setVanilla] = useState<{ code: string; entries: Record<string, string> } | null>(
    null
  )
  const [own, setOwn] = useState<{ code: string; entries: Record<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [edits, setEdits] = useState<Record<string, string | null>>({})
  const [saved, setSaved] = useState<string | null>(null)
  useEscape(onClose, !embedded)
  const file = `assets/minecraft/lang/${code}.json`

  useEffect(() => {
    let current = true
    void window.api.invoke('vanilla:lang', code).then((result) => {
      if (!current) return
      if (result.ok) {
        setVanilla({ code, entries: result.entries })
        setCodes(result.codes)
        setError(null)
      } else {
        setVanilla({ code, entries: {} })
        setError(result.error)
      }
    })
    return () => {
      current = false
    }
  }, [code, gameVersion])

  useEffect(() => {
    let current = true
    const path = `assets/minecraft/lang/${code}.json`
    void (pack.files.has(path) ? fetchText(pack, path) : Promise.resolve('{}'))
      .then((text) => parseLang(text) ?? {})
      .catch(() => ({}))
      .then((entries) => current && setOwn({ code, entries }))
    return () => {
      current = false
    }
  }, [pack, code])

  const ready = vanilla?.code === code && own?.code === code
  const packEntries = ready ? own.entries : {}
  const gameEntries = ready ? vanilla.entries : {}
  const shown = { ...packEntries }
  for (const [key, value] of Object.entries(edits)) {
    if (value === null) delete shown[key]
    else shown[key] = value
  }
  const { rows, total } = searchLang(gameEntries, shown, query, LIMIT)
  const changed = Object.keys(edits).length > 0

  const save = useSingleFlight(async (): Promise<void> => {
    setError(null)
    if (pack.files.has(file) && !(await backupBefore(tr('Testi {0}', code), [file]))) return
    const merged = mergeLang(packEntries, edits, gameEntries)
    try {
      const result = await window.api.invoke(
        'pack:saveLang',
        code,
        `${JSON.stringify(merged, null, 2)}\n`
      )
      if (!result.ok) throw new Error(result.error)
      setOwn({ code, entries: merged })
      setEdits({})
      setSaved(tr('{0} righe nel pack per {1}.', Object.keys(merged).length, code))
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  const body = (
    <>
      <h2>
        <Glyph name="book" />
        {tr('Testi del gioco')}
      </h2>
      <p className="muted small">
        {tr(
          'Nomi di blocchi e oggetti, messaggi, menu: cambia una riga e il pack la sostituisce in quella lingua. Le altre restano quelle del gioco.'
        )}
      </p>
      <div className="row wrap">
        <label className="small select-field">
          {tr('Lingua')}{' '}
          <select
            value={code}
            aria-label={tr('Lingua')}
            disabled={changed}
            onChange={(event) => {
              setCode(event.target.value)
              setEdits({})
              setSaved(null)
            }}
          >
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <input
          className="lang-search"
          placeholder={tr('Cerca: nome, testo o chiave…')}
          aria-label={tr('Cerca nei testi')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {!ready ? (
        <p className="muted">{tr('Leggo i testi…')}</p>
      ) : (
        <>
          <p className="muted small" data-testid="lang-count">
            {total > LIMIT
              ? tr('Righe: {0}, mostro le prime {1}: cerca per restringere.', total, LIMIT)
              : tr('Righe: {0}.', total)}
          </p>
          <ul className="lang-list">
            {rows.map((row) => (
              <li key={row.key}>
                <code className="small">{row.key}</code>
                <input
                  value={row.pack ?? ''}
                  placeholder={row.vanilla ?? ''}
                  aria-label={row.key}
                  className={row.pack !== null ? 'lang-changed' : undefined}
                  onChange={(event) => {
                    const value = event.target.value
                    setEdits({ ...edits, [row.key]: value === '' ? null : value })
                    setSaved(null)
                  }}
                />
                {row.pack !== null && row.vanilla !== null && (
                  <span className="muted small">{tr('Nel gioco: {0}', row.vanilla)}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="field-error small">{error}</p>}
      {saved && (
        <p className="small ok-text" data-testid="lang-saved">
          {saved}
        </p>
      )}
      <div className="row">
        {canWrite && (
          <button
            type="button"
            className="primary"
            disabled={!changed || !ready}
            onClick={() => save()}
          >
            {tr('Salva i testi')}
          </button>
        )}
        {!embedded && (
          <button type="button" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        )}
      </div>
    </>
  )
  if (embedded) {
    return (
      <section className="card embedded-dialog form lang-dialog" aria-label={tr('Testi del gioco')}>
        {body}
      </section>
    )
  }
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form lang-dialog"
        role="dialog"
        aria-label={tr('Testi del gioco')}
        onClick={(event) => event.stopPropagation()}
      >
        {body}
      </div>
    </div>
  )
}
