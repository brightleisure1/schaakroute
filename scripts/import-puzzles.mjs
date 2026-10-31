#!/usr/bin/env node
// SchaakRoute — selecteert tactische openingspuzzels uit de openbare Lichess-puzzeldatabase
// (https://database.lichess.org/#puzzles, CC0). Iedere puzzel komt uit een echte partij; de oplossing
// is door Lichess met Stockfish geverifieerd. Wij verzinnen dus geen combinaties.
//
// Selectie per familie: thema 'opening', de oplossende kant = de kant van de familie (jij straft een fout
// van de tegenstander af), ply in de partij <= 30, RatingDeviation < 100, Popularity >= 70, NbPlays >= 50.
// Per ratingklasse van 200 punten worden de populairste puzzels bewaard (max. 30 per klasse).
//
// Gebruik: node scripts/import-puzzles.mjs [data-raw/lichess_db_puzzle.csv.zst]

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { Chess } from 'chess.js'
import { makeFamilyResolver, normalizeName, prefixOf } from './lib/families.mjs'

const src = process.argv[2] ?? 'data-raw/lichess_db_puzzle.csv.zst'
const OUT = 'public/data'
const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'))
// Samengestelde openingen krijgen hun puzzels van add-curated-openings
const selected = new Map(manifest.families.filter(f => !f.curated).map(f => [f.name, f]))
const PER_BUCKET = 30

// Alle Lichess-namen uit de geïmporteerde ref, om puzzel-labels terug te vertalen naar onze families
const ref = manifest.source.openings.ref
const names = []
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = readFileSync(join('data-raw', 'chess-openings', ref, `${f}.tsv`), 'utf8').split('\n').slice(1)
  for (const l of lines) if (l) names.push(normalizeName(l.split('\t')[1]))
}
const familyOf = makeFamilyResolver(names)
const tagify = s => s.replace(/'/g, '').replace(/[:,]/g, '').replace(/\s+/g, '_')
const tagToName = new Map()
for (const n of names) {
  const prefix = prefixOf(n)
  const first = n.includes(':') ? n.slice(n.indexOf(':') + 1).split(',')[0].trim() : ''
  tagToName.set(tagify(prefix), prefix)
  if (first) tagToName.set(tagify(prefix + ' ' + first), n.slice(0, n.indexOf(':')) + ': ' + first)
}
// Oudere namen in de puzzeldatabase
const LEGACY = { Russian_Game: "Petrov's Defense" }

const buckets = new Map() // family -> Map(bucket -> puzzles[])
const counts = new Map()
let scanned = 0

const zstd = spawn('zstd', ['-dc', src])
const rl = createInterface({ input: zstd.stdout })
let header = null
for await (const line of rl) {
  if (!header) { header = line.split(','); continue }
  scanned++
  const [id, fen, moves, rating, rd, popularity, plays, themes, gameUrl, openingTags] = line.split(',')
  if (!themes.includes('opening') || !openingTags) continue
  if (Number(rd) >= 100 || Number(popularity) < 70 || Number(plays) < 50) continue
  const ply = Number((gameUrl.match(/#(\d+)$/) || [])[1] ?? 99)
  if (ply > 30) continue
  const [famTag, varTag] = openingTags.split(' ')
  let lichessName = (varTag && tagToName.get(varTag)) || tagToName.get(famTag) || LEGACY[famTag]
  if (!lichessName) continue
  const fam = familyOf(lichessName)
  const info = selected.get(fam)
  if (!info) continue
  // FEN = stelling vóór de fout van de tegenstander; de oplosser is de andere kant
  const opponentToMove = fen.split(' ')[1]
  const solver = opponentToMove === 'w' ? 'black' : 'white'
  if (solver !== info.side) continue
  const r = Number(rating)
  const bucket = Math.floor(r / 200) * 200
  if (!buckets.has(fam)) buckets.set(fam, new Map())
  const b = buckets.get(fam)
  if (!b.has(bucket)) b.set(bucket, [])
  b.get(bucket).push({ id, fen, moves: moves.split(' '), rating: r, popularity: Number(popularity), plays: Number(plays), themes: themes.split(' '), gameUrl, tags: openingTags.split(' '), ply })
  counts.set(fam, (counts.get(fam) ?? 0) + 1)
  // geheugen beperken: houd per klasse alleen de populairste kandidaten
  if (b.get(bucket).length > PER_BUCKET * 8) {
    b.get(bucket).sort((x, y) => y.popularity - x.popularity || y.plays - x.plays)
    b.get(bucket).length = PER_BUCKET * 4
  }
}

mkdirSync(join(OUT, 'puzzles'), { recursive: true })
const report = []
const hasher = createHash('sha1')
for (const [fam, info] of selected) {
  const b = buckets.get(fam) ?? new Map()
  const out = []
  for (const [, list] of [...b.entries()].sort((x, y) => x[0] - y[0])) {
    list.sort((x, y) => y.popularity - x.popularity || y.plays - x.plays)
    for (const p of list.slice(0, PER_BUCKET)) {
      // controle: alle puzzelzetten moeten legaal zijn
      const c = new Chess(p.fen)
      let ok = true
      const san = []
      for (const u of p.moves) {
        try { san.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san) } catch { ok = false; break }
      }
      if (!ok) continue
      const varName = p.tags[1] ? (tagToName.get(p.tags[1]) ?? null) : null
      out.push({ id: p.id, fen: p.fen, uci: p.moves, san, rating: p.rating, themes: p.themes.filter(t => t !== 'opening'), gameUrl: p.gameUrl, ply: p.ply, variation: varName, plays: p.plays })
    }
  }
  const json = JSON.stringify({ family: fam, source: 'Lichess puzzle database (CC0), Stockfish-geverifieerd', puzzles: out })
  hasher.update(json)
  writeFileSync(join(OUT, 'puzzles', `${info.id}.json`), json)
  report.push({ family: fam, candidates: counts.get(fam) ?? 0, selected: out.length })
}
manifest.source.puzzles = { url: 'https://database.lichess.org/lichess_db_puzzle.csv.zst', license: 'CC0-1.0', scanned, perBucket: PER_BUCKET }
manifest.validation.puzzles = report
// datasetversie ook laten afhangen van de puzzels, zodat de IndexedDB-cache ververst wordt
manifest.datasetVersion = manifest.datasetVersion.replace(/-p[0-9a-f]{6}$/, '') + '-p' + hasher.digest('hex').slice(0, 6)
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`${scanned} puzzels gescand`)
console.table(report)
