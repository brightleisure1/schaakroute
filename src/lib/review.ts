import { Chess, type Square } from 'chess.js'
import { START_FEN, parseUci } from './chess'
import type { Side } from './types'

// Partij-analyse: haalt je laatste partijen op (Lichess of Chess.com, gratis openbare API's zonder sleutel),
// laat Stockfish lokaal iedere stelling beoordelen en geeft iedere zet een oordeel, van briljant tot blunder.
// Het oordeel volgt het verlies aan winstkans (zoals Lichess en Chess.com dat ook doen).

export interface ReviewPlayer { name: string; rating?: number }

export interface ReviewGame {
  id: string
  source: 'lichess' | 'chesscom' | 'pgn'
  /** Link naar de partij op het platform (niet bij een geplakte PGN zonder link) */
  url?: string
  white: ReviewPlayer
  black: ReviewPlayer
  myColor: Side
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  /** Hoe de partij eindigde, bijv. mat, opgegeven, tijd */
  ending?: string
  speed?: string
  playedAt: number
  opening?: string
  /** Aantal halve zetten dat volgens het platform nog theorie was */
  bookPly?: number
  san: string[]
}

/** Engine-oordeel over één stelling, steeds vanuit wit */
export interface PosEval {
  cp?: number
  mate?: number
  /** Beste zet (uci) en de hoofdlijn */
  best?: string
  pv?: string[]
  /** Score van de op één na beste zet, voor 'enige zet' */
  cp2?: number
  mate2?: number
  depth?: number
}

export type MoveClass = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder'

export const CLASS_ORDER: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']

export const CLASS_INFO: Record<MoveClass, { label: string; symbol: string; color: string }> = {
  brilliant: { label: 'Briljant', symbol: '!!', color: '#139e9a' },
  great: { label: 'Geweldig', symbol: '!', color: '#3b7fd4' },
  best: { label: 'Beste', symbol: '★', color: '#4c9a35' },
  excellent: { label: 'Uitstekend', symbol: '👍', color: '#68a645' },
  good: { label: 'Goed', symbol: '✓', color: '#86a86a' },
  book: { label: 'Theorie', symbol: '📖', color: '#a17f5c' },
  inaccuracy: { label: 'Onnauwkeurig', symbol: '?!', color: '#e4a92a' },
  mistake: { label: 'Fout', symbol: '?', color: '#e8791f' },
  miss: { label: 'Gemist', symbol: '✕', color: '#e0533f' },
  blunder: { label: 'Blunder', symbol: '??', color: '#c62d29' },
}

export interface ReviewedMove {
  ply: number
  san: string
  uci: string
  side: Side
  cls: MoveClass
  /** Verlies aan winstkans in procentpunten (0–100) */
  loss: number
  accuracy: number
  /** Winstkans van wit vóór en na de zet */
  wpBefore: number
  wpAfter: number
  bestUci?: string
  bestSan?: string
  /** Hoofdlijn vanaf de stelling vóór de zet, in SAN */
  bestLine: string[]
  /** De beste zet was een briljant offer, maar werd niet gespeeld */
  missedBrilliant?: boolean
}

export interface SideSummary {
  accuracy: number
  counts: Record<MoveClass, number>
  /** Geschatte partijrating, of null als er te weinig eigen zetten buiten de theorie waren */
  rating: number | null
  /** Briljante zetten die er waren maar niet gespeeld werden */
  missedBrilliants: number
}

// ---------------- Winstkans en nauwkeurigheid ----------------

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Winstkans van wit in procent, uit centipawns of mat (formule van Lichess) */
/**
 * Instelbare onderdelen van de beoordeling, zodat ze tegen echte Chess.com-reviews geijkt kunnen worden.
 * k: steilheid van de winstkans-curve; clamp: boven deze centipawns telt het verschil niet meer;
 * mate: een mat in N telt als ±(mateCp − N·mateStep) centipawns.
 */
export const REVIEW_MODEL = {
  k: 0.00368208,
  clamp: 1000,
  mateCp: 0,
  mateStep: 0,
  // Zetbeoordeling zoals Chess.com: 'expected points' hangen af van de rating van wie zet. Afgestemd zoals in het
  // openbare project mtureyen/chessy (6.158 echte Chess.com-labels): de winkans-curve van Lichess, bij rating 500
  // 0,35× zo steil en bij 2000 0,8× (daartussen lineair), en evaluaties tot ±15 pionnen tellen mee.
  epSlopeAt500: 0.35,
  epSlopeAt2000: 0.8,
  epCap: 1500,
  /** Beste: de topzet van de engine, of een zet die minder dan dit kost (procentpunten) */
  bestMaxLoss: 0.05,
  /** Blunder alleen als je daarna echt slecht staat (je winkans onder dit percentage), anders 'fout' */
  blunderMaxWinAfter: 30,
  /** Geweldig: de op één na beste zet is minstens zoveel procentpunt slechter … */
  greatGap: 14,
  /** … en de zet straft een fout af: de tegenstander verloor met zijn vorige zet minstens zoveel */
  greatMinOpponentLoss: 5,
  /** Gemist: de tegenstander verloor minstens zoveel, en jij geeft daarvan tussen min en max keer terug */
  missMinOpponentLoss: 12,
  missGivesBackMin: 0.3,
  missGivesBackMax: 2,
  // Briljant, afgestemd op een echte Chess.com-review (17…Lb3!! moet briljant zijn) en een steekproef van
  // 88 Lichess-partijen (10 briljante zetten; zonder deze regels 39, met de strengste regels 2):
  /** Hoeveel winstkans de offerzet hooguit mag kosten (de lichte Stockfish ziet een offer soms net iets minder goed) */
  brilliantMaxLoss: 2,
  /** Je stond al gewonnen als de op één na beste zet je minstens deze winstkans geeft (Chess.com: "niet compleet
   *  gewonnen als je de zet niet had gevonden"); behalve bij een offer dat tot mat leidt */
  brilliantMaxWp: 90,
  /** Of Stockfish het offer moet aannemen. Chess.com noemt ook een offer dat je beter niet kunt nemen briljant. */
  brilliantNeedsAccept: false,
}

