// Traint de zetbeoordeling op echte Chess.com-reviews.
//
// Zet PGN's uit Chess.com Game Review (Delen → PGN) in data-raw/chesscom-reviews/*.pgn (meerdere partijen per
// bestand mag). Die map gaat niet mee in git. Daarna: npm run fit:classifier
//   DEPTH=14 (standaard, zoals 'Snel' in de app) of DEPTH=18 ('Grondig')
//   ENGINE=full de volledige Stockfish in plaats van de lichte
//   MODEL=1 het lerende model trainen (beslisbomen) en controleren in 5 delen
//   FIT=0 alleen meten, niet zoeken naar betere instellingen
// Per partij wordt de Stockfish-analyse bewaard in data-raw/chesscom-reviews/.cache, dus elke partij hoeft maar
// één keer geanalyseerd te worden. Uitkomst: overeenkomst per soort, en de beste instellingen voor REVIEW_MODEL.

import { it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { MODEL_LABELS, REVIEW_MODEL, bookInfo, chesscomReview, classifyGame, type MoveClass, type MoveModel, type PosEval } from '../src/lib/review'

const DIR = 'data-raw/chesscom-reviews'
const CACHE = join(DIR, '.cache')
const DEPTH = Number(process.env.DEPTH ?? 14)
/** ENGINE=full: de volledige Stockfish (≈100 MB, zoals Chess.com) in plaats van de lichte uit de app */
const FULL = process.env.ENGINE === 'full'
const LOG: string[] = []
const log = (...a: unknown[]) => { const line = a.map(String).join(' '); LOG.push(line); process.stdout.write(line + '\n') }
const EXAMPLES: string[] = []
const DECIDED: Record<string, number[]> = {}
const NOTABLE: MoveClass[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
type Label = MoveClass | 'quiet'

function engine() {
  const sf = spawn('node', [FULL ? 'node_modules/stockfish/bin/stockfish-19-single.js' : 'node_modules/stockfish/bin/stockfish-19-lite-single.js'])
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

function score(games: Game[], model: MoveModel | null = null) {
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(NOTABLE.map(k => [k, { tp: 0, fp: 0, fn: 0 }]))
  let same = 0, total = 0
  for (const g of games) {
    const moves = classifyGame(g.san, g.evals, g.book, { ratings: g.ratings, model })
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

/** Verwarringstabel (Chess.com → wij) en het verlies aan winstkans per Chess.com-soort, om te zien waar het misgaat */
function diagnose(games: Game[]) {
  const classes: Label[] = [...NOTABLE, 'quiet']
  const conf: Record<string, Record<string, number>> = Object.fromEntries(classes.map(a => [a, Object.fromEntries(classes.map(b => [b, 0]))]))
  const losses: Record<string, number[]> = Object.fromEntries(classes.map(a => [a, []]))
  const byRating: Record<string, Record<string, number[]>> = {}
  for (const g of games) {
    const moves = classifyGame(g.san, g.evals, g.book, { ratings: g.ratings, model: null })
    moves.forEach((m, i) => {
      const ref: Label = g.labels[i] && NOTABLE.includes(g.labels[i]!) ? g.labels[i]! : 'quiet'
      const ours: Label = NOTABLE.includes(m.cls) ? m.cls : 'quiet'
      conf[ref][ours]++
      {
        const sgn = m.side === 'white' ? 1 : -1
        const cpOf = (e: PosEval) => (e.mate != null ? Math.sign(e.mate) * 20000 : (e.cp ?? 0))
        const b = sgn * cpOf(g.evals[i]), a = sgn * cpOf(g.evals[i + 1])
        if (Math.abs(b) >= 500 && i >= g.book && m.uci !== g.evals[i].best) {
          const key = `${b > 0 ? 'win' : 'lose'} ${ref}`
          ;(DECIDED[key] ??= []).push(Math.min(5000, b - a))
          if (b < 0) (DECIDED[`rel ${key}`] ??= []).push(Math.round((100 * Math.min(5000, b - a)) / Math.abs(b)))
        }
      }
      if (ref !== ours && ref !== 'quiet' && ours === 'quiet' && i >= g.book) {
        const ev = (e: PosEval) => (e.mate != null ? `M${e.mate}` : String(e.cp ?? '?'))
        const r = m.side === 'white' ? g.ratings.white : g.ratings.black
        EXAMPLES.push(`${ref.padEnd(10)} ${g.name} ${Math.floor(i / 2) + 1}${i % 2 ? '...' : '.'} ${m.san} (${r}) eval ${ev(g.evals[i])} → ${ev(g.evals[i + 1])} · 2e lijn ${g.evals[i].mate2 != null ? 'M' + g.evals[i].mate2 : g.evals[i].cp2} · beste ${m.bestSan} · wp ${m.wpBefore.toFixed(0)}→${m.wpAfter.toFixed(0)} verlies ${m.loss.toFixed(1)}`)
      }
      if (i >= g.book) losses[ref].push(m.loss)
      const r = m.side === 'white' ? g.ratings.white : g.ratings.black
      const band = r == null ? '?' : r < 1000 ? '<1000' : r < 1600 ? '1000-1599' : r < 2000 ? '1600-1999' : '2000+'
      if ((ref === 'inaccuracy' || ref === 'mistake' || ref === 'blunder') && i >= g.book) ((byRating[band] ??= {})[ref] ??= []).push(m.loss)
    })
  }
  const q = (xs: number[], p: number) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  const short = (c: string) => c.slice(0, 5)
  const head = '  ref\\wij     ' + classes.map(c => short(c).padStart(6)).join('')
  const rows = classes.map(a => '  ' + a.padEnd(11) + classes.map(b => String(conf[a][b]).padStart(6)).join(''))
  const lossRows = classes.map(a => `  ${a.padEnd(11)} n ${String(losses[a].length).padStart(4)} · verlies winstkans p10 ${q(losses[a], 0.1).toFixed(1)} · p50 ${q(losses[a], 0.5).toFixed(1)} · p90 ${q(losses[a], 0.9).toFixed(1)}`)
  const bandRows = Object.entries(byRating).sort().map(([band, per]) => `  ${band.padEnd(10)} ` + ['inaccuracy', 'mistake', 'blunder'].map(k => `${k} p50 ${q(per[k] ?? [], 0.5).toFixed(1)} (n ${(per[k] ?? []).length})`).join(' · '))
  const decRows = Object.entries(DECIDED).sort().map(([k, xs]) => `  ${k.padEnd(16)} n ${String(xs.length).padStart(4)} · cp-verlies p10 ${q(xs, 0.1)} · p25 ${q(xs, 0.25)} · p50 ${q(xs, 0.5)} · p75 ${q(xs, 0.75)} · p90 ${q(xs, 0.9)}`)
  return `Beslist (|eval| ≥ 5 pionnen, niet de beste zet): centipawns verlies per Chess.com-soort\n${decRows.join('\n')}\n\nVerwarringstabel (rij = Chess.com, kolom = wij)\n${head}\n${rows.join('\n')}\n\nVerlies aan winstkans (procentpunten) per Chess.com-soort\n${lossRows.join('\n')}\n\nMediaan verlies per ratinggroep\n${bandRows.join('\n')}`
}


// ---------------- Lerend model: gradient-boosted beslisbomen ----------------

interface Sample { x: number[]; y: number; game: number }

function samplesOf(games: Game[]): Sample[] {
  const out: Sample[] = []
  games.forEach((g, gi) => {
    const feats: number[][] = []
    classifyGame(g.san, g.evals, g.book, { ratings: g.ratings, features: feats, model: null })
    feats.forEach((x, i) => {
      if (!x.length) return
      const l = g.labels[i]
      const y = l && (MODEL_LABELS as readonly string[]).includes(l) ? MODEL_LABELS.indexOf(l as (typeof MODEL_LABELS)[number]) : 0
      out.push({ x, y, game: gi })
    })
  })
  return out
}

interface GbdtOpts { rounds: number; depth: number; rate: number; minLeaf: number; lambda: number; weightPow: number }

function trainGbdt(data: Sample[], o: GbdtOpts): MoveModel {
  const K = MODEL_LABELS.length
  const F = data[0].x.length
  const n = data.length
  // Drempels per kenmerk: kwantielen
  const cuts: number[][] = []
  for (let f = 0; f < F; f++) {
    const vals = [...new Set(data.map(d => d.x[f]))].sort((a, b) => a - b)
    const c: number[] = []
    if (vals.length <= 33) for (let i = 0; i + 1 < vals.length; i++) c.push((vals[i] + vals[i + 1]) / 2)
    else for (let q = 1; q < 32; q++) { const v = vals[Math.floor((q / 32) * vals.length)]; if (c[c.length - 1] !== v) c.push(v) }
    cuts.push(c)
  }
  const bin = data.map(d => d.x.map((v, f) => { const c = cuts[f]; let lo = 0, hi = c.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (v <= c[mid]) hi = mid; else lo = mid + 1 } return lo }))
  const counts = Array(K).fill(0); data.forEach(d => counts[d.y]++)
  const w = data.map(d => Math.pow(n / (K * Math.max(1, counts[d.y])), o.weightPow))
  const wsum = Array(K).fill(0); data.forEach((d, i) => { wsum[d.y] += w[i] })
  const tot = wsum.reduce((a, b) => a + b, 0)
  const bias = wsum.map(v => Math.log(Math.max(1e-6, v / tot)))
  const z = data.map(() => bias.slice())
  const trees: number[][][][] = []
  for (let r = 0; r < o.rounds; r++) {
    const P = z.map(zz => { const m = Math.max(...zz); const e = zz.map(v => Math.exp(v - m)); const s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s) })
    const round: number[][][] = []
    for (let k = 0; k < K; k++) {
      const g = data.map((d, i) => w[i] * (P[i][k] - (d.y === k ? 1 : 0)))
      const h = data.map((_, i) => w[i] * Math.max(1e-6, P[i][k] * (1 - P[i][k])))
      const nodes: number[][] = []
      const build = (idx: number[], depth: number): number => {
        let G = 0, H = 0
        for (const i of idx) { G += g[i]; H += h[i] }
        const me = nodes.length
        nodes.push([-1, -G / (H + o.lambda)])
        if (depth >= o.depth || idx.length < 2 * o.minLeaf) return me
        let best = { gain: 1e-9, f: -1, b: -1 }
        const parent = (G * G) / (H + o.lambda)
        for (let f = 0; f < F; f++) {
          const nb = cuts[f].length + 1
          if (nb < 2) continue
          const hg = new Float64Array(nb), hh = new Float64Array(nb), hc = new Int32Array(nb)
          for (const i of idx) { const b = bin[i][f]; hg[b] += g[i]; hh[b] += h[i]; hc[b]++ }
          let lg = 0, lh = 0, lc = 0
          for (let b = 0; b < nb - 1; b++) {
            lg += hg[b]; lh += hh[b]; lc += hc[b]
            if (lc < o.minLeaf || idx.length - lc < o.minLeaf) continue
            const gain = (lg * lg) / (lh + o.lambda) + ((G - lg) * (G - lg)) / (H - lh + o.lambda) - parent
            if (gain > best.gain) best = { gain, f, b }
          }
        }
        if (best.f < 0) return me
        const left = idx.filter(i => bin[i][best.f] <= best.b)
        const right = idx.filter(i => bin[i][best.f] > best.b)
        const l = build(left, depth + 1)
        const rr = build(right, depth + 1)
        nodes[me] = [best.f, cuts[best.f][best.b], l, rr]
        return me
      }
      build(data.map((_, i) => i), 0)
      round.push(nodes)
    }
    trees.push(round)
    const tv = (t: number[][], x: number[]) => { let i = 0; for (;;) { const nd = t[i]; if (nd[0] < 0) return nd[1]; i = x[nd[0]] <= nd[1] ? nd[2] : nd[3] } }
    data.forEach((d, i) => round.forEach((t, k) => { z[i][k] += o.rate * tv(t, d.x) }))
  }
  return { features: F, bias, rate: o.rate, trees: trees.map(r => r.map(t => t.map(nd => nd.map(v => (Number.isInteger(v) ? v : Number(v.toPrecision(5))))))) }
}

function fitModel(games: Game[]) {
  const all = samplesOf(games)
  const K = 5
  const folds = games.map((_, i) => i % K)
  const configs: GbdtOpts[] = [
    { rounds: 120, depth: 3, rate: 0.1, minLeaf: 20, lambda: 1, weightPow: 0.3 },
    { rounds: 120, depth: 3, rate: 0.1, minLeaf: 20, lambda: 1, weightPow: 0.4 },
    { rounds: 200, depth: 4, rate: 0.05, minLeaf: 30, lambda: 2, weightPow: 0.3 },
  ]
  const rules: ReturnType<typeof score>[] = []
  for (let k = 0; k < K; k++) rules.push(score(games.filter((_, i) => folds[i] === k), null))
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
  log(`\nLerend model, controle in 5 delen (steeds 1/5 van de partijen buiten de training)`)
  log(`  vaste regels:  F1 ${avg(rules.map(r => r.macro)).toFixed(3)} · zelfde label ${(avg(rules.map(r => r.agreement)) * 100).toFixed(1)}%`)
  let bestCfg = configs[0], bestF1 = -1
  for (const cfg of configs) {
    const res: ReturnType<typeof score>[] = []
    for (let k = 0; k < K; k++) {
      const model = trainGbdt(all.filter(s => folds[s.game] !== k), cfg)
      res.push(score(games.filter((_, i) => folds[i] === k), model))
    }
    const f1 = avg(res.map(r => r.macro))
    log(`  model ${JSON.stringify(cfg)}: F1 ${f1.toFixed(3)} · zelfde label ${(avg(res.map(r => r.agreement)) * 100).toFixed(1)}% · beter in ${res.filter((r, k) => r.macro > rules[k].macro).length} van ${K}`)
    if (f1 > bestF1) { bestF1 = f1; bestCfg = cfg }
  }
  // Per soort voor de beste instelling (over alle delen samen, steeds buiten de training gemeten)
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(NOTABLE.map(k => [k, { tp: 0, fp: 0, fn: 0 }]))
  for (let k = 0; k < K; k++) {
    const model = trainGbdt(all.filter(s => folds[s.game] !== k), bestCfg)
    const sc = score(games.filter((_, i) => folds[i] === k), model)
    for (const c of NOTABLE) { per[c].tp += sc.per[c].tp; per[c].fp += sc.per[c].fp; per[c].fn += sc.per[c].fn }
  }
  log('  per soort (buiten de training):')
  for (const c of NOTABLE) { const { tp, fp, fn } = per[c]; log(`    ${c.padEnd(11)} Chess.com ${String(tp + fn).padStart(4)} · model ${String(tp + fp).padStart(4)} · gelijk ${String(tp).padStart(4)} · F1 ${((2 * tp) / Math.max(1, 2 * tp + fp + fn)).toFixed(2)}`) }
  const final = trainGbdt(all, bestCfg)
  writeFileSync(join(DIR, 'move-model.json'), JSON.stringify(final))
  writeFileSync(join(DIR, 'move-model-cv.json'), JSON.stringify({ games: games.length, moves: all.length, cfg: bestCfg, cvF1: bestF1, rulesF1: avg(rules.map(r => r.macro)) }, null, 2))
  log(`\nModel opgeslagen in ${DIR}/move-model.json (${(JSON.stringify(final).length / 1024).toFixed(0)} kB)`)
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
    const file = join(CACHE, `${key}-d${DEPTH}${FULL ? '-full' : ''}.json`)
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
  log(`\n${games.length} partijen, ${games.reduce((a, g) => a + g.san.length, 0)} halve zetten, diepte ${DEPTH}${FULL ? ', volledige Stockfish' : ''}\n`)
  const base = { ...REVIEW_MODEL }
  const before = score(games)
  log(report('Nu', before))
  log('\n' + diagnose(games))
  writeFileSync(join(DIR, 'examples.txt'), EXAMPLES.sort().join('\n'))
  if (process.env.MODEL === '1') { fitModel(games); writeFileSync(join(DIR, 'fit-report.txt'), LOG.join('\n')); return }
  if (process.env.FIT === '0' || !games.length) { writeFileSync(join(DIR, 'fit-report.txt'), LOG.join('\n')); return }

  // Coördinaat-zoektocht: per instelling de beste waarde kiezen, een paar rondes
  const grid: Record<string, number[]> = {
    epSlopeAt500: [0.15, 0.25, 0.35, 0.5, 0.7, 1, 1.2, 1.5],
    epSlopeAt2000: [0.5, 0.8, 1, 1.2, 1.5, 2],
    epCap: [1000, 1500, 2000, 3000, 5000, 10000],
    blunderMaxWinAfter: [20, 30, 40, 50, 101],
    greatInCheck: [0, 1],
    greatRecapture: [0, 1],
    greatEp: [0, 1],
    greatGap: [3, 5, 8, 10, 14, 18, 24],
    greatMinOpponentLoss: [0, 2, 5, 10],
    missMinOpponentLoss: [8, 12, 16, 24],
    losingCp: [0, 300, 500, 700, 1000],
    losingMistakeCp: [100, 150, 200, 300, 400],
    brilliantMaxLoss: [1, 2, 3, 5],
    brilliantMaxWp: [85, 90, 95, 99],
  }
  const objective = (s: ReturnType<typeof score>) => s.macro + 0.25 * s.agreement
  const M = REVIEW_MODEL as Record<string, number | boolean>
  /** Coördinaat-zoektocht op een set partijen; laat REVIEW_MODEL op de beste instellingen staan */
  const fit = (set: Game[]) => {
    Object.assign(REVIEW_MODEL, base)
    let best = objective(score(set))
    // Steilheid en bovengrens werken samen (vlakker + hoger = ook verlies tellen in beslisste stellingen): samen zoeken
    const joint = { a: [0.15, 0.25, 0.35, 0.5, 0.7, 1], b: [0.5, 0.8, 1.2, 2], c: [1500, 3000, 5000, 10000] }
    let bj = [M.epSlopeAt500, M.epSlopeAt2000, M.epCap] as number[]
    for (const a of joint.a) for (const b of joint.b) for (const c of joint.c) {
      Object.assign(M, { epSlopeAt500: a, epSlopeAt2000: b, epCap: c })
      const o = objective(score(set))
      if (o > best + 1e-9) { best = o; bj = [a, b, c] }
    }
    Object.assign(M, { epSlopeAt500: bj[0], epSlopeAt2000: bj[1], epCap: bj[2] })
    for (let round = 0; round < 2; round++) {
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
  // Eerlijke controle in 5 delen: afstemmen op 4/5 van de partijen en meten op het vijfde deel dat buiten de training bleef
  if (games.length >= 5) {
    const K = 5
    const scores: { base: number; tuned: number; agreeBase: number; agreeTuned: number }[] = []
    for (let k = 0; k < K; k++) {
      const test = games.filter((_, i) => i % K === k)
      Object.assign(REVIEW_MODEL, base)
      const b = score(test)
      fit(games.filter((_, i) => i % K !== k))
      const t = score(test)
      scores.push({ base: b.macro, tuned: t.macro, agreeBase: b.agreement, agreeTuned: t.agreement })
    }
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length
    log(`\nControle (steeds 1/5 van de partijen buiten de training): F1 opvallende zetten ${avg(scores.map(x => x.base)).toFixed(3)} → ${avg(scores.map(x => x.tuned)).toFixed(3)}; zelfde label ${(avg(scores.map(x => x.agreeBase)) * 100).toFixed(1)}% → ${(avg(scores.map(x => x.agreeTuned)) * 100).toFixed(1)}%; beter in ${scores.filter(x => x.tuned > x.base).length} van ${K} delen`)
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
