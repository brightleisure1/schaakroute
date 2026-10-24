#!/usr/bin/env node
// Neemt een reproduceerbare steekproef uit de openbare Lichess-partijendatabase
// (https://database.lichess.org, CC0). Een maandbestand bestaat uit vele zstd-frames;
// we downloaden N gelijk verdeelde byte-vensters over het hele bestand, zoeken het
// eerste frame-begin en decomprimeren alleen complete partijen. Zo dekt de steekproef
// alle dagen en tijdstippen van de maand in plaats van alleen de eerste uren.
//
// Gebruik: node scripts/sample-games.mjs [maand=2026-09] [vensters=40] [MB-per-venster=8]
// Uitvoer: data-raw/games-<maand>.tsv  (speed, whiteElo, blackElo, result, eco, opening, zetten)

import { spawnSync } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const month = process.argv[2] ?? '2026-09'
const windows = Number(process.argv[3] ?? 40)
const chunkMb = Number(process.argv[4] ?? 8)
const MAX_PLIES = 24
const url = `https://database.lichess.org/standard/lichess_db_standard_rated_${month}.pgn.zst`
const outDir = join(process.cwd(), 'data-raw')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `games-${month}.tsv`)

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

// Lichess-snelheidsindeling: geschatte duur = basis + 40 * increment (seconden)
function speedOf(tc) {
  if (!tc || tc === '-') return 'correspondence'
  const [base, inc] = tc.split('+').map(Number)
  const est = base + 40 * (inc || 0)
  if (est < 29) return 'ultraBullet'
  if (est < 179) return 'bullet'
  if (est < 479) return 'blitz'
  if (est < 1499) return 'rapid'
  return 'classical'
}

function parseMoves(text) {
  const clean = text
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
  const toks = clean.split(/\s+/).filter(Boolean)
  const last = toks[toks.length - 1]
  if (!['1-0', '0-1', '1/2-1/2', '*'].includes(last)) return null // afgekapte partij
  return toks.slice(0, -1).slice(0, MAX_PLIES).map(t => t.replace(/[?!]+$/, ''))
}

function* games(pgn) {
  const parts = pgn.split(/\n\n(?=\[Event )/)
  // het eerste deel begint midden in een partij: overslaan
  for (let i = 1; i < parts.length; i++) yield parts[i]
}

async function fetchRange(start, end) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
      if (res.status !== 206) throw new Error('HTTP ' + res.status)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      console.error(`  herpoging ${attempt + 1}: ${e.message}`)
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)))
    }
  }
  throw new Error('download mislukt')
}

function decompress(buf) {
  let idx = buf.indexOf(MAGIC)
  while (idx >= 0) {
    const r = spawnSync('zstd', ['-dc'], { input: buf.subarray(idx), maxBuffer: 1 << 30 })
    if (r.stdout && r.stdout.length > 100000) return r.stdout.toString('utf8')
    idx = buf.indexOf(MAGIC, idx + 1)
  }
  return ''
}

const head = await fetch(url, { method: 'HEAD' })
const size = Number(head.headers.get('content-length'))
if (!size) throw new Error('Kan bestandsgrootte niet bepalen: ' + url)
console.log(`${url}\n${(size / 1e9).toFixed(1)} GB, ${windows} vensters x ${chunkMb} MB`)

const out = createWriteStream(outPath)
out.write('speed\twhiteElo\tblackElo\tresult\teco\topening\tmoves\n')
let total = 0
const chunk = chunkMb * 1024 * 1024
const speeds = {}

const tasks = Array.from({ length: windows }, (_, i) => i)
async function worker() {
  while (tasks.length) {
    const i = tasks.shift()
    const start = Math.floor((size - chunk) * (i / Math.max(1, windows - 1)))
    const buf = await fetchRange(start, Math.min(size - 1, start + chunk - 1))
    const text = decompress(buf)
    let n = 0
    for (const g of games(text)) {
      const tag = k => (g.match(new RegExp(`\\[${k} "([^"]*)"\\]`)) || [])[1]
      const opening = tag('Opening')
      const tc = tag('TimeControl')
      const moveText = g.split(/\n\n/)[1]
      if (!opening || !moveText) continue
      const moves = parseMoves(moveText)
      if (!moves || moves.length === 0) continue
      const speed = speedOf(tc)
      speeds[speed] = (speeds[speed] || 0) + 1
      out.write([speed, tag('WhiteElo'), tag('BlackElo'), tag('Result'), tag('ECO'), opening, moves.join(' ')].join('\t') + '\n')
      n++
    }
    total += n
    console.log(`venster ${i + 1}/${windows}: ${n} partijen (totaal ${total})`)
  }
}
await Promise.all([worker(), worker(), worker(), worker()])
out.end()
writeFileSync(join(outDir, `games-${month}.meta.json`), JSON.stringify({ source: url, month, windows, chunkMb, fileSize: size, totalGames: total, speeds, createdAt: new Date().toISOString() }, null, 2))
console.log('Klaar:', outPath, total, speeds)
