// Traint de zetbeoordeling op echte Chess.com-reviews.
//
// Zet PGN's uit Chess.com Game Review (Delen → PGN) in data-raw/chesscom-reviews/*.pgn (meerdere partijen per
// bestand mag). Die map gaat niet mee in git. Daarna: npm run fit:classifier
//   DEPTH=14 (standaard, zoals 'Snel' in de app) of DEPTH=18 ('Grondig')
//   FIT=0 alleen meten, niet zoeken naar betere instellingen
// Per partij wordt de Stockfish-analyse bewaard in data-raw/chesscom-reviews/.cache, dus elke partij hoeft maar
// één keer geanalyseerd te worden. Uitkomst: overeenkomst per soort, en de beste instellingen voor REVIEW_MODEL.

import { it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { REVIEW_MODEL, bookInfo, chesscomReview, classifyGame, type MoveClass, type PosEval } from '../src/lib/review'

const DIR = 'data-raw/chesscom-reviews'
const CACHE = join(DIR, '.cache')
const DEPTH = Number(process.env.DEPTH ?? 14)
const LOG: string[] = []
const log = (...a: unknown[]) => { const line = a.map(String).join(' '); LOG.push(line); process.stdout.write(line + '\n') }
const NOTABLE: MoveClass[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
type Label = MoveClass | 'quiet'

function engine() {
  const sf = spawn('node', ['node_modules/stockfish/bin/stockfish-19-lite-single.js'])
  let buf = ''
  let waiter: ((l: string) => void) | null = null
  sf.stdout.on('data', d => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); waiter?.(l) }
  })
  const send = (s: string) => sf.stdin.write(s + '\n')
  return {
    async init() { await new Promise<void>(r => { waiter = l => { if (l.startsWith('uciok')) r() }; send('uci') }); send('setoption name MultiPV value 2') },
    async evalFen(fen: string): Promise<PosEval> {
      const c = new Chess(fen)
      if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 }
      if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0 }
      const lines: Record<number, string> = {}
      let best: string | undefined
      await new Promise<void>(r => {
        waiter = l => {
          if (l.startsWith('info') && l.includes(' pv ')) lines[Number(l.match(/multipv (\d+)/)?.[1] ?? 1)] = l
          else if (l.startsWith('bestmove')) { best = l.split(' ')[1]; r() }
        }
        send(`position fen ${fen}`); send(`go depth ${DEPTH}`)
      })
      const stm = c.turn() === 'w' ? 1 : -1
      const conv = (l?: string) => {
        if (!l) return {}
        const m = l.match(/score mate (-?\d+)/)?.[1]
        const cp = l.match(/score cp (-?\d+)/)?.[1]
        return m !== undefined ? { mate: stm * Number(m) } : { cp: stm * Number(cp ?? 0) }
      }
      const a = conv(lines[1]) as { cp?: number; mate?: number }
      const b = conv(lines[2]) as { cp?: number; mate?: number }
      return { ...a, best, pv: lines[1]?.split(' pv ')[1]?.trim().split(' ').slice(0, 8), cp2: b.cp, mate2: b.mate }
    },
    kill() { sf.kill() },
  }
}

interface Game { name: string; san: string[]; labels: (MoveClass | null)[]; ratings: { white?: number; black?: number }; evals: PosEval[]; book: number }

function score(games: Game[]) {
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(NOTABLE.map(k => [k, { tp: 0, fp: 0, fn: 0 }]))
  let same = 0, total = 0
  for (const g of games) {
    const moves = classifyGame(g.san, g.evals, g.book, { ratings: g.ratings })
    moves.forEach((m, i) => {
      const ref: Label = g.labels[i] && NOTABLE.includes(g.labels[i]!) ? g.labels[i]! : 'quiet'
      const ours: Label = NOTABLE.includes(m.cls) ? m.cls : 'quiet'
      total++
      if (ref === ours) same++
      if (ref !== 'quiet') { if (ref === ours) per[ref].tp++; else per[ref].fn++ }
      if (ours !== 'quiet' && ours !== ref) per[ours].fp++
    })
  }
  const f1 = (k: string) => { const { tp, fp, fn } = per[k]; return tp + fp + fn === 0 ? null : (2 * tp) / (2 * tp + fp + fn) }
  const present = NOTABLE.filter(k => per[k].tp + per[k].fn > 0)
  const macro = present.length ? present.reduce((a, k) => a + (f1(k) ?? 0), 0) / present.length : 0
  return { agreement: same / Math.max(1, total), macro, per, f1 }
}

function report(title: string, s: ReturnType<typeof score>) {
  const rows = NOTABLE.map(k => {
    const { tp, fp, fn } = s.per[k]
    return `  ${k.padEnd(11)} Chess.com ${String(tp + fn).padStart(3)} · wij ${String(tp + fp).padStart(3)} · gelijk ${String(tp).padStart(3)} · F1 ${s.f1(k)?.toFixed(2) ?? '–'}`
  })
  return `${title}: zelfde label ${(s.agreement * 100).toFixed(1)}% van de zetten, gemiddelde F1 opvallende zetten ${s.macro.toFixed(3)}\n${rows.join('\n')}`
}

