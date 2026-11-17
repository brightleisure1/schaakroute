import { db, type CardSource, type SchaakDB } from './db'
import { epdOf } from './chess'
import { newSrsState, DAY } from './srs'
import type { ReviewedMove } from './review'
import type { Side } from './types'

// Fouten-trainer: de stellingen waarin jij in een partij een fout maakte, om de betere zet alsnog te vinden.

export const MISTAKE_CLASSES = ['inaccuracy', 'mistake', 'miss', 'blunder'] as const
/** Wat vanzelf naar Herhalen gaat na een analyse: echte fouten, geen onnauwkeurigheden (dat zou te veel worden) */
export const AUTO_REVIEW_CLASSES = ['mistake', 'miss', 'blunder'] as const

export interface MistakeItem {
  ply: number
  /** Stelling vóór jouw fout */
  fen: string
  played: ReviewedMove
  bestUci: string
  bestSan: string
  /** Gespeelde zetten tot deze stelling (uci), voor de context in Herhalen */
  lineUci: string[]
}

/** Jouw fouten in de partij, in volgorde; alleen waar de engine een betere zet kent */
export function mistakeItems(moves: ReviewedMove[], myColor: Side, fens: string[]): MistakeItem[] {
  return moves
    .filter(m => m.side === myColor && (MISTAKE_CLASSES as readonly string[]).includes(m.cls) && m.bestUci && m.bestSan && m.bestUci !== m.uci)
    .map(m => ({ ply: m.ply, fen: fens[m.ply], played: m, bestUci: m.bestUci!, bestSan: m.bestSan!, lineUci: moves.slice(0, m.ply).map(x => x.uci) }))
}

/**
 * Zet de stellingen in Herhalen. Wat je in de trainer niet in één keer goed had komt meteen terug,
 * wat goed ging over een dag. Bestaande kaarten worden alleen naar voren gehaald.
 */
export async function saveMistakeCards(items: MistakeItem[], solved: (ply: number) => boolean, side: Side, database: SchaakDB = db, source?: Omit<CardSource, 'played'>): Promise<number> {
  const now = Date.now()
  let added = 0
  for (const it of items) {
    const epd = epdOf(it.fen)
    const id = `${epd}|${it.bestUci}`
    const due = solved(it.ply) ? now + DAY : now
    const existing = await database.cards.get(id)
    if (existing) {
      if (existing.dueAt > due) await database.cards.update(id, { dueAt: due, suspended: false })
      continue
    }
    await database.cards.put({
      ...newSrsState(now), dueAt: due,
      id, epd, uci: it.bestUci, san: it.bestSan, side, familyIds: [], variationIds: [], lineUci: it.lineUci, createdAt: now,
      ...(source ? { source: { ...source, played: it.played.san, cls: it.played.cls } } : {}),
    })
    added++
  }
  return added
}
