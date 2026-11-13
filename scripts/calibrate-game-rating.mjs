#!/usr/bin/env node
// IJkt de "partijrating" van de partij-analyse: welke nauwkeurigheid hoort bij welke rating?
// Neemt een steekproef van volledige rated partijen uit de openbare Lichess-database (CC0),
// laat Stockfish iedere stelling beoordelen (net als de app) en berekent per speler de nauwkeurigheid
// met dezelfde formules als src/lib/review.ts. Per ratinggroep komt de mediane nauwkeurigheid in
// scripts/out/game-rating-calibration.json; die tabel staat (afgerond) in src/lib/review.ts.
//
// Gebruik: node scripts/calibrate-game-rating.mjs [maand=2026-09] [partijen-per-groep=24] [diepte=12]

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createZstdDecompress } from 'node:zlib'
import { join } from 'node:path'
import { Chess } from 'chess.js'

const month = process.argv[2] ?? '2026-09'
const perBucket = Number(process.argv[3] ?? 24)
const depth = Number(process.argv[4] ?? 12)
const url = `https://database.lichess.org/standard/lichess_db_standard_rated_${month}.pgn.zst`
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const BUCKETS = Array.from({ length: 11 }, (_, i) => 600 + i * 200) // 600–2600
const names = JSON.parse(readFileSync('public/data/names.json', 'utf8'))

// ---------- partijen ophalen ----------

function decompress(buf) {
  return new Promise(resolve => {
    const idx = buf.indexOf(MAGIC)
    if (idx < 0) return resolve('')
    const chunks = []
    const z = createZstdDecompress()
    z.on('data', d => chunks.push(d))
    const done = () => resolve(Buffer.concat(chunks).toString('utf8'))
    z.on('error', done) // het laatste frame is afgekapt
    z.on('end', done)
    z.end(buf.subarray(idx))
  })
}

function speedOf(tc) {
  if (!tc || tc === '-') return 'correspondence'
  const [base, inc] = tc.split('+').map(Number)
  const est = base + 40 * (inc || 0)
  return est < 179 ? 'bullet' : est < 479 ? 'blitz' : est < 1499 ? 'rapid' : 'classical'
}

const head = await fetch(url, { method: 'HEAD' })
const size = Number(head.headers.get('content-length'))
const picked = new Map(BUCKETS.map(b => [b, []]))
const full = () => [...picked.values()].every(l => l.length >= perBucket)
for (let w = 0; w < 30 && !full(); w++) {
  const start = Math.floor((size - 16e6) * ((w * 7919) % 30) / 30)
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + 8 * 1024 * 1024}` } })
  const text = await decompress(Buffer.from(await res.arrayBuffer()))
  for (const g of text.split(/\n\n(?=\[Event )/).slice(1)) {
    const tag = k => (g.match(new RegExp(`\\[${k} "([^"]*)"\\]`)) || [])[1]
    const speed = speedOf(tag('TimeControl'))
    if (speed !== 'blitz' && speed !== 'rapid') continue
    if (tag('Termination') !== 'Normal') continue
    const we = Number(tag('WhiteElo')), be = Number(tag('BlackElo'))
    if (!we || !be || Math.abs(we - be) > 150) continue
    const avg = (we + be) / 2
    const bucket = BUCKETS.find(b => Math.abs(avg - b) <= 100)
    if (!bucket || picked.get(bucket).length >= perBucket) continue
    const c = new Chess()
    try { c.loadPgn(g.replace(/\{[^}]*\}/g, '')) } catch { continue }
    const san = c.history()
    if (san.length < 30) continue
    picked.get(bucket).push({ speed, whiteElo: we, blackElo: be, san })
  }
  console.log(`venster ${w + 1}: ${[...picked.entries()].map(([b, l]) => `${b}:${l.length}`).join(' ')}`)
}

// ---------- Stockfish ----------

