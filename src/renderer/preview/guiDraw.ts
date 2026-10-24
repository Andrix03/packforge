// Drawing GUI sprites on a 2D canvas the way the game does: the pieces of layoutSprite, stretched
// or repeated, at a GUI scale, with sharp pixels. Shared by the editor's GUI preview and the mock
// screens of the GUI tab.
import { layoutSprite, type GuiScaling, type SpritePiece } from '../../shared/guiScaling'

type Source = CanvasImageSource & { width: number; height: number }

/** One piece: `px` image pixels per GUI unit of the source, `scale` canvas pixels per GUI unit. */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  image: Source,
  piece: SpritePiece,
  px: number,
  scale: number,
  offsetX = 0,
  offsetY = 0
): void {
  const { source: s, target: t } = piece
  const tx = (offsetX + t.x) * scale
  const ty = (offsetY + t.y) * scale
  if (piece.fill === 'stretch') {
    ctx.drawImage(
      image,
      s.x * px,
      s.y * px,
      s.width * px,
      s.height * px,
      tx,
      ty,
      t.width * scale,
      t.height * scale
    )
    return
  }
  // Tiled: repeat the source from the top-left corner, the last copies cut at the edge.
  for (let y = 0; y < t.height; y += s.height) {
    for (let x = 0; x < t.width; x += s.width) {
      const w = Math.min(s.width, t.width - x)
      const h = Math.min(s.height, t.height - y)
      ctx.drawImage(
        image,
        s.x * px,
        s.y * px,
        w * px,
        h * px,
        tx + x * scale,
        ty + y * scale,
        w * scale,
        h * scale
      )
    }
  }
}

/**
 * A whole sprite `width`×`height` GUI units large at (x, y), laid out with its scaling. `logical`:
 * the sprite's own size in GUI units (from its scaling, else the size it is drawn at).
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: Source,
  scaling: GuiScaling,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  logical?: { width: number; height: number }
): void {
  const size =
    logical ??
    (scaling.type === 'stretch'
      ? { width, height }
      : { width: scaling.width, height: scaling.height })
  const px = image.width / size.width
  for (const piece of layoutSprite(scaling, width, height, size.width, size.height)) {
    drawPiece(ctx, image, piece, px, scale, x, y)
  }
}
