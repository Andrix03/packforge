// Settings of the Effects (LabPBR) view: lighting preset, channel/debug view, exposure,
// tone mapping, bloom and emission strength. Pure data, shared by the UI and BlockPreview.

import type { MetalMode } from '../../shared/labpbr'
import type { LightingPresetId } from './lightingPresets'
import { tr } from '../../shared/i18n'

export type ToneMappingId = 'neutral' | 'aces' | 'agx' | 'reinhard' | 'none'
/** Sun shadows: none, soft-edged, or snapped to the texture's pixels like the shader packs. */
export type ShadowMode = 'off' | 'soft' | 'pixel'
/** What smooth surfaces reflect: the captured scene, or only the sky gradient (cheaper). */
export type ReflectionMode = 'scene' | 'sky'

export interface EffectSettings {
  lighting: LightingPresetId
  /** Index into DEBUG_VIEWS (0 = final image); matches `debugView` in block.frag.glsl. */
  view: number
  /** Exposure in stops (0 = ×1). */
  exposure: number
  toneMapping: ToneMappingId
  /** Bloom strength, 0 = off, 1 = Photon's default (12% of the blurred image mixed in). */
  bloom: number
  /** Brightness of 100% emission (×albedo, in HDR units). */
  emission: number
  shadows: ShadowMode
  reflections: ReflectionMode
  /** How metals are read, as different shader packs do. */
  metals: MetalMode
  /** Rain wetness 0–1 (porous blocks darken, puddles on top faces). */
  rain: number
  /** POM depth multiplier: 1 = the spec's 25% of a block, 0 = off. */
  pom: number
  /** Ray steps (Photon's POM_SAMPLES, default 40). */
  pomSamples: number
  /** Self-shadowing of the relief. */
  pomShadows: boolean
  /** Step sides between pixels get their own normal (blocky relief of PBR packs). */
  pomSlopes: boolean
}

export const DEFAULT_EFFECTS: EffectSettings = {
  lighting: 'time',
  view: 0,
  exposure: 0,
  toneMapping: 'neutral',
  bloom: 1,
  // Photon: emission_scale 40 against blocklight 6, i.e. ~7× a torch-lit surface.
  emission: 8,
  shadows: 'pixel',
  reflections: 'scene',
  metals: 'spec',
  rain: 0,
  pom: 1,
  pomSamples: 40,
  pomShadows: true,
  pomSlopes: false
}

export interface DebugView {
  label: string
  hint: string
  /** Shows raw channel values: no tone mapping, exposure or bloom. */
  raw: boolean
}

export const DEBUG_VIEWS: readonly DebugView[] = [
  { label: tr('Finale'), hint: tr('Tutti gli effetti insieme.'), raw: false },
  {
    label: tr('Albedo'),
    hint: tr('Solo il colore (con la tinta del bioma), senza luce.'),
    raw: true
  },
  {
    label: tr('Normali (_n RG)'),
    hint: tr('La normale ricostruita: azzurro = piatta.'),
    raw: true
  },
  { label: tr('AO (_n B)'), hint: tr('Occlusione ambientale: nero = in ombra.'), raw: true },
  {
    label: tr('Altezza (_n A)'),
    hint: tr('Bianco = in superficie, nero = 25% di profondità (POM).'),
    raw: true
  },
  {
    label: tr('Levigatezza (_s R)'),
    hint: tr('Bianco = liscio e lucido, nero = ruvido.'),
    raw: true
  },
  {
    label: tr('F0 / metalli (_s G)'),
    hint: tr('Grigio = riflettanza; i metalli (230–255) col loro colore.'),
    raw: true
  },
  {
    label: tr('Porosità (_s B 0–64)'),
    hint: tr('Conta solo con la pioggia negli shader che la gestiscono.'),
    raw: true
  },
  {
    label: tr('Subsurface (_s B 65–255)'),
    hint: tr('Luce che passa attraverso (foglie, erba).'),
    raw: true
  },
  { label: tr('Emissione (_s A)'), hint: tr('Le parti che si illuminano da sole.'), raw: true },
  {
    label: tr('Solo luce'),
    hint: tr('Materiale grigio: si vedono solo rilievo e riflessi.'),
    raw: false
  }
]

export const TONE_MAPPINGS: ReadonlyArray<{ id: ToneMappingId; label: string }> = [
  { id: 'neutral', label: tr('Neutro (colori fedeli)') },
  { id: 'aces', label: tr('ACES (cinematografico)') },
  { id: 'agx', label: tr('AgX') },
  { id: 'reinhard', label: tr('Reinhard') },
  { id: 'none', label: tr('Nessuno') }
]

export const SHADOW_MODES: ReadonlyArray<{ id: ShadowMode; label: string }> = [
  { id: 'pixel', label: tr('A pixel') },
  { id: 'soft', label: tr('Morbide') },
  { id: 'off', label: tr('Spente') }
]

export const REFLECTION_MODES: ReadonlyArray<{ id: ReflectionMode; label: string }> = [
  { id: 'scene', label: tr('Scena e cielo') },
  { id: 'sky', label: tr('Solo cielo') }
]