function engine() {
  const sf = spawn('node', ['node_modules/stockfish/bin/stockfish-19-lite-single.js'])
  let buf = ''
  let waiter = null
  sf.stdout.on('data', d => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i)
      buf = buf.slice(i + 1)
      waiter?.(l)
    }
  })
  const send = s => sf.stdin.write(s + '\n')
  const until = prefix => new Promise(r => { waiter = l => { if (l.startsWith(prefix)) r(l) } })
  return {
    async init() { send('uci'); await until('uciok') },
    async evalFen(fen) {
      const c = new Chess(fen)
      if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 }
      if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0 }
      let last = null
      const p = new Promise(r => { waiter = l => { if (l.startsWith('info') && l.includes(' pv ')) last = l; else if (l.startsWith('bestmove')) r() } })
      send(`position fen ${fen}`); send(`go depth ${depth}`)
      await p
      const stm = c.turn() === 'w' ? 1 : -1
      const mate = last?.match(/score mate (-?\d+)/)?.[1]
      const cp = last?.match(/score cp (-?\d+)/)?.[1]
      return mate !== undefined ? { mate: stm * Number(mate) } : { cp: stm * Number(cp ?? 0) }
    },
    kill() { sf.kill() },
  }
}

// ---------- dezelfde formules als src/lib/review.ts ----------

function winPct(e) {
  if (e.mate !== undefined) return e.mate > 0 ? 100 : e.mate < 0 ? 0 : 50
  if (e.cp >= 10000) return 100
  if (e.cp <= -10000) return 0
  const cp = Math.max(-1000, Math.min(1000, e.cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
}
const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
function gameAccuracy(accs) {
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length
  const harmonic = accs.length / accs.reduce((a, b) => a + 1 / Math.max(1, b), 0)
  return (mean + harmonic) / 2
}
function bookPly(san) {
  const c = new Chess()
  let ply = 0
  for (let i = 0; i < Math.min(san.length, 30); i++) {
    c.move(san[i])
    if (names[c.fen().split(' ').slice(0, 4).join(' ')]) ply = i + 1
  }
  return ply
}

const jobs = [...picked.entries()].flatMap(([bucket, list]) => list.map(g => ({ bucket, ...g })))
const samples = []
let doneGames = 0
async function worker() {
  const sf = engine()
  await sf.init()
  while (jobs.length) {
    const g = jobs.shift()
    const c = new Chess()
    const evals = [await sf.evalFen(c.fen())]
    for (const s of g.san) { c.move(s); evals.push(await sf.evalFen(c.fen())) }
    const book = bookPly(g.san)
    const acc = { white: [], black: [] }
    g.san.forEach((_, ply) => {
      const side = ply % 2 === 0 ? 'white' : 'black'
      const f = w => (side === 'white' ? w : 100 - w)
      const loss = Math.max(0, f(winPct(evals[ply])) - f(winPct(evals[ply + 1])))
      acc[side].push(ply < book ? 100 : moveAccuracy(loss))
    })
    samples.push({ elo: g.whiteElo, speed: g.speed, accuracy: gameAccuracy(acc.white) })
    samples.push({ elo: g.blackElo, speed: g.speed, accuracy: gameAccuracy(acc.black) })
    if (++doneGames % 20 === 0) console.log(`${doneGames} partijen geanalyseerd`)
  }
  sf.kill()
}
await Promise.all([worker(), worker(), worker(), worker()])

const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const table = BUCKETS.map(b => {
  const xs = samples.filter(s => Math.abs(s.elo - b) <= 125).map(s => s.accuracy)
  return { rating: b, n: xs.length, median: Number(median(xs).toFixed(2)) }
})
console.table(table)
mkdirSync('scripts/out', { recursive: true })
writeFileSync('scripts/out/game-rating-calibration.json', JSON.stringify({ source: url, depth, perBucket, createdAt: new Date().toISOString(), table, samples }, null, 1))
