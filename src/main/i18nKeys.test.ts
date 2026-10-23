// The English dictionary matches the sources: every tr('…') key has an entry with the same
// placeholders, and no entry is left over. tr() keys must be string literals for this to work.
// Lives here because it reads the source files with node.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EN } from '../shared/i18n/en'
import { setLanguage, tr } from '../shared/i18n'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : []
  })
}

/** First arguments of tr(…) calls: single- or double-quoted literals, escapes decoded. */
function keysIn(code: string): string[] {
  const keys: string[] = []
  for (const m of code.matchAll(/\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    const raw = m[1] ?? m[2] ?? ''
    keys.push(raw.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)))
  }
  return keys
}

const placeholders = (s: string): string =>
  [...s.matchAll(/\{\d+\}/g)]
    .map((m) => m[0])
    .sort()
    .join('')

describe('English dictionary', () => {
  const used = new Set<string>()
  for (const file of [
    ...sources(join(SRC, 'renderer')),
    ...sources(join(SRC, 'shared')),
    ...sources(join(SRC, 'main'))
  ]) {
    if (file.endsWith('en.ts')) continue
    for (const key of keysIn(readFileSync(file, 'utf8'))) used.add(key)
  }

  it('translates every interface text, with the same placeholders', () => {
    expect([...used].filter((key) => EN[key] === undefined)).toEqual([])
    expect(
      [...used].filter(
        (key) => EN[key] !== undefined && placeholders(key) !== placeholders(EN[key] ?? '')
      )
    ).toEqual([])
  })

  it('has no entry the sources no longer use', () => {
    expect(Object.keys(EN).filter((key) => !used.has(key))).toEqual([])
  })

  it('switches language and fills the placeholders in the translated order', () => {
    setLanguage('en')
    expect(tr('Variante {0} di {1}', 2, 4)).toBe('Variant 2 of 4')
    expect(tr('testo senza voce')).toBe('testo senza voce')
    setLanguage('it')
    expect(tr('Variante {0} di {1}', 2, 4)).toBe('Variante 2 di 4')
  })
})
