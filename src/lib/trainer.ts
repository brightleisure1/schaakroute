import { Chess, type Move } from 'chess.js'
import { epdOf, parseUci, uciOf } from './chess'
import type { PositionRef } from './data'
import type { Quality } from './srs'
import type { StatMove, StatsFile } from './types'

// Pure trainerlogica (zonder React), zodat die met tests te controleren is.

export type Verdict =
  | { kind: 'illegal' }
  | { kind: 'correct'; move: Move }
  | {
      kind: 'alternative'
      move: Move
      /** 'book' = stelling komt voor in de Lichess-openingsdatabase; 'practice' = vaak gespeeld in echte partijen */
      source: 'book' | 'practice'
      name?: string
      share?: number
      games?: number
    }
  | { kind: 'wrong'; move: Move; name?: string }

export interface JudgeContext {
  fen: string
  expected: string
  from: string
  to: string
  promotion?: string
  familyIndex?: Map<string, PositionRef[]>
  names?: Record<string, [string, string, string]>
  stats?: StatsFile | null
}

/** Beoordeelt een zet van de gebruiker. Wijzigt niets aan het bord (werkt op een kopie). */
export function judgeMove(ctx: JudgeContext): Verdict {
  const c = new Chess(ctx.fen)
  let move: Move
  try {
    move = c.move({ from: ctx.from, to: ctx.to, promotion: ctx.promotion ?? 'q' })
  } catch {
    return { kind: 'illegal' }
  }
  const played = uciOf(move)
  // Bij promotie zonder expliciete keuze: vergelijk met de verwachte promotie
  if (played === ctx.expected || (!ctx.promotion && ctx.expected.length === 5 && played.slice(0, 4) === ctx.expected.slice(0, 4))) {
    if (played !== ctx.expected) {
      const c2 = new Chess(ctx.fen)
      move = c2.move(parseUci(ctx.expected))
    }
    return { kind: 'correct', move }
  }
  const after = epdOf(c.fen())
  const named = ctx.names?.[after]
  const pos = ctx.stats?.positions[epdOf(ctx.fen)]
  const stat = pos?.m.find(x => x[0] === played)
  const share = stat && pos ? (stat[2] as number) / pos.n : 0
  // 1. een andere variant van dezelfde opening: echte theorie, geen fout
  if (ctx.familyIndex?.has(after)) return { kind: 'alternative', move, source: 'book', name: named?.[1] }
  // 2. benoemde opening die ook in de praktijk regelmatig gespeeld wordt
  if (named && share >= 0.05) return { kind: 'alternative', move, source: 'book', name: named[1], share, games: stat?.[2] as number }
  // 3. onbenoemd maar vaak gespeeld in echte partijen
  if (stat && (stat[2] as number) >= 30 && share >= 0.1) return { kind: 'alternative', move, source: 'practice', share, games: stat[2] as number }
  // Een naam in de database maakt een zet nog niet goed (bijv. 1...g5 'Borg Defense')
  return { kind: 'wrong', move, name: named?.[1] }
}

/** SM-2-kwaliteit op basis van hoe een zet ging */
export function qualityFor(mistakes: number, hints: number, alternatives: number, shown: boolean): Quality {
  if (shown || mistakes >= 2) return 1
  if (mistakes === 1) return 2
  if (hints > 0) return 3
  if (alternatives > 0) return 4
  return 5
}

/** Sterren voor een afgeronde lijn */
export function starsFor(userMoves: number, mistakes: number, hints: number): number {
  if (userMoves === 0) return 3
  const errors = mistakes + hints * 0.5
  if (errors === 0) return 3
  if (errors <= Math.max(1, userMoves * 0.2)) return 2
  return 1
}

export interface PlyOutcome {
  ply: number
  expected: string
  mistakes: number
  hints: number
  alternatives: number
  shown: boolean
}

/** Geeft voor ply-index aan of de gebruiker aan zet is */
export function isUserPly(ply: number, side: 'white' | 'black', startFenTurn: 'w' | 'b' = 'w') {
  const whiteToMove = (ply % 2 === 0) === (startFenTurn === 'w')
  return side === 'white' ? whiteToMove : !whiteToMove
}

/** Statistiek-hulp: scores van een zet vanuit het perspectief van een kant, optioneel per ratingband */
export function moveScore(sm: StatMove, side: 'white' | 'black', band?: number) {
  const m = sm as unknown as number[]
  const [n, w, d, b] = band === undefined ? [m[2], m[3], m[4], m[5]] : m.slice(6 + band * 4, 10 + band * 4)
  if (!n) return { n: 0, score: 0, win: 0, draw: 0, loss: 0 }
  const win = (side === 'white' ? w : b) / n
  const loss = (side === 'white' ? b : w) / n
  const draw = d / n
  return { n, score: win + draw / 2, win, draw, loss }
}

/** Aantal partijen voor een zet binnen een ratingband */
export const bandCount = (m: StatMove, band: number) => (m[6 + band * 4] as number) ?? 0
