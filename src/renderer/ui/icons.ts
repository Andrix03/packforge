// Pixel icons (16×16, two tones: a = full colour, b = shade at 45 %), drawn on the design canvas
// (.claude/design-v2) and stored as SVG paths. New icons: draw them with pixelArt.ts.

export interface PixelIconData {
  a: string
  b: string
}

export const NAV_ICONS = {
  logo: {
    a: 'M0 2h15v1h-15zM2 3h13v1h-13zM3 4h12v1h-12zM7 5h5v1h-5zM7 6h5v1h-5zM7 7h5v1h-5zM5 8h9v1h-9zM5 9h9v1h-9zM3 10h13v1h-13zM3 11h13v1h-13zM3 12h13v1h-13z',
    b: ''
  },
  search: {
    a: 'M6 1h1v1h-1zM3 2h7v1h-7zM2 3h3v1h-3zM8 3h3v1h-3zM2 4h2v1h-2zM9 4h2v1h-2zM2 5h1v1h-1zM10 5h1v1h-1zM1 6h2v1h-2zM10 6h2v1h-2zM2 7h1v1h-1zM10 7h1v1h-1zM2 8h2v1h-2zM9 8h2v1h-2zM2 9h3v1h-3zM8 9h3v1h-3zM3 10h9v1h-9zM6 11h1v1h-1zM10 11h3v1h-3zM11 12h3v1h-3zM12 13h3v1h-3zM13 14h2v1h-2z',
    b: ''
  },
  eye: {
    a: 'M5 4h6v1h-6zM4 5h1v1h-1zM11 5h1v1h-1zM3 6h1v1h-1zM6 6h3v1h-3zM12 6h1v1h-1zM2 7h1v1h-1zM5 7h5v1h-5zM13 7h1v1h-1zM1 8h1v1h-1zM5 8h5v1h-5zM14 8h1v1h-1zM2 9h1v1h-1zM6 9h3v1h-3zM13 9h1v1h-1zM3 10h1v1h-1zM12 10h1v1h-1zM4 11h1v1h-1zM11 11h1v1h-1zM5 12h6v1h-6z',
    b: ''
  },
  chest: {
    a: 'M1 3h14v1h-14zM1 4h1v1h-1zM14 4h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM7 6h2v1h-2zM14 6h1v1h-1zM1 7h14v1h-14zM1 8h1v1h-1zM7 8h2v1h-2zM14 8h1v1h-1zM1 9h1v1h-1zM7 9h2v1h-2zM14 9h1v1h-1zM1 10h1v1h-1zM14 10h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h14v1h-14z',
    b: ''
  },
  cube: {
    a: 'M7 1h2v1h-2zM5 2h2v1h-2zM9 2h2v1h-2zM3 3h2v1h-2zM11 3h2v1h-2zM1 4h2v1h-2zM13 4h2v1h-2zM1 5h3v1h-3zM12 5h3v1h-3zM1 6h1v1h-1zM4 6h2v1h-2zM10 6h2v1h-2zM14 6h1v1h-1zM1 7h1v1h-1zM6 7h4v1h-4zM14 7h1v1h-1zM1 8h1v1h-1zM7 8h2v1h-2zM14 8h1v1h-1zM1 9h1v1h-1zM7 9h2v1h-2zM14 9h1v1h-1zM1 10h1v1h-1zM7 10h2v1h-2zM14 10h1v1h-1zM1 11h1v1h-1zM7 11h2v1h-2zM14 11h1v1h-1zM2 12h2v1h-2zM7 12h2v1h-2zM12 12h2v1h-2zM4 13h2v1h-2zM7 13h2v1h-2zM10 13h2v1h-2zM6 14h4v1h-4z',
    b: ''
  },
  spark: {
    a: 'M6 1h1v1h-1zM6 2h1v1h-1zM6 3h1v1h-1zM5 4h3v1h-3zM4 5h5v1h-5zM1 6h11v1h-11zM4 7h5v1h-5zM5 8h3v1h-3zM6 9h1v1h-1zM6 10h1v1h-1zM13 10h1v1h-1zM6 11h1v1h-1zM13 11h1v1h-1zM11 12h5v1h-5zM13 13h1v1h-1zM13 14h1v1h-1z',
    b: ''
  },
  upload: {
    a: 'M7 1h2v1h-2zM6 2h4v1h-4zM5 3h6v1h-6zM4 4h8v1h-8zM7 5h2v1h-2zM7 6h2v1h-2zM7 7h2v1h-2zM7 8h2v1h-2zM7 9h2v1h-2zM1 10h2v1h-2zM13 10h2v1h-2zM1 11h2v1h-2zM13 11h2v1h-2zM1 12h2v1h-2zM13 12h2v1h-2zM1 13h14v1h-14zM1 14h14v1h-14z',
    b: ''
  },
  pencil: {
    a: 'M13 0h1v1h-1zM12 1h3v1h-3zM11 2h5v1h-5zM10 3h5v1h-5zM9 4h5v1h-5zM8 5h5v1h-5zM7 6h5v1h-5zM6 7h5v1h-5zM5 8h5v1h-5zM4 9h5v1h-5zM3 10h5v1h-5zM2 11h5v1h-5zM2 12h4v1h-4zM1 13h4v1h-4zM1 14h2v1h-2z',
    b: ''
  },
  eraser: {
    a: 'M6 3h2v1h-2zM5 4h1v1h-1zM8 4h1v1h-1zM4 5h1v1h-1zM9 5h1v1h-1zM3 6h1v1h-1zM10 6h1v1h-1zM3 7h1v1h-1zM9 7h1v1h-1zM11 7h1v1h-1zM4 8h1v1h-1zM8 8h1v1h-1zM10 8h3v1h-3zM5 9h1v1h-1zM7 9h1v1h-1zM9 9h5v1h-5zM6 10h1v1h-1zM8 10h7v1h-7zM7 11h8v1h-8zM8 12h6v1h-6zM9 13h4v1h-4zM10 14h2v1h-2zM1 15h9v1h-9z',
    b: ''
  },
  fill: {
    a: 'M3 2h6v1h-6zM2 3h1v1h-1zM9 3h1v1h-1zM1 4h2v1h-2zM9 4h2v1h-2zM1 6h11v1h-11zM13 6h2v1h-2zM1 7h11v1h-11zM13 7h2v1h-2zM1 8h1v1h-1zM11 8h1v1h-1zM13 8h2v1h-2zM1 9h1v1h-1zM11 9h1v1h-1zM13 9h2v1h-2zM1 10h1v1h-1zM11 10h1v1h-1zM13 10h2v1h-2zM2 11h1v1h-1zM11 11h1v1h-1zM13 11h2v1h-2zM2 12h1v1h-1zM10 12h1v1h-1zM13 12h1v1h-1zM2 13h1v1h-1zM10 13h1v1h-1zM2 14h9v1h-9z',
    b: ''
  },
  picker: {
    a: 'M11 1h1v1h-1zM9 2h5v1h-5zM9 3h5v1h-5zM8 4h7v1h-7zM6 5h1v1h-1zM9 5h5v1h-5zM7 6h1v1h-1zM9 6h5v1h-5zM7 7h2v1h-2zM11 7h1v1h-1zM6 8h4v1h-4zM5 9h3v1h-3zM10 9h1v1h-1zM4 10h3v1h-3zM3 11h3v1h-3zM2 12h3v1h-3zM2 13h2v1h-2zM1 14h1v1h-1z',
    b: ''
  },
  shade: {
    a: 'M9 1h1v1h-1zM6 2h7v1h-7zM5 3h4v1h-4zM11 3h3v1h-3zM5 4h4v1h-4zM12 4h2v1h-2zM5 5h4v1h-4zM13 5h1v1h-1zM4 6h5v1h-5zM13 6h2v1h-2zM5 7h4v1h-4zM13 7h1v1h-1zM5 8h4v1h-4zM12 8h2v1h-2zM5 9h4v1h-4zM11 9h3v1h-3zM6 10h7v1h-7zM4 11h2v1h-2zM9 11h1v1h-1zM3 12h3v1h-3zM2 13h3v1h-3zM1 14h3v1h-3zM1 15h2v1h-2z',
    b: ''
  },
  noise: {
    a: 'M13 1h1v1h-1zM11 2h1v1h-1zM4 3h3v1h-3zM4 4h3v1h-3zM12 4h1v1h-1zM14 4h1v1h-1zM4 5h3v1h-3zM2 6h7v1h-7zM11 6h1v1h-1zM2 7h7v1h-7zM13 7h1v1h-1zM2 8h7v1h-7zM2 9h1v1h-1zM8 9h1v1h-1zM11 9h1v1h-1zM2 10h7v1h-7zM14 10h1v1h-1zM2 11h7v1h-7zM2 12h7v1h-7zM2 13h7v1h-7zM2 14h7v1h-7z',
    b: ''
  },
  line: {
    a: 'M12 1h3v1h-3zM12 2h3v1h-3zM12 3h3v1h-3zM11 4h1v1h-1zM10 5h1v1h-1zM9 6h1v1h-1zM8 7h1v1h-1zM7 8h1v1h-1zM6 9h1v1h-1zM5 10h1v1h-1zM4 11h1v1h-1zM1 12h3v1h-3zM1 13h3v1h-3zM1 14h3v1h-3z',
    b: ''
  },
  rect: {
    a: 'M1 3h14v1h-14zM1 4h14v1h-14zM1 5h2v1h-2zM13 5h2v1h-2zM1 6h2v1h-2zM13 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM1 8h2v1h-2zM13 8h2v1h-2zM1 9h2v1h-2zM13 9h2v1h-2zM1 10h2v1h-2zM13 10h2v1h-2zM1 11h14v1h-14zM1 12h14v1h-14z',
    b: ''
  },
  ellipse: {
    a: 'M5 1h6v1h-6zM4 2h8v1h-8zM3 3h3v1h-3zM10 3h3v1h-3zM2 4h2v1h-2zM12 4h2v1h-2zM1 5h3v1h-3zM12 5h3v1h-3zM1 6h2v1h-2zM13 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM1 8h2v1h-2zM13 8h2v1h-2zM1 9h2v1h-2zM13 9h2v1h-2zM1 10h3v1h-3zM12 10h3v1h-3zM2 11h2v1h-2zM12 11h2v1h-2zM3 12h3v1h-3zM10 12h3v1h-3zM4 13h8v1h-8zM5 14h6v1h-6z',
    b: ''
  },
  select: {
    a: 'M1 2h2v1h-2zM4 2h2v1h-2zM7 2h2v1h-2zM10 2h2v1h-2zM13 2h2v1h-2zM1 3h1v1h-1zM14 3h1v1h-1zM1 5h1v1h-1zM14 5h1v1h-1zM1 6h1v1h-1zM14 6h1v1h-1zM1 8h1v1h-1zM14 8h1v1h-1zM1 9h1v1h-1zM14 9h1v1h-1zM1 11h1v1h-1zM14 11h1v1h-1zM1 12h1v1h-1zM14 12h1v1h-1zM1 13h2v1h-2zM4 13h2v1h-2zM7 13h2v1h-2zM10 13h2v1h-2zM13 13h2v1h-2z',
    b: ''
  },
  wand: {
    a: 'M12 0h1v1h-1zM10 1h1v1h-1zM12 1h1v1h-1zM14 1h1v1h-1zM12 2h1v1h-1zM9 3h7v1h-7zM12 4h1v1h-1zM10 5h1v1h-1zM12 5h1v1h-1zM14 5h1v1h-1zM12 6h1v1h-1zM7 8h2v1h-2zM6 9h3v1h-3zM5 10h3v1h-3zM4 11h3v1h-3zM3 12h3v1h-3zM2 13h3v1h-3zM1 14h3v1h-3zM1 15h2v1h-2z',
    b: ''
  },
  move: {
    a: 'M7 1h2v1h-2zM6 2h4v1h-4zM5 3h6v1h-6zM7 4h2v1h-2zM3 5h1v1h-1zM7 5h2v1h-2zM12 5h1v1h-1zM2 6h2v1h-2zM7 6h2v1h-2zM12 6h2v1h-2zM1 7h14v1h-14zM1 8h14v1h-14zM2 9h2v1h-2zM7 9h2v1h-2zM12 9h2v1h-2zM3 10h1v1h-1zM7 10h2v1h-2zM12 10h1v1h-1zM7 11h2v1h-2zM5 12h6v1h-6zM6 13h4v1h-4zM7 14h2v1h-2z',
    b: ''
  }
} satisfies Record<string, PixelIconData>

