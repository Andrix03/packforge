// Right side of the hotbar while a texture is open: undo / redo, Principiante / Pro, save.
// Built from the commands the editor publishes, so it always does what the editor would.
import { PixelIcon } from '../ui/components'
import { CMD_ICONS } from '../ui/icons'
import { useCommandList, useCommandStore } from './commandContext'
import { tr } from '../../shared/i18n'

export function EditorHotbar() {
  const commands = useCommandList()
  const store = useCommandStore()
  const find = (id: string) => commands.find((c) => c.id === id)
  const save = find('editor:save')
  if (!save) return null
  const beginner = find('editor:beginner')
  const pro = find('editor:pro')
  // A mode command is disabled when that mode is already on.
  const proOn = pro?.enabled === false
  return (
    <div className="editor-hotbar">
      <div className="joined">
        <button
          type="button"
          className="ore ico"
          title={tr('Annulla (Ctrl+Z)')}
          aria-label={tr('Annulla')}
          disabled={find('editor:undo')?.enabled === false}
          onClick={() => store.run('editor:undo')}
        >
          <PixelIcon icon={CMD_ICONS.undo} />
        </button>
        <button
          type="button"
          className="ore ico"
          title={tr('Ripeti (Ctrl+Y)')}
          aria-label={tr('Ripeti')}
          disabled={find('editor:redo')?.enabled === false}
          onClick={() => store.run('editor:redo')}
        >
          <PixelIcon icon={CMD_ICONS.redo} />
        </button>
      </div>
      <div className="joined" role="radiogroup" aria-label={tr("Modalità dell'editor")}>
        <button
          type="button"
          role="radio"
          aria-checked={!proOn}
          className={proOn ? 'ore' : 'ore-on'}
          title={tr('Principiante: meno strumenti, consigli e avvisi')}
          onClick={() => beginner && store.run(beginner.id)}
        >
          <PixelIcon icon={CMD_ICONS.beginner} />
          <span>{tr('Principiante')}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={proOn}
          className={proOn ? 'ore-on' : 'ore'}
          title={tr('Pro: tutti gli strumenti e le opzioni')}
          onClick={() => pro && store.run(pro.id)}
        >
          <PixelIcon icon={CMD_ICONS.pro} />
          <span>{tr('Pro')}</span>
        </button>
      </div>
      <button
        type="button"
        className={save.enabled === false ? 'ore ico' : 'ore-on ico'}
        title={
          save.enabled === false
            ? tr('Salva (Ctrl+S) — {0}', save.why ?? '')
            : tr('Salva la texture nel pack (Ctrl+S)')
        }
        aria-label={tr('Salva')}
        disabled={save.enabled === false}
        onClick={() => store.run('editor:save')}
      >
        <PixelIcon icon={CMD_ICONS.save} />
      </button>
    </div>
  )
}
