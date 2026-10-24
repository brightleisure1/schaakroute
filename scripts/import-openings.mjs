#!/usr/bin/env node
// SchaakRoute — reproduceerbare import van de openbare Lichess-openingsdatabase.
//
// 1. Haalt a.tsv … e.tsv op uit github.com/lichess-org/chess-openings op een vaste commit.
// 2. Speelt iedere regel na met chess.js (legaliteitscontrole, SAN/UCI/EPD per zet).
// 3. Deelt namen in families in (regels: scripts/lib/families.mjs).
// 4. Bepaalt populariteit uit een steekproef van echte Lichess-partijen (scripts/sample-games.mjs).
// 5. Selecteert de 10 populairste families voor wit en voor zwart.
// 6. Schrijft per familie ALLE benoemde varianten + boom + lessen + positiestatistieken naar public/data.
//
// Gebruik: node scripts/import-openings.mjs [--ref <commit|master>] [--games data-raw/games-2026-09.tsv]

import { Chess } from 'chess.js'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { GENERIC_FAMILIES, makeFamilyResolver, normalizeName, slugify, variationPath } from './lib/families.mjs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
)
const PINNED_REF = 'a6189a30dc273ccb21fc2536a9a2fefd5592a67a' // lichess-org/chess-openings, 2026-10-06
const ref = args.ref ?? PINNED_REF
const gamesPath = args.games ?? 'data-raw/games-2026-09.tsv'
const SPEEDS = new Set(['blitz', 'rapid', 'classical'])
const PER_SIDE = 10
const STATS_MAX_PLY = 24
const PREFIX_MIN = 5 // minimaal aantal partijen om een zettenreeks te blijven volgen
const STATS_MIN = 20 // minimaal aantal partijen om een stelling in de statistieken op te nemen
const OUT = 'public/data'

const epdOf = fen => fen.split(' ').slice(0, 4).join(' ')
const sha = s => createHash('sha1').update(s).digest('hex')

