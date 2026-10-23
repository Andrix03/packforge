// First-run tutorial for Beginner mode: "il tuo primo blocco". Each step completes by itself
// when the user really does it (renderer/tutorialEvents.ts). Pure data + logic.

export type TutorialStep = 'pack' | 'texture' | 'paint' | 'save' | 'test' | 'game'

export type TutorialStatus = 'active' | 'done' | 'off'

export interface TutorialState {
  status: TutorialStatus
  done: TutorialStep[]
}

export const TUTORIAL_STEPS: ReadonlyArray<{ id: TutorialStep; title: string; hint: string }> = [
  {
    id: 'pack',
    title: 'Crea o apri un pack',
    hint: 'A destra c’è «Nuovo pack»: dagli un nome e scegli la versione di Minecraft.'
  },
  {
    id: 'texture',
    title: 'Crea una texture',
    hint: 'Premi «+ Nuova texture» (per esempio dirt) oppure fai doppio clic su una texture.'
  },
  {
    id: 'paint',
    title: 'Disegna',
    hint: 'Scegli un colore e dipingi con la matita: clic sinistro colore primario, destro secondario.'
  },
  { id: 'save', title: 'Salva', hint: 'Premi «Salva» o Ctrl+S: la texture finisce nel pack.' },
  {
    id: 'test',
    title: 'Guardala in 3D',
    hint: 'Premi «Prova»: vedi il blocco in un muro, al sole, di notte, sotto la pioggia.'
  },
  {
    id: 'game',
    title: 'Portala nel gioco',
    hint: 'Nel pack, «🎮 Copia nel gioco» → «Copia nel gioco». In Minecraft attiva il pack e premi F3 + T.'
  }
]

export const NEW_TUTORIAL: TutorialState = { status: 'active', done: [] }

const IDS = new Set<string>(TUTORIAL_STEPS.map((s) => s.id))

/** Reads the stored tutorial leniently (unknown steps dropped). */
export function parseTutorial(value: unknown): TutorialState {
  if (typeof value !== 'object' || value === null) return { ...NEW_TUTORIAL }
  const r = value as Record<string, unknown>
  const status: TutorialStatus =
    r['status'] === 'done' || r['status'] === 'off' ? r['status'] : 'active'
  const done = Array.isArray(r['done'])
    ? [...new Set(r['done'].filter((s): s is TutorialStep => typeof s === 'string' && IDS.has(s)))]
    : []
  return { status, done }
}

/** The state after a step was done (finished when every step is). */
export function completeStep(state: TutorialState, step: TutorialStep): TutorialState {
  if (state.status !== 'active' || state.done.includes(step)) return state
  const done = [...state.done, step]
  return { status: done.length === TUTORIAL_STEPS.length ? 'done' : 'active', done }
}

/** The first step not done yet (null when all are). */
export function nextStep(state: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS.find((s) => !state.done.includes(s.id))?.id ?? null
}
