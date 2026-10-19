import { describe, expect, it } from 'vitest'
import { stageContext } from './stageContext'

const B = 'assets/minecraft/textures/block'
const STAGES = [0, 1, 2, 3].map((n) => `${B}/carrots_stage${n}.png`)
const files = new Set([...STAGES, `${B}/carrots_stage3_top.png`, `${B}/carrots_stage3_v2.png`])
const exists = (path: string): boolean => files.has(path)

describe('stageContext', () => {
  it('shows the previous stage, and the upper block of a tall stage above it', () => {
    expect(stageContext(`${B}/carrots_stage3.png`, STAGES, exists)).toEqual({
      above: `${B}/carrots_stage3_top.png`,
      below: null,
      previous: `${B}/carrots_stage2.png`
    })
    expect(stageContext(`${B}/carrots_stage1.png`, STAGES, exists)).toEqual({
      above: null,
      below: null,
      previous: `${B}/carrots_stage0.png`
    })
  })

  it('shows the lower block under a top, and no previous top when that stage is not tall', () => {
    const withTop = [...STAGES, `${B}/carrots_stage3_top.png`]
    expect(stageContext(`${B}/carrots_stage3_top.png`, withTop, exists)).toEqual({
      above: null,
      below: `${B}/carrots_stage3.png`,
      previous: null
    })
  })

  it('treats a random variant as its stage (same top, same previous stage)', () => {
    const withVariant = [...STAGES, `${B}/carrots_stage3_v2.png`]
    expect(stageContext(`${B}/carrots_stage3_v2.png`, withVariant, exists)).toEqual({
      above: `${B}/carrots_stage3_top.png`,
      below: null,
      previous: `${B}/carrots_stage2.png`
    })
  })

  it('has nothing before the first stage', () => {
    expect(stageContext(`${B}/carrots_stage0.png`, STAGES, exists).previous).toBeNull()
  })
})
