// Small pixel pictures (8×8) for preset buttons: light scenes, materials, test scenes, biomes, CTM
// methods, texture sizes, start fills, issue filters, held-item views, vanilla reference modes.
// Drawn on the design canvas (.claude/design-v2); rows of palette chars, '' = transparent.
import { pictureBackground } from './pixelArt'

export interface PixelPicture {
  rows: readonly string[]
  palette: Readonly<Record<string, string>>
}

export const LIGHT_PICTURES = {
  time: {
    rows: [
      'ssssnnnn',
      'sYYsnnMn',
      'sYYsnnnn',
      'ssssnnnn',
      'ssssnnnn',
      'ggggdddd',
      'GGGGDDDD',
      'GGGGDDDD'
    ],
    palette: {
      s: '#7ea6dc',
      Y: '#f6e27a',
      n: '#1d2346',
      M: '#e8e8f0',
      g: '#6fb043',
      G: '#4c7d2c',
      d: '#2d4a1f',
      D: '#203616'
    }
  },
  noon: {
    rows: [
      'ssssssss',
      'sssssYYs',
      'sssssYYs',
      'ssssssss',
      'cccssssc',
      'gggggggg',
      'GGGGGGGG',
      'GGGGGGGG'
    ],
    palette: { s: '#7ea6dc', c: '#c9dcf2', Y: '#f6e27a', g: '#6fb043', G: '#4c7d2c' }
  },
  sunset: {
    rows: [
      'pppppppp',
      'pppppppp',
      'oooooooo',
      'ooYYYYoo',
      'yyYYYYyy',
      'dddddddd',
      'DDDDDDDD',
      'DDDDDDDD'
    ],
    palette: { p: '#6d7fb3', o: '#e39a6a', y: '#f0b27a', Y: '#ffd96a', d: '#3a4a2a', D: '#28331d' }
  },
  cave: {
    rows: [
      'kkkkkkkk',
      'kkkFkkkk',
      'kkFOFkkk',
      'kkkFkkkk',
      'kkkWkkkk',
      'kkkWkkkk',
      'SSSSSSSS',
      'SSSSSSSS'
    ],
    palette: { k: '#1a1a1f', F: '#f6a23a', O: '#ffe48a', W: '#7a5a34', S: '#3a3a3e' }
  },
  nether: {
    rows: [
      'rrrrrrrr',
      'rRrrrRrr',
      'rrrrrrrr',
      'nnnnnnnn',
      'nNnnnNnn',
      'nnnnnnnn',
      'LLLLLLLL',
      'llLLllLL'
    ],
    palette: { r: '#4a1410', R: '#5e1c14', n: '#6e2418', N: '#80301c', L: '#f07a1a', l: '#ffb23a' }
  }
} satisfies Record<string, PixelPicture>

