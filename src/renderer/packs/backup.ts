import { tr } from '../../shared/i18n'
// Backups before pack files change (see main/backups.ts). Only the files an operation will
// really write are listed: restoring removes the ones it created.

/** Takes the backup; on failure asks whether to go on without it. False = stop. */
export async function backupBefore(label: string, paths: readonly string[]): Promise<boolean> {
  if (paths.length === 0) return true
  const result = await window.api.invoke('backup:create', label, [...new Set(paths)])
  if (result.ok) return true
  return window.confirm(tr('{0}\n\nContinuare senza backup?', result.error))
}