/** Winstkans van wit in procent, uit centipawns of mat (logistische curve, zie REVIEW_MODEL) */
export function winPct(e: Pick<PosEval, 'cp' | 'mate'> | undefined): number {
  if (!e) return 50
  const M = REVIEW_MODEL
  let cp: number
  if (e.mate !== undefined) {
    if (!M.mateCp) return e.mate > 0 ? 100 : e.mate < 0 ? 0 : 50
    cp = Math.sign(e.mate || 1) * Math.max(M.clamp, M.mateCp - Math.abs(e.mate) * M.mateStep)
  } else {
    if (e.cp === undefined) return 50
    if (e.cp >= 10000) return 100
    if (e.cp <= -10000) return 0
    cp = Math.max(-M.clamp, Math.min(M.clamp, e.cp))
  }
  return 50 + 50 * (2 / (1 + Math.exp(-M.k * cp)) - 1)
}

/** Rating van wie zet → steilheid van de curve (Chess.com: een pion is voor een beginner minder waard dan voor een meester) */
function epSlope(rating: number | undefined): number {
  const M = REVIEW_MODEL
  const r = rating !== undefined && Number.isFinite(rating) ? rating : 1500
  const t = Math.min(1, Math.max(0, (r - 500) / 1500))
  return 0.00368208 * (M.epSlopeAt500 + t * (M.epSlopeAt2000 - M.epSlopeAt500))
}

/** Expected points van wit in procent (0–100), voor een speler met deze rating */
export function expectedPoints(e: Pick<PosEval, 'cp' | 'mate'> | undefined, rating?: number): number {
  if (!e) return 50
  const cap = REVIEW_MODEL.epCap
  const cp = e.mate !== undefined ? (e.mate > 0 ? cap : e.mate < 0 ? -cap : 0) : Math.max(-cap, Math.min(cap, e.cp ?? 0))
  return 100 / (1 + Math.exp(-epSlope(rating) * cp))
}

/** Nauwkeurigheid van één zet uit het verlies aan winstkans (formule van Lichess) */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669))
}

/** Gemiddelde van rekenkundig en harmonisch gemiddelde: een paar grote fouten tellen goed mee */
export function gameAccuracy(accs: number[]): number {
  if (!accs.length) return 0
  const mean = accs.reduce((a, b) => a + b, 0) / accs.length
  const harmonic = accs.length / accs.reduce((a, b) => a + 1 / Math.max(1, b), 0)
  return (mean + harmonic) / 2
}

// ---------------- Offers herkennen ----------------

/**
 * Stukken (geen pionnen) van `color` die de tegenstander, die aan zet is, met winst kan slaan.
 * Eenvoudige ruilberekening per veld: slaan met het goedkoopste stuk, terugslaan als het veld gedekt is.
 * `gained`: wat er net geslagen werd (telt mee in de ruil).
 */
function hangingSquares(c: Chess, color: 'w' | 'b', gained = 0): Set<string> {
  const replies = c.moves({ verbose: true }).filter(m => m.captured && m.captured !== 'p')
  const out = new Set<string>()
  for (const sq of new Set(replies.map(m => m.to))) {
    const piece = c.get(sq as Square)
    if (!piece || piece.color !== color) continue
    const value = PIECE_VALUE[piece.type]
    if (value < 3) continue
    const cheapest = Math.min(...replies.filter(m => m.to === sq).map(m => PIECE_VALUE[m.piece] || 100))
    // Een koning kan alleen slaan op een onverdedigd veld; die zet staat dan al niet tussen de legale zetten
    const defended = c.attackers(sq as Square, color).length > 0
    if ((defended ? gained - value + cheapest : gained - value) <= -2) out.add(sq)
  }
  return out
}

/**
 * Offert de gespeelde zet echt materiaal? Alleen als een stuk door déze zet te slaan valt: het stuk dat
 * zette, of een stuk dat pas door de zet onbeschermd raakt. Een stuk dat al verloren stond (bijv. bij een
 * vork, waarna je je koning wegzet) is geen offer, en een promotie ook niet.
 */
