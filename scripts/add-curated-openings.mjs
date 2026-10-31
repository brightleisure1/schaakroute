#!/usr/bin/env node
// SchaakRoute — voegt de samengestelde openingen uit scripts/lib/curated-openings.mjs toe aan public/data.
// Draait na import-openings en import-puzzles (die de map opnieuw opbouwen) en is veilig om vaker te draaien.
//
// Partijen, statistieken en puzzels komen uit dezelfde bronnen en filters als de andere openingen.
//
// Gebruik: node scripts/add-curated-openings.mjs [--games data-raw/games-2026-09.tsv]

import { Chess } from 'chess.js'
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createZstdDecompress } from 'node:zlib'
import { CURATED_OPENINGS } from './lib/curated-openings.mjs'
import { normalizeName, slugify, variationPath } from './lib/families.mjs'

const args = process.argv.slice(2)
const gamesPath = args.includes('--games') ? args[args.indexOf('--games') + 1] : 'data-raw/games-2026-09.tsv'
const puzzlesPath = 'data-raw/lichess_db_puzzle.csv.zst'
const OUT = 'public/data'
const SPEEDS = new Set(['blitz', 'rapid', 'classical'])
const MIN_REACH = 5 // zelfde grens als PREFIX_MIN in import-openings
const REACH_MAX_PLY = 24
const PER_BUCKET = 30

