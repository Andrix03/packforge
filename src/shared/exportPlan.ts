// Export of a pack: project info (packforge.json), what goes into the zip for each variant, the
// generated LICENSE / CREDITS / CHANGELOG, and the files that must stay out. Pure.
//
// Monetization note shown in the app (Minecraft EULA + Usage Guidelines, read 2026-10-19):
// mods/content you make "belong to you … as long as you don't sell them for money / try to make
// money from them"; donations are fine "so long as you don't offer the donor something that only
// they can use"; commercial material must carry "NOT AN OFFICIAL MINECRAFT [PRODUCT]. NOT
// APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT" — CREDITS.txt always includes it.

import { mapKindOf } from './labpbr'
import { tr } from './i18n'

/** The project file at the pack root (never exported, ignored by the game). */
export const PROJECT_FILE = 'packforge.json'

export const DISCLAIMER =
  'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.'

export interface License {
  id: string
  name: string
  url: string | null
}

export const LICENSES: readonly License[] = [
  { id: 'all-rights-reserved', name: tr('Tutti i diritti riservati'), url: null },
  { id: 'CC-BY-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  {
    id: 'CC-BY-SA-4.0',
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/'
  },
  {
    id: 'CC-BY-NC-4.0',
    name: 'CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/'
  },
  {
    id: 'CC-BY-NC-SA-4.0',
    name: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/'
  },
  {
    id: 'CC0-1.0',
    name: 'CC0 1.0 (pubblico dominio)',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/'
  },
  { id: 'MIT', name: 'MIT', url: 'https://opensource.org/license/mit' }
]

export interface Credit {
  name: string
  /** What they made or allowed (e.g. "sound effects, CC BY 4.0"). */
  what: string
}

export interface ChangelogEntry {
  version: string
  /** YYYY-MM-DD. */
  date: string
  notes: string
}

export interface ProjectInfo {
  version: string
  author: string
  license: string
  credits: Credit[]
  changelog: ChangelogEntry[]
}

export const DEFAULT_PROJECT: ProjectInfo = {
  version: '1.0.0',
  author: '',
  license: 'all-rights-reserved',
  credits: [],
  changelog: []
}

const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/
const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** Reads packforge.json leniently: invalid parts fall back to the defaults. */
export function parseProject(json: unknown): ProjectInfo {
  if (typeof json !== 'object' || json === null) return { ...DEFAULT_PROJECT }
  const r = json as Record<string, unknown>
  const version = text(r['version'], 32)
  const license = text(r['license'], 64)
  return {
    version: VERSION.test(version) ? version : DEFAULT_PROJECT.version,
    author: text(r['author'], 120),
    license: LICENSES.some((l) => l.id === license) ? license : DEFAULT_PROJECT.license,
    credits: (Array.isArray(r['credits']) ? r['credits'] : [])
      .slice(0, 200)
      .map((c) => ({ name: text((c as Credit)?.name, 120), what: text((c as Credit)?.what, 300) }))
      .filter((c) => c.name !== ''),
    changelog: (Array.isArray(r['changelog']) ? r['changelog'] : [])
      .slice(0, 500)
      .map((e) => ({
        version: text((e as ChangelogEntry)?.version, 32),
        date: text((e as ChangelogEntry)?.date, 10),
        notes: text((e as ChangelogEntry)?.notes, 4000)
      }))
      .filter((e) => VERSION.test(e.version))
  }
}

export function validVersion(version: string): boolean {
  return VERSION.test(version)
}

/** Why a file must not be exported (work files, OS clutter, hidden folders), or null. */
export function strayReason(path: string): string | null {
  const parts = path.split('/')
  const name = parts.at(-1)!.toLowerCase()
  if (parts.some((p) => p.startsWith('.'))) return tr('file o cartella nascosti')
  if (name === 'thumbs.db' || name === 'desktop.ini') return tr('file di sistema di Windows')
  if (/\.(psd|psb|kra|aseprite|ase|xcf|pdn|blend|clip|sai2?)$/.test(name))
    return tr('file di lavoro di un editor')
  if (/(\.tmp|\.bak|~)$/.test(name)) return tr('file temporaneo')
  return null
}

export type ExportVariant =
  { kind: 'full' } | { kind: 'no-pbr' } | { kind: 'resolution'; resolution: number }