export function isSacrifice(fenBefore: string, uci: string): boolean {
  return sacrificedSquares(fenBefore, uci).length > 0
}

/** De velden van de stukken die de zet offert (zie isSacrifice) */
export function sacrificedSquares(fenBefore: string, uci: string): string[] {
  const c = new Chess(fenBefore)
  let move
  try {
    move = c.move(parseUci(uci))
  } catch {
    return []
  }
  if (move.promotion) return []
  const gained = move.captured ? PIECE_VALUE[move.captured] : 0
  const after = hangingSquares(c, move.color, gained)
  if (!after.size) return []
  // Wat stond er vóór de zet al te slaan? Dezelfde stelling, maar met de tegenstander aan zet.
  let before = new Set<string>()
  try {
    const parts = fenBefore.split(' ')
    parts[1] = parts[1] === 'w' ? 'b' : 'w'
    parts[3] = '-'
    before = hangingSquares(new Chess(parts.join(' ')), move.color)
  } catch {
    // ongeldige omgedraaide stelling (bijv. schaak): alleen het gezette stuk telt
    before = new Set([...after].filter(sq => sq !== move.to))
  }
  return [...after].filter(sq => sq === move.to || !before.has(sq))
}

// ---------------- Zetten beoordelen ----------------


const sideAt = (ply: number): Side => (ply % 2 === 0 ? 'white' : 'black')
const forSide = (wpWhite: number, side: Side) => (side === 'white' ? wpWhite : 100 - wpWhite)

function sanLine(fen: string, uci: string[]): string[] {
  const c = new Chess(fen)
  const out: string[] = []
  for (const u of uci) {
    try { out.push(c.move(parseUci(u)).san) } catch { break }
  }
  return out
}

/**
 * Beoordeelt alle zetten. `evals[i]` is het oordeel over de stelling vóór zet i (evals.length = san.length + 1).
 * `bookPly`: zoveel halve zetten aan het begin zijn theorie.
 */
/** Ratings van wit en zwart op Chess.com-schaal; ontbreekt er een, dan geldt 1500 */
export interface ClassifyOptions { ratings?: { white?: number; black?: number } }

/** De ratings uit een partij, omgerekend naar Chess.com-schaal (daar is het model op afgestemd) */
export function reviewRatings(g: Pick<ReviewGame, 'source' | 'white' | 'black'>): ClassifyOptions['ratings'] {
  const conv = (r?: number) => (r === undefined ? undefined : g.source === 'lichess' ? Math.round(toChesscom(r)) : r)
  return { white: conv(g.white.rating), black: conv(g.black.rating) }
}