export const MATERIAL_PICTURES = {
  stone: {
    rows: [
      '11220222',
      '12201010',
      '01202210',
      '22110102',
      '10221022',
      '20201021',
      '20012212',
      '21212001'
    ],
    palette: { '0': '#7a7a7a', '1': '#8a8a8a', '2': '#9a9a9a' }
  },
  polished: {
    rows: [
      'hhhhhhhd',
      'h111111d',
      'h111111d',
      'h000000d',
      'h111111d',
      'h111111d',
      'h000000d',
      'dddddddd'
    ],
    palette: { '0': '#a4a4a4', '1': '#9a9a9a', h: '#c4c4c4', d: '#6e6e6e' }
  },
  wood: {
    rows: [
      '11111111',
      '22222200',
      '11111111',
      '00000000',
      '11111111',
      '22002222',
      '11111111',
      '00000000'
    ],
    palette: { '0': '#8a6c3e', '1': '#a2824e', '2': '#b8955c' }
  },
  dirt: {
    rows: [
      '02110100',
      '11222101',
      '10221100',
      '11122120',
      '01011100',
      '02220000',
      '11211021',
      '01200221'
    ],
    palette: { '0': '#6b4a32', '1': '#866043', '2': '#9a7050' }
  },
  wool: {
    rows: [
      '11110001',
      '00111011',
      '00001110',
      '11110111',
      '11111100',
      '01100001',
      '10110110',
      '00000111'
    ],
    palette: { '0': '#dcdcdc', '1': '#ececec' }
  },
  leaves: {
    rows: [
      '21011203',
      '12303330',
      '11323113',
      '03221201',
      '10200320',
      '03022130',
      '00232000',
      '13000220'
    ],
    palette: { '0': '#2c5a18', '1': '#4f8a2e', '2': '#6aa83e', '3': '' }
  },
  glass: {
    rows: [
      'ffffffff',
      'f......f',
      'f.w....f',
      'f..w...f',
      'f......f',
      'f....w.f',
      'f......f',
      'ffffffff'
    ],
    palette: { f: '#d8eef2', w: '#ffffff', '.': '' }
  },
  ice: {
    rows: [
      '12111121',
      '12200010',
      '02010111',
      '20202212',
      '12221021',
      '10120110',
      '21112202',
      '11021012'
    ],
    palette: { '0': '#7fa6e0', '1': '#9cbcf0', '2': '#c4d8f8' }
  },
  metal: {
    rows: [
      'hhhhhhhh',
      'h11111hd',
      'h1w111hd',
      'h11111hd',
      'h11111hd',
      'h11111hd',
      'hhhhhhhd',
      'dddddddd'
    ],
    palette: { '1': '#c8c8d0', h: '#e8e8ee', d: '#7a7a84', w: '#ffffff' }
  },
  ore: {
    rows: [
      '00010011',
      '1dd11110',
      '1dd100d0',
      '000010dd',
      '11d01001',
      '10dd1000',
      '00010dd1',
      '10001d01'
    ],
    palette: { '0': '#7a7a7a', '1': '#8e8e8e', d: '#4fd6d0' }
  },
  crop: {
    rows: [
      '.y..y..y',
      '.y.yy..y',
      'yy.y..yy',
      '.y.y.yy.',
      '.yy..y..',
      '..y..y..',
      'gg.gg.gg',
      'gggggggg'
    ],
    palette: { y: '#d8b84a', g: '#5a8a2a', '.': '' }
  },
  emissive: {
    rows: [
      'kkkkkkkk',
      'kOkkkkOk',
      'kkkkkkkk',
      'kkkOOkkk',
      'kkkOOkkk',
      'kkkkkkkk',
      'kOkkkkOk',
      'kkkkkkkk'
    ],
    palette: { k: '#3a2a1a', O: '#ffd96a' }
  },
  none: {
    rows: [
      'abaabaaR',
      'baabaaRb',
      'abaabRab',
      'baabRbaa',
      'abaRabaa',
      'baRabaab',
      'aRabaaba',
      'Rbaabaab'
    ],
    palette: { a: '#d4d4d4', b: '#b0b0b0', R: '#c43a2a' }
  }
} satisfies Record<string, PixelPicture>

export const SCENE_PICTURES = {
  blocco: {
    rows: [
      'ssssssss',
      'ssssssss',
      'ss####ss',
      'ss#hh#ss',
      'ss####ss',
      'ss####ss',
      'gggggggg',
      'DDDDDDDD'
    ],
    palette: { s: '#8fbbe6', '#': '#7f7f7f', h: '#a8a8a8', g: '#6fb043', D: '#7a5636' }
  },
  muro: {
    rows: [
      'ssssssss',
      'sAABBAAs',
      'sAABBAAs',
      'sBBAABBs',
      'sBBAABBs',
      'sAABBAAs',
      'sAABBAAs',
      'gggggggg'
    ],
    palette: { s: '#8fbbe6', A: '#8a8a8a', B: '#6e6e6e', g: '#6fb043' }
  },
  pavimento: {
    rows: [
      'ssssssss',
      'ssssssss',
      'ssssssss',
      'ABABABAB',
      'BABABABA',
      'ABABABAB',
      'BABABABA',
      'ABABABAB'
    ],
    palette: { s: '#8fbbe6', A: '#8a8a8a', B: '#6e6e6e' }
  },
  distesa: {
    rows: [
      'ssssssss',
      'ssssssss',
      'sssMMsss',
      'ssMMMMss',
      'cccccccc',
      'gggggggg',
      'GGGGGGGG',
      'gggggggg'
    ],
    palette: { s: '#8fbbe6', M: '#7d93a8', c: '#a3c67d', g: '#6fb043', G: '#5a9636' }
  },
  campo: {
    rows: [
      'ssssssss',
      'ssssssss',
      'yGyGyGyG',
      'gygygygy',
      'DDDDDDDD',
      'yGyGyGyG',
      'DDDDDDDD',
      'dddddddd'
    ],
    palette: { s: '#8fbbe6', y: '#d8b84a', G: '#5a8a2a', g: '#77a33a', D: '#4a321e', d: '#5e4027' }
  },
  altri: {
    rows: [
      'ssssssss',
      'ssssLLss',
      'sWWsLLLL',
      'sWWsBBLL',
      'sWWsBBss',
      'sWWsBBss',
      'gggggggg',
      'DDDDDDDD'
    ],
    palette: { s: '#8fbbe6', W: '#a2824e', L: '#4f8a2e', B: '#9a4a3a', g: '#6fb043', D: '#7a5636' }
  },
  casa: {
    rows: [
      'sssRRRRs',
      'ssRRRRRR',
      'ssWWWWWW',
      'ssWwwWWW',
      'ssWwwWWW',
      'ssWWWWWW',
      'gggggggg',
      'DDDDDDDD'
    ],
    palette: { s: '#8fbbe6', R: '#6e3b2a', W: '#a2824e', w: '#cfeaf2', g: '#6fb043', D: '#7a5636' }
  },
  grotta: {
    rows: [
      'SSSSSSSS',
      'SkkkkkSS',
      'SkkFkkkS',
      'kkFOFkkk',
      'kkkWkkkk',
      'kkkWkkkk',
      'SSSSSSSS',
      'SSSSSSSS'
    ],
    palette: { S: '#55555a', k: '#1a1a1f', F: '#f6a23a', O: '#ffe48a', W: '#7a5a34' }
  },
  sentiero: {
    rows: [
      'ssssssss',
      'ssssssss',
      'gggPPggg',
      'ggPPPggg',
      'gPPPgggg',
      'gPPPgggg',
      'PPPggggg',
      'PPgggggg'
    ],
    palette: { s: '#8fbbe6', g: '#6fb043', P: '#b39a5e' }
  }
} satisfies Record<string, PixelPicture>

