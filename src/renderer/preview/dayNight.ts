// Day/night lighting for the preview. Pure: no Three.js, so it is unit-tested.
// Time is in hours [0, 24): the sun rises at 6 in the east (+X), is highest
// at 12 and sets at 18 in the west; the moon is opposite.

export type Vec3 = [number, number, number]

export interface Lighting {
  /** Unit vector pointing towards the sun. */
  sunDirection: Vec3
  /** Sun color already scaled by its intensity (0 at night). */
  sunColor: Vec3
  moonDirection: Vec3
  moonColor: Vec3
  ambient: Vec3
  sky: Vec3
}

const SUN_NOON: Vec3 = [1.0, 0.97, 0.9]
const SUN_LOW: Vec3 = [1.0, 0.55, 0.3]
const MOON: Vec3 = [0.55, 0.65, 1.0]
const AMBIENT_DAY: Vec3 = [0.42, 0.46, 0.55]
const AMBIENT_NIGHT: Vec3 = [0.05, 0.06, 0.11]
const SKY_DAY: Vec3 = [0.47, 0.65, 1.0]
const SKY_NIGHT: Vec3 = [0.03, 0.04, 0.1]
const SKY_SUNSET: Vec3 = [0.95, 0.5, 0.3]

/** Wraps any hour value into [0, 24). */
export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24
}

export function lightingAt(hour: number): Lighting {
  const angle = ((normalizeHour(hour) - 6) / 24) * Math.PI * 2
  const sunDirection = normalize([Math.cos(angle), Math.sin(angle), 0.35])
  const moonDirection = normalize([-Math.cos(angle), -Math.sin(angle), 0.35])
  const elevation = Math.sin(angle)

  // 0 at night, 1 in full day; soft transition around the horizon.
  const day = smoothstep(-0.12, 0.3, elevation)
  // Peaks while the sun is near the horizon (dawn and dusk).
  const twilight = Math.max(0, 1 - Math.abs(elevation) / 0.3) * smoothstep(-0.25, 0, elevation)

  const sunTint = mix(SUN_LOW, SUN_NOON, smoothstep(0, 0.5, elevation))
  return {
    sunDirection,
    sunColor: scale(sunTint, day),
    moonDirection,
    moonColor: scale(MOON, (1 - day) * 0.28),
    ambient: mix(AMBIENT_NIGHT, AMBIENT_DAY, day),
    sky: mix(mix(SKY_NIGHT, SKY_DAY, day), SKY_SUNSET, twilight * 0.6)
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2])
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** "HH:MM" of an hour of the day. */
export function formatHour(hour: number): string {
  const total = Math.round(normalizeHour(hour) * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
