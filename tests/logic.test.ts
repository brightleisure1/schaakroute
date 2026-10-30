// Spaced repetition, zetbeoordeling (inclusief rokade, en passant en promotie), PGN en gamification.
import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { DAY, RELEARN_DELAY, masteryScore, newSrsState, review, stageOf } from '../src/lib/srs'
import { isUserPly, judgeMove, qualityFor, starsFor } from '../src/lib/trainer'
import { needsPromotion, epdOf, cropWindow } from '../src/lib/chess'
import { parsePgn, splitGames, treeToPgn } from '../src/lib/pgn'
import { computeStreak, levelFromXp } from '../src/lib/gamification'
import { learnLessons, learnThreshold, userMoveCount } from '../src/lib/course'
import { groupByFirstMove, matchesOpening } from '../src/lib/openingGroups'
import type { FamilyFile, FamilySummary, Side, Variation } from '../src/lib/types'

describe('openingskeuze', () => {
  const family = (id: string, name: string, side: Side, rootSan: string[]) => ({ id, name, side, rootSan }) as FamilySummary
  const families = [
    family('italian', 'Italian Game', 'white', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']),
    family('english', 'English Opening', 'white', ['c4']),
    family('london', 'London System', 'white', ['d4', 'Nf6', 'Bf4']),
    family('kings', "King's Gambit", 'white', ['e4', 'e5', 'f4']),
    family('sicilian', 'Sicilian Defense', 'black', ['e4', 'c5']),
    family('englund', 'Englund Gambit', 'black', ['d4', 'e5']),
  ]

  it('groepeert per eerste zet: e4, d4, dan de rest, met behoud van volgorde', () => {
    const groups = groupByFirstMove(families, 'white')
    expect(groups.map(g => g.label)).toEqual(['Begint met 1. e4', 'Begint met 1. d4', 'Andere eerste zetten'])
    expect(groups[0].families.map(f => f.id)).toEqual(['italian', 'kings'])
    expect(groups[2].families.map(f => f.id)).toEqual(['english'])
  })

  it('noemt de groepen voor zwart naar de zet van wit en laat lege groepen weg', () => {
    expect(groupByFirstMove(families, 'black').map(g => g.label)).toEqual(['Tegen 1. e4', 'Tegen 1. d4'])
  })

  it('zoekt op Engelse naam, Nederlandse naam en zetten, los van leestekens', () => {
    const [italian, , , kings] = families
    expect(matchesOpening(italian, 'Italiaans', 'italiaans')).toBe(true)
    expect(matchesOpening(italian, 'Italiaans', 'ITALIAN')).toBe(true)
    expect(matchesOpening(kings, 'Koningsgambiet', 'kings')).toBe(true)
    expect(matchesOpening(italian, 'Italiaans', 'Nf3')).toBe(true)
    expect(matchesOpening(italian, 'Italiaans', '1.e4')).toBe(true)
    expect(matchesOpening(italian, 'Italiaans', 'siciliaans')).toBe(false)
    expect(matchesOpening(italian, 'Italiaans', '  ')).toBe(true)
  })
})

describe('SM-2 spaced repetition', () => {
  it('geeft groeiende intervallen bij goede antwoorden (1, 6, 15 dagen…)', () => {
    const now = 1_000_000
    let s = newSrsState(now)
    s = review(s, 5, now)
    expect(s.interval).toBe(1)
    expect(s.dueAt).toBe(now + DAY)
    s = review(s, 5, now)
    expect(s.interval).toBe(6)
    s = review(s, 5, now)
    expect(s.interval).toBeGreaterThanOrEqual(15)
    expect(stageOf(s)).toBe('mature')
  })

  it('laat fouten snel terugkomen en verlaagt de ease', () => {
    const now = 5_000_000
    let s = review(review(newSrsState(now), 5, now), 5, now)
    const before = s.ease
    s = review(s, 1, now)
    expect(s.interval).toBe(0)
    expect(s.reps).toBe(0)
    expect(s.lapses).toBe(1)
    expect(s.dueAt).toBe(now + RELEARN_DELAY)
    expect(s.ease).toBeLessThan(before)
  })

  it('houdt de ease minimaal op 1,3', () => {
    let s = newSrsState(0)
    for (let i = 0; i < 20; i++) s = review(s, 1, 0)
    expect(s.ease).toBe(1.3)
  })

  it('berekent een beheersingsscore van 0–100', () => {
    expect(masteryScore(newSrsState())).toBe(0)
    let s = newSrsState(0)
    for (let i = 0; i < 5; i++) s = review(s, 5, 0)
    expect(masteryScore(s)).toBeGreaterThan(80)
    expect(masteryScore(s)).toBeLessThanOrEqual(100)
  })
})

describe('zetbeoordeling', () => {
  const start = new Chess().fen()
  it('herkent illegale zetten', () => {
    expect(judgeMove({ fen: start, expected: 'e2e4', from: 'e2', to: 'e5' }).kind).toBe('illegal')
  })
  it('herkent de juiste zet', () => {
    expect(judgeMove({ fen: start, expected: 'e2e4', from: 'e2', to: 'e4' }).kind).toBe('correct')
  })
  it('onderscheidt een theoretisch alternatief van een fout', () => {
    const c = new Chess()
    c.move('d4')
    const names = { [epdOf(c.fen())]: ['A40', "Queen's Pawn Game", "Queen's Pawn Game"] as [string, string, string] }
    // in een andere variant van dezelfde opening = theorie
    const familyIndex = new Map([[epdOf(c.fen()), [{ variationId: 'x', ply: 1 }]]])
    expect(judgeMove({ fen: start, expected: 'e2e4', from: 'd2', to: 'd4', names, familyIndex }).kind).toBe('alternative')
    // benoemd én vaak gespeeld = theorie
    const stats = { bands: [], totalGames: 1, positions: { [epdOf(start)]: { n: 100, m: [['d2d4', 'd4', 30, 0, 0, 0]] } } } as never
    expect(judgeMove({ fen: start, expected: 'e2e4', from: 'd2', to: 'd4', names, stats }).kind).toBe('alternative')
    // alleen een naam (zelden gespeeld) is géén vrijbrief
    const rare = judgeMove({ fen: start, expected: 'e2e4', from: 'd2', to: 'd4', names })
    expect(rare.kind).toBe('wrong')
    if (rare.kind === 'wrong') expect(rare.name).toBe("Queen's Pawn Game")
    expect(judgeMove({ fen: start, expected: 'e2e4', from: 'h2', to: 'h4', names }).kind).toBe('wrong')
  })
  it('herkent een in de praktijk vaak gespeelde zet als alternatief', () => {
    const stats = { bands: [], totalGames: 100, positions: { [epdOf(start)]: { n: 1000, m: [['e2e4', 'e4', 500, 0, 0, 0], ['g1f3', 'Nf3', 300, 0, 0, 0]] } } } as never
    const v = judgeMove({ fen: start, expected: 'e2e4', from: 'g1', to: 'f3', stats })
    expect(v.kind).toBe('alternative')
  })
  it('ondersteunt rokade', () => {
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    expect(judgeMove({ fen, expected: 'e1g1', from: 'e1', to: 'g1' }).kind).toBe('correct')
  })
  it('ondersteunt en passant', () => {
    const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'
    const v = judgeMove({ fen, expected: 'e5f6', from: 'e5', to: 'f6' })
    expect(v.kind).toBe('correct')
    if (v.kind === 'correct') expect(v.move.isEnPassant()).toBe(true)
  })
  it('ondersteunt promotie (met en zonder expliciete keuze)', () => {
    const fen = '8/4P1k1/8/8/8/8/6K1/8 w - - 0 1'
    const c = new Chess(fen)
    expect(needsPromotion(c, 'e7', 'e8')).toBe(true)
    expect(needsPromotion(c, 'g2', 'g3')).toBe(false)
    expect(judgeMove({ fen, expected: 'e7e8q', from: 'e7', to: 'e8', promotion: 'q' }).kind).toBe('correct')
    expect(judgeMove({ fen, expected: 'e7e8n', from: 'e7', to: 'e8', promotion: 'q' }).kind).toBe('wrong')
    expect(judgeMove({ fen, expected: 'e7e8n', from: 'e7', to: 'e8' }).kind).toBe('correct')
  })
  it('herkent schaak en schaakmat via chess.js', () => {
    const c = new Chess()
    for (const m of ['f3', 'e5', 'g4', 'Qh4#']) c.move(m)
    expect(c.isCheckmate()).toBe(true)
  })
  it('bepaalt wie aan zet is en kent kwaliteit/sterren toe', () => {
    expect(isUserPly(0, 'white')).toBe(true)
    expect(isUserPly(1, 'white')).toBe(false)
    expect(isUserPly(1, 'black')).toBe(true)
    expect(qualityFor(0, 0, 0, false)).toBe(5)
    expect(qualityFor(0, 1, 0, false)).toBe(3)
    expect(qualityFor(1, 0, 0, false)).toBe(2)
    expect(qualityFor(0, 0, 0, true)).toBe(1)
    expect(starsFor(6, 0, 0)).toBe(3)
    expect(starsFor(6, 1, 0)).toBe(2)
    expect(starsFor(6, 4, 2)).toBe(1)
  })
})

describe('PGN', () => {
  const pgn = `[Event "Test"]\n\n1. e4 c5 (1... e5 2. Nf3 Nc6 (2... d6) 3. Bc4) 2. Nf3 {Open Siciliaans} d6 3. d4 *`
  it('leest varianten tussen haakjes', () => {
    const g = parsePgn(pgn)
    expect(g.errors).toHaveLength(0)
    expect(g.mainline).toEqual(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4'])
    const lines = g.lines.map(l => l.join(' '))
    expect(lines).toContain('e2e4 e7e5 g1f3 b8c6 f1c4')
    expect(lines).toContain('e2e4 e7e5 g1f3 d7d6')
    expect(lines).toContain('e2e4 c7c5 g1f3 d7d6 d2d4')
    const afterC5 = new Chess()
    afterC5.move('e4')
    afterC5.move('c5')
    expect(g.edges.find(e => e.san === 'Nf3' && e.epd === epdOf(afterC5.fen()))?.comment).toBe('Open Siciliaans')
  })
  it('exporteert een boom die weer identiek ingelezen wordt', () => {
    const g = parsePgn(pgn)
    const byEpd = new Map<string, { uci: string; san: string; main: boolean }[]>()
    for (const e of g.edges) {
      const list = byEpd.get(e.epd) ?? []
      if (!list.some(x => x.uci === e.uci)) list.push({ uci: e.uci, san: e.san, main: list.length === 0 })
      byEpd.set(e.epd, list)
    }
    const out = treeToPgn(epd => byEpd.get(epd) ?? [])
    const again = parsePgn(out)
    expect(new Set(again.lines.map(l => l.join(' ')))).toEqual(new Set(g.lines.map(l => l.join(' '))))
  })
  it('splitst meerdere partijen en meldt ongeldige zetten', () => {
    expect(splitGames('[Event "a"]\n\n1. e4 *\n\n[Event "b"]\n\n1. d4 *')).toHaveLength(2)
    expect(parsePgn('1. e4 e5 2. Ke3 *').errors.length).toBe(1)
  })
})

describe('gamification', () => {
  it('berekent levels uit XP', () => {
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(50).level).toBe(2)
    expect(levelFromXp(200).level).toBe(3)
  })
  it('berekent streaks (vandaag nog niet getraind telt niet als breuk)', () => {
    expect(computeStreak(['2026-10-22', '2026-10-23'], '2026-10-24').current).toBe(2)
    expect(computeStreak(['2026-10-22', '2026-10-23', '2026-10-24'], '2026-10-24').current).toBe(3)
    expect(computeStreak(['2026-10-20', '2026-10-23'], '2026-10-24').current).toBe(1)
    expect(computeStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-20'], '2026-10-24').best).toBe(3)
  })
})

describe('leerpad zonder korte lijnen', () => {
  const v = (id: string, plies: number) => ({ id, uci: Array(plies).fill('e2e4'), san: [], path: [], eco: 'A00', tags: [] }) as unknown as Variation
  const fam = (side: 'white' | 'black', vars: Variation[]) => ({
    family: { side } as FamilyFile['family'],
    variations: vars,
    lessons: [{ id: 'l1', level: 1, title: 'Kort', variationIds: vars.filter(x => x.uci.length < 7).map(x => x.id) }, { id: 'l2', level: 1, title: 'Gemengd', variationIds: vars.map(x => x.id) }],
  }) as unknown as FamilyFile

  it('telt alleen de eigen zetten', () => {
    expect(userMoveCount(v('a', 7), 'white')).toBe(4)
    expect(userMoveCount(v('a', 7), 'black')).toBe(3)
  })

  it('haalt lijnen met minder dan 4 eigen zetten uit de lessen en laat lege lessen vallen', () => {
    const f = fam('white', [v('kort', 3), v('lang', 8)])
    expect(learnLessons(f)).toEqual([{ id: 'l2', level: 1, title: 'Gemengd', variationIds: ['lang'] }])
  })

  it('valt terug op de langste lijn als een opening alleen korte lijnen heeft', () => {
    const f = fam('black', [v('a', 2), v('b', 6)])
    expect(learnThreshold(f)).toBe(3)
    expect(learnLessons(f).flatMap(l => l.variationIds)).toEqual(['b', 'b'])
  })
})

describe('4×4-uitsnede van de beginzetten', () => {
  // Verwachte vensters komen uit Claude Design, ronde 5
  const cases: [string, string[], string, number[], string[]][] = [
    ['Italian Game', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], 'cdef', [3, 4, 5, 6], ['c4']],
    ['London System', ['d2d4', 'd7d5', 'c1f4'], 'cdef', [3, 4, 5, 6], ['f4']],
    ["Queen's Gambit", ['d2d4', 'd7d5', 'c2c4'], 'bcde', [3, 4, 5, 6], ['c4']],
    ['English Opening', ['c2c4'], 'bcde', [2, 3, 4, 5], ['c2', 'c4']],
    ['Scotch Game', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4'], 'cdef', [3, 4, 5, 6], ['d4']],
    ["Bishop's Opening", ['e2e4', 'e7e5', 'f1c4'], 'cdef', [3, 4, 5, 6], ['c4']],
    ['Ruy Lopez', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], 'bcde', [3, 4, 5, 6], ['b5']],
    ["King's Gambit", ['e2e4', 'e7e5', 'f2f4'], 'defg', [3, 4, 5, 6], ['f4']],
    ['Vienna Game', ['e2e4', 'e7e5', 'b1c3'], 'cdef', [3, 4, 5, 6], ['c3']],
    ['Hungarian Opening', ['g2g3'], 'efgh', [1, 2, 3, 4], ['g2', 'g3']],
  ]
  for (const [name, uci, files, ranks, highlight] of cases) {
    it(name, () => expect(cropWindow(uci)).toEqual({ files, ranks, highlight }))
  }
})
