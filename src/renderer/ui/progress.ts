// Pure maths of the segmented progress bar (components.tsx draws it).

/** How many of `cells` segments are lit for `done` of `total` (a started job shows at least one). */
export function litCells(done: number, total: number, cells: number): number {
  if (!(total > 0) || !(done > 0)) return 0
  if (done >= total) return cells
  return Math.min(cells - 1, Math.max(1, Math.floor((done / total) * cells)))
}
