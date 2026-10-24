import { Chess, type Move, type Square } from 'chess.js'

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** EPD = FEN zonder zettellers: identificeert een stelling onafhankelijk van de zetvolgorde */
export const epdOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ')
export const fenFromEpd = (epd: string) => `${epd} 0 1`

export const uciOf = (m: Pick<Move, 'from' | 'to' | 'promotion'>) => m.from + m.to + (m.promotion ?? '')

export function parseUci(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined }
}

/** Speelt UCI-zetten na vanaf de beginstelling (of een FEN). Gooit een fout bij een illegale zet. */
export function replay(uci: string[], fen: string = START_FEN): Chess {
  const c = new Chess(fen)
  for (const u of uci) c.move(parseUci(u))
  return c
}

export function fenAt(uci: string[], ply: number, fen: string = START_FEN) {
  return replay(uci.slice(0, ply), fen).fen()
}

export function epdsOf(uci: string[], fen: string = START_FEN): string[] {
  const c = new Chess(fen)
  const out = [epdOf(c.fen())]
  for (const u of uci) {
    c.move(parseUci(u))
    out.push(epdOf(c.fen()))
  }
  return out
}

/** Probeert een zet; geeft null bij een illegale zet (in plaats van een exception). */
export function tryMove(c: Chess, from: string, to: string, promotion?: string): Move | null {
  try {
    return c.move({ from: from as Square, to: to as Square, promotion: promotion as 'q' | undefined })
  } catch {
    return null
  }
}

export function needsPromotion(c: Chess, from: string, to: string): boolean {
  const piece = c.get(from as Square)
  if (!piece || piece.type !== 'p') return false
  const rank = to[1]
  if (!((piece.color === 'w' && rank === '8') || (piece.color === 'b' && rank === '1'))) return false
  return c.moves({ square: from as Square, verbose: true }).some(m => m.to === to)
}

export function sanToUci(fen: string, san: string): string | null {
  const c = new Chess(fen)
  try {
    return uciOf(c.move(san))
  } catch {
    return null
  }
}

/** Zettenlijst als nette PGN-tekst: "1. e4 c5 2. Nf3" */
export function formatMoves(san: string[], startPly = 0): string {
  const parts: string[] = []
  san.forEach((m, i) => {
    const ply = startPly + i
    if (ply % 2 === 0) parts.push(`${ply / 2 + 1}.`)
    else if (i === 0) parts.push(`${Math.floor(ply / 2) + 1}...`)
    parts.push(m)
  })
  return parts.join(' ')
}

export function moveNumberLabel(ply: number) {
  return ply % 2 === 0 ? `${ply / 2 + 1}.` : `${Math.floor(ply / 2) + 1}...`
}

export const sideToMoveAt = (ply: number, startFen = START_FEN) => {
  const startWhite = startFen.split(' ')[1] === 'w'
  return (ply % 2 === 0) === startWhite ? 'white' : 'black'
}

const PIECE_NL: Record<string, string> = { K: 'koning', Q: 'dame', R: 'toren', B: 'loper', N: 'paard' }
/** Korte Nederlandse omschrijving van een SAN-zet */
export function describeSan(san: string): string {
  if (san.startsWith('O-O-O')) return 'lange rokade'
  if (san.startsWith('O-O')) return 'korte rokade'
  const piece = PIECE_NL[san[0]] ?? 'pion'
  const capture = san.includes('x')
  const target = (san.match(/[a-h][1-8]/g) ?? []).pop() ?? ''
  const promo = san.match(/=([QRBN])/)
  let s = `${piece} ${capture ? 'slaat op' : 'naar'} ${target}`
  if (promo) s += `, promoveert tot ${PIECE_NL[promo[1]]}`
  if (san.includes('#')) s += ' — schaakmat'
  else if (san.includes('+')) s += ' met schaak'
  return s
}