export function classifyGame(san: string[], evals: PosEval[], bookPly = 0, opts: ClassifyOptions = {}): ReviewedMove[] {
  const M = REVIEW_MODEL
  const c = new Chess(START_FEN)
  const out: ReviewedMove[] = []
  const epLosses: number[] = []
  for (let ply = 0; ply < san.length && ply + 1 < evals.length; ply++) {
    const fen = c.fen()
    const legal = c.moves().length
    const inCheck = c.inCheck()
    const m = c.move(san[ply])
    const uci = m.from + m.to + (m.promotion ?? '')
    const side = sideAt(ply)
    const rating = opts.ratings?.[side]
    const before = evals[ply]
    const after = evals[ply + 1]
    // Winstkans (Lichess) voor nauwkeurigheid en grafiek; expected points (rating-afhankelijk) voor het oordeel
    const wpBefore = winPct(before)
    const wpAfter = winPct(after)
    const loss = Math.max(0, forSide(wpBefore, side) - forSide(wpAfter, side))
    const epLoss = Math.max(0, forSide(expectedPoints(before, rating), side) - forSide(expectedPoints(after, rating), side))
    epLosses.push(epLoss)
    const isBest = !!before.best && before.best === uci
    const prev = out[ply - 1]
    const oppLoss = ply > 0 ? epLosses[ply - 1] : 0
    const moverWpAfter = forSide(wpAfter, side)
    const second = before.cp2 !== undefined || before.mate2 !== undefined ? forSide(winPct({ cp: before.cp2, mate: before.mate2 }), side) : undefined

    let cls: MoveClass
    if (legal === 1) cls = 'best' // Chess.com kent geen 'gedwongen': de enige zet is ook de beste
    else if (ply < bookPly) cls = 'book'
    else {
      // Briljant: een goed stukoffer, (bijna) de beste zet, je staat daarna niet slechter, en je stond niet al
      // compleet gewonnen zonder deze zet (gemeten aan de op één na beste zet), behalve bij een offer dat tot mat leidt
      const matingSac = isBest && after.mate !== undefined && (side === 'white' ? after.mate > 0 : after.mate < 0)
      const withoutIt = second ?? forSide(wpBefore, side)
      const open = withoutIt < M.brilliantMaxWp || matingSac
      const offered = epLoss < M.brilliantMaxLoss && !inCheck && !m.promotion && legal > 2 && moverWpAfter >= 50 && open ? sacrificedSquares(fen, uci) : []
      const accepted = !!after.best && offered.includes(after.best.slice(2, 4))
      const recapture = !!m.captured && !!prev && prev.uci.slice(2, 4) === m.to
      if (offered.length && (accepted || matingSac || !M.brilliantNeedsAccept)) cls = 'brilliant'
      // Geweldig: de enige goede zet, en hij straft een fout van de tegenstander af
      else if (isBest && !recapture && !inCheck && second !== undefined && forSide(wpBefore, side) - second >= M.greatGap && oppLoss >= M.greatMinOpponentLoss) cls = 'great'
      else if (isBest || epLoss < M.bestMaxLoss) cls = 'best'
      // Gemist: de tegenstander gaf iets weg en jij geeft het (grotendeels) terug
      else if (epLoss >= 5 && oppLoss >= M.missMinOpponentLoss && epLoss >= oppLoss * M.missGivesBackMin && epLoss <= oppLoss * M.missGivesBackMax) cls = 'miss'
      else if (epLoss < 2) cls = 'excellent'
      else if (epLoss < 5) cls = 'good'
      else if (epLoss < 10) cls = 'inaccuracy'
      // Blunder: kost veel én je staat daarna echt slecht; anders 'fout'
      else if (epLoss < 20 || moverWpAfter >= M.blunderMaxWinAfter) cls = 'mistake'
      else cls = 'blunder'
    }

    // Gemiste briljante zet: de beste zet was een offer dat Stockfish aanneemt (of tot mat leidt), en jij speelde iets duidelijk slechters
    let missedBrilliant = false
    if (cls !== 'book' && !isBest && epLoss >= 10 && legal > 2 && !inCheck && before.best && forSide(wpBefore, side) >= 50) {
      const mates = before.mate !== undefined && (side === 'white' ? before.mate > 0 : before.mate < 0)
      if ((second ?? forSide(wpBefore, side)) < M.brilliantMaxWp || mates) {
        const offered = sacrificedSquares(fen, before.best)
        const reply = before.pv?.[1]
        missedBrilliant = offered.length > 0 && ((!!reply && offered.includes(reply.slice(2, 4))) || mates || !M.brilliantNeedsAccept)
      }
    }
    const bestLine = before.pv?.length ? sanLine(fen, before.pv.slice(0, 6)) : []
    out.push({
      missedBrilliant,
      ply, san: m.san, uci, side, cls, loss,
      accuracy: cls === 'book' ? 100 : moveAccuracy(loss),
      wpBefore, wpAfter,
      bestUci: before.best, bestSan: bestLine[0],
      bestLine,
    })
  }
  return out
}

export function summarize(moves: ReviewedMove[], side: Side, source: ReviewGame['source'] = 'lichess'): SideSummary {
  const scale: RatingScale = source === 'chesscom' ? 'chesscom' : 'lichess'
  const own = moves.filter(m => m.side === side)
  const counts = Object.fromEntries(CLASS_ORDER.map(k => [k, 0])) as Record<MoveClass, number>
  for (const m of own) counts[m.cls]++
  const accuracy = gameAccuracy(own.map(m => m.accuracy))
  const played = own.filter(m => m.cls !== 'book').length
  return { accuracy, counts, rating: played >= MIN_RATED_MOVES ? estimateRating(accuracy, scale) : null, missedBrilliants: own.filter(m => m.missedBrilliant).length }
}

// ---------------- Partijrating ----------------

/** Zoveel eigen zetten buiten de theorie zijn nodig voor een schatting */
export const MIN_RATED_MOVES = 10

export type RatingScale = 'lichess' | 'chesscom'

/**
 * Welke Lichess-rating hoort typisch bij een nauwkeurigheid: [nauwkeurigheid, rating], oplopend.
 * Geijkt met scripts/calibrate-game-rating.mjs: rated blitz- en rapidpartijen uit de Lichess-database,
 * ratings 600–2600, met dezelfde Stockfish-instelling als de app. Per groep spelers met ongeveer dezelfde
 * nauwkeurigheid is dit hun mediane rating. Dat is bewust voorzichtig: één goede partij maakt je niet
 * meteen 2400, want ook lager gerate spelers halen af en toe een hoge nauwkeurigheid. De bovenkant (96 → 2300,
 * 98,5 → 2500) is bijgesteld op een echte Chess.com-review: daar gaf 96,0% een partijrating van 2050 (Chess.com-schaal).
 */
export const RATING_CURVE: [number, number][] = [[49.7, 940], [58.3, 1070], [71.5, 1180], [78.2, 1520], [80.9, 1640], [84.2, 1790], [86.1, 1840], [88, 1960], [91.1, 2080], [96, 2300], [98.5, 2500]]

/** Lichess- naar Chess.com-rating (blitz en rapid), een benadering: Chess.com ligt een paar honderd punten lager */
export const toChesscom = (lichess: number) => 1.15 * lichess - 600

