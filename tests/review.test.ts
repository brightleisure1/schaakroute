import { describe, expect, it } from 'vitest'
import { bookInfo, chesscomGame, classifyGame, decodeShare, encodeShare, estimateRating, explainMove, formatScore, gameFromPgn, gameToPgn, highlightsOf, isOwnGame, parseGameLink, gameAccuracy, isSacrifice, moveAccuracy, summarize, winPct, type PosEval } from '../src/lib/review'

const ITALIAN_BC5 = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'

describe('winstkans en nauwkeurigheid', () => {
  it('winPct is 50 bij gelijke stand en loopt naar 0 en 100', () => {
    expect(winPct({ cp: 0 })).toBeCloseTo(50)
    expect(winPct({ cp: 300 })).toBeGreaterThan(75)
    expect(winPct({ cp: -300 })).toBeLessThan(25)
    expect(winPct({ mate: 3 })).toBe(100)
    expect(winPct({ mate: -1 })).toBe(0)
    expect(winPct({ cp: 10000 })).toBe(100)
  })
  it('een zet zonder verlies is ~100% nauwkeurig, een groot verlies bijna 0', () => {
    expect(moveAccuracy(0)).toBeCloseTo(100, 0)
    expect(moveAccuracy(50)).toBeLessThan(15)
    expect(gameAccuracy([100, 100, 100])).toBeCloseTo(100, 0)
    expect(gameAccuracy([100, 100, 10])).toBeLessThan(60)
  })
  it('scores voor weergave', () => {
    expect(formatScore({ cp: 130 })).toBe('+1.3')
    expect(formatScore({ cp: -40 })).toBe('−0.4')
    expect(formatScore({ mate: -2 })).toBe('#−2')
  })
})