// ---------- 1. Lichess-openingsbestanden ----------
const rawDir = join('data-raw', 'chess-openings', ref)
mkdirSync(rawDir, { recursive: true })
const rows = []
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const p = join(rawDir, `${f}.tsv`)
  if (!existsSync(p)) {
    const url = `https://raw.githubusercontent.com/lichess-org/chess-openings/${ref}/${f}.tsv`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Download mislukt: ${url} (${res.status})`)
    writeFileSync(p, await res.text())
    console.log('gedownload', url)
  }
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean)
  const header = lines.shift().split('\t')
  if (header[0] !== 'eco' || header[1] !== 'name' || header[2] !== 'pgn') throw new Error('Onverwacht formaat in ' + p)
  for (const l of lines) {
    const [eco, name, pgn] = l.split('\t')
    rows.push({ eco, rawName: name, name: normalizeName(name), pgn, file: f })
  }
}
const fileHash = sha(['a', 'b', 'c', 'd', 'e'].map(f => readFileSync(join(rawDir, `${f}.tsv`), 'utf8')).join('\n')).slice(0, 12)
console.log(`${rows.length} regels ingelezen (ref ${ref.slice(0, 10)}, hash ${fileHash})`)

// ---------- 2. Naspelen + legaliteitscontrole ----------
const illegal = []
for (const r of rows) {
  const chess = new Chess()
  const tokens = r.pgn.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean)
  r.san = []
  r.uci = []
  r.epds = [epdOf(chess.fen())]
  try {
    for (const t of tokens) {
      const m = chess.move(t)
      r.san.push(m.san)
      r.uci.push(m.from + m.to + (m.promotion ?? ''))
      r.epds.push(epdOf(chess.fen()))
    }
    r.epd = r.epds[r.epds.length - 1]
    r.ok = true
  } catch (e) {
    r.ok = false
    illegal.push({ name: r.name, pgn: r.pgn, error: String(e.message ?? e) })
  }
}
console.log(`legaliteitscontrole: ${rows.length - illegal.length} legaal, ${illegal.length} illegaal`)

// ---------- 3. Families ----------
const familyOf = makeFamilyResolver(rows.map(r => r.name))
for (const r of rows) r.family = familyOf(r.name)
const famRows = new Map()
for (const r of rows) {
  if (!r.ok) continue
  if (!famRows.has(r.family)) famRows.set(r.family, [])
  famRows.get(r.family).push(r)
}
function sideOf(list, fam) {
  const shortest = [...list].sort((a, b) => a.san.length - b.san.length || a.eco.localeCompare(b.eco))[0]
  // Verdedigingen zijn per definitie keuzes van zwart (Lichess benoemt bijv. de King's Indian Defense pas na
  // de derde zet van wit). Overige namen: de kant die de laatste zet van de kortste lijn doet.
  const side = /Defen[cs]e$/.test(fam) ? 'black' : shortest.san.length % 2 === 1 ? 'white' : 'black'
  return { side, root: shortest }
}

// ---------- 4. Partijensteekproef ----------
if (!existsSync(gamesPath)) throw new Error(`Geen partijensteekproef gevonden (${gamesPath}). Draai eerst: npm run data:games`)
const sampleMeta = JSON.parse(readFileSync(gamesPath.replace(/\.tsv$/, '.meta.json'), 'utf8'))
const bandOf = avg => (avg < 1200 ? 0 : avg < 1600 ? 1 : avg < 2000 ? 2 : 3)
const BANDS = ['<1200', '1200-1599', '1600-1999', '2000+']
const games = []
const famGames = new Map()
const nameGames = new Map()
const bandTotals = [0, 0, 0, 0]
const speedTotals = {}
{
  const lines = readFileSync(gamesPath, 'utf8').split('\n')
  lines.shift()
  for (const l of lines) {
    if (!l) continue
    const [speed, we, be, result, , opening, moves] = l.split('\t')
    if (!SPEEDS.has(speed)) continue
    const w = Number(we), b = Number(be)
    if (!w || !b) continue
    const band = bandOf((w + b) / 2)
    const res = result === '1-0' ? 0 : result === '0-1' ? 2 : result === '1/2-1/2' ? 1 : -1
    if (res < 0) continue
    const name = normalizeName(opening)
    const fam = familyOf(name)
    famGames.set(fam, (famGames.get(fam) ?? 0) + 1)
    nameGames.set(name, (nameGames.get(name) ?? 0) + 1)
    bandTotals[band]++
    speedTotals[speed] = (speedTotals[speed] ?? 0) + 1
    games.push({ moves: moves.split(' '), res, band })
  }
}
const totalGames = games.length
console.log(`${totalGames} partijen (blitz/rapid/classical) in steekproef`)

// ---------- 5. Ranglijst ----------
const ranking = { white: [], black: [] }
for (const [fam, list] of famRows) {
  const { side, root } = sideOf(list, fam)
  ranking[side].push({
    family: fam,
    games: famGames.get(fam) ?? 0,
    share: (famGames.get(fam) ?? 0) / totalGames,
    lines: list.length,
    rootPgn: root.pgn,
    excluded: GENERIC_FAMILIES[fam] ?? null,
  })
}
const unmatched = [...famGames.keys()].filter(f => !famRows.has(f))
for (const side of ['white', 'black']) {
  ranking[side].sort((a, b) => b.games - a.games)
  let rank = 0
  for (const e of ranking[side]) e.rank = e.excluded ? null : ++rank
}
const selected = ['white', 'black'].flatMap(side =>
  ranking[side].filter(e => !e.excluded).slice(0, PER_SIDE).map(e => ({ ...e, side })),
)
console.log('Geselecteerd:')
for (const s of selected) console.log(`  ${s.side.padEnd(5)} #${s.rank} ${s.family} — ${s.games} partijen (${(s.share * 100).toFixed(2)}%)`)

// ---------- 6. Positiestatistieken uit echte partijen ----------
// Zettenreeksen ply voor ply volgen zolang ze minstens PREFIX_MIN keer voorkomen; daarna per stelling (EPD)
// samenvoegen zodat verschillende zetvolgordes (transposities) bij elkaar opgeteld worden.
console.log('positiestatistieken berekenen…')
const prefixNode = new Map() // prefix -> { fen, epd, n, moves: Map(san -> {n, r:[w,d,b], bands:[[n,w,d,b]x4]}) }
const rootChess = new Chess()
prefixNode.set('', { fen: rootChess.fen(), epd: epdOf(rootChess.fen()), n: 0, moves: new Map() })
let alive = games.map(() => '')
for (let ply = 0; ply < STATS_MAX_PLY; ply++) {
  const childCount = new Map()
  for (let gi = 0; gi < games.length; gi++) {
    const pre = alive[gi]
    if (pre === null) continue
    const g = games[gi]
    const node = prefixNode.get(pre)
    if (!node || ply >= g.moves.length) { alive[gi] = null; continue }
    const san = g.moves[ply]
    node.n++
    let m = node.moves.get(san)
    if (!m) node.moves.set(san, (m = { n: 0, r: [0, 0, 0], bands: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }))
    m.n++
    m.r[g.res]++
    m.bands[g.band][0]++
    m.bands[g.band][g.res + 1]++
    const child = pre ? pre + ' ' + san : san
    childCount.set(child, (childCount.get(child) ?? 0) + 1)
    alive[gi] = child
  }
  let kept = 0
  for (const [child, n] of childCount) {
    if (n < PREFIX_MIN) continue
    const cut = child.lastIndexOf(' ')
    const parent = prefixNode.get(cut === -1 ? '' : child.slice(0, cut))
    const san = cut === -1 ? child : child.slice(cut + 1)
    const c = new Chess(parent.fen)
    let mv
    try { mv = c.move(san) } catch { continue }
    parent.moves.get(san).uci = mv.from + mv.to + (mv.promotion ?? '')
    parent.moves.get(san).childEpd = epdOf(c.fen())
    prefixNode.set(child, { fen: c.fen(), epd: epdOf(c.fen()), n: 0, moves: new Map() })
    kept++
  }
  for (let gi = 0; gi < games.length; gi++) if (alive[gi] !== null && !prefixNode.has(alive[gi])) alive[gi] = null
  console.log(`  ply ${ply + 1}: ${kept} zettenreeksen gevolgd`)
}
// Samenvoegen per EPD
const posStats = new Map() // epd -> { n, moves: Map(uci -> agg) }
for (const node of prefixNode.values()) {
  if (node.n === 0) continue
  let p = posStats.get(node.epd)
  if (!p) posStats.set(node.epd, (p = { n: 0, moves: new Map() }))
  p.n += node.n
  for (const [san, m] of node.moves) {
    if (!m.uci) {
      // zet die te zelden voorkwam om verder te volgen: wel meetellen, UCI bepalen
      const c = new Chess(node.fen)
      try { const mv = c.move(san); m.uci = mv.from + mv.to + (mv.promotion ?? ''); m.childEpd = epdOf(c.fen()) } catch { continue }
    }
    let a = p.moves.get(m.uci)
    if (!a) p.moves.set(m.uci, (a = { san, uci: m.uci, childEpd: m.childEpd, n: 0, r: [0, 0, 0], bands: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }))
    a.n += m.n
    for (let i = 0; i < 3; i++) a.r[i] += m.r[i]
    for (let b = 0; b < 4; b++) for (let i = 0; i < 4; i++) a.bands[b][i] += m.bands[b][i]
  }
}
console.log(`  ${posStats.size} unieke stellingen met statistieken`)
const reachOf = epd => posStats.get(epd)?.n ?? null

// ---------- 7. Per familie: varianten, boom, transposities, lessen ----------
const epdToLines = new Map()
for (const r of rows) if (r.ok) {
  if (!epdToLines.has(r.epd)) epdToLines.set(r.epd, [])
  epdToLines.get(r.epd).push(r)
}

// Transposities: dezelfde stelling (EPD) bereikt via verschillende zetvolgordes, over de hele Lichess-dataset
const epdPrefixes = new Map() // epd -> Map(prefixUci -> naam van de lijn)
for (const r of rows) if (r.ok) {
  for (let i = 1; i <= r.uci.length; i++) {
    const e = r.epds[i]
    if (!epdPrefixes.has(e)) epdPrefixes.set(e, new Map())
    const pre = r.uci.slice(0, i).join(' ')
    if (!epdPrefixes.get(e).has(pre)) epdPrefixes.get(e).set(pre, r.name)
  }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'families'), { recursive: true })
