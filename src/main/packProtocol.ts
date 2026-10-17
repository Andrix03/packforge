import type { OpenedSource, SourceRole } from './session'
import { readPackAsset } from './packSource'

// `pack://<p|v><generation>/<path>` serves PNG and .mcmeta files of the open pack (`p`) or the
// loaded vanilla jar (`v`) to the renderer. Only current generations resolve.

export const PACK_SCHEME = 'pack'

const HOST_PREFIX: Record<SourceRole, string> = { pack: 'p', vanilla: 'v' }

export function assetBase(role: SourceRole, generation: number): string {
  return `${PACK_SCHEME}://${HOST_PREFIX[role]}${generation}/`
}

export async function handlePackRequest(
  request: Request,
  getSource: (role: SourceRole) => OpenedSource | null
): Promise<Response> {
  if (request.method !== 'GET') return notFound()

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return notFound()
  }
  if (url.protocol !== `${PACK_SCHEME}:`) return notFound()

  const role = (Object.keys(HOST_PREFIX) as SourceRole[]).find((r) => {
    const current = getSource(r)
    return current !== null && url.host === `${HOST_PREFIX[r]}${current.generation}`
  })
  const current = role ? getSource(role) : null
  if (!current) return notFound()

  let path: string
  try {
    path = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    return notFound()
  }

  const asset = await readPackAsset(current.source, path)
  if (!asset) return notFound()
  return new Response(asset.bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      'content-type': asset.contentType,
      'cache-control': 'no-cache',
      // WebGL needs CORS to upload images from another origin as textures.
      // Safe: read-only, PNGs of the open pack/jar only, URLs change per open.
      'access-control-allow-origin': '*'
    }
  })
}

function notFound(): Response {
  return new Response(null, { status: 404 })
}
