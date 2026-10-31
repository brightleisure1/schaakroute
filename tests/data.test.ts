// Controleert de geïmporteerde dataset: selectie, volledigheid, legaliteit, bomen, lessen en statistieken.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
// @ts-expect-error – gedeelde JS-module van het importscript
import { makeFamilyResolver, normalizeName, GENERIC_FAMILIES } from '../scripts/lib/families.mjs'
import type { FamilyFile, Manifest, PuzzleFile, RankingEntry, StatsFile } from '../src/lib/types'

const DATA = join(__dirname, '..', 'public', 'data')
const read = <T>(p: string): T => JSON.parse(readFileSync(join(DATA, p), 'utf8'))
const manifest = read<Manifest>('manifest.json')
const families = manifest.families.map(f => read<FamilyFile>(`families/${f.id}.json`))
const epdOf = (fen: string) => fen.split(' ').slice(0, 4).join(' ')

describe('selectie van de 20 openingen', () => {
  const selected = manifest.families.filter(f => !f.curated)

  it('heeft precies 10 witte en 10 zwarte families', () => {
    expect(selected.filter(f => f.side === 'white')).toHaveLength(10)
    expect(selected.filter(f => f.side === 'black')).toHaveLength(10)
    expect(new Set(selected.map(f => f.id)).size).toBe(20)
    expect(new Set(manifest.families.map(f => f.id)).size).toBe(manifest.families.length)
  })

  it('is de top 10 (zonder verzamelnamen) van de ranglijst, gesorteerd op aantal partijen', () => {
    const ranking = read<{ white: RankingEntry[]; black: RankingEntry[] }>('ranking.json')
    for (const side of ['white', 'black'] as const) {
      const list = ranking[side]
      for (let i = 1; i < list.length; i++) expect(list[i - 1].games).toBeGreaterThanOrEqual(list[i].games)
      const top = list.filter(e => !e.excluded).slice(0, 10).map(e => e.family)
      expect(selected.filter(f => f.side === side).map(f => f.name)).toEqual(top)
      for (const e of list.filter(e => e.excluded)) expect(Object.keys(GENERIC_FAMILIES)).toContain(e.family)
    }
  })

  it('telt iedere partij in precies één familie (geen dubbeltellingen)', () => {
    const ranking = read<{ white: RankingEntry[]; black: RankingEntry[] }>('ranking.json')
    const names = [...ranking.white, ...ranking.black].map(e => e.family)
    expect(new Set(names).size).toBe(names.length)
    const total = [...ranking.white, ...ranking.black].reduce((a, e) => a + e.games, 0)
    expect(total).toBeLessThanOrEqual(manifest.source.games.usedGames)
  })

  it('heeft 0 illegale lijnen in de volledige Lichess-bron', () => {
    expect(manifest.source.openings.illegal).toBe(0)
    expect(manifest.validation.illegalLines).toHaveLength(0)
  })
})

describe('volledigheid van de import (alle benoemde varianten)', () => {
  const rawDir = join(__dirname, '..', 'data-raw', 'chess-openings', manifest.source.openings.ref)
  it.skipIf(!existsSync(rawDir))('bevat iedere bronregel van iedere geselecteerde familie', () => {
    const rows: { eco: string; name: string; pgn: string }[] = []
    for (const f of ['a', 'b', 'c', 'd', 'e']) {
      for (const l of readFileSync(join(rawDir, `${f}.tsv`), 'utf8').split('\n').slice(1)) {
        if (!l) continue
        const [eco, name, pgn] = l.split('\t')
        rows.push({ eco, name: normalizeName(name), pgn })
      }
    }
    const familyOf = makeFamilyResolver(rows.map(r => r.name))
    for (const file of families.filter(f => !f.family.curated)) {
      const source = rows.filter(r => familyOf(r.name) === file.family.name)
      const report = manifest.validation.report.find(r => r.family === file.family.name)!
      expect(source.length).toBe(report.sourceRows)
      expect(file.variations.length + report.duplicatesMerged).toBe(source.length)
      const names = new Set(file.variations.map(v => v.name))
      for (const r of source) expect(names.has(r.name)).toBe(true)
    }
  })

  it('heeft geen kunstmatige limiet en de aantallen kloppen met de interface-data', () => {
    for (const file of families) {
      expect(file.family.variationCount).toBe(file.variations.length)
      expect(file.family.namedCount).toBe(new Set(file.variations.map(v => v.name)).size)
      expect(file.family.subvariationCount).toBe(file.variations.filter(v => v.tags.includes('sub')).length)
    }
    const sicilian = families.find(f => f.family.name === 'Sicilian Defense')!
    expect(sicilian.variations.length).toBeGreaterThan(300)
    const names = sicilian.variations.map(v => v.name).join('|')
    for (const n of ['Najdorf Variation', 'Dragon Variation', 'Accelerated Dragon', 'Sveshnikov Variation', 'Scheveningen Variation', 'Alapin Variation', 'Closed', 'Rossolimo']) expect(names).toContain(n)
  })
})

