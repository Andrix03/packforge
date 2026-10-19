import { describe, expect, it } from 'vitest'
import { completeStep, NEW_TUTORIAL, nextStep, parseTutorial, TUTORIAL_STEPS } from './tutorial'

describe('tutorial', () => {
  it('reads stored state leniently', () => {
    expect(parseTutorial(null)).toEqual(NEW_TUTORIAL)
    expect(parseTutorial({ status: 'off', done: ['pack', 'nope', 'pack'] })).toEqual({
      status: 'off',
      done: ['pack']
    })
  })

  it('completes steps in any order and finishes after the last', () => {
    let state = NEW_TUTORIAL
    expect(nextStep(state)).toBe('pack')
    state = completeStep(state, 'texture')
    expect(nextStep(state)).toBe('pack')
    for (const step of TUTORIAL_STEPS) state = completeStep(state, step.id)
    expect(state.status).toBe('done')
    expect(nextStep(state)).toBeNull()
  })

  it('ignores steps once turned off', () => {
    const off = { status: 'off' as const, done: [] }
    expect(completeStep(off, 'pack')).toBe(off)
  })
})
