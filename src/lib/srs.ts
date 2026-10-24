// Spaced repetition volgens SM-2 (SuperMemo 2, Wozniak 1990), met een korte herleerstap:
// een fout antwoord komt na 10 minuten terug in plaats van pas morgen.

export const MINUTE = 60_000
export const DAY = 86_400_000
export const RELEARN_DELAY = 10 * MINUTE
export const MATURE_DAYS = 7

export interface SrsState {
  ease: number // E-factor, minimaal 1.3
  interval: number // dagen
  reps: number // aantal opeenvolgende goede herhalingen
  lapses: number
  correct: number
  wrong: number
  dueAt: number
  lastReviewed: number | null
}

export const newSrsState = (now = Date.now()): SrsState => ({
  ease: 2.5,
  interval: 0,
  reps: 0,
  lapses: 0,
  correct: 0,
  wrong: 0,
  dueAt: now,
  lastReviewed: null,
})

/**
 * Kwaliteit 0–5:
 * 5 = direct goed, zonder hint
 * 4 = goed na een theoretisch alternatief (de juiste zet wel gekend)
 * 3 = goed na een hint
 * 1 = fout (of de zet moest getoond worden)
 */
export type Quality = 0 | 1 | 2 | 3 | 4 | 5

export function review(state: SrsState, q: Quality, now = Date.now()): SrsState {
  const s = { ...state }
  s.lastReviewed = now
  if (q < 3) {
    s.reps = 0
    s.lapses += 1
    s.wrong += 1
    s.interval = 0
    s.dueAt = now + RELEARN_DELAY
  } else {
    s.correct += 1
    if (s.reps === 0) s.interval = 1
    else if (s.reps === 1) s.interval = 6
    else s.interval = Math.round(s.interval * s.ease * 10) / 10
    s.reps += 1
    s.dueAt = now + s.interval * DAY
  }
  s.ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  return s
}

/** Beheersingsscore 0–100: groeit met het herhalingsinterval, daalt met fouten */
export function masteryScore(s: Pick<SrsState, 'interval' | 'reps' | 'lapses' | 'correct'>): number {
  if (s.correct === 0) return 0
  const base = Math.min(1, s.interval / 30)
  const learning = s.reps > 0 ? 0.15 : 0.05
  const penalty = Math.min(0.3, s.lapses * 0.05)
  return Math.round(Math.max(0, Math.min(1, learning + base * 0.85 - penalty)) * 100)
}

export type CardStage = 'new' | 'learning' | 'young' | 'mature'
export function stageOf(s: Pick<SrsState, 'interval' | 'reps' | 'correct'>): CardStage {
  if (s.correct === 0 && s.reps === 0) return 'new'
  if (s.interval < 1) return 'learning'
  if (s.interval < MATURE_DAYS) return 'young'
  return 'mature'
}
