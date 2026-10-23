// Prints a version's section of CHANGELOG.md for the GitHub release: first line the heading
// without the date ("0.1.0 alpha"), a blank line, then the notes. Fails when the version is missing,
// so a tag never ships without notes.
import { readFileSync } from 'node:fs'

const version = process.argv[2]
const lines = readFileSync('CHANGELOG.md', 'utf8').split(/\r?\n/)
const start = lines.findIndex(
  (line) => line.startsWith(`## ${version} `) || line === `## ${version}`
)
if (!version || start < 0) {
  console.error(`CHANGELOG.md has no "## ${version}" section.`)
  process.exit(1)
}
const next = lines.findIndex((line, i) => i > start && line.startsWith('## '))
const title = lines[start].slice(3).split(' — ')[0]
const body = lines
  .slice(start + 1, next < 0 ? undefined : next)
  .join('\n')
  .trim()
console.log(`${title}\n\n${body}`)
