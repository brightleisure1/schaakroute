import { formatMoves } from './chess'
import type { FamilySummary, Side } from './types'

export interface OpeningGroup {
  key: string
  label: string
  families: FamilySummary[]
}

const MAIN_FIRST_MOVES = ['e4', 'd4']

/**
 * Deelt de openingen van één kleur in op de eerste zet van wit, zodat de lijst overzichtelijk blijft als er meer bijkomen.
 * De volgorde binnen een groep blijft die van de invoer (populairste eerst).
 */
export function groupByFirstMove(families: FamilySummary[], side: Side): OpeningGroup[] {
  const own = families.filter(f => f.side === side)
  const main = MAIN_FIRST_MOVES.map(move => ({
    key: move,
    label: side === 'white' ? `Begint met 1. ${move}` : `Tegen 1. ${move}`,
    families: own.filter(f => f.rootSan[0] === move),
  }))
  const other = { key: 'other', label: 'Andere eerste zetten', families: own.filter(f => !MAIN_FIRST_MOVES.includes(f.rootSan[0])) }
  return [...main, other].filter(g => g.families.length)
}

/** Alleen letters en cijfers, zodat "kings" ook King's vindt en "1.e4" de zetten */
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')

/** Zoekt op Engelse naam, Nederlandse naam en zetten */
export function matchesOpening(f: FamilySummary, nameNl: string | undefined, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  return [f.name, nameNl ?? '', f.rootSan.join(''), formatMoves(f.rootSan)].some(s => normalize(s).includes(q))
}