export const TOOL_ICONS = {
  pencil: {
    a: 'M13 0h1v1h-1zM12 1h3v1h-3zM12 2h4v1h-4zM13 3h2v1h-2zM11 4h1v1h-1zM10 5h3v1h-3zM9 6h3v1h-3zM8 7h3v1h-3zM7 8h3v1h-3zM6 9h3v1h-3zM5 10h3v1h-3zM6 11h1v1h-1zM1 13h2v1h-2zM1 14h2v1h-2z',
    b: 'M11 2h1v1h-1zM10 3h3v1h-3zM9 4h2v1h-2zM12 4h2v1h-2zM8 5h2v1h-2zM7 6h2v1h-2zM6 7h2v1h-2zM5 8h2v1h-2zM4 9h2v1h-2zM3 10h2v1h-2zM2 11h4v1h-4zM2 12h4v1h-4zM3 13h2v1h-2z'
  },
  eraser: {
    a: 'M7 7h1v1h-1zM6 8h3v1h-3zM5 9h5v1h-5zM4 10h7v1h-7zM5 11h7v1h-7zM6 12h5v1h-5zM7 13h3v1h-3zM8 14h1v1h-1z',
    b: 'M11 3h1v1h-1zM10 4h3v1h-3zM9 5h5v1h-5zM8 6h7v1h-7zM9 7h7v1h-7zM10 8h5v1h-5zM11 9h3v1h-3zM12 10h1v1h-1zM0 15h10v1h-10z'
  },
  fill: {
    a: 'M5 1h4v1h-4zM4 2h1v1h-1zM9 2h1v1h-1zM3 3h1v1h-1zM10 3h1v1h-1zM2 4h10v1h-10zM2 5h1v1h-1zM11 5h1v1h-1zM2 6h10v1h-10zM3 7h8v1h-8zM3 8h8v1h-8zM3 9h8v1h-8zM4 10h6v1h-6zM4 11h6v1h-6zM4 12h6v1h-6zM5 13h4v1h-4z',
    b: 'M3 5h8v1h-8zM13 7h2v1h-2zM13 8h2v1h-2zM12 9h4v1h-4zM12 10h4v1h-4zM13 11h2v1h-2z'
  },
  picker: {
    a: 'M8 4h1v1h-1zM8 5h2v1h-2zM8 6h3v1h-3zM7 7h5v1h-5zM6 8h3v1h-3zM5 9h3v1h-3zM4 10h3v1h-3zM3 11h3v1h-3zM2 12h3v1h-3zM1 13h3v1h-3zM1 14h2v1h-2z',
    b: 'M10 2h4v1h-4zM9 3h5v1h-5zM9 4h5v1h-5zM10 5h4v1h-4zM11 6h2v1h-2z'
  },
  shade: {
    a: 'M8 1h3v1h-3zM6 2h3v1h-3zM10 2h3v1h-3zM5 3h4v1h-4zM12 3h2v1h-2zM5 4h4v1h-4zM13 4h1v1h-1zM4 5h5v1h-5zM13 5h2v1h-2zM4 6h5v1h-5zM14 6h1v1h-1zM4 7h5v1h-5zM13 7h2v1h-2zM5 8h4v1h-4zM13 8h1v1h-1zM5 9h4v1h-4zM12 9h2v1h-2zM4 10h5v1h-5zM10 10h3v1h-3zM3 11h3v1h-3zM8 11h3v1h-3zM2 12h3v1h-3zM3 13h1v1h-1z',
    b: 'M9 2h1v1h-1zM9 3h3v1h-3zM9 4h4v1h-4zM9 5h4v1h-4zM9 6h5v1h-5zM9 7h4v1h-4zM9 8h4v1h-4zM9 9h3v1h-3zM9 10h1v1h-1z'
  },
  noise: {
    a: 'M11 0h1v1h-1zM3 1h3v1h-3zM9 1h1v1h-1zM13 1h1v1h-1zM3 2h1v1h-1zM5 2h1v1h-1zM11 2h1v1h-1zM2 3h5v1h-5zM9 3h1v1h-1zM14 3h1v1h-1zM1 4h7v1h-7zM11 4h1v1h-1zM1 5h1v1h-1zM7 5h1v1h-1zM9 5h1v1h-1zM13 5h1v1h-1zM1 6h1v1h-1zM7 6h1v1h-1zM12 6h1v1h-1zM1 7h7v1h-7zM10 7h1v1h-1zM1 8h1v1h-1zM7 8h1v1h-1zM1 9h1v1h-1zM7 9h1v1h-1zM1 10h1v1h-1zM7 10h1v1h-1zM1 11h1v1h-1zM7 11h1v1h-1zM1 12h1v1h-1zM7 12h1v1h-1zM1 13h7v1h-7z',
    b: 'M2 5h5v1h-5zM2 6h5v1h-5zM2 8h5v1h-5zM2 9h5v1h-5zM2 10h5v1h-5zM2 11h5v1h-5zM2 12h5v1h-5z'
  },
  wand: {
    a: 'M12 0h1v1h-1zM10 1h1v1h-1zM12 1h1v1h-1zM14 1h1v1h-1zM12 2h1v1h-1zM9 3h7v1h-7zM12 4h1v1h-1zM10 5h1v1h-1zM12 5h1v1h-1zM14 5h1v1h-1zM12 6h1v1h-1z',
    b: 'M8 7h2v1h-2zM7 8h3v1h-3zM6 9h3v1h-3zM5 10h3v1h-3zM4 11h3v1h-3zM3 12h3v1h-3zM2 13h3v1h-3zM1 14h3v1h-3zM1 15h2v1h-2z'
  }
} satisfies Record<string, PixelIconData>