export function variantLabel(variant: ExportVariant): string {
  return variant.kind === 'full'
    ? tr('completo')
    : variant.kind === 'no-pbr'
      ? tr('senza PBR')
      : `${variant.resolution}×`
}

/** File-name suffix of a variant ('' for the full pack). */
export function variantSuffix(variant: ExportVariant): string {
  return variant.kind === 'full'
    ? ''
    : variant.kind === 'no-pbr'
      ? '-base'
      : `-${variant.resolution}x`
}

/** `My Pack` 1.2.0 → `My-Pack-1.2.0.zip` (safe on every OS). */
export function exportFileName(packName: string, version: string, variant: ExportVariant): string {
  const slug =
    packName
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'pack'
  return `${slug}-${version}${variantSuffix(variant)}.zip`
}

/** The pack files a variant exports (project file and stray files never; no maps for no-pbr). */
export function filesForVariant(files: readonly string[], variant: ExportVariant): string[] {
  return files.filter((path) => {
    if (path === PROJECT_FILE || strayReason(path)) return false
    if (variant.kind === 'no-pbr') {
      const png = path.replace(/\.mcmeta$/i, '')
      if (mapKindOf(png)) return false
    }
    return true
  })
}

export function licenseText(info: ProjectInfo, packName: string, year: number): string {
  const license = LICENSES.find((l) => l.id === info.license) ?? LICENSES[0]!
  const owner = info.author || 'the author'
  if (license.id === 'all-rights-reserved') {
    return `${packName}\nCopyright (c) ${year} ${owner}. All rights reserved.\n\nYou may use this resource pack in your own game. Redistribution, re-uploads and modified copies require written permission from the author.\n`
  }
  return `${packName}\nCopyright (c) ${year} ${owner}.\n\nLicensed under ${license.name}${license.url ? `: ${license.url}` : ''}\n`
}

export function creditsText(info: ProjectInfo, packName: string): string {
  const lines = [`${packName}${info.author ? ` by ${info.author}` : ''}`, '']
  if (info.credits.length > 0) {
    lines.push('Credits:')
    for (const credit of info.credits)
      lines.push(`- ${credit.name}${credit.what ? `: ${credit.what}` : ''}`)
    lines.push('')
  }
  lines.push('Made with PackForge.', '', DISCLAIMER, '')
  return lines.join('\n')
}

/** Newest first, as Markdown. */
export function changelogText(info: ProjectInfo, packName: string): string {
  const entries = [...info.changelog].sort((a, b) => compareVersions(b.version, a.version))
  const body = entries
    .map((e) => `## ${e.version}${e.date ? ` (${e.date})` : ''}\n\n${e.notes.trim() || '-'}\n`)
    .join('\n')
  return `# ${packName} changelog\n\n${body || 'No changes recorded yet.\n'}`
}

/** 1.10.0 > 1.9.2 (numeric parts compared as numbers). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/)
  const pb = b.split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? ''
    const y = pb[i] ?? ''
    const nx = Number(x)
    const ny = Number(y)
    const diff =
      Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== ''
        ? nx - ny
        : x.localeCompare(y)
    if (diff !== 0) return diff
  }
  return 0
}

export interface ExportCheck {
  errors: string[]
  warnings: string[]
  /** Pack textures with exactly the vanilla pixels (must not be redistributed). */
  vanillaCopies: string[]
  stray: Array<{ path: string; reason: string }>
  /** Files a full export would contain. */
  files: number
}

export type ExportResult =
  | {
      ok: true
      path: string
      files: number
      bytes: number
      kept: string[]
      /** Bytes the lossless PNG optimisation saved. */
      saved: number
    }
  | { ok: false; error: string; exists?: boolean }

/** Checks a variant sent by the renderer (main re-validates everything). */
export function parseVariant(value: unknown): ExportVariant | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (v['kind'] === 'full' || v['kind'] === 'no-pbr') return { kind: v['kind'] }
  if (
    v['kind'] === 'resolution' &&
    [16, 32, 64, 128, 256, 512].includes(v['resolution'] as number)
  ) {
    return { kind: 'resolution', resolution: v['resolution'] as number }
  }
  return null
}

export type ListingResult =
  { ok: true; dir: string; written: string[]; kept: string[] } | { ok: false; error: string }