/** De rating waarop iemand in deze partij speelde, geschat uit de nauwkeurigheid (afgerond op 10) */
export function estimateRating(accuracy: number, scale: RatingScale = 'lichess'): number {
  const c = RATING_CURVE
  let r: number
  if (accuracy <= c[0][0]) r = c[0][1]
  else if (accuracy >= c[c.length - 1][0]) r = c[c.length - 1][1]
  else {
    const i = c.findIndex(([a]) => a >= accuracy)
    const [a0, r0] = c[i - 1]
    const [a1, r1] = c[i]
    r = r0 + ((accuracy - a0) / (a1 - a0)) * (r1 - r0)
  }
  if (scale === 'chesscom') r = toChesscom(r)
  return Math.round(Math.max(100, Math.min(3000, r)) / 10) * 10
}

/** Korte uitleg bij een zet, in gewone taal */
export function explainMove(m: ReviewedMove): string {
  const text = explainClass(m)
  return m.missedBrilliant && m.bestSan ? `${text} Er was een briljante zet: ${m.bestSan}!` : text
}

function explainClass(m: ReviewedMove): string {
  const best = m.bestSan && m.bestUci !== m.uci ? m.bestSan : null
  switch (m.cls) {
    case 'brilliant': return `${m.san} is briljant: je offert materiaal en het is de beste zet.`
    case 'great': return `${m.san} is een geweldige zet: de enige zet die de stelling houdt.`
    case 'best': return `${m.san} is de beste zet.`
    case 'excellent': return `${m.san} is uitstekend, bijna net zo sterk als de beste zet${best ? ` (${best})` : ''}.`
    case 'good': return `${m.san} is een goede zet.${best ? ` Beste was ${best}.` : ''}`
    case 'book': return `${m.san} is een theoriezet.`
    case 'inaccuracy': return `${m.san} is onnauwkeurig.${best ? ` Beter was ${best}.` : ''}`
    case 'mistake': return `${m.san} is een fout.${best ? ` Beter was ${best}.` : ''}`
    case 'miss': return `${m.san} is een gemiste kans: de tegenstander gaf iets weg.${best ? ` Met ${best} had je kunnen profiteren.` : ''}`
    case 'blunder': return `${m.san} is een blunder.${best ? ` Beste was ${best}.` : ''}`
  }
}

/** Score vanuit wit voor weergave: +1.3, −0.4, #3, #−2 */
export function formatScore(e: PosEval | undefined): string {
  if (!e) return '–'
  if (e.mate !== undefined) return e.mate === 0 ? '#' : `#${e.mate > 0 ? '' : '−'}${Math.abs(e.mate)}`
  if (e.cp === undefined) return '–'
  if (Math.abs(e.cp) >= 10000) return e.cp > 0 ? '1-0' : '0-1'
  const v = e.cp / 100
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1)
}

/** Welke engine de analyse doet (zie public/engine/SOURCE.md) */
export const ENGINE_NAME = 'Stockfish 19 (lite, NNUE)'

// ---------------- Partijen ophalen ----------------

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const LICHESS_ENDING: Record<string, string> = {
  mate: 'mat', resign: 'opgegeven', outoftime: 'tijd', timeout: 'tijd', stalemate: 'pat', draw: 'remise',
  aborted: 'afgebroken', noStart: 'niet begonnen', insufficientMaterialClaim: 'remise', cheat: 'valsspelen',
}

export async function fetchLichessRecent(username: string, max = 30): Promise<ReviewGame[]> {
  const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=${max}&moves=true&opening=true&clocks=false&evals=false`
  const res = await fetch(url, { headers: { Accept: 'application/x-ndjson' } })
  if (res.status === 404) throw new Error(`Lichess-gebruiker "${username}" niet gevonden`)
  if (res.status === 429) throw new Error('Lichess vraagt even te wachten. Probeer het over een minuut opnieuw.')
  if (!res.ok) throw new Error(`Lichess gaf foutcode ${res.status}`)
  const text = await res.text()
  return text.split('\n').filter(l => l.trim()).map(l => lichessGame(JSON.parse(l), [username])).filter((g): g is ReviewGame => !!g)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lichessGame(g: any, myNames: string[]): ReviewGame | null {
  if (g.variant !== 'standard' || !g.moves || g.initialFen) return null
  const name = (p: { user?: { name?: string }; aiLevel?: number } | undefined) => p?.user?.name ?? (p?.aiLevel ? `Stockfish niveau ${p.aiLevel}` : 'Anoniem')
  const white = { name: name(g.players?.white), rating: g.players?.white?.rating }
  const black = { name: name(g.players?.black), rating: g.players?.black?.rating }
  const mine = myNames.map(n => n.toLowerCase())
  return {
    id: 'li:' + g.id, source: 'lichess', url: `https://lichess.org/${g.id}`,
    white, black, myColor: mine.includes(black.name.toLowerCase()) && !mine.includes(white.name.toLowerCase()) ? 'black' : 'white',
    result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '1/2-1/2',
    ending: LICHESS_ENDING[g.status] ?? g.status, speed: g.speed, playedAt: g.createdAt,
    opening: g.opening?.name, bookPly: g.opening?.ply, san: String(g.moves).split(' ').filter(Boolean),
  }
}

