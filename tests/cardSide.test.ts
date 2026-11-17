import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { SchaakDB, repairCardSides, type TrainingCard } from '../src/lib/db'
import { cardLine } from '../src/lib/daily'
import { newSrsState } from '../src/lib/srs'

// Een kaart moet altijd de kant hebben die in de stelling aan zet is. Anders speelt de trainer jouw zet zelf
// (als 'tegenstander') en telt hij als goed: dat gebeurde bij 'Train mijn fouten' met een opening van de andere kleur.
const card = (lineUci: string[], side: 'white' | 'black'): TrainingCard => ({
  ...newSrsState(Date.now()), id: `x|${lineUci.length}`, epd: 'x', uci: 'g1f3', san: 'Nf3', side, familyIds: ['sicilian-defense'], variationIds: [], lineUci, createdAt: Date.now(),
})

describe('kant van een herhaalkaart', () => {
  it('cardLine gebruikt wie er aan zet is, ook als de kaart iets anders zegt', () => {
    expect(cardLine(card(['e2e4', 'c7c5'], 'black')).side).toBe('white')
    expect(cardLine(card(['e2e4'], 'white')).side).toBe('black')
  })
  it('herstelt opgeslagen kaarten met de verkeerde kant', async () => {
    const db = new SchaakDB('card-side-test')
    await db.cards.bulkPut([card(['e2e4', 'c7c5'], 'black'), card(['e2e4'], 'black')])
    expect(await repairCardSides(db)).toBe(1)
    const sides = (await db.cards.toArray()).map(c => [c.lineUci.length, c.side])
    expect(sides).toEqual(expect.arrayContaining([[2, 'white'], [1, 'black']]))
  })
})