describe('offers herkennen', () => {
  it('Lxf7+ laat een onverdedigde loper slaan: offer', () => {
    expect(isSacrifice(ITALIAN_BC5, 'c4f7')).toBe(true)
  })
  it('een gewone ontwikkelingszet of pionzet is geen offer', () => {
    expect(isSacrifice(ITALIAN_BC5, 'e1g1')).toBe(false)
    expect(isSacrifice(ITALIAN_BC5, 'c2c3')).toBe(false)
    expect(isSacrifice(ITALIAN_BC5, 'b1c3')).toBe(false)
  })
  it('een gedekt stuk dat een pion slaat en door een pion geslagen kan worden is geen offer', () => {
    // 1.e4 d5 2.Nc3 d4? 3.Nd5?? nee: wit paard naar d5 wordt niet door een pion aangevallen; neem Pxd5 exd5-ruil
    expect(isSacrifice('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'e4d5')).toBe(false)
  })
})

describe('zetten beoordelen', () => {
  // Herdersmat: 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
  const san = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
  const evals: PosEval[] = [
    { cp: 30, best: 'e2e4', pv: ['e2e4'] },
    { cp: 30, best: 'e7e5', pv: ['e7e5'] },
    { cp: 30, best: 'g1f3', pv: ['g1f3'] },
    { cp: 0, best: 'b8c6', pv: ['b8c6'] },
    { cp: 10, best: 'f1c4', pv: ['f1c4'] },
    { cp: 40, best: 'g7g6', pv: ['g7g6', 'h5f3'] },
    { mate: 1, best: 'h5f7', pv: ['h5f7'] },
    { cp: 10000 },
  ]
  const moves = classifyGame(san, evals, 2)
  it('geeft iedere zet een oordeel', () => {
    expect(moves.map(m => m.cls)).toEqual(['book', 'book', 'good', 'best', 'best', 'blunder', 'best'])
  })
  it('noemt bij een blunder de beste zet', () => {
    expect(moves[5].bestSan).toBe('g6')
    expect(explainMove(moves[5])).toBe('Nf6 is een blunder. Beste was g6.')
  })
  it('telt per kleur en berekent de nauwkeurigheid', () => {
    const black = summarize(moves, 'black')
    expect(black.counts.blunder).toBe(1)
    expect(black.accuracy).toBeLessThan(summarize(moves, 'white').accuracy)
  })
  it('een gemiste kans na een fout van de tegenstander', () => {
    // 1…e5 kost zwart veel; wit profiteert niet met 2.Nf3 (beter was Qh5) en geeft het voordeel terug
    const s = ['e4', 'e5', 'Nf3', 'Nc6']
    const e: PosEval[] = [{ cp: 30, best: 'e2e4' }, { cp: 30, best: 'd7d5' }, { cp: 250, best: 'd1h5' }, { cp: 40, best: 'b8c6' }, { cp: 40, best: 'f1b5' }]
    expect(classifyGame(s, e).map(m => m.cls)).toEqual(['best', 'mistake', 'miss', 'best'])
  })
})

describe('theorie en Chess.com', () => {
  it('bookInfo vindt de laatste stelling met een naam', () => {
    const names = { 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': ['B00', "King's Pawn Game", "King's Pawn Game"] as [string, string, string] }
    expect(bookInfo(['e4', 'a6', 'h4'], names)).toEqual({ ply: 1, name: "King's Pawn Game" })
  })
  it('zet een Chess.com-partij om', () => {
    const g = chesscomGame({
      url: 'https://www.chess.com/game/live/123', rules: 'chess', end_time: 1700000000, time_class: 'blitz',
      pgn: '[White "Anna"]\n[Black "Bob"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
      white: { username: 'Anna', rating: 1200, result: 'checkmated' }, black: { username: 'Bob', rating: 1250, result: 'win' },
    }, 'bob')
    expect(g).toMatchObject({ id: 'cc:123', myColor: 'black', result: '0-1', ending: 'mat', san: ['f3', 'e5', 'g4', 'Qh4#'] })
  })
})

describe('partijrating', () => {
  it('hogere nauwkeurigheid geeft een hogere rating, met een voorzichtige boven- en ondergrens', () => {
    expect(estimateRating(90)).toBeGreaterThan(estimateRating(85))
    expect(estimateRating(85)).toBeGreaterThan(estimateRating(75))
    expect(estimateRating(30)).toBe(estimateRating(40))
    expect(estimateRating(100)).toBeLessThanOrEqual(2500)
    expect(estimateRating(80)).toBeGreaterThan(1450)
    expect(estimateRating(80)).toBeLessThan(1750)
  })
  it('op Chess.com-schaal komt de rating lager uit', () => {
    expect(estimateRating(80, 'chesscom')).toBeLessThan(estimateRating(80, 'lichess') - 200)
  })
  it('geen schatting bij te weinig eigen zetten buiten de theorie', () => {
    const san = ['e4', 'e5', 'Nf3', 'Nc6']
    const e: PosEval[] = Array.from({ length: 5 }, () => ({ cp: 20 }))
    expect(summarize(classifyGame(san, e), 'white').rating).toBeNull()
  })
})

describe('briljant, links en PGN', () => {
  it('een stuk laten staan voor een sterkere zet telt als offer (Légal: 5.Pxe5 en de dame staat aan)', () => {
    // 1.e4 e5 2.Nf3 d6 3.Bc4 Bg4 4.Nc3 g6 — wit speelt 5.Nxe5 en laat de dame op d1 slaan
    const fen = 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5'
    expect(isSacrifice(fen, 'f3e5')).toBe(true)
  })
  it('herkent links naar partijen', () => {
    expect(parseGameLink('https://lichess.org/iVshKPMF')).toEqual({ kind: 'lichess', id: 'iVshKPMF' })
    expect(parseGameLink('https://lichess.org/iVshKPMFabcd/black#12')).toEqual({ kind: 'lichess', id: 'iVshKPMF' })
    expect(parseGameLink('https://www.chess.com/game/computer/2635491810')).toEqual({ kind: 'chesscom', type: 'computer', id: '2635491810' })
    expect(parseGameLink('https://www.chess.com/game/live/187092403126')).toEqual({ kind: 'chesscom', type: 'live', id: '187092403126' })
    expect(parseGameLink('https://lichess.org/training/abc12345')).toBeNull()
    expect(parseGameLink('1. e4 e5')).toBeNull()
  })
  it('zet een geplakte PGN van een botpartij om', () => {
    const g = gameFromPgn('[Site "Chess.com"]\n[White "Bot Nelson"]\n[Black "devin"]\n[Result "0-1"]\n[Link "https://www.chess.com/game/computer/2635491810"]\n\n1. f3 e5 2. g4 Qh4# 0-1', ['Devin'])
    expect(g).toMatchObject({ id: 'cc:2635491810', source: 'chesscom', myColor: 'black', result: '0-1', ending: 'mat' })
    expect(() => gameFromPgn('geen pgn', [])).toThrow()
  })
})

describe('briljant bij een matcombinatie', () => {
  it('16.Db8+ in de Opera-partij is briljant, ook al stond wit al gewonnen', () => {
    const san = '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8#'
      .replace(/\d+\./g, '').split(/\s+/).filter(Boolean)
    const evals: PosEval[] = san.map((_, i) => (i < 30 ? { cp: i % 2 ? 300 : 320 } : i === 30 ? { mate: 2, best: 'b3b8' } : { mate: 1, best: 'd1d8' }))
    evals.push({ cp: 10000 })
    evals[31] = { mate: 1, best: 'b8b8' } // na 16.Db8+ (zwart aan zet): wit geeft mat in 1
    evals[32] = { mate: 1, best: 'd1d8' }
    const moves = classifyGame(san, evals)
    expect(moves[30].san).toBe('Qb8+')
    expect(moves[30].cls).toBe('brilliant')
  })
})

describe('delen', () => {
  const game = gameFromPgn('[White "Anna"]\n[Black "Bob"]\n[Result "0-1"]\n[WhiteElo "1200"]\n\n1. f3 e5 2. g4 Qh4# 0-1', ['bob'])
  it('een partij gaat heen en terug door een deellink, met de zet', () => {
    const code = encodeShare({ ...game, url: 'https://lichess.org/abcdefgh' }, 3)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = decodeShare(code)!
    expect(back.ply).toBe(3)
    expect(back.game).toMatchObject({ id: game.id, san: game.san, myColor: 'black', result: '0-1', url: 'https://lichess.org/abcdefgh', white: { name: 'Anna', rating: 1200 } })
  })
  it('weigert onzin, illegale zetten en gevaarlijke links', () => {
    expect(decodeShare('onzin')).toBeNull()
    const bad = encodeShare({ ...game, san: ['e4', 'e4'] })
    expect(decodeShare(bad)).toBeNull()
    const evil = decodeShare(encodeShare({ ...game, url: 'javascript:alert(1)' }))!
    expect(evil.game.url).toBeUndefined()
  })
  it('maakt een PGN met koppen', () => {
    const pgn = gameToPgn(game)
    expect(pgn).toContain('[White "Anna"]')
    expect(pgn).toContain('2. g4 Qh4#')
  })
})

describe('briljante zetten bijhouden', () => {
  it('verzamelt alleen jouw briljante, geweldige en gemiste briljante zetten', () => {
    const mk = (ply: number, cls: string, missed = false) => ({ ply, side: ply % 2 ? 'black' : 'white', cls, missedBrilliant: missed }) as unknown as Parameters<typeof highlightsOf>[0][number]
    const moves = [mk(0, 'brilliant'), mk(1, 'brilliant'), mk(2, 'great'), mk(4, 'mistake', true), mk(6, 'best')]
    expect(highlightsOf(moves, 'white').map(h => [h.kind, h.move.ply])).toEqual([['brilliant', 0], ['great', 2], ['missed', 4]])
  })
  it('telt alleen partijen waarin jij speelde', () => {
    const g = gameFromPgn('[White "Morphy"]\n[Black "Duke"]\n\n1. e4 e5 *', [])
    expect(isOwnGame(g, ['devin'])).toBe(false)
    expect(isOwnGame({ ...g, white: { name: 'Devin' } }, ['devin'])).toBe(true)
    expect(isOwnGame(g, [])).toBe(true)
    expect(isOwnGame(g, [], true)).toBe(false)
  })
})

describe('briljant is streng', () => {
  it('bij een vork je koning wegzetten is geen offer, ook al gaat de toren verloren', () => {
    // Pe7+ vorkt koning g8 en toren c8; zwart zet de koning weg
    expect(isSacrifice('2r3k1/4N1pp/8/8/8/8/5PPP/6K1 b - - 0 1', 'g8h8')).toBe(false)
  })
  it('een promotie is geen damesoffer', () => {
    expect(isSacrifice('8/P7/8/8/8/8/k7/r5K1 w - - 0 1', 'a7a8q')).toBe(false)
  })
  it('een offer is briljant, ook als de tegenstander het beter niet neemt; niet als je al ruim gewonnen stond', () => {
    // 4.Lxf7+ in de Italiaan als beste zet
    const san = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Bxf7+']
    const base: PosEval[] = san.map(() => ({ cp: 20 }))
    base[6] = { cp: 20, best: 'c4f7' }
    expect(classifyGame(san, [...base, { cp: 30, best: 'e8e7' }])[6].cls).toBe('brilliant')
    const won: PosEval[] = san.map(() => ({ cp: 900 }))
    won[6] = { cp: 900, best: 'c4f7' }
    expect(classifyGame(san, [...won, { cp: 900, best: 'e8f7' }])[6].cls).not.toBe('brilliant')
  })})
