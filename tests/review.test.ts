import { describe, expect, it } from 'vitest'
import { bookInfo, chesscomGame, classifyGame, explainMove, formatScore, gameAccuracy, isSacrifice, moveAccuracy, summarize, winPct, type PosEval } from '../src/lib/review'

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
