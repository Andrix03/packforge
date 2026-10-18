import { useEffect, useRef, useState } from 'react'

type Source = string | HTMLCanvasElement

/** GUI pixels: a slot is 18 wide in the inventory, 20 in the hotbar; items are 16. */
const SLOTS = 9
const HOTBAR_WIDTH = SLOTS * 20 + 2
const INVENTORY_WIDTH = SLOTS * 18 + 14

/**
 * The item in the hotbar and in an inventory row, drawn like the game at a GUI scale:
 * slot 1 is the texture being tested, slot 2 the vanilla one (when there is one).
 */
export function ItemSlots({
  mine,
  vanilla,
  frameHeight
}: {
  mine: Source
  vanilla: string | null
  /** Rows of the first frame of the tested texture (null = top square). */
  frameHeight: number | null
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(3)

  useEffect(() => {
    let current = true
    void Promise.all([toImage(mine), vanilla ? toImage(vanilla) : null]).then(([a, b]) => {
      const canvas = canvasRef.current
      if (!current || !canvas) return
      draw(canvas, scale, [a && { image: a, frameHeight }, b && { image: b, frameHeight: null }])
    })
    return () => {
      current = false
    }
  }, [mine, vanilla, frameHeight, scale])

  return (
    <div className="item-slots">
      <div className="row wrap">
        <strong className="small">Inventario e barra</strong>
        <span className="muted small">1 = la tua texture{vanilla ? ', 2 = vanilla' : ''}</span>
        <label className="inline-select">
          <span className="muted small">Scala GUI</span>
          <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
            {[1, 2, 3, 4].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <canvas ref={canvasRef} className="item-slots-canvas" aria-label="Slot dell'inventario" />
    </div>
  )
}

interface Item {
  image: CanvasImageSource & { width: number; height: number }
  frameHeight: number | null
}

function draw(canvas: HTMLCanvasElement, scale: number, items: Array<Item | null>): void {
  canvas.width = INVENTORY_WIDTH * scale
  canvas.height = 52 * scale
  const g = canvas.getContext('2d')
  if (!g) return
  g.imageSmoothingEnabled = false
  g.scale(scale, scale)
  const rect = (x: number, y: number, w: number, h: number, color: string): void => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  const item = (index: number, x: number, y: number): void => {
    const it = items[index]
    if (!it) return
    const { image } = it
    const height = Math.min(image.height, it.frameHeight ?? Math.min(image.width, image.height))
    g.drawImage(image, 0, 0, image.width, height, x, y, 16, 16)
  }

  // Hotbar (dark, over the world), the first slot selected.
  const hx = (INVENTORY_WIDTH - HOTBAR_WIDTH) / 2
  rect(hx, 0, HOTBAR_WIDTH, 22, '#1f1f1f')
  for (let i = 0; i < SLOTS; i++) {
    const x = hx + 1 + i * 20
    rect(x, 1, 20, 20, '#5a5a5a')
    rect(x + 2, 3, 16, 16, '#3c3c3c')
    item(i, x + 2, 3)
  }
  g.strokeStyle = '#ffffff'
  g.lineWidth = 2
  g.strokeRect(hx + 1, 1, 20, 20)

  // Inventory row on the light GUI background.
  rect(0, 26, INVENTORY_WIDTH, 26, '#c6c6c6')
  for (let i = 0; i < SLOTS; i++) {
    const x = 7 + i * 18
    rect(x, 30, 18, 18, '#ffffff')
    rect(x, 30, 17, 17, '#373737')
    rect(x + 1, 31, 16, 16, '#8b8b8b')
    item(i, x + 1, 31)
  }
}

function toImage(source: Source): Promise<Item['image'] | null> {
  if (typeof source !== 'string') return Promise.resolve(source)
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}