export const CMD_ICONS = {
  save: {
    a: 'M0 1h13v1h-13zM0 2h2v1h-2zM11 2h3v1h-3zM0 3h2v1h-2zM3 3h3v1h-3zM11 3h4v1h-4zM0 4h2v1h-2zM3 4h3v1h-3zM11 4h5v1h-5zM0 5h2v1h-2zM11 5h5v1h-5zM0 6h16v1h-16zM0 7h16v1h-16zM0 8h3v1h-3zM13 8h3v1h-3zM0 9h3v1h-3zM13 9h3v1h-3zM0 10h3v1h-3zM13 10h3v1h-3zM0 11h3v1h-3zM13 11h3v1h-3zM0 12h3v1h-3zM13 12h3v1h-3zM0 13h16v1h-16z',
    b: ''
  },
  beginner: {
    a: 'M2 1h4v1h-4zM10 1h4v1h-4zM1 2h6v1h-6zM9 2h6v1h-6zM1 3h6v1h-6zM9 3h6v1h-6zM3 4h10v1h-10zM5 5h6v1h-6zM7 6h2v1h-2zM7 7h2v1h-2zM7 8h2v1h-2zM7 9h2v1h-2z',
    b: 'M4 10h8v1h-8zM3 11h10v1h-10zM3 12h10v1h-10zM4 13h8v1h-8z'
  },
  pro: {
    a: 'M7 0h2v1h-2zM7 1h2v1h-2zM6 2h4v1h-4zM6 3h4v1h-4zM0 4h16v1h-16zM1 5h14v1h-14zM3 6h10v1h-10zM4 7h8v1h-8zM4 8h8v1h-8zM3 9h4v1h-4zM9 9h4v1h-4zM3 10h3v1h-3zM10 10h3v1h-3zM2 11h3v1h-3zM11 11h3v1h-3zM2 12h2v1h-2zM12 12h2v1h-2z',
    b: ''
  },
  brush: {
    a: 'M10 4h4v1h-4zM9 5h6v1h-6zM8 6h8v1h-8zM8 7h8v1h-8zM2 8h2v1h-2zM8 8h8v1h-8zM1 9h4v1h-4zM8 9h8v1h-8zM1 10h4v1h-4zM9 10h6v1h-6zM2 11h2v1h-2zM10 11h4v1h-4z',
    b: ''
  },
  pixelPerfect: {
    a: 'M0 2h4v1h-4zM0 3h4v1h-4zM0 4h4v1h-4zM4 5h4v1h-4zM4 6h4v1h-4zM4 7h4v1h-4zM8 8h4v1h-4zM8 9h4v1h-4zM8 10h4v1h-4zM12 11h4v1h-4zM12 12h4v1h-4zM12 13h4v1h-4z',
    b: ''
  },
  seamless: {
    a: 'M2 4h3v1h-3zM11 4h3v1h-3zM1 5h5v1h-5zM10 5h5v1h-5zM0 6h2v1h-2zM5 6h2v1h-2zM9 6h2v1h-2zM14 6h2v1h-2zM0 7h2v1h-2zM6 7h4v1h-4zM14 7h2v1h-2zM0 8h2v1h-2zM6 8h4v1h-4zM14 8h2v1h-2zM0 9h2v1h-2zM5 9h2v1h-2zM9 9h2v1h-2zM14 9h2v1h-2zM1 10h5v1h-5zM10 10h5v1h-5zM2 11h3v1h-3zM11 11h3v1h-3z',
    b: ''
  },
  grid: {
    a: 'M1 1h14v1h-14zM1 2h14v1h-14zM1 3h2v1h-2zM7 3h2v1h-2zM13 3h2v1h-2zM1 4h2v1h-2zM7 4h2v1h-2zM13 4h2v1h-2zM1 5h2v1h-2zM7 5h2v1h-2zM13 5h2v1h-2zM1 6h2v1h-2zM7 6h2v1h-2zM13 6h2v1h-2zM1 7h14v1h-14zM1 8h14v1h-14zM1 9h2v1h-2zM7 9h2v1h-2zM13 9h2v1h-2zM1 10h2v1h-2zM7 10h2v1h-2zM13 10h2v1h-2zM1 11h2v1h-2zM7 11h2v1h-2zM13 11h2v1h-2zM1 12h2v1h-2zM7 12h2v1h-2zM13 12h2v1h-2zM1 13h14v1h-14zM1 14h14v1h-14z',
    b: ''
  },
  tile3: {
    a: 'M6 6h4v1h-4zM6 7h4v1h-4zM6 8h4v1h-4zM6 9h4v1h-4z',
    b: 'M1 1h4v1h-4zM6 1h4v1h-4zM11 1h4v1h-4zM1 2h4v1h-4zM6 2h4v1h-4zM11 2h4v1h-4zM1 3h4v1h-4zM6 3h4v1h-4zM11 3h4v1h-4zM1 4h4v1h-4zM6 4h4v1h-4zM11 4h4v1h-4zM1 6h4v1h-4zM11 6h4v1h-4zM1 7h4v1h-4zM11 7h4v1h-4zM1 8h4v1h-4zM11 8h4v1h-4zM1 9h4v1h-4zM11 9h4v1h-4zM1 11h4v1h-4zM6 11h4v1h-4zM11 11h4v1h-4zM1 12h4v1h-4zM6 12h4v1h-4zM11 12h4v1h-4zM1 13h4v1h-4zM6 13h4v1h-4zM11 13h4v1h-4zM1 14h4v1h-4zM6 14h4v1h-4zM11 14h4v1h-4z'
  },
  zoomIn: {
    a: 'M5 1h4v1h-4zM3 2h8v1h-8zM2 3h3v1h-3zM9 3h3v1h-3zM2 4h2v1h-2zM6 4h2v1h-2zM10 4h2v1h-2zM1 5h2v1h-2zM6 5h2v1h-2zM11 5h2v1h-2zM1 6h2v1h-2zM4 6h6v1h-6zM11 6h2v1h-2zM1 7h2v1h-2zM4 7h6v1h-6zM11 7h2v1h-2zM1 8h2v1h-2zM6 8h2v1h-2zM11 8h2v1h-2zM2 9h2v1h-2zM6 9h2v1h-2zM10 9h2v1h-2zM2 10h3v1h-3zM9 10h3v1h-3zM3 11h10v1h-10zM5 12h4v1h-4zM11 12h3v1h-3zM12 13h3v1h-3zM13 14h3v1h-3zM14 15h2v1h-2z',
    b: ''
  },
  zoomOut: {
    a: 'M5 1h4v1h-4zM3 2h8v1h-8zM2 3h3v1h-3zM9 3h3v1h-3zM2 4h2v1h-2zM10 4h2v1h-2zM1 5h2v1h-2zM11 5h2v1h-2zM1 6h2v1h-2zM4 6h6v1h-6zM11 6h2v1h-2zM1 7h2v1h-2zM4 7h6v1h-6zM11 7h2v1h-2zM1 8h2v1h-2zM11 8h2v1h-2zM2 9h2v1h-2zM10 9h2v1h-2zM2 10h3v1h-3zM9 10h3v1h-3zM3 11h10v1h-10zM5 12h4v1h-4zM11 12h3v1h-3zM12 13h3v1h-3zM13 14h3v1h-3zM14 15h2v1h-2z',
    b: ''
  },
  fit: {
    a: 'M0 0h5v1h-5zM11 0h5v1h-5zM0 1h5v1h-5zM11 1h5v1h-5zM0 2h2v1h-2zM14 2h2v1h-2zM0 3h2v1h-2zM14 3h2v1h-2zM0 4h2v1h-2zM14 4h2v1h-2zM0 11h2v1h-2zM14 11h2v1h-2zM0 12h2v1h-2zM14 12h2v1h-2zM0 13h2v1h-2zM14 13h2v1h-2zM0 14h5v1h-5zM11 14h5v1h-5zM0 15h5v1h-5zM11 15h5v1h-5z',
    b: 'M5 5h6v1h-6zM5 6h6v1h-6zM5 7h6v1h-6zM5 8h6v1h-6zM5 9h6v1h-6zM5 10h6v1h-6z'
  },
  color: {
    a: 'M5 1h6v1h-6zM3 2h10v1h-10zM2 3h12v1h-12zM1 4h3v1h-3zM6 4h4v1h-4zM12 4h3v1h-3zM1 5h3v1h-3zM6 5h4v1h-4zM12 5h3v1h-3zM0 6h16v1h-16zM0 7h8v1h-8zM11 7h5v1h-5zM0 8h7v1h-7zM12 8h4v1h-4zM0 9h8v1h-8zM11 9h5v1h-5zM1 10h2v1h-2zM5 10h11v1h-11zM1 11h2v1h-2zM5 11h10v1h-10zM2 12h11v1h-11zM4 13h7v1h-7z',
    b: ''
  },
  relief: {
    a: 'M5 3h1v1h-1zM4 4h3v1h-3zM3 5h5v1h-5zM2 6h7v1h-7zM1 7h9v1h-9zM0 8h11v1h-11zM0 9h12v1h-12zM0 10h13v1h-13zM0 11h14v1h-14zM0 12h15v1h-15zM0 13h16v1h-16z',
    b: 'M12 5h1v1h-1zM11 6h3v1h-3zM10 7h5v1h-5zM9 8h7v1h-7zM8 9h8v1h-8zM7 10h9v1h-9zM6 11h10v1h-10zM5 12h11v1h-11zM4 13h12v1h-12z'
  },
  material: {
    a: 'M4 1h8v1h-8zM3 2h10v1h-10zM2 3h3v1h-3zM11 3h3v1h-3zM1 4h6v1h-6zM12 4h3v1h-3zM1 5h2v1h-2zM4 5h3v1h-3zM13 5h2v1h-2zM1 6h2v1h-2zM4 6h3v1h-3zM13 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2zM1 8h2v1h-2zM13 8h2v1h-2zM1 9h2v1h-2zM13 9h2v1h-2zM1 10h2v1h-2zM13 10h2v1h-2zM1 11h3v1h-3zM12 11h3v1h-3zM2 12h3v1h-3zM11 12h3v1h-3zM3 13h10v1h-10zM4 14h8v1h-8z',
    b: 'M7 2h2v1h-2zM5 3h6v1h-6zM7 4h5v1h-5zM3 5h1v1h-1zM7 5h6v1h-6zM3 6h1v1h-1zM7 6h6v1h-6zM2 7h12v1h-12zM2 8h12v1h-12zM3 9h10v1h-10zM3 10h10v1h-10zM4 11h8v1h-8zM5 12h6v1h-6zM7 13h2v1h-2z'
  },
  layerNew: {
    a: 'M12 0h2v1h-2zM12 1h2v1h-2zM10 2h6v1h-6zM10 3h6v1h-6zM12 4h2v1h-2zM12 5h2v1h-2z',
    b: 'M1 4h10v1h-10zM1 5h10v1h-10zM1 6h2v1h-2zM9 6h2v1h-2zM1 7h2v1h-2zM9 7h2v1h-2zM1 8h2v1h-2zM9 8h2v1h-2zM1 9h2v1h-2zM9 9h2v1h-2zM1 10h2v1h-2zM9 10h2v1h-2zM1 11h2v1h-2zM9 11h2v1h-2zM1 12h2v1h-2zM9 12h2v1h-2zM1 13h10v1h-10zM1 14h10v1h-10z'
  },
  duplicate: {
    a: 'M5 5h11v1h-11zM5 6h11v1h-11zM5 7h2v1h-2zM14 7h2v1h-2zM5 8h2v1h-2zM14 8h2v1h-2zM5 9h2v1h-2zM14 9h2v1h-2zM5 10h2v1h-2zM14 10h2v1h-2zM5 11h2v1h-2zM14 11h2v1h-2zM5 12h2v1h-2zM14 12h2v1h-2zM5 13h2v1h-2zM14 13h2v1h-2zM5 14h11v1h-11zM5 15h11v1h-11z',
    b: 'M0 0h11v1h-11zM0 1h11v1h-11zM0 2h2v1h-2zM9 2h2v1h-2zM0 3h2v1h-2zM9 3h2v1h-2zM0 4h2v1h-2zM9 4h2v1h-2zM0 5h2v1h-2zM9 5h2v1h-2zM0 6h2v1h-2zM9 6h2v1h-2zM0 7h2v1h-2zM9 7h2v1h-2zM0 8h2v1h-2zM9 8h2v1h-2zM0 9h11v1h-11zM0 10h11v1h-11z'
  },
  merge: {
    a: 'M7 0h2v1h-2zM7 1h2v1h-2zM7 2h2v1h-2zM7 3h2v1h-2zM7 4h2v1h-2zM4 5h8v1h-8zM4 6h8v1h-8zM6 7h4v1h-4zM6 8h4v1h-4z',
    b: 'M1 11h14v1h-14zM1 12h14v1h-14zM1 13h14v1h-14zM1 14h14v1h-14z'
  },
  trash: {
    a: 'M5 0h6v1h-6zM5 1h6v1h-6zM1 2h14v1h-14zM1 3h14v1h-14zM3 5h2v1h-2zM11 5h2v1h-2zM3 6h2v1h-2zM11 6h2v1h-2zM3 7h2v1h-2zM11 7h2v1h-2zM3 8h2v1h-2zM11 8h2v1h-2zM3 9h2v1h-2zM11 9h2v1h-2zM3 10h2v1h-2zM11 10h2v1h-2zM3 11h2v1h-2zM11 11h2v1h-2zM3 12h2v1h-2zM11 12h2v1h-2zM3 13h2v1h-2zM11 13h2v1h-2zM3 14h10v1h-10zM3 15h10v1h-10z',
    b: 'M7 7h2v1h-2zM7 8h2v1h-2zM7 9h2v1h-2zM7 10h2v1h-2zM7 11h2v1h-2zM7 12h2v1h-2z'
  },
  undo: {
    a: 'M5 2h2v1h-2zM4 3h3v1h-3zM3 4h3v1h-3zM2 5h11v1h-11zM2 6h12v1h-12zM3 7h3v1h-3zM12 7h3v1h-3zM4 8h3v1h-3zM13 8h2v1h-2zM5 9h2v1h-2zM13 9h2v1h-2zM13 10h2v1h-2zM12 11h3v1h-3zM4 12h10v1h-10zM4 13h9v1h-9z',
    b: ''
  },
  redo: {
    a: 'M9 2h2v1h-2zM9 3h3v1h-3zM10 4h3v1h-3zM3 5h11v1h-11zM2 6h12v1h-12zM1 7h3v1h-3zM10 7h3v1h-3zM1 8h2v1h-2zM9 8h3v1h-3zM1 9h2v1h-2zM9 9h2v1h-2zM1 10h2v1h-2zM1 11h3v1h-3zM2 12h10v1h-10zM3 13h9v1h-9z',
    b: ''
  },
  more: {
    a: 'M5 2h2v1h-2zM5 3h3v1h-3zM6 4h3v1h-3zM7 5h3v1h-3zM8 6h3v1h-3zM9 7h3v1h-3zM10 8h2v1h-2zM9 9h3v1h-3zM8 10h3v1h-3zM7 11h3v1h-3zM6 12h3v1h-3zM5 13h3v1h-3zM5 14h2v1h-2z',
    b: ''
  },
  less: {
    a: 'M10 2h2v1h-2zM9 3h3v1h-3zM8 4h3v1h-3zM7 5h3v1h-3zM6 6h3v1h-3zM5 7h3v1h-3zM5 8h2v1h-2zM5 9h3v1h-3zM6 10h3v1h-3zM7 11h3v1h-3zM8 12h3v1h-3zM9 13h3v1h-3zM10 14h2v1h-2z',
    b: ''
  },
  info: {
    a: 'M7 2h2v1h-2zM7 3h2v1h-2zM6 5h3v1h-3zM6 6h3v1h-3zM7 7h2v1h-2zM7 8h2v1h-2zM7 9h2v1h-2zM7 10h2v1h-2zM7 11h2v1h-2zM6 12h4v1h-4zM6 13h4v1h-4z',
    b: ''
  },
  minus: { a: 'M3 7h10v1h-10zM3 8h10v1h-10z', b: '' },
  plus: {
    a: 'M7 3h2v1h-2zM7 4h2v1h-2zM7 5h2v1h-2zM7 6h2v1h-2zM3 7h10v1h-10zM3 8h10v1h-10zM7 9h2v1h-2zM7 10h2v1h-2zM7 11h2v1h-2zM7 12h2v1h-2z',
    b: ''
  },
  panels: {
    a: 'M1 2h14v1h-14zM1 3h14v1h-14zM1 4h2v1h-2zM9 4h2v1h-2zM13 4h2v1h-2zM1 5h2v1h-2zM9 5h2v1h-2zM13 5h2v1h-2zM1 6h2v1h-2zM9 6h2v1h-2zM13 6h2v1h-2zM1 7h2v1h-2zM9 7h2v1h-2zM13 7h2v1h-2zM1 8h2v1h-2zM9 8h2v1h-2zM13 8h2v1h-2zM1 9h2v1h-2zM9 9h2v1h-2zM13 9h2v1h-2zM1 10h2v1h-2zM9 10h2v1h-2zM13 10h2v1h-2zM1 11h2v1h-2zM9 11h2v1h-2zM13 11h2v1h-2zM1 12h14v1h-14zM1 13h14v1h-14z',
    b: 'M11 4h2v1h-2zM11 5h2v1h-2zM11 6h2v1h-2zM11 7h2v1h-2zM11 8h2v1h-2zM11 9h2v1h-2zM11 10h2v1h-2zM11 11h2v1h-2z'
  }
} satisfies Record<string, PixelIconData>