describe('legaliteit, ID\'s en bomen', () => {
  for (const file of families) {
    it(`${file.family.name}: alle ${file.variations.length} lijnen zijn legaal en consistent`, () => {
      const ids = new Set<string>()
      const keys = new Set<string>()
      for (const v of file.variations) {
        expect(ids.has(v.id)).toBe(false)
        ids.add(v.id)
        const key = v.name + '|' + v.epd
        expect(keys.has(key)).toBe(false) // geen dubbele varianten
        keys.add(key)
        const c = new Chess()
        v.uci.forEach((u, i) => {
          const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
          expect(m.san).toBe(v.san[i])
        })
        expect(epdOf(c.fen())).toBe(v.epd)
        expect(v.uci.length).toBeGreaterThan(0)
        // boom: pad komt overeen met de naam
        if (v.path.length) expect(v.tags).not.toContain('base')
        for (const part of v.path) expect(v.name).toContain(part.replace(/^with /, ''))
        // alle lijnen in de familie beginnen bij de eigen kant óf zijn transposities ernaartoe
        expect(v.level).toBeGreaterThanOrEqual(1)
        expect(v.level).toBeLessThanOrEqual(5)
        for (const t of v.transposesTo ?? []) {
          const a = new Chess()
          for (const u of t.uci) a.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
          const b = new Chess()
          for (const u of v.uci.slice(0, t.ply)) b.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
          expect(epdOf(a.fen())).toBe(epdOf(b.fen())) // echte transpositie: zelfde stelling
          expect(t.uci.join(' ')).not.toBe(v.uci.slice(0, t.ply).join(' '))
        }
      }
    })

    it(`${file.family.name}: iedere variant zit in precies één les`, () => {
      const seen = new Map<string, number>()
      for (const l of file.lessons) {
        expect(l.variationIds.length).toBeGreaterThan(0)
        expect(l.variationIds.length).toBeLessThanOrEqual(6)
        for (const id of l.variationIds) seen.set(id, (seen.get(id) ?? 0) + 1)
      }
      expect(seen.size).toBe(file.variations.length)
      for (const n of seen.values()) expect(n).toBe(1)
    })
  }
})

describe('Alien Gambit (samengestelde opening)', () => {
  const file = families.find(f => f.family.id === 'alien-gambit')!

  it('staat bij wit, na de 10 populairste en vóór zwart', () => {
    expect(file.family.side).toBe('white')
    expect(file.family.curated).toBe(true)
    expect(manifest.families.map(f => f.id).indexOf('alien-gambit')).toBe(10)
  })

  it('begint elke lijn met het offer op f7, of komt daar via een andere zetvolgorde', () => {
    expect(file.family.rootSan.at(-1)).toBe('Nxf7')
    for (const v of file.variations) expect(v.uci.slice(0, file.family.rootUci.length)).toEqual(file.family.rootUci)
    const root = file.variations.find(v => v.path.length === 0)!
    expect(root.name).toBe('Alien Gambit')
    for (const m of root.moveOrders ?? []) {
      const c = new Chess()
      for (const san of m.san) c.move(san)
      expect(epdOf(c.fen())).toBe(root.epd)
    }
    expect(root.moveOrders).toHaveLength(2)
  })

  it('wint het stuk terug in de valstrik na 7...Bg4', () => {
    const trap = file.variations.find(v => v.name === 'Alien Gambit: Bg4 Trap')!
    expect(trap.tags).toContain('tactical')
    expect(trap.san.slice(13, 19)).toEqual(['Bg4', 'Ne5+', 'Ke8', 'Nxg4', 'Nxg4', 'Qxg4'])
  })

  it('gaat in elke lijn verder dan het offer en eindigt op een zet van wit', () => {
    for (const v of file.variations) {
      expect(v.uci.length).toBeGreaterThan(file.family.rootUci.length + 2)
      expect(v.uci.length % 2).toBe(1)
    }
    expect(file.lessons.length).toBeGreaterThan(0)
  })

  it('leert per stelling één witte zet, behalve de bewuste keuze na 6...Kxf7', () => {
    const moves = new Map<string, Set<string>>()
    for (const v of file.variations) {
      const c = new Chess()
      for (const san of v.san) {
        const epd = epdOf(c.fen())
        if (c.turn() === 'w') moves.set(epd, (moves.get(epd) ?? new Set()).add(san))
        c.move(san)
      }
    }
    const choices = [...moves.values()].filter(s => s.size > 1).map(s => [...s].sort())
    expect(choices).toEqual([['Bc4+', 'Nf3']])
  })

  it('telt dezelfde partijen als de Lichess-naam in de Caro-Kann', () => {
    const caro = families.find(f => f.family.id === 'caro-kann-defense')!
    expect(caro.variations.find(v => v.name === 'Caro-Kann Defense: Alien Gambit')?.namedGames).toBe(file.family.games)
  })
})

describe('positiestatistieken en puzzels', () => {
  it('statistieken bevatten alleen legale zetten en consistente aantallen', () => {
    for (const f of manifest.families.slice(0, 6)) {
      const stats = read<StatsFile>(`stats/${f.id}.json`)
      for (const [epd, p] of Object.entries(stats.positions).slice(0, 300)) {
        const sum = p.m.reduce((a, m) => a + (m[2] as number), 0)
        expect(sum).toBeLessThanOrEqual(p.n)
        const c = new Chess(epd + ' 0 1')
        for (const m of p.m) {
          const u = m[0]
          const mv = new Chess(c.fen()).move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
          expect(mv.san).toBe(m[1])
          const [n, w, d, b] = [m[2], m[3], m[4], m[5]] as number[]
          expect(w + d + b).toBe(n)
        }
      }
    }
  })

  it('puzzels zijn legaal en de oplosser is de kant van de opening', () => {
    for (const f of manifest.families) {
      const pf = read<PuzzleFile>(`puzzles/${f.id}.json`)
      expect(pf.puzzles.length).toBeGreaterThan(50)
      for (const p of pf.puzzles.slice(0, 60)) {
        const c = new Chess(p.fen)
        const solver = c.turn() === 'w' ? 'black' : 'white'
        expect(solver).toBe(f.side)
        p.uci.forEach((u, i) => expect(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san).toBe(p.san[i]))
      }
    }
  })
})
