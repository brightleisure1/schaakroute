import type { FamilyFile, Lesson, Variation } from './types'

// Leren gaat over lijnen waarin je zelf minstens 4 zetten speelt. Kortere lijnen (1–3 eigen zetten) zijn
// saai om te leren; ze blijven gewoon in de variantenboom staan en zijn daar los te oefenen.

export const MIN_LEARN_MOVES = 4

/** Aantal zetten dat de gebruiker zelf speelt in een variant */
export const userMoveCount = (v: Variation, side: 'white' | 'black') => (side === 'white' ? Math.ceil(v.uci.length / 2) : Math.floor(v.uci.length / 2))

/** Minimum voor deze opening: 4, of de langste lijn als een opening (bijv. de Englund Gambit) alleen korte lijnen heeft */
export function learnThreshold(file: FamilyFile) {
  const longest = Math.max(0, ...file.variations.map(v => userMoveCount(v, file.family.side)))
  return Math.min(MIN_LEARN_MOVES, longest)
}

const cache = new WeakMap<FamilyFile, Lesson[]>()

/** De lessen van het leerpad, zonder korte lijnen; lessen die daardoor leeg raken vervallen */
export function learnLessons(file: FamilyFile): Lesson[] {
  const hit = cache.get(file)
  if (hit) return hit
  const min = learnThreshold(file)
  const byId = new Map(file.variations.map(v => [v.id, v]))
  const lessons = file.lessons
    .map(l => ({ ...l, variationIds: l.variationIds.filter(id => { const v = byId.get(id); return !!v && userMoveCount(v, file.family.side) >= min }) }))
    .filter(l => l.variationIds.length)
  cache.set(file, lessons)
  return lessons
}