/** Eén Lichess-partij ophalen op ID (8 tekens) */
export async function fetchLichessGame(id: string, myNames: string[]): Promise<ReviewGame> {
  const res = await fetch(`https://lichess.org/game/export/${id}?moves=true&opening=true&clocks=false&evals=false`, { headers: { Accept: 'application/json' } })
  if (res.status === 404) throw new Error('Deze Lichess-partij bestaat niet (meer).')
  if (!res.ok) throw new Error(`Lichess gaf foutcode ${res.status}`)
  const g = lichessGame(await res.json(), myNames)
  if (!g) throw new Error('Dit is geen gewone schaakpartij vanaf de beginstelling.')
  return g
}

interface ChesscomGame {
  url: string; pgn?: string; rules: string; end_time: number; time_class?: string
  white: { username: string; rating?: number; result: string }
  black: { username: string; rating?: number; result: string }
}

const CHESSCOM_ENDING: Record<string, string> = {
  checkmated: 'mat', resigned: 'opgegeven', timeout: 'tijd', abandoned: 'verlaten', stalemate: 'pat',
  agreed: 'remise', repetition: 'herhaling', insufficient: 'remise', timevsinsufficient: 'remise', '50move': 'remise',
}

export function chesscomGame(g: ChesscomGame, username: string): ReviewGame | null {
  if (g.rules !== 'chess' || !g.pgn) return null
  const c = new Chess()
  try {
    c.loadPgn(g.pgn)
  } catch {
    return null
  }
  const san = c.history()
  if (!san.length) return null
  const h = c.getHeaders()
  if (h.SetUp === '1') return null
  const myColor: Side = g.black.username.toLowerCase() === username.toLowerCase() ? 'black' : 'white'
  const result = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2'
  const loserResult = result === '1-0' ? g.black.result : result === '0-1' ? g.white.result : g.white.result
  const slug = h.ECOUrl?.split('/openings/')[1]
  const opening = slug ? decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s*\.\.\.\s*.*$/, '').replace(/\s\d+\.\S*.*$/, '') : undefined
  return {
    id: 'cc:' + (g.url.split('/').pop() ?? g.url), source: 'chesscom', url: g.url,
    white: { name: g.white.username, rating: g.white.rating }, black: { name: g.black.username, rating: g.black.rating },
    myColor, result, ending: CHESSCOM_ENDING[loserResult] ?? loserResult, speed: g.time_class,
    playedAt: g.end_time * 1000, opening, san,
  }
}

/** Zoekt een Chess.com-partij op ID in de archieven van een speler (hooguit de laatste 6 maanden) */
export async function findChesscomGame(username: string, id: string): Promise<ReviewGame | null> {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/games/archives`)
  if (!res.ok) return null
  const { archives } = (await res.json()) as { archives: string[] }
  for (const url of archives.slice(-6).reverse()) {
    const r = await fetch(url)
    if (!r.ok) continue
    const { games } = (await r.json()) as { games: ChesscomGame[] }
    const g = games.find(g => g.url.split('/').pop() === id)
    if (g) return chesscomGame(g, username)
    await sleep(300)
  }
  return null
}

export type GameLink = { kind: 'lichess'; id: string } | { kind: 'chesscom'; type: 'live' | 'daily' | 'computer'; id: string }

/** Herkent een link naar een partij op Lichess of Chess.com */
export function parseGameLink(text: string): GameLink | null {
  const t = text.trim()
  const li = t.match(/lichess\.org\/(?:embed\/)?(?:game\/export\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:[/?#]|$)/)
  if (li && !/^(training|study|analysis|tv|games|editor|practice|learn|streamer|broadcast|tournament|swiss|simul|team|forum|blog|player|paste|account)$/.test(li[1])) return { kind: 'lichess', id: li[1] }
  const cc = t.match(/chess\.com\/(?:analysis\/)?game\/(live|daily|computer)\/(\d+)/) ?? t.match(/chess\.com\/(live|daily)\/game\/(\d+)/)
  if (cc) return { kind: 'chesscom', type: cc[1] as 'live' | 'daily' | 'computer', id: cc[2] }
  return null
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) }

/** Zet een geplakte PGN om; `myNames` zijn je gebruikersnamen om je kleur te herkennen */
export function gameFromPgn(pgn: string, myNames: string[]): ReviewGame {
  const c = new Chess()
  try {
    c.loadPgn(pgn.trim())
  } catch {
    throw new Error('Dit lijkt geen geldige PGN. Kopieer de hele PGN, inclusief de regels tussen [ ].')
  }
  const h = c.getHeaders()
  if (h.SetUp === '1' || (h.FEN && !h.FEN.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w'))) throw new Error('Alleen partijen vanaf de beginstelling kunnen geanalyseerd worden.')
  const san = c.history()
  if (!san.length) throw new Error('Deze PGN bevat geen zetten.')
  const site = h.Link ?? h.Site ?? ''
  const source: ReviewGame['source'] = /chess\.com/i.test(site) ? 'chesscom' : /lichess\.org/i.test(site) ? 'lichess' : 'pgn'
  const white = { name: h.White && h.White !== '?' ? h.White : 'Wit', rating: Number(h.WhiteElo) || undefined }
  const black = { name: h.Black && h.Black !== '?' ? h.Black : 'Zwart', rating: Number(h.BlackElo) || undefined }
  const mine = myNames.map(n => n.toLowerCase())
  const myColor: Side = mine.includes(black.name.toLowerCase()) && !mine.includes(white.name.toLowerCase()) ? 'black' : 'white'
  const date = (h.UTCDate ?? h.Date ?? '').replace(/\./g, '-')
  const playedAt = Date.parse(`${date}T${h.UTCTime ?? '12:00:00'}Z`) || Date.now()
  const result = h.Result === '1-0' || h.Result === '0-1' || h.Result === '1/2-1/2' ? h.Result : '*'
  const ccId = site.match(/chess\.com\/game\/(?:live|daily|computer)\/(\d+)/)?.[1]
  const liId = site.match(/lichess\.org\/([a-zA-Z0-9]{8})/)?.[1]
  return {
    id: ccId ? 'cc:' + ccId : liId ? 'li:' + liId : 'pgn:' + hash(`${h.White}|${h.Black}|${date}|${san.join(' ')}`),
    source, url: /^https?:/.test(site) ? site : undefined, white, black, myColor, result,
    ending: san[san.length - 1].endsWith('#') ? 'mat' : undefined, playedAt, opening: h.Opening, san,
  }
}

export async function fetchChesscomRecent(username: string, max = 30): Promise<ReviewGame[]> {
  const u = encodeURIComponent(username.toLowerCase())
  const res = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`)
  if (res.status === 404) throw new Error(`Chess.com-gebruiker "${username}" niet gevonden`)
  if (!res.ok) throw new Error(`Chess.com gaf foutcode ${res.status}`)
  const { archives } = (await res.json()) as { archives: string[] }
  const out: ReviewGame[] = []
  // Van de laatste maand terug, tot er genoeg partijen zijn (hooguit drie maanden)
  for (const url of archives.slice(-3).reverse()) {
    let r = await fetch(url)
    if (r.status === 429) {
      await sleep(5000)
      r = await fetch(url)
    }
    if (!r.ok) continue
    const { games } = (await r.json()) as { games: ChesscomGame[] }
    for (const g of [...games].sort((a, b) => b.end_time - a.end_time)) {
      if (out.length >= max) break
      const rg = chesscomGame(g, username)
      if (rg) out.push(rg)
    }
    if (out.length >= max) break
    await sleep(300)
  }
  return out
}

