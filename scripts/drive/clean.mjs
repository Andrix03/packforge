// Deletes the temp folders single scenario runs leave behind (packforge-drive-*: fixture pack,
// Chromium user data, screenshots). `npm run drive:clean`.
import { readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const folders = readdirSync(tmpdir()).filter((name) => name.startsWith('packforge-drive-'))
let removed = 0
for (const name of folders) {
  try {
    rmSync(join(tmpdir(), name), { recursive: true, force: true, maxRetries: 3 })
    removed++
  } catch {
    // Still in use (an app left open with --keep-open): skipped.
  }
}
console.log(`removed ${removed} of ${folders.length} scenario folders`)
