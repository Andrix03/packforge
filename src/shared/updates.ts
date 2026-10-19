// "A newer PackForge is out": the latest GitHub release compared with the running version.
// Notify only — unsigned builds cannot update themselves (Smart App Control blocks them).

import { compareVersions } from './exportPlan'

export const RELEASES_PAGE = 'https://github.com/Andrix03/packforge/releases'
export const LATEST_RELEASE_API = 'https://api.github.com/repos/Andrix03/packforge/releases/latest'

export interface ReleaseInfo {
  version: string
  url: string
}

/** The latest release from GitHub's JSON, or null for drafts, pre-releases and odd data. */
export function parseRelease(json: unknown): ReleaseInfo | null {
  if (typeof json !== 'object' || json === null) return null
  const r = json as Record<string, unknown>
  if (r['draft'] === true || r['prerelease'] === true) return null
  const tag = typeof r['tag_name'] === 'string' ? r['tag_name'] : ''
  const version = /^v?(\d+\.\d+\.\d+)$/.exec(tag)?.[1]
  const url = typeof r['html_url'] === 'string' ? r['html_url'] : ''
  // Only links into this project's releases are ever opened.
  if (!version || !isReleaseUrl(url)) return null
  return { version, url }
}

export function isReleaseUrl(url: string): boolean {
  return url === RELEASES_PAGE || url.startsWith(`${RELEASES_PAGE}/`)
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
