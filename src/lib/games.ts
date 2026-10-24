import { Chess } from 'chess.js'
import { db, type ImportedGame, type RepertoireMove } from './db'
import { START_FEN, epdOf, uciOf, parseUci } from './chess'
import { positionIndex } from './data'
import { splitGames } from './pgn'
import type { FamilyFile, Side, StatsFile } from './types'

// Import van eigen partijen via de officiële gratis API's van Lichess en Chess.com (geen sleutel nodig),
// of via een eigen PGN-bestand. Verzoeken gaan één voor één om de rate limits te respecteren.

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchLichessGames(username: string, max = 200, onProgress?: (n: number) => void): Promise<ImportedGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=true&opening=true&clocks=false&evals=false&perfType=bullet,blitz,rapid,classical`
  let res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } })
  if (res.status === 429) {
    // Lichess: bij 429 een volle minuut wachten
    await sleep(60_000)
    res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } })
  }
  if (res.status === 404) throw new Error(`Lichess-gebruiker "${username}" niet gevonden`)
  if (!res.ok || !res.body) throw new Error(`Lichess gaf foutcode ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const out: ImportedGame[] = []
  const lower = username.toLowerCase()
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = done ? '' : parts.pop() ?? ''
    for (const line of done ? parts.concat(buf) : parts) {
      if (!line.trim()) continue
      const g = JSON.parse(line)
      if (g.variant !== 'standard' || !g.moves) continue
      const whiteName = g.players?.white?.user?.name?.toLowerCase()
      const color: Side = whiteName === lower ? 'white' : 'black'
      const result = !g.winner ? 'draw' : g.winner === color ? 'win' : 'loss'
      out.push({
        id: 'li:' + g.id, source: 'lichess', username, color, result, playedAt: g.createdAt,
        san: String(g.moves).split(' ').slice(0, 40), url: `https://lichess.org/${g.id}`, opening: g.opening?.name,
      })
    }
    onProgress?.(out.length)
    if (done) break
  }
  return out
}