export const BIOME_PICTURES = {
  pianure: {
    rows: [
      '02110211',
      '12211202',
      '22000212',
      '10202110',
      '10100102',
      '21002011',
      '02002221',
      '22002220'
    ],
    palette: { '0': '#5f9e35', '1': '#6fb043', '2': '#86c25a' }
  },
  giungla: {
    rows: [
      '10011021',
      '10210102',
      '01100220',
      '12011200',
      '21010021',
      '10202101',
      '12100100',
      '12120111'
    ],
    palette: { '0': '#1f6a12', '1': '#2f8a1a', '2': '#45a82a' }
  },
  palude: {
    rows: [
      '02211010',
      '11220221',
      '22101202',
      '20102211',
      'wwww2101',
      'wwwwww01',
      '2wwwwwww',
      '102wwwww'
    ],
    palette: { '0': '#4c6a2a', '1': '#5a7a34', '2': '#6a8a3e', w: '#3a5a52' }
  },
  deserto: {
    rows: [
      '20002002',
      '11221011',
      '10202001',
      '11121200',
      '12021212',
      '21202221',
      '12001011',
      '21022202'
    ],
    palette: { '0': '#d8c98f', '1': '#e3d6a2', '2': '#cbb978' }
  },
  neve: {
    rows: [
      '10001101',
      '00111111',
      '00011111',
      '11011101',
      '00101011',
      '11010100',
      '10000100',
      '00111110'
    ],
    palette: { '0': '#eef4f8', '1': '#dce8f0' }
  }
} satisfies Record<string, PixelPicture>

export const CTM_PICTURES = {
  ctm: {
    rows: [
      'FFFFFFFF',
      'FggggggF',
      'FggggggF',
      'FggggggF',
      'FggggggF',
      'FggggggF',
      'FggggggF',
      'FFFFFFFF'
    ],
    palette: { g: '#3e6470', F: '#eaf6f9' }
  },
  h: {
    rows: [
      'FFFFFFFF',
      'gggggggg',
      'gggggggg',
      'FFFFFFFF',
      'FFFFFFFF',
      'gggggggg',
      'gggggggg',
      'FFFFFFFF'
    ],
    palette: { g: '#3e6470', F: '#eaf6f9' }
  },
  v: {
    rows: [
      'FggFFggF',
      'FggFFggF',
      'FggFFggF',
      'FggFFggF',
      'FggFFggF',
      'FggFFggF',
      'FggFFggF',
      'FggFFggF'
    ],
    palette: { g: '#3e6470', F: '#eaf6f9' }
  }
} satisfies Record<string, PixelPicture>

export const SIZE_PICTURES = {
  '16': {
    rows: [
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '##......',
      '##......'
    ],
    palette: { '#': '#5f9e35', '.': '#3a3a3a' }
  },
  '32': {
    rows: [
      '........',
      '........',
      '........',
      '........',
      '####....',
      '####....',
      '####....',
      '####....'
    ],
    palette: { '#': '#5f9e35', '.': '#3a3a3a' }
  },
  '64': {
    rows: [
      '........',
      '........',
      '######..',
      '######..',
      '######..',
      '######..',
      '######..',
      '######..'
    ],
    palette: { '#': '#5f9e35', '.': '#3a3a3a' }
  },
  '128': {
    rows: [
      '########',
      '########',
      '########',
      '########',
      '########',
      '########',
      '########',
      '########'
    ],
    palette: { '#': '#5f9e35', '.': '#3a3a3a' }
  }
} satisfies Record<string, PixelPicture>