// ---------------- Theorie herkennen ----------------

/**
 * Hoe lang de partij in de theorie bleef: tot en met de laatste stelling met een openingsnaam
 * (namenlijst van Lichess), binnen de eerste `maxPly` halve zetten.
 */
export function bookInfo(san: string[], names: Record<string, [string, string, string]>, maxPly = 30): { ply: number; name?: string } {
  const c = new Chess()
  let ply = 0
  let name: string | undefined
  for (let i = 0; i < Math.min(san.length, maxPly); i++) {
    try { c.move(san[i]) } catch { break }
    const n = names[c.fen().split(' ').slice(0, 4).join(' ')]
    if (n) { ply = i + 1; name = n[1] }
  }
  return { ply, name }
}

// ---------------- Delen ----------------

const SAFE_URL = /^https:\/\/(lichess\.org|(www\.)?chess\.com)\/[\w/.-]*$/
const SAFE_ID = /^(li|cc|pgn):[A-Za-z0-9]{1,40}$/

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
}

/** Codeert een partij (en eventueel een zet) voor in een deellink. De analyse zelf gaat niet mee. */
export function encodeShare(g: ReviewGame, ply?: number): string {
  return toBase64Url(JSON.stringify({
    v: 1, i: g.id, s: g.source, u: g.url, w: [g.white.name, g.white.rating], b: [g.black.name, g.black.rating],
    c: g.myColor === 'white' ? 'w' : 'b', r: g.result, e: g.ending, p: g.speed, t: g.playedAt, o: g.opening, k: g.bookPly,
    m: g.san.join(' '), z: ply || undefined,
  }))
}

/** Leest een deellink terug. Alles wordt gecontroleerd: de zetten moeten legaal zijn en links mogen alleen naar Lichess of Chess.com. */
export function decodeShare(code: string): { game: ReviewGame; ply?: number } | null {
  try {
    const d = JSON.parse(fromBase64Url(code))
    if (d?.v !== 1 || typeof d.m !== 'string') return null
    const san = d.m.split(' ').filter(Boolean)
    const c = new Chess()
    for (const s of san) c.move(s)
    if (!san.length) return null
    const str = (x: unknown, max = 80) => (typeof x === 'string' ? x.slice(0, max) : undefined)
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
    const source: ReviewGame['source'] = d.s === 'lichess' || d.s === 'chesscom' ? d.s : 'pgn'
    const url = str(d.u, 200)
    const id = typeof d.i === 'string' && SAFE_ID.test(d.i) ? d.i : 'pgn:' + hash(d.m)
    const result = ['1-0', '0-1', '1/2-1/2', '*'].includes(d.r) ? d.r : '*'
    const ply = num(d.z)
    return {
      game: {
        id, source, url: url && SAFE_URL.test(url) ? url : undefined,
        white: { name: str(d.w?.[0]) || 'Wit', rating: num(d.w?.[1]) }, black: { name: str(d.b?.[0]) || 'Zwart', rating: num(d.b?.[1]) },
        myColor: d.c === 'b' ? 'black' : 'white', result, ending: str(d.e, 30), speed: str(d.p, 20),
        playedAt: num(d.t) ?? Date.now(), opening: str(d.o, 120), bookPly: num(d.k), san,
      },
      ply: ply !== undefined ? Math.max(0, Math.min(san.length, Math.round(ply))) : undefined,
    }
  } catch {
    return null
  }
}