mkdirSync(join(OUT, 'stats'), { recursive: true })
const report = []
const familySummaries = []
const outHasher = createHash('sha1') // versie verandert ook als de verwerking (niet de bron) verandert

for (const sel of selected) {
  const fam = sel.family
  const slug = slugify(fam)
  const list = famRows.get(fam)
  const famTotal = famGames.get(fam) ?? 0

  // Ontdubbelen: zelfde genormaliseerde naam + zelfde eindstelling = alternatieve zetvolgorde
  const byKey = new Map()
  let duplicatesMerged = 0
  for (const r of list) {
    const key = r.name + '|' + r.epd
    if (byKey.has(key)) {
      const main = byKey.get(key)
      if (r.uci.join() === main.uci.join()) { duplicatesMerged++; continue }
      main.moveOrders.push({ san: r.san, uci: r.uci })
      duplicatesMerged++
      continue
    }
    byKey.set(key, { ...r, moveOrders: [] })
  }
  const lines = [...byKey.values()].sort((a, b) => a.eco.localeCompare(b.eco) || a.san.length - b.san.length || a.name.localeCompare(b.name))
  const nameCount = new Map()
  for (const r of lines) nameCount.set(r.name, (nameCount.get(r.name) ?? 0) + 1)
  const nameSeen = new Map()

  function transpositionsOf(r) {
    const out = []
    for (let i = 1; i <= r.uci.length; i++) {
      const own = r.uci.slice(0, i).join(' ')
      for (const [pre, name] of epdPrefixes.get(r.epds[i])) {
        if (pre === own || pre.split(' ').length !== i) continue
        out.push({ ply: i, name, uci: pre.split(' ') })
        break
      }
    }
    return out
  }
  const variations = lines.map(r => {
    const idx = (nameSeen.get(r.name) ?? 0) + 1
    nameSeen.set(r.name, idx)
    const path = variationPath(r.name, fam)
    const reach = reachOf(r.epd)
    const tags = []
    if (/Gambit|Countergambit/i.test(r.name)) tags.push('gambit')
    if (/Trap|Attack|Sacrifice|Countergambit|Mate\b/i.test(path.join(' '))) tags.push('tactical')
    if (path.length >= 2) tags.push('sub')
    return {
      id: sha(r.name + '|' + r.uci.join(' ')).slice(0, 12),
      eco: r.eco,
      name: r.name,
      path,
      lineNo: nameCount.get(r.name) > 1 ? idx : undefined,
      san: r.san,
      uci: r.uci,
      epd: r.epd,
      moveOrders: r.moveOrders.length ? r.moveOrders : undefined,
      // aantal steekproefpartijen dat de eindstelling bereikte (alle zetvolgordes), of null als die
      // stelling te zelden / te diep voorkwam om betrouwbaar te tellen
      reach,
      // aantal steekproefpartijen dat Lichess precies deze naam gaf
      namedGames: nameGames.get(r.name) ?? 0,
      tags,
      transposesTo: transpositionsOf(r),
    }
  })

  // Categorieën op basis van frequentie binnen de familie
  for (const v of variations) {
    const freq = (v.reach ?? 0) / Math.max(1, famTotal)
    v.freq = Number(freq.toFixed(5))
    if (v.path.length === 0) v.tags.unshift('base')
    else if (freq >= 0.01) v.tags.unshift('main')
    else if (freq >= 0.0005) v.tags.unshift('side')
    else v.tags.unshift('rare')
    if (!v.transposesTo.length) delete v.transposesTo
  }

  // Niveaus (Course): 1 basis, 2 hoofdvarianten, 3 zijvarianten met frequentie, 4 zeldzame/subvarianten, 5 diep/gevorderd
  for (const v of variations) {
    const t = v.tags
    v.level = t.includes('base') && v.san.length <= 8 ? 1
      : t.includes('main') ? 2
      : t.includes('side') ? 3
      : v.san.length <= 14 && !t.includes('sub') ? 4
      : 5
  }

  // Lessen: per niveau gegroepeerd op eerste naamniveau, in stukken van max. 6 varianten, belangrijkste eerst
  const lessons = []
  for (let level = 1; level <= 5; level++) {
    const lv = variations.filter(v => v.level === level)
    const groups = new Map()
    for (const v of lv) {
      const g = v.path[0] ?? fam
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g).push(v)
    }
    const ordered = [...groups.entries()]
      .map(([g, vs]) => [g, vs.sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0) || a.san.length - b.san.length)])
      .sort((a, b) => Math.max(...b[1].map(v => v.reach ?? 0)) - Math.max(...a[1].map(v => v.reach ?? 0)))
    // grote groepen krijgen eigen lessen (max. 6 varianten); kleine groepen worden gebundeld
    let bundle = { names: [], vs: [] }
    const flush = () => {
      if (!bundle.vs.length) return
      const title = bundle.names.length <= 2 ? bundle.names.join(' · ') : `${bundle.names.slice(0, 2).join(' · ')} +${bundle.names.length - 2}`
      lessons.push({ id: `${slug}-l${level}-${lessons.length + 1}`, level, title, variationIds: bundle.vs.map(v => v.id) })
      bundle = { names: [], vs: [] }
    }
    for (const [g, vs] of ordered) {
      if (vs.length >= 4) {
        flush()
        for (let i = 0; i < vs.length; i += 6) {
          lessons.push({
            id: `${slug}-l${level}-${lessons.length + 1}`,
            level,
            title: g + (vs.length > 6 ? ` (${Math.floor(i / 6) + 1}/${Math.ceil(vs.length / 6)})` : ''),
            variationIds: vs.slice(i, i + 6).map(v => v.id),
          })
        }
        continue
      }
      if (bundle.vs.length + vs.length > 6) flush()
      bundle.names.push(g)
      bundle.vs.push(...vs)
    }
    flush()
  }

  // Statistieken voor alle stellingen op de lijnen + praktische vervolgen (max. 6 ply voorbij lijneinde)
  const famPositions = new Set()
  for (const v of variations) for (const r of [v, ...(v.moveOrders ?? [])]) {
    const c = new Chess()
    famPositions.add(epdOf(c.fen()))
    for (const u of r.uci) { c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); famPositions.add(epdOf(c.fen())) }
  }
  const frontier = [...new Set(variations.map(v => v.epd))].map(e => [e, 0])
  while (frontier.length) {
    const [epd, d] = frontier.pop()
    const p = posStats.get(epd)
    if (!p || d >= 6) continue
    for (const m of p.moves.values()) {
      if (m.n / p.n < 0.05 || !m.childEpd || famPositions.has(m.childEpd)) continue
      famPositions.add(m.childEpd)
      frontier.push([m.childEpd, d + 1])
    }
  }
  const stats = {}
  for (const epd of famPositions) {
    const p = posStats.get(epd)
    if (!p || p.n < STATS_MIN) continue
    const moves = [...p.moves.values()]
      .filter(m => m.n >= 3)
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .map(m => [m.uci, m.san, m.n, ...m.r, ...m.bands.flat()])
    stats[epd] = { n: p.n, m: moves }
  }

  const ecoCodes = [...new Set(variations.map(v => v.eco))].sort()
  const root = sideOf(list, fam).root
  const summary = {
    id: slug,
    name: fam,
    side: sel.side,
    rank: sel.rank,
    ecoRange: ecoCodes.length > 1 ? `${ecoCodes[0]}–${ecoCodes[ecoCodes.length - 1]}` : ecoCodes[0],
    ecoCodes,
    rootSan: root.san,
    rootUci: root.uci,
    rootEpd: root.epd,
    games: famTotal,
    share: Number((famTotal / totalGames).toFixed(5)),
    variationCount: variations.length,
    namedCount: new Set(variations.map(v => v.name)).size,
    subvariationCount: variations.filter(v => v.tags.includes('sub')).length,
    gambitCount: variations.filter(v => v.tags.includes('gambit')).length,
    lessonCount: lessons.length,
    maxPlies: Math.max(...variations.map(v => v.san.length)),
  }
  familySummaries.push(summary)
  const famJson = JSON.stringify({ family: summary, variations, lessons })
  const statsJson = JSON.stringify({ bands: BANDS, totalGames, positions: stats })
  outHasher.update(famJson).update(statsJson)
  writeFileSync(join(OUT, 'families', `${slug}.json`), famJson)
  writeFileSync(join(OUT, 'stats', `${slug}.json`), statsJson)

  report.push({
    family: fam,
    sourceRows: list.length,
    variations: variations.length,
    distinctNames: summary.namedCount,
    duplicatesMerged,
    withMoveOrders: variations.filter(v => v.moveOrders).length,
    linesWithTransposition: variations.filter(v => v.transposesTo).length,
    statPositions: Object.keys(stats).length,
  })
}