export const START_PICTURES = {
  noise: {
    rows: [
      '12102001',
      '02202200',
      '01200010',
      '02212211',
      '11110022',
      '02011211',
      '00021010',
      '02112221'
    ],
    palette: { '0': '#6e6e6e', '1': '#8a8a8a', '2': '#a4a4a4' }
  },
  solid: {
    rows: [
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa',
      'aaaaaaaa'
    ],
    palette: { a: '#7a7a7a' }
  },
  empty: {
    rows: [
      'aabbaabb',
      'aabbaabb',
      'bbaabbaa',
      'bbaabbaa',
      'aabbaabb',
      'aabbaabb',
      'bbaabbaa',
      'bbaabbaa'
    ],
    palette: { a: '#e4e4e4', b: '#b8b8b8' }
  }
} satisfies Record<string, PixelPicture>

export const FILTER_PICTURES = {
  all: {
    rows: [
      'kkkkkkkk',
      'kLLkLLLk',
      'kkkkkkkk',
      'kLLkLLLk',
      'kkkkkkkk',
      'kLLkLLLk',
      'kkkkkkkk',
      'kkkkkkkk'
    ],
    palette: { k: '#3a3a3a', L: '#ebe7e0' }
  },
  err: {
    rows: [
      'RRRRRRRR',
      'RWRRRRWR',
      'RRWRRWRR',
      'RRRWWRRR',
      'RRRWWRRR',
      'RRWRRWRR',
      'RWRRRRWR',
      'RRRRRRRR'
    ],
    palette: { R: '#c43a2a', W: '#ffffff' }
  },
  warn: {
    rows: [
      'kkkYYkkk',
      'kkYYYYkk',
      'kkYkkYkk',
      'kYYkkYYk',
      'kYYkkYYk',
      'YYYYYYYY',
      'YYYkkYYY',
      'YYYYYYYY'
    ],
    palette: { k: '#3a3a3a', Y: '#e8b44a' }
  }
} satisfies Record<string, PixelPicture>

export const ITEM_PICTURES = {
  hand: {
    rows: [
      'bbbbbbbb',
      'bbbbbddb',
      'bbbbdDdb',
      'bbbsddbb',
      'bbsssbbb',
      'bsssbbbb',
      'sssbbbbb',
      'ssbbbbbb'
    ],
    palette: { b: '#3a3a3a', s: '#e0ac7e', d: '#4fd6d0', D: '#ffffff' }
  },
  inventory: {
    rows: [
      'gggggggg',
      'gkkgkkgg',
      'gkkgdkgg',
      'gggggggg',
      'gkkgkkgg',
      'gkkgkkgg',
      'gggggggg',
      'gggggggg'
    ],
    palette: { g: '#c6c6c6', k: '#8b8b8b', d: '#4fd6d0' }
  },
  ground: {
    rows: [
      'ssssssss',
      'sssddsss',
      'ssdWdsss',
      'sssddsss',
      'ssssssss',
      'ssssssss',
      'gggKKggg',
      'mmmmmmmm'
    ],
    palette: { s: '#8fbbe6', d: '#4fd6d0', W: '#ffffff', g: '#6fb043', K: '#3f6a26', m: '#7a5636' }
  }
} satisfies Record<string, PixelPicture>

export const REFERENCE_PICTURES = {
  side: {
    rows: [
      'kkkkkkkk',
      'aaakkbbb',
      'aAakkbBb',
      'aaakkbbb',
      'aaakkbbb',
      'aAakkbBb',
      'aaakkbbb',
      'kkkkkkkk'
    ],
    palette: { k: '#2c2c2c', a: '#8a8a8a', A: '#a8a8a8', b: '#7aa85a', B: '#9ac87a' }
  },
  trace: {
    rows: [
      'aaaaaaaa',
      'aAaaaAaa',
      'aabbbbaa',
      'aabBbbaa',
      'aabbbbaa',
      'aaaaaaaa',
      'aAaaaAaa',
      'aaaaaaaa'
    ],
    palette: { a: '#8a8a8a', A: '#a8a8a8', b: '#9fbf86', B: '#c2dcaa' }
  },
  compare: {
    rows: [
      'aaaabbbb',
      'aAaabBbb',
      'aaaabbbb',
      'aaaabbbb',
      'aaaabbbb',
      'aAaabBbb',
      'aaaabbbb',
      'aaaabbbb'
    ],
    palette: { a: '#8a8a8a', A: '#a8a8a8', b: '#7aa85a', B: '#9ac87a' }
  }
} satisfies Record<string, PixelPicture>

const cache = new Map<PixelPicture, string>()

/** CSS background for a picture (cached: the same object always gives the same string). */
export function pictureCss(picture: PixelPicture): string {
  let css = cache.get(picture)
  if (css === undefined) {
    css = pictureBackground(picture.rows, picture.palette)
    cache.set(picture, css)
  }
  return css
}
