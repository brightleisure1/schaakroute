import { Chess } from 'chess.js'
import { db, type RepertoireMove, type SchaakDB } from './db'
import { START_FEN, epdOf, parseUci } from './chess'
import { isUserPly } from './trainer'
import type { Side, TrainingLine } from './types'

// Eigen repertoire als boom van stellingen (EPD) met zetten. Mijn kant heeft per stelling één hoofdzet
// (main) en eventueel opgeslagen alternatieven; voor de tegenstander worden alle reacties bewaard.
// Omdat trainingskaarten op EPD + zet zijn gesleuteld, blijft voortgang behouden als je een zet wijzigt.

export async function repChildren(repertoireId: number, epd: string, database: SchaakDB = db): Promise<RepertoireMove[]> {
  return database.repMoves.where('[repertoireId+epd]').equals([repertoireId, epd]).toArray()
}

export interface AddLineResult {
  added: number
  conflicts: { epd: string; existing: string; added: string }[]
}

/** Voegt een zettenreeks toe. Bestaat er al een andere hoofdzet voor mijn kant, dan wordt de nieuwe een alternatief. */
export async function addLine(repertoireId: number, side: Side, uci: string[], database: SchaakDB = db, opts: { makeMain?: boolean } = {}): Promise<AddLineResult> {
  const c = new Chess()
  const res: AddLineResult = { added: 0, conflicts: [] }
  const all = await database.repMoves.where('repertoireId').equals(repertoireId).toArray()
  const byEpd = new Map<string, RepertoireMove[]>()
  for (const m of all) byEpd.set(m.epd, [...(byEpd.get(m.epd) ?? []), m])
  const toAdd: RepertoireMove[] = []
  const toUpdate: RepertoireMove[] = []
  for (let ply = 0; ply < uci.length; ply++) {
    const epd = epdOf(c.fen())
    const mv = c.move(parseUci(uci[ply]))
    const existing = byEpd.get(epd) ?? []
    if (existing.some(m => m.uci === uci[ply])) continue
    const mine = isUserPly(ply, side)
    let main = true
    if (mine) {
      const curMain = existing.find(m => m.main)
      if (curMain) {
        if (opts.makeMain) {
          toUpdate.push({ ...curMain, main: false })
        } else {
          main = false
          res.conflicts.push({ epd, existing: curMain.san, added: mv.san })
        }
      }
    }
    const rm: RepertoireMove = { repertoireId, epd, uci: uci[ply], san: mv.san, main, createdAt: Date.now() }
    toAdd.push(rm)
    byEpd.set(epd, [...existing, rm])
    res.added++
  }
  await database.transaction('rw', database.repMoves, database.repertoires, async () => {
    if (toUpdate.length) await database.repMoves.bulkPut(toUpdate)
    if (toAdd.length) await database.repMoves.bulkAdd(toAdd)
    await database.repertoires.update(repertoireId, { updatedAt: Date.now() })
  })
  return res
}

/** Maakt een zet de hoofdzet in zijn stelling (de oude wordt een alternatief; niets wordt gewist). */
export async function setMain(moveId: number, database: SchaakDB = db) {
  const m = await database.repMoves.get(moveId)
  if (!m) return
  const siblings = await repChildren(m.repertoireId, m.epd, database)
  await database.repMoves.bulkPut(siblings.map(s => ({ ...s, main: s.id === moveId })))
}

/** Verwijdert een zet en alles wat alleen via die zet bereikbaar is. */
export async function deleteMove(moveId: number, database: SchaakDB = db) {
  const m = await database.repMoves.get(moveId)
  if (!m) return
  const all = await database.repMoves.where('repertoireId').equals(m.repertoireId).toArray()
  const byEpd = new Map<string, RepertoireMove[]>()
  for (const x of all) byEpd.set(x.epd, [...(byEpd.get(x.epd) ?? []), x])
  // bereikbaarheid vanaf de start zonder deze zet
  const reachable = new Set<string>()
  const keep = new Set<number>()
  const stack = [START_FEN]
  while (stack.length) {
    const fen = stack.pop()!
    const epd = epdOf(fen)
    if (reachable.has(epd)) continue
    reachable.add(epd)
    for (const x of byEpd.get(epd) ?? []) {
      if (x.id === moveId) continue
      keep.add(x.id!)
      const c = new Chess(fen)
      c.move(parseUci(x.uci))
      stack.push(c.fen())
    }
  }
  const remove = all.filter(x => !keep.has(x.id!)).map(x => x.id!)
  await database.repMoves.bulkDelete(remove)
  // als de hoofdzet verwijderd is, promoveer een alternatief
  const rest = await repChildren(m.repertoireId, m.epd, database)
  if (m.main && rest.length && !rest.some(r => r.main)) await database.repMoves.update(rest[0].id!, { main: true })
}

export async function updateComment(moveId: number, comment: string, database: SchaakDB = db) {
  await database.repMoves.update(moveId, { comment })
}

/** Alle trainbare lijnen: mijn hoofdzetten + alle tegenstanderszetten, tot een blad. */
export async function repertoireLines(repertoireId: number, database: SchaakDB = db, maxLines = 500): Promise<TrainingLine[]> {
  const rep = await database.repertoires.get(repertoireId)
  if (!rep) return []
  const all = await database.repMoves.where('repertoireId').equals(repertoireId).toArray()
  const byEpd = new Map<string, RepertoireMove[]>()
  for (const x of all) byEpd.set(x.epd, [...(byEpd.get(x.epd) ?? []), x])
  const lines: TrainingLine[] = []
  const walk = (fen: string, uci: string[], san: string[], seen: Set<string>) => {
    if (lines.length >= maxLines) return
    const epd = epdOf(fen)
    let kids = byEpd.get(epd) ?? []
    if (isUserPly(uci.length, rep.side)) kids = kids.filter(k => k.main).slice(0, 1)
    if (!kids.length || seen.has(epd)) {
      // een lijn moet eindigen na een zet van mij (anders is er niets te oefenen in de laatste stap)
      if (uci.length) lines.push({ key: `rep${repertoireId}:${uci.join(' ')}`, repertoireId, title: rep.name, subtitle: san.slice(-4).join(' '), uci, san, side: rep.side })
      return
    }
    const nextSeen = new Set(seen).add(epd)
    for (const k of kids) {
      const c = new Chess(fen)
      c.move(parseUci(k.uci))
      walk(c.fen(), [...uci, k.uci], [...san, k.san], nextSeen)
    }
  }
  walk(START_FEN, [], [], new Set())
  return lines.filter(l => l.uci.some((_, i) => isUserPly(i, rep.side)))
}