/** De partij als PGN, met de bekende gegevens in de koppen */
export function gameToPgn(g: ReviewGame): string {
  const c = new Chess()
  for (const s of g.san) c.move(s)
  const d = new Date(g.playedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  c.setHeader('Event', g.speed ? `${g.speed} partij` : 'Partij')
  c.setHeader('Site', g.url ?? 'SchaakRoute')
  c.setHeader('Date', `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`)
  c.setHeader('White', g.white.name)
  c.setHeader('Black', g.black.name)
  c.setHeader('Result', g.result)
  if (g.white.rating) c.setHeader('WhiteElo', String(g.white.rating))
  if (g.black.rating) c.setHeader('BlackElo', String(g.black.rating))
  if (g.opening) c.setHeader('Opening', g.opening)
  return c.pgn()
}

// ---------------- Hoogtepunten bijhouden ----------------

export type HighlightKind = 'brilliant' | 'great' | 'missed'

export interface Highlight {
  kind: HighlightKind
  move: ReviewedMove
}

/** Jouw briljante en geweldige zetten in een partij, en de briljante zetten die je miste */
export function highlightsOf(moves: ReviewedMove[], myColor: Side): Highlight[] {
  const out: Highlight[] = []
  for (const m of moves) {
    if (m.side !== myColor) continue
    if (m.cls === 'brilliant' || m.cls === 'great') out.push({ kind: m.cls, move: m })
    else if (m.missedBrilliant) out.push({ kind: 'missed', move: m })
  }
  return out
}

/**
 * Is de speler aan jouw kant echt jij? Met bekende gebruikersnamen moet de naam kloppen
 * (een geplakte partij van Morphy telt dan niet mee); zonder namen telt alles behalve gedeelde partijen.
 */
export function isOwnGame(g: ReviewGame, myNames: string[], shared = false): boolean {
  const names = myNames.map(n => n.toLowerCase())
  const player = (g.myColor === 'white' ? g.white : g.black).name.toLowerCase()
  return names.length ? names.includes(player) : !shared
}

// ---------------- Chess.com-labels uit een Game Review-PGN ----------------

/** Hoe Chess.com de soorten in een PGN noemt ({[%c_effect …;type;Mistake;…]}) */
const CHESSCOM_TYPES: Record<string, MoveClass> = {
  Brilliant: 'brilliant', GreatFind: 'great', Great: 'great', BestMove: 'best', Best: 'best', Excellent: 'excellent', Good: 'good',
  Book: 'book', Inaccuracy: 'inaccuracy', Mistake: 'mistake', Miss: 'miss', MissedWin: 'miss', Blunder: 'blunder',
}

export interface ChesscomReview {
  san: string[]
  /** Label per halve zet; null = Chess.com zet er geen teken bij (beste, uitstekend, goed of theorie) */
  labels: (MoveClass | null)[]
  ratings: { white?: number; black?: number }
  /** Soorten die we niet kennen, om nieuwe namen op te sporen */
  unknownTypes: string[]
}

/** Leest een PGN uit Chess.com Game Review (Delen → PGN) met het oordeel per zet */
export function chesscomReview(pgn: string): ChesscomReview {
  const c = new Chess()
  c.loadPgn(pgn.trim())
  const comments = c.getComments()
  const h = c.getHeaders()
  const san = c.history()
  const replay = new Chess()
  const labels: (MoveClass | null)[] = []
  const unknownTypes = new Set<string>()
  const used = new Set<number>()
  for (const s of san) {
    replay.move(s)
    const fen = replay.fen()
    const i = comments.findIndex((x, k) => !used.has(k) && x.fen === fen)
    let label: MoveClass | null = null
    if (i >= 0) {
      used.add(i)
      for (const t of comments[i].comment.matchAll(/type;([A-Za-z]+)/g)) {
        if (CHESSCOM_TYPES[t[1]]) label = CHESSCOM_TYPES[t[1]]
        else if (!/^(Winner|Checkmate|Draw|Resign|Timeout)/.test(t[1])) unknownTypes.add(t[1])
      }
    }
    labels.push(label)
  }
  const num = (x?: string) => (x && Number(x) ? Number(x) : undefined)
  return { san, labels, ratings: { white: num(h.WhiteElo), black: num(h.BlackElo) }, unknownTypes: [...unknownTypes] }
}
