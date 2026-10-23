// Runs the UI scenarios in scripts/drive/scenarios (one fresh app and fixture pack each), building
// once. Prints one line per scenario with its time, the failing checks, and the slowest scenarios.
//
//   npm run drive:all [-- --no-build] [--jobs <n>] [--only <a,b>] [--failed]
//
// --jobs: scenarios run side by side (default 2; 1 = one at a time). A scenario that fails is run
//   once more at the end, alone, so a timing hiccup under load doesn't count as a failure (it is
//   reported as such).
// --only: scenarios whose name contains one of the words. --failed: the ones that failed last time.
// Passing runs delete their temp folder (--clean); failing ones keep it for the screenshots.

import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const argv = process.argv.slice(2)
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const LAST = join(tmpdir(), 'packforge-drive-last.json')

let scenarios = readdirSync(join(here, 'scenarios'))
  .filter((name) => name.endsWith('.mjs'))
  .sort()
const only = option('--only')
if (only) {
  const words = only
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
  scenarios = scenarios.filter((name) => words.some((w) => name.includes(w)))
}
if (argv.includes('--failed')) {
  let last = []
  try {
    last = JSON.parse(readFileSync(LAST, 'utf8')).failed ?? []
  } catch {
    // No previous run.
  }
  scenarios = scenarios.filter((name) => last.includes(name))
}
if (scenarios.length === 0) {
  console.log('No scenario to run.')
  process.exit(0)
}
const jobs = Math.max(1, Number(option('--jobs') ?? 2))
const started = Date.now()

if (!argv.includes('--no-build')) {
  const build = spawnSync(`"${join(root, 'node_modules', '.bin', 'electron-vite')}" build`, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '0' }
  })
  if (build.status !== 0) {
    console.log(
      `BUILD FAILED\n${`${build.stdout}${build.stderr}`.split('\n').slice(-30).join('\n')}`
    )
    process.exit(1)
  }
}

/** One scenario in its own Electron, on its own CDP port. */
function run(name, port) {
  const args = [join(here, 'drive.mjs'), join(here, 'scenarios', name), '--no-build', '--clean']
  args.push('--port', String(port))
  const t0 = Date.now()
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: root })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('close', (code) => done({ name, ok: code === 0, output, ms: Date.now() - t0 }))
  })
}

const lineOf = (r, retried) => {
  const summary = r.output.match(/(\d+)\/(\d+) checks passed/)
  const time = `${(r.ms / 1000).toFixed(0)} s`.padStart(5)
  const note = retried ? '  (passed on the second run, alone)' : ''
  return `${r.ok ? '✓' : '✗'} ${r.name.padEnd(20)} ${time}  ${summary ? `${summary[1]}/${summary[2]}` : ''}${note}`
}
const failingLines = (r) =>
  r.output
    .split(/\r?\n/)
    .filter((line) => /^(FAIL|SCENARIO ERROR|BUILD FAILED|error screenshot)/.test(line))
    .map((line) => `    ${line}`)

// Workers take scenarios from the queue; each has its own port range.
const queue = [...scenarios]
const results = []
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async (_, worker) => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const r = await run(name, 9400 + worker * 10)
      results.push(r)
      if (r.ok) console.log(lineOf(r, false))
    }
  })
)

// Failures again, one at a time.
let failed = 0
let flaky = 0
for (const r of results.filter((r) => !r.ok).sort((a, b) => a.name.localeCompare(b.name))) {
  const again = await run(r.name, 9390)
  if (again.ok) {
    flaky++
    console.log(lineOf(again, true))
    // The first run kept its folder for the screenshots: not needed any more.
    const shots = /screenshots: (.+)$/m.exec(r.output)?.[1]?.trim()
    if (shots && shots !== 'removed')
      rmSync(dirname(shots), { recursive: true, force: true, maxRetries: 5 })
    Object.assign(r, again)
  } else {
    failed++
    console.log(lineOf(again, false))
    for (const line of failingLines(again)) console.log(line)
  }
}

writeFileSync(LAST, JSON.stringify({ failed: results.filter((r) => !r.ok).map((r) => r.name) }))
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 5)
console.log(
  `slowest: ${slowest.map((r) => `${r.name.replace('.mjs', '')} ${(r.ms / 1000).toFixed(0)} s`).join(', ')}`
)
console.log(
  `${results.length} scenarios in ${((Date.now() - started) / 60000).toFixed(1)} min, ${jobs} at a time`
)
if (flaky > 0) console.log(`${flaky} scenario(s) passed only on the second run`)
console.log(failed === 0 ? 'ALL SCENARIOS PASSED' : `${failed} SCENARIO(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
