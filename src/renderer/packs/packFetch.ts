// Reading pack (or vanilla jar) files through pack://, for the workspace tools (validator,
// batch, color variants). Images are decoded by our exact codec (straight alpha).

import { assetUrl } from '../../shared/ipc'
import { decodePng, type DecodedPng } from '../../shared/pngCodec'

export interface FileSource {
  base: string
  files: ReadonlySet<string>
  versions?: Readonly<Record<string, number>>
}

export async function fetchBytes(source: FileSource, path: string): Promise<Uint8Array> {
  const response = await fetch(assetUrl(source.base, path, source.versions?.[path] ?? 0))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function fetchText(source: FileSource, path: string): Promise<string> {
  return new TextDecoder().decode(await fetchBytes(source, path))
}

export async function loadPng(source: FileSource, path: string): Promise<DecodedPng> {
  const decoded = decodePng(await fetchBytes(source, path))
  if (!decoded.ok) throw new Error(decoded.error)
  return decoded.image
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