export async function fetchChesscomGames(username: string, months = 3, onProgress?: (n: number) => void): Promise<ImportedGame[]> {
  const u = encodeURIComponent(username.toLowerCase())
  const res = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`)
  if (res.status === 404) throw new Error(`Chess.com-gebruiker "${username}" niet gevonden`)
  if (!res.ok) throw new Error(`Chess.com gaf foutcode ${res.status}`)
  const { archives } = (await res.json()) as { archives: string[] }
  const out: ImportedGame[] = []
  for (const url of archives.slice(-months).reverse()) {
    // Chess.com: verzoeken serieel doen; bij 429 even wachten
    let r = await fetch(url)
    if (r.status === 429) {
      await sleep(5000)
      r = await fetch(url)
    }
    if (!r.ok) continue
    const { games } = (await r.json()) as { games: { url: string; pgn?: string; rules: string; end_time: number; white: { username: string; result: string }; black: { username: string; result: string } }[] }
    for (const g of games) {
      if (g.rules !== 'chess' || !g.pgn) continue
      const color: Side = g.white.username.toLowerCase() === username.toLowerCase() ? 'white' : 'black'
      const mine = color === 'white' ? g.white.result : g.black.result
      const opp = color === 'white' ? g.black.result : g.white.result
      const result = mine === 'win' ? 'win' : opp === 'win' ? 'loss' : 'draw'
      const san = sanFromPgn(g.pgn)
      if (!san.length) continue
      out.push({ id: 'cc:' + g.url, source: 'chesscom', username, color, result, playedAt: g.end_time * 1000, san: san.slice(0, 40), url: g.url })
    }
    onProgress?.(out.length)
    await sleep(300)
  }
  return out
}

function sanFromPgn(pgn: string): string[] {
  const c = new Chess()
  try {
    c.loadPgn(pgn)
    return c.history()
  } catch {
    return []
  }
}

export function gamesFromPgnFile(text: string, username: string): ImportedGame[] {
  const out: ImportedGame[] = []
  const lower = username.trim().toLowerCase()
  for (const [i, g] of splitGames(text).entries()) {
    const c = new Chess()
    try {
      c.loadPgn(g)
    } catch {
      continue
    }
    const h = c.getHeaders()
    if (h.Variant && h.Variant !== 'Standard') continue
    const white = (h.White ?? '').toLowerCase()
    const black = (h.Black ?? '').toLowerCase()
    if (lower && white !== lower && black !== lower) continue
    const color: Side = !lower || white === lower ? 'white' : 'black'
    const res = h.Result
    const result = res === '1/2-1/2' ? 'draw' : (res === '1-0') === (color === 'white') ? 'win' : 'loss'
    const date = h.UTCDate ?? h.Date ?? ''
    const playedAt = Date.parse(date.replace(/\./g, '-')) || Date.now()
    out.push({ id: `pgn:${h.Site ?? ''}:${date}:${i}:${c.history().slice(0, 8).join('')}`, source: 'pgn', username: username || h.White || 'ik', color, result, playedAt, san: c.history().slice(0, 40), url: h.Site?.startsWith('http') ? h.Site : undefined, opening: h.Opening })
  }
  return out
}

export async function saveGames(games: ImportedGame[]) {
  await db.games.bulkPut(games)
}

// ---------------- Analyse ----------------

export interface BookExit {
  key: string
  familyId: string
  familyName: string
  epd: string
  fen: string
  lineUci: string[]
  lineSan: string[]
  played: string
  bookMoves: { uci: string; san: string }[]
  count: number
}

export interface Analysis {
  games: number
  byFamily: { familyId: string; name: string; color: Side; games: number; score: number; inMyOpenings: boolean }[]
  byName: { name: string; color: Side; games: number; score: number }[]
  userBookExits: BookExit[]
  repertoireDeviations: { repertoire: string; epd: string; lineSan: string[]; expected: string; played: string; count: number }[]
  repertoireGaps: { repertoire: string; epd: string; lineSan: string[]; opponentMove: string; count: number }[]
  recommendations: { familyId: string; familyName: string; variationId: string; name: string; games: number }[]
}

export function analyseGames(
  games: ImportedGame[],
  families: FamilyFile[],
  names: Record<string, [string, string, string]>,
  myOpenings: string[],
  repertoires: { id: number; name: string; side: Side; moves: RepertoireMove[] }[],
  learnedVariationIds: Set<string>,
  _stats?: StatsFile,
): Analysis {
  const famByName = new Map(families.map(f => [f.family.name, f]))
  const famIdx = new Map(families.map(f => [f.family.id, positionIndex(f)]))
  const fam = new Map<string, { familyId: string; name: string; color: Side; games: number; points: number }>()
  const byName = new Map<string, { name: string; color: Side; games: number; points: number }>()
  const exits = new Map<string, BookExit>()
  const devs = new Map<string, Analysis['repertoireDeviations'][number]>()
  const gaps = new Map<string, Analysis['repertoireGaps'][number]>()
  const reached = new Map<string, { familyId: string; familyName: string; variationId: string; name: string; games: number }>()
  const repIdx = repertoires.map(r => {
    const m = new Map<string, RepertoireMove[]>()
    for (const x of r.moves) m.set(x.epd, [...(m.get(x.epd) ?? []), x])
    return { ...r, idx: m }
  })

  for (const g of games) {
    const points = g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0
    const c = new Chess(START_FEN)
    const ucis: string[] = []
    const sans: string[] = []
    let deepest: [string, string, string] | undefined
    let family: FamilyFile | undefined
    let leftBook = false
    const repActive = repIdx.filter(r => r.side === g.color).map(r => ({ r, active: true }))
    for (let ply = 0; ply < Math.min(g.san.length, 30); ply++) {
      const fen = c.fen()
      const epd = epdOf(fen)
      let mv
      try {
        mv = c.move(g.san[ply])
      } catch {
        break
      }
      const uci = uciOf(mv)
      const myMove = (ply % 2 === 0) === (g.color === 'white')
      const afterEpd = epdOf(c.fen())
      const nm = names[afterEpd]
      if (nm) {
        deepest = nm
        family = famByName.get(nm[2]) ?? family
      }
      // Boekafwijking in een van de 20 families
      if (family && !leftBook) {
        const idx = famIdx.get(family.family.id)!
        const here = idx.get(epd)
        if (here && !idx.has(afterEpd)) {
          leftBook = true
          const bookMoves = [...new Map(here.filter(h => h.next).map(h => [h.next!, { uci: h.next!, san: h.nextSan! }])).values()]
          if (myMove && bookMoves.length) {
            const key = `${family.family.id}|${epd}|${uci}`
            const e = exits.get(key) ?? { key, familyId: family.family.id, familyName: family.family.name, epd, fen, lineUci: [...ucis], lineSan: [...sans], played: mv.san, bookMoves, count: 0 }
            e.count++
            exits.set(key, e)
          }
        }
      }
      // Repertoire-afwijkingen
      for (const ra of repActive) {
        if (!ra.active) continue
        const kids = ra.r.idx.get(epd)
        if (!kids?.length) { ra.active = false; continue }
        if (kids.some(k => k.uci === uci)) {
          if (myMove && !kids.find(k => k.uci === uci)?.main) {
            const main = kids.find(k => k.main)
            if (main) {
              const key = `${ra.r.id}|${epd}|${uci}`
              const d = devs.get(key) ?? { repertoire: ra.r.name, epd, lineSan: [...sans], expected: main.san, played: mv.san, count: 0 }
              d.count++
              devs.set(key, d)
            }
          }
          continue
        }
        const key = `${ra.r.id}|${epd}|${uci}`
        if (myMove) {
          const main = kids.find(k => k.main) ?? kids[0]
          const d = devs.get(key) ?? { repertoire: ra.r.name, epd, lineSan: [...sans], expected: main.san, played: mv.san, count: 0 }
          d.count++
          devs.set(key, d)
        } else {
          const gp = gaps.get(key) ?? { repertoire: ra.r.name, epd, lineSan: [...sans], opponentMove: mv.san, count: 0 }
          gp.count++
          gaps.set(key, gp)
        }
        ra.active = false
      }
      ucis.push(uci)
      sans.push(mv.san)
    }
    if (deepest) {
      const k = deepest[1] + '|' + g.color
      const n = byName.get(k) ?? { name: deepest[1], color: g.color, games: 0, points: 0 }
      n.games++
      n.points += points
      byName.set(k, n)
    }
    if (family) {
      const k = family.family.id + '|' + g.color
      const f = fam.get(k) ?? { familyId: family.family.id, name: family.family.name, color: g.color, games: 0, points: 0 }
      f.games++
      f.points += points
      fam.set(k, f)
      // aanbeveling: diepste benoemde variant uit deze familie die nog niet geleerd is
      if (deepest && family.family.side === g.color) {
        const v = family.variations.find(x => x.name === deepest![1])
        if (v && !learnedVariationIds.has(v.id)) {
          const r = reached.get(v.id) ?? { familyId: family.family.id, familyName: family.family.name, variationId: v.id, name: v.path.join(', ') || family.family.name, games: 0 }
          r.games++
          reached.set(v.id, r)
        }
      }
    }
  }
  const mine = new Set(myOpenings)
  return {
    games: games.length,
    byFamily: [...fam.values()].map(f => ({ familyId: f.familyId, name: f.name, color: f.color, games: f.games, score: f.points / f.games, inMyOpenings: mine.has(f.familyId) })).sort((a, b) => b.games - a.games),
    byName: [...byName.values()].map(n => ({ name: n.name, color: n.color, games: n.games, score: n.points / n.games })).sort((a, b) => b.games - a.games),
    userBookExits: [...exits.values()].sort((a, b) => b.count - a.count),
    repertoireDeviations: [...devs.values()].sort((a, b) => b.count - a.count),
    repertoireGaps: [...gaps.values()].sort((a, b) => b.count - a.count),
    recommendations: [...reached.values()].sort((a, b) => b.games - a.games).slice(0, 12),
  }
}

/** Zet boekafwijkingen om in herhaalkaarten (de theoriezet wordt de verwachte zet). */
export async function exitsToCards(exits: BookExit[], side: (e: BookExit) => Side) {
  const now = Date.now()
  let n = 0
  for (const e of exits) {
    const target = e.bookMoves[0]
    const id = `${e.epd}|${target.uci}`
    const existing = await db.cards.get(id)
    if (existing) {
      await db.cards.update(id, { dueAt: now })
      continue
    }
    const c = new Chess(e.fen)
    c.move(parseUci(target.uci))
    await db.cards.put({
      id, epd: e.epd, uci: target.uci, san: target.san, side: side(e), familyIds: [e.familyId], variationIds: [], lineUci: e.lineUci, createdAt: now,
      ease: 2.5, interval: 0, reps: 0, lapses: 1, correct: 0, wrong: 1, dueAt: now, lastReviewed: null,
    })
    n++
  }
  return n
}
