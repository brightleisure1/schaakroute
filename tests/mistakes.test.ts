import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { SchaakDB } from '../src/lib/db'
import { classifyGame, type PosEval } from '../src/lib/review'
import { mistakeItems, saveMistakeCards } from '../src/lib/mistakes'
import { GAMES_FILTER, gameCardText, inReviewFilter } from '../src/lib/gameCards'

// Herdersmat: zwart blundert met 3…Nf6??
const san = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']
const evals: PosEval[] = [
  { cp: 30, best: 'e2e4' }, { cp: 30, best: 'e7e5' }, { cp: 30, best: 'g1f3' }, { cp: 0, best: 'b8c6' },
  { cp: 10, best: 'f1c4' }, { cp: 40, best: 'g7g6', pv: ['g7g6', 'h5f3'] }, { mate: 1, best: 'h5f7' }, { cp: 10000 },
]
const fens = (() => { const c = new Chess(); const out = [c.fen()]; for (const s of san) { c.move(s); out.push(c.fen()) } return out })()

describe('fouten-trainer', () => {
  const moves = classifyGame(san, evals)
  it('vindt alleen jouw fouten met een betere zet', () => {
    const items = mistakeItems(moves, 'black', fens)
    expect(items.map(i => [i.ply, i.played.san, i.bestSan])).toEqual([[5, 'Nf6', 'g6']])
    expect(items[0].lineUci).toHaveLength(5)
    expect(mistakeItems(moves, 'white', fens)).toEqual([])
  })
  it('zet fouten in Herhalen: mislukt meteen, gelukt later; geen dubbele kaarten', async () => {
    const db = new SchaakDB('mistakes-test')
    const items = mistakeItems(moves, 'black', fens)
    expect(await saveMistakeCards(items, () => false, 'black', db)).toBe(1)
    const [card] = await db.cards.toArray()
    expect(card).toMatchObject({ uci: 'g7g6', san: 'g6', side: 'black', familyIds: [] })
    expect(card.dueAt).toBeLessThanOrEqual(Date.now())
    expect(await saveMistakeCards(items, () => true, 'black', db)).toBe(0)
    expect(await db.cards.count()).toBe(1)
  })
  it('onthoudt uit welke partij een fout komt, voor Herhalen', async () => {
    const db = new SchaakDB('mistakes-source-test')
    const items = mistakeItems(moves, 'black', fens)
    await saveMistakeCards(items, () => false, 'black', db, { kind: 'game', gameId: 'lichess:abc', opponent: 'AdamX000', playedAt: Date.UTC(2026, 10, 17) })
    const [card] = await db.cards.toArray()
    expect(card.source).toMatchObject({ kind: 'game', gameId: 'lichess:abc', opponent: 'AdamX000', played: 'Nf6' })
    expect(inReviewFilter(card, GAMES_FILTER)).toBe(true)
    expect(inReviewFilter(card, '')).toBe(true)
    expect(inReviewFilter(card, 'italian-game')).toBe(false)
    expect(gameCardText(card.source!).title).toBe('Je partij tegen AdamX000')
  })
})
