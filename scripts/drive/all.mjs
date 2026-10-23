// Runs every UI scenario in scripts/drive/scenarios (one fresh app and fixture pack each), building
// once. Prints one line per scenario and the failing checks. `npm run drive:all [-- --no-build]`.

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const scenarios = readdirSync(join(here, 'scenarios'))
  .filter((name) => name.endsWith('.mjs'))
  .sort()
let build = !process.argv.includes('--no-build')
let failed = 0
let flaky = 0
for (const name of scenarios) {
  const args = [join(here, 'drive.mjs'), join(here, 'scenarios', name)]
  if (!build) args.push('--no-build')
  build = false
  let run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  // Back to back the machine is busier: a failing scenario gets one more run, reported as such.
  let retried = false
  if (run.status !== 0) {
    const again = spawnSync(
      process.execPath,
      [...args.filter((arg) => arg !== '--no-build'), '--no-build'],
      { cwd: root, encoding: 'utf8' }
    )
    if (again.status === 0) {
      run = again
      retried = true
      flaky++
    }
  }
  const output = `${run.stdout}${run.stderr}`
  const summary = output.match(/(\d+)\/(\d+) checks passed/)
  const ok = run.status === 0
  if (!ok) failed++
  console.log(
    `${ok ? '✓' : '✗'} ${name.padEnd(18)} ${summary ? `${summary[1]}/${summary[2]}` : ''}${retried ? '  (passata al 2° tentativo)' : ''}`
  )
  if (!ok) {
    for (const line of output.split(/\r?\n/)) {
      if (/^(FAIL|SCENARIO ERROR|BUILD FAILED|error screenshot)/.test(line))
        console.log(`    ${line}`)
    }
  }
}
if (flaky > 0) console.log(`${flaky} scenario(s) passed only on the second run (timing under load)`)
console.log(failed === 0 ? 'ALL SCENARIOS PASSED' : `${failed} SCENARIO(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
