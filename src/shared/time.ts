import { language, tr } from './i18n'

const relative = new Intl.RelativeTimeFormat(language(), { numeric: 'auto' })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

/** Relative time in the interface language, e.g. "2 ore fa", "ieri", "adesso". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const seconds = Math.round((time - now.getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit)
  }
  return tr('adesso')
}
