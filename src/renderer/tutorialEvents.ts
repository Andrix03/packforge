import type { TutorialStep } from '../shared/tutorial'

/** Event the components send when the user does a tutorial step (TutorialCard listens). */
export const STEP_EVENT = 'packforge:tutorial-step'

export function announceStep(step: TutorialStep): void {
  window.dispatchEvent(new CustomEvent<TutorialStep>(STEP_EVENT, { detail: step }))
}
