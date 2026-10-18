// Settings of the Effects (LabPBR) view: lighting preset, channel/debug view, exposure,
// tone mapping, bloom and emission strength. Pure data, shared by the UI and BlockPreview.

import type { LightingPresetId } from './lightingPresets'

export type ToneMappingId = 'neutral' | 'aces' | 'agx' | 'reinhard' | 'none'

export interface EffectSettings {
  lighting: LightingPresetId
  /** Index into DEBUG_VIEWS (0 = final image); matches `debugView` in block.frag.glsl. */
  view: number
  /** Exposure in stops (0 = ×1). */
  exposure: number
  toneMapping: ToneMappingId
  /** Bloom strength, 0 = off. */
  bloom: number
  /** Brightness of 100% emission (×albedo, in HDR units). */
  emission: number
}

export const DEFAULT_EFFECTS: EffectSettings = {
  lighting: 'time',
  view: 0,
  exposure: 0,
  toneMapping: 'neutral',
  bloom: 0.5,
  emission: 4
}

export interface DebugView {
  label: string
  hint: string
  /** Shows raw channel values: no tone mapping, exposure or bloom. */
  raw: boolean
}

export const DEBUG_VIEWS: readonly DebugView[] = [
  { label: 'Finale', hint: 'Tutti gli effetti insieme.', raw: false },
  { label: 'Albedo', hint: 'Solo il colore (con la tinta del bioma), senza luce.', raw: true },
  { label: 'Normali (_n RG)', hint: 'La normale ricostruita: azzurro = piatta.', raw: true },
  { label: 'AO (_n B)', hint: 'Occlusione ambientale: nero = in ombra.', raw: true },
  {
    label: 'Altezza (_n A)',
    hint: 'Bianco = in superficie, nero = 25% di profondità (POM).',
    raw: true
  },
  { label: 'Levigatezza (_s R)', hint: 'Bianco = liscio e lucido, nero = ruvido.', raw: true },
  {
    label: 'F0 / metalli (_s G)',
    hint: 'Grigio = riflettanza; i metalli (230–255) col loro colore.',
    raw: true
  },
  {
    label: 'Porosità (_s B 0–64)',
    hint: 'Conta solo con la pioggia negli shader che la gestiscono.',
    raw: true
  },
  {
    label: 'Subsurface (_s B 65–255)',
    hint: 'Luce che passa attraverso (foglie, erba).',
    raw: true
  },
  { label: 'Emissione (_s A)', hint: 'Le parti che si illuminano da sole.', raw: true },
  { label: 'Solo luce', hint: 'Materiale grigio: si vedono solo rilievo e riflessi.', raw: false }
]

export const TONE_MAPPINGS: ReadonlyArray<{ id: ToneMappingId; label: string }> = [
  { id: 'neutral', label: 'Neutro (colori fedeli)' },
  { id: 'aces', label: 'ACES (cinematografico)' },
  { id: 'agx', label: 'AgX' },
  { id: 'reinhard', label: 'Reinhard' },
  { id: 'none', label: 'Nessuno' }
]
