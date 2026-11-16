import type { FamilyFile, Lesson, Variation } from './types'
import { t } from './i18n'

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

/** Titel van een les in de gekozen taal; het volgnummer (1/4) blijft staan */
export function lessonTitle(title: string) {
  const m = title.match(/^(.*?)( \(\d+\/\d+\))?$/)!
  return t(m[1]) + (m[2] ?? '')
}

/** Een les leert hooguit zoveel varianten, zodat hij een paar minuten duurt */
export const MAX_LESSON_VARIATIONS = 3

/** Verdeelt n varianten zo gelijk mogelijk over lessen van hooguit MAX_LESSON_VARIATIONS (7 → 3, 2, 2) */
export function lessonSizes(n: number): number[] {
  const parts = Math.ceil(n / MAX_LESSON_VARIATIONS)
  return Array.from({ length: parts }, (_, i) => Math.floor(n / parts) + (i < n % parts ? 1 : 0))
}

/** De lessen van het leerpad, zonder korte lijnen; lessen die daardoor leeg raken vervallen */
export function learnLessons(file: FamilyFile): Lesson[] {
  const hit = cache.get(file)
  if (hit) return hit
  const min = learnThreshold(file)
  const byId = new Map(file.variations.map(v => [v.id, v]))
  const lessons = file.lessons
    .map(l => ({ ...l, variationIds: l.variationIds.filter(id => { const v = byId.get(id); return !!v && userMoveCount(v, file.family.side) >= min }) }))
    .filter(l => l.variationIds.length)
    // Grote lessen in delen; het eerste deel houdt het oude ID, zodat bestaande links blijven werken
    .flatMap(l => {
      let at = 0
      return lessonSizes(l.variationIds.length).map((size, i) => {
        const part = { ...l, id: i ? `${l.id}-${i + 1}` : l.id, title: l.title.replace(/ \(\d+\/\d+\)$/, ''), variationIds: l.variationIds.slice(at, at + size) }
        at += size
        return part
      })
    })
  // Delen met dezelfde titel binnen een niveau doorlopend nummeren: (1/4), (2/4) …
  const key = (l: Lesson) => `${l.level}|${l.title}`
  const totals = new Map<string, number>()
  for (const l of lessons) totals.set(key(l), (totals.get(key(l)) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const l of lessons) {
    const total = totals.get(key(l))!
    if (total < 2) continue
    const n = (seen.get(key(l)) ?? 0) + 1
    seen.set(key(l), n)
    l.title = `${l.title} (${n}/${total})`
  }
  cache.set(file, lessons)
  return lessons
}
