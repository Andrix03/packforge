// Listing kit for Modrinth / CurseForge: the same zip, plus what the upload form asks for —
// summary, description (Modrinth wants an English one), game versions and suggested tags. Pure.
//
// Modrinth tags: GET api.modrinth.com/v2/tag/category, project_type resourcepack (2026-10-19):
// resolutions 8x- 16x 32x 48x 64x 128x 256x 512x+, features audio blocks core-shaders entities
// environment equipment fonts gui items locale models. CurseForge: only categories seen on live
// listings are suggested (16x, 32x, Animated, Photo Realistic, Traditional, Font Packs…).

import { mapKindOf } from './labpbr'

export interface PackFacts {
  name: string
  author: string
  version: string
  license: string
  /** Most common texture width (null without textures). */
  resolution: number | null
  textures: number
  /** Textures with a `_n` or `_s`. */
  pbr: number
  ctm: boolean
  animated: number
  /** `textures/<folder>` names present (block, item, entity, gui, font…). */
  folders: string[]
  sounds: boolean
  models: boolean
  lang: boolean
  /** "1.21.11 – 26.3"-style spans of the supported releases. */
  gameVersions: string[]
}

export function factsFromFiles(
  files: readonly string[],
  widths: ReadonlyMap<string, number>,
  base: Pick<PackFacts, 'name' | 'author' | 'version' | 'license' | 'gameVersions'>
): PackFacts {
  const pngs = files.filter((f) => /^assets\/[^/]+\/textures\/.+\.png$/.test(f))
  const albedos = pngs.filter((f) => !mapKindOf(f))
  const set = new Set(files)
  const counts = new Map<number, number>()
  for (const path of albedos) {
    const w = widths.get(path)
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  const resolution =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null
  const folders = [
    ...new Set(
      albedos.map((f) => /^assets\/[^/]+\/textures\/([^/]+)\//.exec(f)?.[1] ?? '').filter(Boolean)
    )
  ].sort()
  return {
    ...base,
    resolution,
    textures: albedos.length,
    pbr: albedos.filter(
      (f) => set.has(f.replace(/\.png$/, '_n.png')) || set.has(f.replace(/\.png$/, '_s.png'))
    ).length,
    ctm: files.some((f) => /^assets\/[^/]+\/optifine\/ctm\/.+\.properties$/.test(f)),
    animated: albedos.filter((f) => set.has(`${f}.mcmeta`)).length,
    folders,
    sounds: files.some((f) => /^assets\/[^/]+\/sounds\//.test(f)),
    models: files.some((f) => /^assets\/[^/]+\/models\//.test(f)),
    lang: files.some((f) => /^assets\/[^/]+\/lang\//.test(f))
  }
}

/** Modrinth's resolution tag for a texture size. */
export function modrinthResolution(size: number | null): string | null {
  if (size === null) return null
  if (size <= 8) return '8x-'
  if (size >= 512) return '512x+'
  const tags = [16, 32, 48, 64, 128, 256]
  return `${tags.reduce((best, t) => (Math.abs(t - size) < Math.abs(best - size) ? t : best))}x`
}

export function modrinthTags(facts: PackFacts): string[] {
  const tags: string[] = []
  const res = modrinthResolution(facts.resolution)
  if (res) tags.push(res)
  const has = (folder: string): boolean => facts.folders.includes(folder)
  if (has('block')) tags.push('blocks')
  if (has('item')) tags.push('items')
  if (has('entity')) tags.push('entities')
  if (has('gui')) tags.push('gui')
  if (has('font')) tags.push('fonts')
  if (has('environment')) tags.push('environment')
  if (has('trims') || has('equipment')) tags.push('equipment')
  if (facts.models) tags.push('models')
  if (facts.sounds) tags.push('audio')
  if (facts.lang) tags.push('locale')
  return tags
}

export function curseforgeTags(facts: PackFacts): string[] {
  const tags: string[] = []
  if (facts.resolution) tags.push(`${facts.resolution}x`)
  if (facts.animated > 0) tags.push('Animated')
  if (facts.folders.includes('font')) tags.push('Font Packs')
  return tags
}

function features(facts: PackFacts, lang: 'en' | 'it'): string[] {
  const en = lang === 'en'
  const lines: string[] = []
  if (facts.resolution) {
    lines.push(
      en
        ? `${facts.resolution}× textures (${facts.textures})`
        : `Texture ${facts.resolution}× (${facts.textures})`
    )
  }
  if (facts.pbr > 0) {
    lines.push(
      en
        ? `LabPBR 1.3 normal and specular maps on ${facts.pbr} textures (relief, reflections, emission) — needs Iris or OptiFine and a LabPBR shader pack`
        : `Mappe LabPBR 1.3 normal e specular su ${facts.pbr} texture (rilievo, riflessi, emissione) — serve Iris o OptiFine con uno shader pack LabPBR`
    )
  }
  if (facts.ctm) {
    lines.push(
      en
        ? 'Connected textures — needs Continuity (Fabric) or OptiFine'
        : 'Texture connesse — serve Continuity (Fabric) o OptiFine'
    )
  }
  if (facts.animated > 0) {
    const one = facts.animated === 1
    lines.push(
      en
        ? `${facts.animated} animated texture${one ? '' : 's'}`
        : `${facts.animated} texture animat${one ? 'a' : 'e'}`
    )
  }
  return lines
}

export function summaryText(facts: PackFacts, lang: 'en' | 'it'): string {
  const parts = features(facts, lang).map((f) => f.split(' — ')[0]!)
  const text = lang === 'en' ? `${parts.join(', ')}.` : `${parts.join(', ')}.`
  return text.length > 1 ? text.slice(0, 250) : ''
}

export function descriptionMarkdown(facts: PackFacts, lang: 'en' | 'it'): string {
  const en = lang === 'en'
  const versions = facts.gameVersions.join(', ') || (en ? 'see pack.mcmeta' : 'vedi pack.mcmeta')
  return [
    `# ${facts.name}`,
    '',
    en
      ? `${facts.name} is a resource pack for Minecraft: Java Edition${facts.author ? ` by ${facts.author}` : ''}.`
      : `${facts.name} è un resource pack per Minecraft: Java Edition${facts.author ? ` di ${facts.author}` : ''}.`,
    '',
    `## ${en ? 'Features' : 'Cosa contiene'}`,
    '',
    ...features(facts, lang).map((f) => `- ${f}`),
    '',
    `## ${en ? 'Installation' : 'Installazione'}`,
    '',
    en
      ? '1. Put the zip in your `resourcepacks` folder (Options → Resource Packs → Open Pack Folder).\n2. Enable it and move it above the default pack.'
      : '1. Metti lo zip nella cartella `resourcepacks` (Opzioni → Pacchetti di risorse → Apri cartella).\n2. Attivalo e spostalo sopra quello predefinito.',
    '',
    `${en ? 'Game versions' : 'Versioni del gioco'}: ${versions}  `,
    `${en ? 'Pack version' : 'Versione del pack'}: ${facts.version}  `,
    `${en ? 'License' : 'Licenza'}: ${facts.license}`,
    '',
    'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    ''
  ].join('\n')
}

/** The upload checklist with everything to paste, for both sites. */
export function listingText(facts: PackFacts, zipName: string): string {
  return [
    `${facts.name} ${facts.version}`,
    '',
    `File: ${zipName}`,
    `Summary (EN): ${summaryText(facts, 'en')}`,
    `Game versions: ${facts.gameVersions.join(', ') || '-'}`,
    `License: ${facts.license}`,
    '',
    `Modrinth tags: ${modrinthTags(facts).join(', ') || '-'}`,
    '  (also pick a style: vanilla-like, realistic, simplistic, themed, …)',
    `CurseForge categories: ${curseforgeTags(facts).join(', ') || '-'}`,
    '  (check the category list on the upload form)',
    '',
    'Descriptions: description-en.md (Modrinth requires English), description-it.md.',
    'Screenshots: the screenshots folder next to this one (📷 in Prova).',
    ''
  ].join('\n')
}
