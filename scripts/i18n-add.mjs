// Adds English entries to src/shared/i18n/en.ts from a JSON file { "Italian key": "English" }
// (new interface text: `node scripts/i18n-add.mjs new.json`, then prettier on en.ts). Keys already
// in the dictionary (quoted, or bare: prettier unquotes single words) are left as they are; change
// those by hand. src/main/i18nKeys.test.ts checks the result against the sources.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/shared/i18n/en.ts'
const additions = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
let text = readFileSync(file, 'utf8')
let added = 0
const skipped = []
for (const [key, english] of Object.entries(additions)) {
  if ([quote(key), `"${key}"`, key].some((written) => text.includes(`\n  ${written}:`))) {
    skipped.push(key)
    continue
  }
  // Prettier leaves no trailing comma: the last entry gets one before the new line goes after it.
  const close = text.lastIndexOf('\n}')
  const body = text.slice(0, close).replace(/\s*$/, '')
  const joined = body.endsWith(',') || body.endsWith('{') ? body : `${body},`
  text = `${joined}\n  ${quote(key)}: ${quote(english)},${text.slice(close)}`
  added++
}
writeFileSync(file, text)
console.log(`${added} added${skipped.length ? `, already there: ${skipped.join(' | ')}` : ''}`)