// Namen-index: iedere benoemde Lichess-stelling (alle 3865 regels), zodat de app elke stelling kan benoemen
const names = {}
for (const r of rows) if (r.ok) names[r.epd] = [r.eco, r.name, familyOf(r.name)]
writeFileSync(join(OUT, 'names.json'), JSON.stringify(names))

// ---------- 8. Manifest + rapport ----------
const datasetVersion = `${ref.slice(0, 7)}-${fileHash}-${sampleMeta.month}-${outHasher.digest('hex').slice(0, 6)}`
const manifest = {
  schemaVersion: 1,
  datasetVersion,
  generatedAt: new Date().toISOString(),
  source: {
    openings: { repo: 'https://github.com/lichess-org/chess-openings', ref, license: 'CC0-1.0', rows: rows.length, illegal: illegal.length },
    games: {
      url: sampleMeta.source,
      license: 'CC0-1.0',
      month: sampleMeta.month,
      method: `${sampleMeta.windows} gelijk verdeelde vensters van ${sampleMeta.chunkMb} MB over het volledige maandbestand (${(sampleMeta.fileSize / 1e9).toFixed(1)} GB)`,
      sampledGames: sampleMeta.totalGames,
      usedGames: totalGames,
      speeds: speedTotals,
      ratingBands: Object.fromEntries(BANDS.map((b, i) => [b, bandTotals[i]])),
    },
  },
  method: [
    'Familie = Lichess-naam vóór de dubbele punt.',
    "'X Accepted', 'X Declined' en 'X, with …' worden samengevoegd met X wanneer X zelf een Lichess-familie is.",
    'Systemen die Lichess onder meerdere hoofdnamen opslaat (London System, King\'s Indian Attack, Colle System, Torre Attack) worden op naam samengevoegd.',
    "Kant: namen die eindigen op 'Defense' zijn zwart; anders de partij die de laatste zet doet van de kortste lijn in de familie.",
    'Populariteit = aantal rated blitz/rapid/classical-partijen in de steekproef waarvan de Lichess-openingsnaam (header "Opening") bij de familie hoort. Iedere partij telt in precies één familie: geen dubbeltellingen.',
    'Generieke verzamelnamen (King\'s Pawn Game, Queen\'s Pawn Game, Indian Defense, Zukertort Opening, Van\'t Kruijs Opening) tellen mee in de ranglijst maar worden niet geselecteerd.',
    'Transpositie = een stelling uit een lijn die in de Lichess-dataset ook via een andere zetvolgorde (van dezelfde lengte) bereikt wordt.',
    'Frequentie van een variant = aantal steekproefpartijen dat de eindstelling bereikte (alle zetvolgordes samen), mits de stelling binnen 24 ply en minstens 5 keer voorkwam.',
  ],
  families: familySummaries,
  validation: { illegalLines: illegal, report, unmatchedGameFamilies: unmatched },
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
writeFileSync(join(OUT, 'ranking.json'), JSON.stringify({ datasetVersion, totalGames, white: ranking.white.slice(0, 40), black: ranking.black.slice(0, 40) }, null, 1))
console.table(report)
console.log('dataset', datasetVersion)
