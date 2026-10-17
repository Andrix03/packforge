import { readPackPng, type PackSource } from './packSource'

// `pack://g<generation>/<pack-relative path>` serves PNGs of the open pack to
// the renderer (thumbnails). Only the current generation resolves.

export const PACK_SCHEME = 'pack'

export function packAssetBase(generation: number): string {
  return `${PACK_SCHEME}://g${generation}/`
}

export async function handlePackRequest(
  request: Request,
  current: { source: PackSource; generation: number } | null
): Promise<Response> {
  if (request.method !== 'GET' || !current) return notFound()

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return notFound()
  }
  if (url.protocol !== `${PACK_SCHEME}:` || url.host !== `g${current.generation}`) return notFound()

  let path: string
  try {
    path = decodeURIComponent(url.pathname.replace(/^\//, ''))
  } catch {
    return notFound()
  }

  const bytes = await readPackPng(current.source, path)
  if (!bytes) return notFound()
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' }
  })
}

function notFound(): Response {
  return new Response(null, { status: 404 })
}
