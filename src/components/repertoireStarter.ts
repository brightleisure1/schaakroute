import { Chess } from 'chess.js'
import { db, type SchaakDB } from '../lib/db'
import { epdOf, parseUci } from '../lib/chess'
import { isUserPly } from '../lib/trainer'
import { addLine } from '../lib/repertoire'
import { loadFamily, loadStats } from '../lib/data'
import type { FamilyFile, StatsFile } from '../lib/types'
import { t } from '../lib/i18n'

// Startrepertoire uit de openingsdata: de meest gespeelde lijnen van één familie, zo gekozen dat je
// per stelling één eigen zet hebt (een repertoire traint alleen hoofdzetten) en op alle gangbare
// reacties van de tegenstander een antwoord klaar hebt.

/** Voorstellen op het lege repertoirescherm (titel en hint zijn Nederlandse sleutels: vertalen met t() bij het tonen) */
export const STARTERS = [
  { familyId: 'italian-game', side: 'white', title: 'Wit: Italian Game', hint: 'de 12 meest gespeelde lijnen' },
  { familyId: 'sicilian-defense', side: 'black', title: 'Zwart: Sicilian Defense', hint: 'antwoord op 1.e4' },
] as const

export const STARTER_LINES = 12

/**
 * Kiest de meest gespeelde varianten (op frequentie) die niet botsen met een eerder gekozen eigen zet.
 * Eindigt een variant met een zet van de tegenstander, dan komt jouw meest gespeelde antwoord erbij
 * (uit de statistieken), zodat er in elke lijn iets te oefenen valt. Geeft alleen de eindlijnen terug
 * (een lijn die het begin is van een langere lijn voegt niets toe).
 */
export function starterLines(file: FamilyFile, stats: StatsFile | null, count = STARTER_LINES): string[][] {
  const side = file.family.side
  const mine = new Map<string, string>() // stelling → mijn zet
  const known = new Set<string>() // "stelling zet" van alles wat al in de boom zit
  const picked: string[][] = []
  const variations = [...file.variations].sort((a, b) => b.freq - a.freq || a.uci.length - b.uci.length)

  const leaves = () => picked.filter(l => !picked.some(o => o.length > l.length && l.every((u, i) => o[i] === u)))

  for (const v of variations) {
    if (leaves().length >= count) break
    const c = new Chess()
    const line: string[] = []
    const steps: [string, string, boolean][] = []
    let ok = true
    try {
      for (let ply = 0; ply < v.uci.length; ply++) {
        const epd = epdOf(c.fen())
        const own = isUserPly(ply, side)
        if (own && mine.has(epd) && mine.get(epd) !== v.uci[ply]) { ok = false; break }
        c.move(parseUci(v.uci[ply]))
        steps.push([epd, v.uci[ply], own])
        line.push(v.uci[ply])
      }
      // eindigt op een zet van de tegenstander: voeg mijn antwoord toe
      if (ok && line.length && isUserPly(line.length, side)) {
        const epd = epdOf(c.fen())
        const reply = mine.get(epd) ?? stats?.positions[epd]?.m[0]?.[0]
        if (reply) {
          c.move(parseUci(reply))
          steps.push([epd, reply, true])
          line.push(reply)
        }
      }
    } catch {
      ok = false // ongeldige zet in de data: deze variant overslaan
    }
    if (!ok || !line.length || steps.every(([e, u]) => known.has(`${e} ${u}`))) continue
    for (const [e, u, own] of steps) {
      known.add(`${e} ${u}`)
      if (own) mine.set(e, u)
    }
    picked.push(line)
  }
  return leaves()
}

/** Maakt het repertoire aan en geeft het id terug */
export async function createStarterRepertoire(familyId: string, database: SchaakDB = db): Promise<number> {
  const [file, stats] = await Promise.all([loadFamily(familyId), loadStats(familyId).catch(() => null)])
  const lines = starterLines(file, stats)
  if (!lines.length) throw new Error(t('Geen lijnen gevonden voor {name}.', { name: file.family.name }))
  const now = Date.now()
  const id = (await database.repertoires.add({ name: t('Mijn {name}', { name: file.family.name }), side: file.family.side, familyId, createdAt: now, updatedAt: now })) as number
  for (const l of lines) await addLine(id, file.family.side, l, database)
  return id
}
