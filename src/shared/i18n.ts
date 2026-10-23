// Interface language. The Italian text is the key: `tr('Salva')` returns it as is in Italian and
// its English translation (i18n/en.ts) in English. Placeholders {0}, {1}… take the extra
// arguments, so a sentence keeps its own word order in each language.
//
// The language is fixed for the life of a page (changing it reloads the window) and of a process
// start: the renderer reads it from the preload before any module runs, main sets it first thing
// at startup. So module-level `tr()` calls (lists of presets, tools…) see the right language.
import { EN } from './i18n/en'

export type Language = 'it' | 'en'
export const LANGUAGES: ReadonlyArray<{ id: Language; label: string }> = [
  { id: 'it', label: 'Italiano' },
  { id: 'en', label: 'English' }
]

export function isLanguage(value: unknown): value is Language {
  return value === 'it' || value === 'en'
}

function initial(): Language {
  const fromPreload = (globalThis as { api?: { language?: unknown } }).api?.language
  return isLanguage(fromPreload) ? fromPreload : 'it'
}

let current: Language = initial()

export function language(): Language {
  return current
}

export function setLanguage(next: Language): void {
  current = next
}

/** The text in the interface language, with {0}, {1}… replaced by `args`. */
export function tr(key: string, ...args: readonly unknown[]): string {
  const text = current === 'en' ? (EN[key] ?? key) : key
  // Like a template literal: every value through String().
  return args.length === 0
    ? text
    : text.replace(/\{(\d+)\}/g, (m, i: string) =>
        Number(i) < args.length ? String(args[Number(i)]) : m
      )
}

/** Locale for dates and numbers. */
export function locale(): string {
  return current === 'en' ? 'en-GB' : 'it-IT'
}
