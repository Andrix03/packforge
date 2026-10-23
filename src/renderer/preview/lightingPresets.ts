// Lighting presets for the Effects (LabPBR) view. Pure: no Three.js, so it is unit-tested.
// An environment is the day/night lighting plus a sky gradient (what smooth and metal surfaces
// reflect, and the hemisphere ambient light) and an optional torch held by the viewer.

import { lightingAt, type Lighting, type Vec3 } from './dayNight'

export type LightingPresetId = 'time' | 'noon' | 'sunset' | 'cave' | 'nether'

export interface Environment extends Lighting {
  /** Linear sky radiance straight up, at the horizon and from the ground below. */
  zenith: Vec3
  horizon: Vec3
  ground: Vec3
  /** Light carried by the viewer (color × intensity at 1 block), or null. */
  torch: Vec3 | null
}

export interface LightingPreset {
  id: LightingPresetId
  label: string
  hint: string
}

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  {
    id: 'time',
    label: 'Segui l’ora',
    hint: 'Segue lo slider dell’ora e il ciclo giorno/notte.'
  },
  { id: 'noon', label: 'Mezzogiorno', hint: 'Sole alto e cielo azzurro: luce piena.' },
  {
    id: 'sunset',
    label: 'Tramonto',
    hint: 'Sole basso e arancione: risalta il rilievo delle normali.'
  },
  {
    id: 'cave',
    label: 'Grotta',
    hint: 'Buio, con una torcia in mano: ideale per l’emissione.'
  },
  { id: 'nether', label: 'Nether', hint: 'Luce rossa diffusa e bagliore di lava dal basso.' }
]

const DARK: Vec3 = [0, 0, 0]
const TORCH: Vec3 = [1.0, 0.62, 0.32]

export function environmentFor(preset: LightingPresetId, hour: number): Environment {
  switch (preset) {
    case 'noon':
      return {
        ...lightingAt(12),
        zenith: [0.22, 0.42, 0.95],
        horizon: [0.62, 0.75, 0.98],
        ground: [0.2, 0.18, 0.15],
        torch: null
      }
    case 'sunset':
      return {
        ...lightingAt(17.4),
        zenith: [0.22, 0.27, 0.55],
        horizon: [1.0, 0.52, 0.28],
        ground: [0.12, 0.08, 0.06],
        torch: null
      }
    case 'cave':
      return {
        sunDirection: [0, 1, 0],
        sunColor: DARK,
        moonDirection: [0, -1, 0],
        moonColor: DARK,
        ambient: [0.012, 0.012, 0.016],
        sky: [0.02, 0.02, 0.025],
        zenith: [0.01, 0.01, 0.012],
        horizon: [0.012, 0.012, 0.014],
        ground: [0.008, 0.008, 0.008],
        torch: scale(TORCH, 1.2)
      }
    case 'nether':
      return {
        sunDirection: [0, 1, 0],
        sunColor: DARK,
        moonDirection: [0, -1, 0],
        moonColor: DARK,
        ambient: [0.34, 0.13, 0.09],
        sky: [0.2, 0.03, 0.03],
        zenith: [0.12, 0.02, 0.02],
        horizon: [0.3, 0.06, 0.04],
        ground: [0.85, 0.28, 0.05],
        torch: null
      }
    case 'time': {
      const light = lightingAt(hour)
      return {
        ...light,
        zenith: scale(light.sky, 0.8),
        horizon: mix(light.sky, scale(light.ambient, 2), 0.4),
        ground: scale(light.ambient, 0.5),
        torch: null
      }
    }
  }
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}