it('zetbeoordeling trainen op Chess.com-reviews', async () => {
  if (!existsSync(DIR)) throw new Error(`Map ${DIR} bestaat niet`)
  mkdirSync(CACHE, { recursive: true })
  const names = JSON.parse(readFileSync('public/data/names.json', 'utf8'))
  const texts = readdirSync(DIR).filter(f => f.endsWith('.pgn')).flatMap(f => readFileSync(join(DIR, f), 'utf8').split(/\n\s*\n(?=\[Event )/).map((t, i) => ({ name: `${f}#${i + 1}`, t })))
  const sf = engine()
  await sf.init()
  const games: Game[] = []
  for (const { name, t } of texts) {
    let r
    try { r = chesscomReview(t) } catch { log(`overgeslagen (geen geldige PGN): ${name}`); continue }
    if (r.unknownTypes.length) log(`${name}: onbekende soorten ${r.unknownTypes.join(', ')}`)
    // Zonder één enkel label is er geen Game Review gedraaid: dan zou alles als 'geen fout' tellen
    if (!r.labels.some(Boolean)) { log(`overgeslagen (geen labels, eerst Game Review draaien): ${name}`); continue }
    const key = createHash('sha1').update(r.san.join(' ')).digest('hex').slice(0, 16)
    const file = join(CACHE, `${key}-d${DEPTH}.json`)
    let evals: PosEval[]
    if (existsSync(file)) evals = JSON.parse(readFileSync(file, 'utf8'))
    else {
      const c = new Chess()
      evals = [await sf.evalFen(c.fen())]
      for (const s of r.san) { c.move(s); evals.push(await sf.evalFen(c.fen())) }
      writeFileSync(file, JSON.stringify(evals))
      log(`geanalyseerd: ${name} (${r.san.length} halve zetten)`)
    }
    games.push({ name, san: r.san, labels: r.labels, ratings: r.ratings, evals, book: bookInfo(r.san, names).ply })
  }
  sf.kill()
  log(`\n${games.length} partijen, ${games.reduce((a, g) => a + g.san.length, 0)} halve zetten, diepte ${DEPTH}\n`)
  const base = { ...REVIEW_MODEL }
  const before = score(games)
  log(report('Nu', before))
  if (process.env.FIT === '0' || !games.length) { writeFileSync(join(DIR, 'fit-report.txt'), LOG.join('\n')); return }

  // Coördinaat-zoektocht: per instelling de beste waarde kiezen, een paar rondes
  const grid: Record<string, number[]> = {
    epSlopeAt500: [0.2, 0.35, 0.6, 0.8, 1, 1.2, 1.5, 2],
    epSlopeAt2000: [0.5, 0.8, 1, 1.2, 1.5, 2],
    epCap: [1000, 1500, 2000, 3000, 5000],
    blunderMaxWinAfter: [20, 30, 40, 50, 101],
    greatGap: [8, 10, 14, 18, 24],
    greatMinOpponentLoss: [0, 2, 5, 10],
    missMinOpponentLoss: [8, 12, 16, 24],
    brilliantMaxLoss: [1, 2, 3, 5],
    brilliantMaxWp: [85, 90, 95, 99],
  }
  const objective = (s: ReturnType<typeof score>) => s.macro + 0.25 * s.agreement
  const M = REVIEW_MODEL as Record<string, number | boolean>
  /** Coördinaat-zoektocht op een set partijen; laat REVIEW_MODEL op de beste instellingen staan */
  const fit = (set: Game[]) => {
    Object.assign(REVIEW_MODEL, base)
    let best = objective(score(set))
    for (let round = 0; round < 3; round++) {
      for (const [k, values] of Object.entries(grid)) {
        let bestV = M[k] as number
        for (const v of values) {
          M[k] = v
          const o = objective(score(set))
          if (o > best + 1e-9) { best = o; bestV = v }
        }
        M[k] = bestV
      }
    }
  }
  // Eerlijke controle: afstemmen op alle partijen behalve één, en meten op die ene
  if (games.length >= 3) {
    const held: Game[] = []
    const scores: { base: number; tuned: number }[] = []
    for (const g of games) {
      Object.assign(REVIEW_MODEL, base)
      const b = score([g]).macro
      fit(games.filter(x => x !== g))
      scores.push({ base: b, tuned: score([g]).macro })
      held.push(g)
    }
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
    log(`\nControle (steeds één partij buiten de training): F1 opvallende zetten ${avg(scores.map(x => x.base)).toFixed(3)} → ${avg(scores.map(x => x.tuned)).toFixed(3)}; beter bij ${scores.filter(x => x.tuned > x.base).length} van ${scores.length} partijen`)
  }
  fit(games)
  const after = score(games)
  log('\n' + report('Na afstemmen', after))
  const changed = Object.fromEntries(Object.keys(grid).filter(k => (REVIEW_MODEL as Record<string, unknown>)[k] !== (base as Record<string, unknown>)[k]).map(k => [k, (REVIEW_MODEL as Record<string, unknown>)[k]]))
  log('\nBeste instellingen (verschil met nu):', JSON.stringify(changed))
  writeFileSync(join(DIR, 'fit-result.json'), JSON.stringify({ depth: DEPTH, games: games.length, before: { agreement: before.agreement, macro: before.macro }, after: { agreement: after.agreement, macro: after.macro }, changed }, null, 2))
  Object.assign(REVIEW_MODEL, base)
  writeFileSync(join(DIR, 'fit-report.txt'), LOG.join('\n'))
})
