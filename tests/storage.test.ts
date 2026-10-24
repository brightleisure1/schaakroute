// Opslag van voortgang in IndexedDB (via fake-indexeddb): kaarten, varianten, repertoire en datasetupdates.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { SchaakDB } from '../src/lib/db'
import { completeVariation, dueCards, recordMove, exportBackup, importBackup } from '../src/lib/progress'
import { addLine, deleteMove, repertoireLines, setMain } from '../src/lib/repertoire'
import { epdOf } from '../src/lib/chess'

const startEpd = epdOf(new Chess().fen())
let n = 0
let database: SchaakDB
beforeEach(async () => {
  database = new SchaakDB(`test-${++n}`)
  await database.open()
})

describe('voortgang opslaan', () => {
  it('maakt een kaart aan en plant herhalingen volgens SM-2', async () => {
    const base = { epd: startEpd, uci: 'e2e4', san: 'e4', side: 'white' as const, familyId: 'italian-game', variationId: 'v1', lineUci: [], mode: 'practice' as const, result: 'correct' as const }
    const r1 = await recordMove({ ...base, quality: 5 }, database)
    expect(r1.isNew).toBe(true)
    expect(r1.card.interval).toBe(1)
    const r2 = await recordMove({ ...base, quality: 5 }, database)
    expect(r2.card.interval).toBe(6)
    const r3 = await recordMove({ ...base, quality: 1, result: 'mistake' }, database)
    expect(r3.card.lapses).toBe(1)
    expect(await database.attempts.count()).toBe(3)
    const day = (await database.daily.toArray())[0]
    expect(day.correct).toBe(2)
    expect(day.mistakes).toBe(1)
  })

  it('bewaart voortgang na het sluiten en heropenen van de database', async () => {
    const name = database.name
    await completeVariation({ variationId: 'v9', familyId: 'sicilian-defense', stars: 3, mistakes: 0, hints: 0, correct: 4, mode: 'practice' }, database)
    database.close()
    const reopened = new SchaakDB(name)
    await reopened.open()
    const p = await reopened.progress.get('v9')
    expect(p?.completions).toBe(1)
    expect(p?.bestStars).toBe(3)
    expect(((await reopened.meta.get('xp'))?.value as number)).toBeGreaterThan(0)
  })

  it('geeft openstaande herhalingen terug', async () => {
    await recordMove({ epd: startEpd, uci: 'e2e4', san: 'e4', side: 'white', lineUci: [], quality: 1, mode: 'practice', result: 'mistake' }, database)
    expect(await dueCards(10, database)).toHaveLength(0) // pas over 10 minuten
    await database.cards.toCollection().modify({ dueAt: Date.now() - 1 })
    expect(await dueCards(10, database)).toHaveLength(1)
  })

  it('maakt een back-up en zet hem terug', async () => {
    await completeVariation({ variationId: 'vb', familyId: 'x', stars: 2, mistakes: 1, hints: 0, correct: 2, mode: 'practice' }, database)
    const backup = await exportBackup(database)
    await database.progress.clear()
    await importBackup(backup, database)
    expect((await database.progress.get('vb'))?.bestStars).toBe(2)
  })
})

describe('repertoire', () => {
  it('bewaart een afwijkende eigen zet als alternatief en behoudt voortgang bij wisselen van hoofdzet', async () => {
    const id = (await database.repertoires.add({ name: 'Test', side: 'white', createdAt: 0, updatedAt: 0 })) as number
    await addLine(id, 'white', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], database)
    const r = await addLine(id, 'white', ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], database)
    expect(r.conflicts).toHaveLength(1)
    const lines = await repertoireLines(id, database)
    expect(lines.map(l => l.uci.join(' '))).toEqual(['e2e4 e7e5 g1f3 b8c6 f1c4'])
    // tegenstander-alternatieven worden allemaal getraind
    await addLine(id, 'white', ['e2e4', 'c7c5', 'g1f3'], database)
    expect(await repertoireLines(id, database)).toHaveLength(2)
    // hoofdzet wisselen
    const bb5 = (await database.repMoves.where('repertoireId').equals(id).toArray()).find(m => m.uci === 'f1b5')!
    await setMain(bb5.id!, database)
    const after = await repertoireLines(id, database)
    expect(after.map(l => l.uci.join(' '))).toContain('e2e4 e7e5 g1f3 b8c6 f1b5')
    expect(await database.repMoves.count()).toBe(8) // niets gewist
  })

  it('verwijdert een zet met de hele subboom', async () => {
    const id = (await database.repertoires.add({ name: 'T2', side: 'black', createdAt: 0, updatedAt: 0 })) as number
    await addLine(id, 'black', ['e2e4', 'c7c6', 'd2d4', 'd7d5'], database)
    await addLine(id, 'black', ['d2d4', 'd7d5'], database)
    const c6 = (await database.repMoves.where('repertoireId').equals(id).toArray()).find(m => m.uci === 'c7c6')!
    await deleteMove(c6.id!, database)
    const left = await database.repMoves.where('repertoireId').equals(id).toArray()
    expect(left.map(m => m.uci).sort()).toEqual(['d2d4', 'd7d5', 'e2e4'].sort())
  })
})

describe('datasetupdates', () => {
  it('wist bij een nieuwe datasetversie alleen de datacache, nooit gebruikersvoortgang', async () => {
    vi.resetModules()
    const { db } = await import('../src/lib/db')
    await db.open()
    await db.cards.put({ id: 'x|e2e4', epd: 'x', uci: 'e2e4', san: 'e4', side: 'white', familyIds: [], variationIds: [], lineUci: [], createdAt: 0, ease: 2.5, interval: 1, reps: 1, lapses: 0, correct: 1, wrong: 0, dueAt: 0, lastReviewed: 0 })
    await db.datasets.put({ key: 'family:old', version: 'v1', data: {} })
    await db.meta.put({ key: 'datasetVersion', value: 'v1' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ datasetVersion: 'v2', families: [] }) })))
    const data = await import('../src/lib/data')
    const m = await data.loadManifest()
    expect(m.datasetVersion).toBe('v2')
    expect(await db.datasets.get('family:old')).toBeUndefined()
    expect(await db.cards.get('x|e2e4')).toBeDefined()
    expect((await db.meta.get('datasetVersion'))?.value).toBe('v2')
    vi.unstubAllGlobals()
  })
})