const epdOf = fen => fen.split(' ').slice(0, 4).join(' ')
const sha = s => createHash('sha1').update(s).digest('hex')
const manifestPath = join(OUT, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const curatedNames = new Set(CURATED_OPENINGS.map(o => o.name))

// Eerdere uitvoering ongedaan maken
manifest.families = manifest.families.filter(f => !f.curated)
manifest.validation.report = manifest.validation.report.filter(r => !curatedNames.has(r.family))
manifest.validation.puzzles = (manifest.validation.puzzles ?? []).filter(r => !curatedNames.has(r.family))
manifest.datasetVersion = manifest.datasetVersion.replace(/-c[0-9a-f]{6}$/, '')

function play(moves) {
  const c = new Chess()
  const san = []
  const uci = []
  const epds = [epdOf(c.fen())]
  for (const t of moves.split(' ')) {
    const m = c.move(t) // gooit een fout bij een illegale zet
    san.push(m.san)
    uci.push(m.from + m.to + (m.promotion ?? ''))
    epds.push(epdOf(c.fen()))
  }
  return { san, uci, epds, epd: epds[epds.length - 1] }
}

// ---------- Partijen: per opening het aantal met de Lichess-naam, en per stelling hoe vaak die bereikt is ----------
const openings = CURATED_OPENINGS.map(o => ({ ...o, id: slugify(o.name), played: o.lines.map(l => ({ ...l, ...play(l.moves) })) }))
const wanted = new Set(openings.flatMap(o => o.played.map(l => l.epd)))
const reachCount = new Map()
const namedCount = new Map()
let usedGames = 0
for (const l of readFileSync(gamesPath, 'utf8').split('\n').slice(1)) {
  if (!l) continue
  const [speed, we, be, result, , opening, moves] = l.split('\t')
  if (!SPEEDS.has(speed) || !Number(we) || !Number(be) || !['1-0', '0-1', '1/2-1/2'].includes(result)) continue
  usedGames++
  const name = normalizeName(opening)
  namedCount.set(name, (namedCount.get(name) ?? 0) + 1)
  // Naspelen is duur; alleen partijen die in de buurt van een gezochte opening komen
  if (!openings.some(o => moves.includes(o.rootMoves.split(' ').at(-1)))) continue
  const c = new Chess()
  for (const san of moves.split(' ').slice(0, REACH_MAX_PLY)) {
    try { c.move(san) } catch { break }
    const e = epdOf(c.fen())
    if (wanted.has(e)) reachCount.set(e, (reachCount.get(e) ?? 0) + 1)
  }
}
const reachOf = epd => ((reachCount.get(epd) ?? 0) >= MIN_REACH ? reachCount.get(epd) : null)
if (usedGames !== manifest.source.games.usedGames) throw new Error(`Andere steekproef: ${usedGames} partijen, manifest zegt ${manifest.source.games.usedGames}`)

// ---------- Puzzels: zelfde selectie als import-puzzles ----------
const puzzleCandidates = new Map(openings.map(o => [o.puzzleTag, []]))
const rl = createInterface({ input: createReadStream(puzzlesPath).pipe(createZstdDecompress()) })
for await (const line of rl) {
  const [id, fen, moves, rating, rd, popularity, plays, themes, gameUrl, openingTags] = line.split(',')
  if (!openingTags || !themes.includes('opening')) continue
  const list = openingTags.split(' ').map(t => puzzleCandidates.get(t)).find(Boolean)
  if (!list) continue
  if (Number(rd) >= 100 || Number(popularity) < 70 || Number(plays) < 50) continue
  const ply = Number((gameUrl.match(/#(\d+)$/) || [])[1] ?? 99)
  if (ply > 30) continue
  list.push({ id, fen, moves: moves.split(' '), rating: Number(rating), popularity: Number(popularity), plays: Number(plays), themes: themes.split(' '), gameUrl, ply })
}

// ---------- Per opening: bestanden en manifest ----------
const hasher = createHash('sha1')
for (const o of openings) {
  const famTotal = namedCount.get(normalizeName(o.lichessName)) ?? 0
  const moveOrders = o.rootMoveOrders.map(play)
  const variations = o.played.map(l => {
    const path = variationPath(l.name, o.name)
    const reach = reachOf(l.epd)
    const freq = Number(((reach ?? 0) / Math.max(1, famTotal)).toFixed(5))
    const size = path.length === 0 ? 'base' : freq >= 0.01 ? 'main' : freq >= 0.0005 ? 'side' : 'rare'
    const tags = [size, 'gambit']
    if (/Trap/.test(l.name)) tags.push('tactical')
    if (path.length >= 2) tags.push('sub')
    const isRoot = path.length === 0
    return {
      id: sha(l.name + '|' + l.uci.join(' ')).slice(0, 12),
      eco: o.eco,
      name: l.name,
      path,
      san: l.san,
      uci: l.uci,
      epd: l.epd,
      ...(isRoot ? { moveOrders: moveOrders.filter(m => m.epd === l.epd).map(m => ({ san: m.san, uci: m.uci })) } : {}),
      reach,
      namedGames: isRoot ? famTotal : 0,
      tags,
      freq,
      level: l.level,
    }
  })
  const lessons = [...new Set(variations.map(v => v.level))].sort((a, b) => a - b).map((level, i) => ({
    id: `${o.id}-l${level}-${i + 1}`,
    level,
    title: o.lessons[level],
    variationIds: variations.filter(v => v.level === level).map(v => v.id),
  }))

  // Statistieken: de stellingen op de lijnen plus praktische vervolgen, overgenomen uit de bronopening
  const source = JSON.parse(readFileSync(join(OUT, 'stats', `${o.statsFrom}.json`), 'utf8'))
  const positions = {}
  for (const epd of o.played.flatMap(l => l.epds)) if (source.positions[epd]) positions[epd] = source.positions[epd]
  const frontier = [...new Set(o.played.map(l => l.epd))].map(e => [e, 0])
  while (frontier.length) {
    const [epd, d] = frontier.pop()
    const p = source.positions[epd]
    if (!p) continue
    positions[epd] = p
    if (d >= 6) continue
    for (const m of p.m) {
      if (m[2] / p.n < 0.05) continue
      const c = new Chess(`${epd} 0 1`)
      c.move({ from: m[0].slice(0, 2), to: m[0].slice(2, 4), promotion: m[0][4] })
      frontier.push([epdOf(c.fen()), d + 1])
    }
  }

  // Puzzels: per ratingklasse van 200 punten de populairste, alleen als de kant van de opening oplost
  const solver = o.side === 'white' ? 'b' : 'w' // FEN = stelling vóór de fout van de tegenstander
  const buckets = new Map()
  const candidates = puzzleCandidates.get(o.puzzleTag).filter(p => p.fen.split(' ')[1] === solver)
  for (const p of candidates) {
    const b = Math.floor(p.rating / 200) * 200
    buckets.set(b, [...(buckets.get(b) ?? []), p])
  }
  const puzzles = []
  for (const [, list] of [...buckets.entries()].sort((x, y) => x[0] - y[0])) {
    list.sort((x, y) => y.popularity - x.popularity || y.plays - x.plays)
    for (const p of list.slice(0, PER_BUCKET)) {
      const c = new Chess(p.fen)
      const san = p.moves.map(u => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
      puzzles.push({ id: p.id, fen: p.fen, uci: p.moves, san, rating: p.rating, themes: p.themes.filter(t => t !== 'opening'), gameUrl: p.gameUrl, ply: p.ply, variation: o.lichessName, plays: p.plays })
    }
  }

  const sideFamilies = manifest.families.filter(f => f.side === o.side)
  const root = play(o.rootMoves)
  const summary = {
    id: o.id,
    name: o.name,
    side: o.side,
    rank: sideFamilies.length + 1,
    curated: true,
    ecoRange: o.eco,
    ecoCodes: [o.eco],
    rootSan: root.san,
    rootUci: root.uci,
    rootEpd: root.epd,
    games: famTotal,
    share: Number((famTotal / usedGames).toFixed(5)),
    variationCount: variations.length,
    namedCount: variations.length,
    subvariationCount: variations.filter(v => v.tags.includes('sub')).length,
    gambitCount: variations.length,
    lessonCount: lessons.length,
    maxPlies: Math.max(...variations.map(v => v.san.length)),
  }

  const famJson = JSON.stringify({ family: summary, variations, lessons })
  const statsJson = JSON.stringify({ bands: source.bands, totalGames: source.totalGames, positions })
  const puzzleJson = JSON.stringify({ family: o.name, source: 'Lichess puzzle database (CC0), Stockfish-geverifieerd', puzzles })
  hasher.update(famJson).update(statsJson).update(puzzleJson)
  writeFileSync(join(OUT, 'families', `${o.id}.json`), famJson)
  writeFileSync(join(OUT, 'stats', `${o.id}.json`), statsJson)
  writeFileSync(join(OUT, 'puzzles', `${o.id}.json`), puzzleJson)

  // Achteraan bij de eigen kleur, zodat de populairste per kleur vooraan blijft
  manifest.families.splice(manifest.families.lastIndexOf(sideFamilies.at(-1)) + 1, 0, summary)
  manifest.validation.report.push({ family: o.name, sourceRows: variations.length, variations: variations.length, distinctNames: variations.length, duplicatesMerged: 0, withMoveOrders: 1, linesWithTransposition: 0, statPositions: Object.keys(positions).length })
  manifest.validation.puzzles.push({ family: o.name, candidates: candidates.length, selected: puzzles.length })
  console.log(`${o.name}: ${famTotal} partijen, ${variations.length} lijnen, ${Object.keys(positions).length} stellingen met statistieken, ${puzzles.length} puzzels`)
  for (const v of variations) console.log(`  L${v.level} ${v.name}: ${v.san.length} ply, bereikt ${v.reach ?? '<5'} keer`)
}

const note = 'Samengestelde openingen (Alien Gambit) staan buiten de top 10. Lichess benoemt alleen de eindstelling; de vervolgen komen uit de partijensteekproef en zijn beoordeeld met Stockfish. Hun partijen tellen ook mee bij de opening waarin ze vallen.'
manifest.method = [...manifest.method.filter(m => m !== note), note]
manifest.datasetVersion += '-c' + hasher.digest('hex').slice(0, 6)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
console.log('dataset', manifest.datasetVersion)
