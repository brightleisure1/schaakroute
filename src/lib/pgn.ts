import { Chess } from 'chess.js'
import { START_FEN, epdOf, uciOf, parseUci } from './chess'

// PGN-import met varianten (haakjes) en PGN-export van een zettenboom.

export interface PgnEdge {
  fenBefore: string
  epd: string
  uci: string
  san: string
  ply: number
  comment?: string
}

export interface PgnGame {
  headers: Record<string, string>
  edges: PgnEdge[]
  /** alle lijnen van begin tot blad, als UCI-reeksen */
  lines: string[][]
  mainline: string[]
  errors: string[]
}

export function splitGames(text: string): string[] {
  const norm = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '')
  const parts = norm.split(/\n\s*\n(?=\[)/)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

function tokenize(movetext: string): string[] {
  const tokens: string[] = []
  const re = /\{[^}]*\}|;[^\n]*|\(|\)|\$\d+|\d+\.(?:\.\.)?|1-0|0-1|1\/2-1\/2|\*|[^\s(){};]+/g
  for (const m of movetext.matchAll(re)) tokens.push(m[0])
  return tokens
}

export function parsePgn(text: string): PgnGame {
  const headers: Record<string, string> = {}
  const headerRe = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm
  let lastHeaderEnd = 0
  for (const m of text.matchAll(headerRe)) {
    headers[m[1]] = m[2]
    lastHeaderEnd = (m.index ?? 0) + m[0].length
  }
  const movetext = text.slice(lastHeaderEnd)
  const startFen = headers.FEN ?? START_FEN
  const edges: PgnEdge[] = []
  const lines: string[][] = []
  const errors: string[] = []

  interface State { fens: string[]; ucis: string[] }
  let st: State = { fens: [startFen], ucis: [] }
  const stack: State[] = []
  let skipDepth = 0 // na een fout in een variant de rest van die variant overslaan

  for (const tok of tokenize(movetext)) {
    if (tok === '(') {
      stack.push({ fens: [...st.fens], ucis: [...st.ucis] })
      if (skipDepth) { skipDepth++; continue }
      // variant = alternatief voor de laatst gespeelde zet
      st = { fens: st.fens.slice(0, -1), ucis: st.ucis.slice(0, -1) }
      if (st.fens.length === 0) st = { fens: [startFen], ucis: [] }
      continue
    }
    if (tok === ')') {
      if (!skipDepth && st.ucis.length) lines.push([...st.ucis])
      if (skipDepth) skipDepth--
      st = stack.pop() ?? st
      continue
    }
    if (skipDepth) continue
    if (tok.startsWith('{') || tok.startsWith(';')) {
      const last = edges[edges.length - 1]
      if (last && last.uci === st.ucis[st.ucis.length - 1]) last.comment = tok.replace(/^[{;]\s*|\s*\}$/g, '')
      continue
    }
    if (/^\$\d+$/.test(tok) || /^\d+\.(\.\.)?$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue
    const san = tok.replace(/^\d+\.(\.\.)?/, '').replace(/[?!]+$/, '')
    if (!san) continue
    const fen = st.fens[st.fens.length - 1]
    const c = new Chess(fen)
    try {
      const mv = c.move(san)
      const uci = uciOf(mv)
      edges.push({ fenBefore: fen, epd: epdOf(fen), uci, san: mv.san, ply: st.ucis.length })
      st.fens.push(c.fen())
      st.ucis.push(uci)
    } catch {
      errors.push(`Ongeldige zet "${san}" na ${st.ucis.length} ply`)
      skipDepth = stack.length ? 1 : 0
      if (!stack.length) break
    }
  }
  if (st.ucis.length) lines.push([...st.ucis])
  const mainline = [...st.ucis]
  // Dubbele (prefix-)lijnen verwijderen
  const keys = lines.map(l => l.join(' '))
  const unique = lines.filter((_l, i) => !keys.some((k, j) => j !== i && k.length > keys[i].length && k.startsWith(keys[i] + ' ')) && keys.indexOf(keys[i]) === i)
  return { headers, edges, lines: unique, mainline, errors }
}

export interface TreeMove {
  uci: string
  san: string
  main?: boolean
  comment?: string
}

/** Exporteert een zettenboom als PGN met varianten. children(epd) geeft de zetten in die stelling (hoofdzet eerst). */
export function treeToPgn(children: (epd: string) => TreeMove[], headers: Record<string, string> = {}, startFen = START_FEN): string {
  const expanded = new Set<string>()
  const num = (ply: number, force: boolean) => (ply % 2 === 0 ? `${ply / 2 + 1}. ` : force ? `${Math.floor(ply / 2) + 1}... ` : '')
  const after = (fen: string, uci: string) => {
    const c = new Chess(fen)
    c.move(parseUci(uci))
    return c.fen()
  }
  const comment = (m: TreeMove) => (m.comment ? ` {${m.comment.replace(/[{}]/g, '')}}` : '')

  function line(fen: string, ply: number, force: boolean): string[] {
    const epd = epdOf(fen)
    if (expanded.has(epd)) return []
    expanded.add(epd)
    const kids = [...children(epd)].sort((a, b) => Number(!!b.main) - Number(!!a.main))
    if (!kids.length) return []
    const [main, ...alts] = kids
    const out = [num(ply, force) + main.san + comment(main)]
    for (const alt of alts) {
      const sub = [num(ply, true) + alt.san + comment(alt), ...line(after(fen, alt.uci), ply + 1, false)]
      out.push('(' + sub.join(' ') + ')')
    }
    out.push(...line(after(fen, main.uci), ply + 1, alts.length > 0 || !!main.comment))
    return out
  }

  const startPly = startFen.split(' ')[1] === 'b' ? 1 : 0
  const body = line(startFen, startPly, true).join(' ')
  const tags = { Event: 'SchaakRoute repertoire', Site: 'SchaakRoute', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), Result: '*', ...headers }
  if (startFen !== START_FEN) Object.assign(tags, { SetUp: '1', FEN: startFen })
  const head = Object.entries(tags).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n')
  return `${head}\n\n${wrap(body + ' *')}\n`
}

function wrap(s: string, width = 80) {
  const out: string[] = []
  let cur = ''
  for (const w of s.split(' ')) {
    if ((cur + ' ' + w).trim().length > width) {
      out.push(cur.trim())
      cur = w
    } else cur += ' ' + w
  }
  if (cur.trim()) out.push(cur.trim())
  return out.join('\n')
}
