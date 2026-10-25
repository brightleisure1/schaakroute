import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { BookOpen, ChessKnight, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Ellipsis, Eye, Info, Lightbulb, ListOrdered, RotateCcw, Undo2 } from 'lucide-react'
import { Board } from './Board'
import { MoveInput } from './MoveInput'
import { ProgressBar, Stars, useSettings, pct, nf, plural, STICKY_ACTIONS, BadgesEarned } from './ui'
import { START_FEN, describeSan, epdOf, formatMoves, moveNumberLabel, parseUci, uciOf } from '../lib/chess'
import { loadNames, loadStats, positionIndex, type PositionRef } from '../lib/data'
import { judgeMove, isUserPly, qualityFor, starsFor, moveScore, bandCount } from '../lib/trainer'
import { completeVariation, recordMistake, recordMove, checkBadges } from '../lib/progress'
import { moveLoss } from '../lib/engine'
import { OPENING_INFO } from '../content/openingInfo'
import type { FamilyFile, StatsFile, TrainingLine, TrainMode } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

export interface Miss {
  ply: number
  expected: string
  played: string[]
  hinted: boolean
  shown: boolean
}

export interface LineResult {
  userMoves: number
  correctFirstTry: number
  mistakes: number
  hints: number
  alternatives: number
  shown: number
  stars: number
  xp: number
  newCards: number
  badges: BadgeDef[]
  misses: Miss[]
}

interface PlyState {
  mistakes: number
  hints: number
  alternatives: number
  shown: boolean
  wrong: string[]
}
const emptyPly = (): PlyState => ({ mistakes: 0, hints: 0, alternatives: 0, shown: false, wrong: [] })

type FeedbackKind = 'correct' | 'wrong' | 'illegal' | 'info' | 'hint' | 'learn'
type Feedback = { kind: FeedbackKind; text: ReactNode } | null

export interface TrainerProps {
  line: TrainingLine
  mode: TrainMode
  family?: FamilyFile
  sessionId?: number
  /** Wordt aangeroepen zodra de lijn uitgespeeld is */
  onComplete?: (r: LineResult) => void
  /** Acties onder de eindsamenvatting (volgende, opnieuw …). Het bord blijft daarbij in beeld. */
  renderEnd?: (r: LineResult, restart: () => void) => ReactNode
  /** Extra's onderaan de eindsamenvatting (repertoire, verwante varianten …), onder de terugblik */
  renderEndExtra?: (r: LineResult) => ReactNode
  /** Kleine kop boven het bord (bijv. voortgang in een dagelijkse sessie) */
  header?: ReactNode
  /** Toon in de leermodus eerst een korte introductie */
  autoIntro?: boolean
  /** Meldt of er een lijn half gespeeld is (om per ongeluk wisselen te voorkomen) */
  onProgressChange?: (inProgress: boolean) => void
}

const MODE_LABEL: Record<TrainMode, string> = { learn: 'Leren', practice: 'Oefenen', mastery: 'Mastery', review: 'Herhaling' }
const sideNl = (s: 'white' | 'black') => (s === 'white' ? 'Wit' : 'Zwart')
const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function Trainer({ line, mode, family, sessionId, onComplete, renderEnd, renderEndExtra, header, autoIntro = true, onProgressChange }: TrainerProps) {
  const settings = useSettings()
  const startPly = line.startPly ?? 0
  const endPly = Math.min(line.endPly ?? line.uci.length, line.uci.length)
  const opponent = line.side === 'white' ? 'black' : 'white'
  const wantsIntro = autoIntro && startPly === 0 && mode === 'learn'

  // Alle stellingen van de lijn vooraf berekenen (chess.js controleert de legaliteit)
  const { fens, sans, moves } = useMemo(() => {
    const c = new Chess(START_FEN)
    const fens = [c.fen()]
    const sans: string[] = []
    const moves: [string, string][] = []
    for (const u of line.uci) {
      const m = c.move(parseUci(u))
      fens.push(c.fen())
      sans.push(m.san)
      moves.push([m.from, m.to])
    }
    return { fens, sans, moves }
  }, [line.uci])

  const userPlies = useMemo(() => {
    const out: number[] = []
    for (let p = startPly; p < endPly; p++) if (isUserPly(p, line.side)) out.push(p)
    return out
  }, [startPly, endPly, line.side])

  const [ply, setPly] = useState(startPly)
  const [viewPly, setViewPly] = useState<number | null>(null)
  const [plyState, setPlyState] = useState<Record<number, PlyState>>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [opponentLine, setOpponentLine] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [tempFen, setTempFen] = useState<{ fen: string; move: [string, string] } | null>(null)
  const [flash, setFlash] = useState<{ square: string; kind: 'good' | 'bad' | 'info' } | null>(null)
  const [showMoves, setShowMoves] = useState(false)
  const [showExplain, setShowExplain] = useState(false)
  const [revealedPly, setRevealedPly] = useState<number | null>(null)
  const [showFull, setShowFull] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [result, setResult] = useState<LineResult | null>(null)
  const [intro, setIntro] = useState(wantsIntro)
  const [names, setNames] = useState<Record<string, [string, string, string]> | null>(null)
  const [stats, setStats] = useState<StatsFile | null>(null)
  const xpRef = useRef(0)
  const newCardsRef = useRef(0)
  const busy = useRef(false)
  const runId = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadNames().then(setNames).catch(() => setNames({}))
    if (line.familyId) loadStats(line.familyId).then(setStats).catch(() => setStats(null))
  }, [line.familyId])

  const famIndex = useMemo(() => (family ? positionIndex(family) : undefined), [family])

  const restart = useCallback(() => {
    runId.current++
    setPly(startPly)
    setViewPly(null)
    setPlyState({})
    setFeedback(null)
    setOpponentLine(null)
    setHintLevel(0)
    setTempFen(null)
    setFlash(null)
    setResult(null)
    setShowFull(false)
    setRevealedPly(null)
    setMenuOpen(false)
    xpRef.current = 0
    newCardsRef.current = 0
    busy.current = false
  }, [startPly])

  // Bij een nieuwe lijn alles resetten
  useEffect(() => {
    restart()
    setIntro(wantsIntro)
  }, [line.key, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = ply >= endPly
  const userTurn = !done && isUserPly(ply, line.side)

  useEffect(() => {
    onProgressChange?.(ply > startPly && !result)
  }, [ply, result, startPly]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tegenstander speelt automatisch de boekzet, en dat wordt ook in tekst gemeld
  useEffect(() => {
    if (done || userTurn || intro || showFull || result) return
    const id = runId.current
    const t = setTimeout(() => {
      if (id !== runId.current) return
      setOpponentLine(`${sideNl(opponent)} ${ply === startPly ? 'speelt' : 'antwoordt'} ${sans[ply]} (${describeSan(sans[ply])}).`)
      setPly(p => p + 1)
      setHintLevel(0)
    }, ply === startPly ? 350 : 520)
    return () => clearTimeout(t)
  }, [ply, done, userTurn, intro, showFull, result, startPly, opponent, sans])

  // Leermodus: de zet wordt voorgedaan
  useEffect(() => {
    if (mode === 'learn' && userTurn && !intro) {
      setFeedback({ kind: 'learn', text: <>Speel <b>{sans[ply]}</b>: {describeSan(sans[ply])}.</> })
    }
  }, [mode, userTurn, ply, intro, sans])

  // Lijn afgerond
  useEffect(() => {
    if (!done || result) return
    const total = Object.values(plyState)
    const mistakes = total.reduce((a, s) => a + s.mistakes, 0)
    const hints = total.reduce((a, s) => a + s.hints, 0)
    const alternatives = total.reduce((a, s) => a + s.alternatives, 0)
    const shown = total.filter(s => s.shown).length
    const correctFirstTry = userPlies.filter(p => {
      const s = plyState[p]
      return !s || (s.mistakes === 0 && s.hints === 0 && !s.shown)
    }).length
    const misses: Miss[] = userPlies
      .filter(p => plyState[p] && (plyState[p].mistakes > 0 || plyState[p].hints > 0 || plyState[p].shown))
      .map(p => ({ ply: p, expected: sans[p], played: plyState[p].wrong, hinted: plyState[p].hints > 0, shown: plyState[p].shown }))
    const stars = mode === 'learn' ? 0 : starsFor(userPlies.length, mistakes + shown, hints)
    const finish = async () => {
      let xp = xpRef.current
      if (line.variationId && line.familyId && startPly === 0) {
        xp += await completeVariation({ variationId: line.variationId, familyId: line.familyId, stars, mistakes, hints, correct: correctFirstTry, mode })
      }
      const badges = await checkBadges()
      const r: LineResult = { userMoves: userPlies.length, correctFirstTry, mistakes, hints, alternatives, shown, stars, xp, newCards: newCardsRef.current, badges, misses }
      setResult(r)
      setViewPly(null)
      onComplete?.(r)
    }
    const t = setTimeout(finish, 350)
    return () => clearTimeout(t)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const updatePly = (p: number, patch: (s: PlyState) => PlyState) =>
    setPlyState(prev => ({ ...prev, [p]: patch(prev[p] ?? emptyPly()) }))

  async function acceptCorrect(p: number, to: string) {
    const st = plyState[p] ?? emptyPly()
    const quality = mode === 'learn' ? 5 : qualityFor(st.mistakes, st.hints, st.alternatives, st.shown)
    setFlash({ square: to, kind: 'good' })
    setTimeout(() => setFlash(f => (f?.square === to ? null : f)), 600)
    setOpponentLine(null)
    setFeedback({ kind: 'correct', text: <><b>{sans[p]}</b> {mode !== 'learn' && quality === 5 ? 'klopt, in één keer.' : 'is goed.'}</> })
    setPly(p + 1)
    setHintLevel(0)
    try {
      const rec = await recordMove({
        epd: epdOf(fens[p]), uci: line.uci[p], san: sans[p], side: line.side, familyId: line.familyId, variationId: line.variationId,
        lineUci: line.uci.slice(0, p), quality, mode, result: st.shown ? 'shown' : st.hints ? 'hint' : st.mistakes ? 'mistake' : 'correct', sessionId,
      })
      xpRef.current += rec.xp
      if (rec.isNew && mode !== 'learn' && quality >= 3) newCardsRef.current++
    } catch (e) {
      console.error('Opslaan mislukt', e)
    }
  }

  function onUserMove(from: string, to: string, promotion?: string): boolean {
    if (!userTurn || busy.current || viewPly !== null || showFull || intro) return false
    const p = ply
    const verdict = judgeMove({ fen: fens[p], expected: line.uci[p], from, to, promotion, familyIndex: famIndex, names: names ?? undefined, stats })
    if (verdict.kind === 'illegal') {
      setFeedback({ kind: 'illegal', text: 'Dat is geen legale zet in deze stelling.' })
      return false
    }
    if (verdict.kind === 'correct') {
      void acceptCorrect(p, to)
      return true
    }
    // Verkeerde of alternatieve zet: kort tonen, dan terugzetten
    const c = new Chess(fens[p])
    c.move({ from, to, promotion: promotion ?? 'q' })
    busy.current = true
    setTempFen({ fen: c.fen(), move: [from, to] })
    setOpponentLine(null)
    const id = runId.current
    setTimeout(() => {
      if (id !== runId.current) return
      setTempFen(null)
      setFlash(null)
      busy.current = false
    }, 750)
    const playedUci = uciOf(verdict.move)
    // Fout. Ook een zet die in een andere variant of opening theorie is: je leert hier déze variant
    const st = plyState[p] ?? emptyPly()
    const mistakes = st.mistakes + (mode === 'learn' ? 0 : 1)
    updatePly(p, s => ({ ...s, mistakes, wrong: mode === 'learn' ? s.wrong : [...s.wrong, verdict.move.san] }))
    setFlash({ square: to, kind: 'bad' })
    recordMistake({ sessionId, epd: epdOf(fens[p]), expected: line.uci[p], played: playedUci, result: 'mistake', familyId: line.familyId, variationId: line.variationId }).catch(() => {})
    let text: ReactNode = <><b>{verdict.move.san}</b> is niet de zet uit deze variant. {mode === 'mastery' ? 'Probeer het nog eens.' : 'Probeer het nog eens of vraag een hint.'}</>
    if (mode === 'learn') text = <>Speel de aangegeven zet <b>{sans[p]}</b>.</>
    else if (mistakes >= 3) {
      updatePly(p, s => ({ ...s, shown: true }))
      setHintLevel(2)
      text = <>De zet was <b>{sans[p]}</b> ({describeSan(sans[p])}). Speel hem nu zelf. Deze stelling komt snel terug in je herhalingen.</>
    } else if (mistakes === 2 && mode !== 'mastery') {
      setHintLevel(h => Math.max(h, 1))
      text = <><b>{verdict.move.san}</b> is het ook niet. Hint: het gemarkeerde stuk moet bewegen.</>
    }
    setFeedback({ kind: 'wrong', text })
    // Optioneel: Stockfish onderscheidt een speelbare zet van een echte fout
    if (settings?.engineEnabled && mode !== 'learn') {
      moveLoss(fens[p], playedUci).then(r => {
        if (!r || id !== runId.current) return
        setFeedback(prev => {
          if (!prev || prev.kind !== 'wrong') return prev
          const loss = (r.loss / 100).toFixed(1).replace('.', ',')
          const extra = r.loss >= 150
            ? <span className="mt-1 block">Stockfish: dit is ook objectief een slechte zet (ongeveer {loss} pion verlies).</span>
            : r.loss <= 50
              ? <span className="mt-1 block">Stockfish: objectief speelbaar (minder dan een halve pion verschil), alleen niet de zet van deze lijn.</span>
              : <span className="mt-1 block">Stockfish: een onnauwkeurigheid (ongeveer {loss} pion).</span>
          return { kind: prev.kind, text: <>{prev.text}{extra}</> }
        })
      }).catch(() => {})
    }
    return false
  }

  function hint() {
    if (!userTurn || mode === 'mastery' || mode === 'learn' || intro) return
    const next = Math.min(2, hintLevel + 1)
    setHintLevel(next)
    updatePly(ply, s => ({ ...s, hints: s.hints + 1 }))
    setFeedback({ kind: 'hint', text: next === 1 ? 'Hint: verplaats het gemarkeerde stuk.' : <>De zet is <b>{sans[ply]}</b>; de pijl laat hem zien.</> })
  }

  function showMove() {
    if (!userTurn) return
    updatePly(ply, s => ({ ...s, shown: true }))
    setHintLevel(2)
    setFeedback({ kind: 'hint', text: <>De zet is <b>{sans[ply]}</b>. Speel hem nu zelf.</> })
  }

  function revealStats() {
    // de statistiek verklapt de zet: telt als hint
    if (userTurn && mode !== 'learn') updatePly(ply, s => ({ ...s, hints: s.hints + 1 }))
    setRevealedPly(ply)
  }

  function previousMove() {
    if (ply <= startPly || intro) return
    runId.current++
    busy.current = false
    setTempFen(null)
    setResult(null)
    let target = ply - 1
    while (target > startPly && !isUserPly(target, line.side)) target--
    if (target < startPly) target = startPly
    setPly(Math.max(startPly, target))
    setOpponentLine(null)
    setFeedback({ kind: 'info', text: 'Een zet teruggenomen. Speel opnieuw.' })
    setHintLevel(0)
  }

  // ---------- sneltoetsen ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') setMenuOpen(false)
      if (intro && e.key === 'Enter') { e.preventDefault(); setIntro(false); return }
      if (e.key === 'ArrowLeft') setViewPly(v => Math.max(0, (v ?? (result ? endPly : ply)) - 1))
      if (e.key === 'ArrowRight') setViewPly(v => (v === null ? null : v + 1 >= (result || showFull ? endPly + 1 : ply) ? null : v + 1))
      if (result) return
      const k = e.key.toLowerCase()
      if (k === 'h') hint()
      else if (k === 'u') setShowExplain(s => !s)
      else if (k === 'z') previousMove()
      else if (k === 'r') restart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

  // ---------- weergave ----------
  const finalPly = result ? endPly : ply
  const displayPly = showFull ? (viewPly ?? endPly) : viewPly ?? finalPly
  const boardFen = !showFull && viewPly === null && tempFen && !result ? tempFen.fen : fens[displayPly]
  const lastMove = !showFull && viewPly === null && tempFen && !result ? tempFen.move : displayPly > 0 ? moves[displayPly - 1] : null
  const arrows: Arrow[] = []
  const expected = userTurn && viewPly === null && !showFull && !result ? parseUci(line.uci[ply]) : null
  if (expected && (mode === 'learn' || hintLevel >= 2) && !intro) arrows.push({ startSquare: expected.from, endSquare: expected.to, color: mode === 'learn' ? 'rgba(47,125,79,0.85)' : 'rgba(58,110,165,0.85)' })
  // in de samenvatting: de gemiste zet tonen op het bord
  const recapMiss = result && viewPly !== null ? result.misses.find(m => m.ply === viewPly) : undefined
  if (recapMiss) {
    const u = parseUci(line.uci[recapMiss.ply])
    arrows.push({ startSquare: u.from, endSquare: u.to, color: 'rgba(47,125,79,0.85)' })
  }
  const hintSquare = expected && hintLevel === 1 ? expected.from : null
  const doneUser = userPlies.filter(p => p < ply).length
  const info = line.familyId ? OPENING_INFO[line.familyId] : undefined
  const currentName = names?.[epdOf(fens[displayPly])]?.[1] ?? lastNamed(names, fens, displayPly)
  const canHint = userTurn && mode !== 'mastery' && mode !== 'learn' && !intro
  const meta = [MODE_LABEL[mode], `je speelt ${line.side === 'white' ? 'wit' : 'zwart'}`, line.subtitle].filter(Boolean).join(' · ')
  const boardLabel = `Schaakbord, je speelt ${line.side === 'white' ? 'wit' : 'zwart'}${userTurn ? ', jij bent aan zet' : ''}`

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="-mx-2 sm:mx-auto sm:w-full sm:max-w-[min(92vw,620px)] lg:max-w-[min(640px,calc(100dvh-160px))]">
        {header && <div className="px-2 sm:px-0">{header}</div>}
        <div className="relative">
          {intro && (
            <button className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/25 lg:hidden" onClick={() => setIntro(false)} aria-label="Start de training">
              <span className="btn btn-primary px-8 py-3 text-base shadow-lg">Start</span>
            </button>
          )}
          <Board
            id={`trainer-${line.key}`}
            label={boardLabel}
            fen={boardFen}
            orientation={line.side}
            movable={userTurn && viewPly === null && !showFull && !intro && !result ? line.side : undefined}
            onMove={onUserMove}
            lastMove={lastMove}
            arrows={arrows}
            hintSquare={hintSquare}
            flash={flash}
          />
        </div>
        <div className="px-2 sm:px-0">
          {viewPly !== null && !showFull && !result && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info-ink">
              <span>Je bekijkt een eerdere stelling (na {plural(viewPly, 'halve zet', 'halve zetten')}).</span>
              <button className="min-h-11 font-semibold underline" onClick={() => setViewPly(null)}>Terug naar training</button>
            </div>
          )}
          {!result && !showFull && !intro && (
            <MoveInput fen={fens[ply] ?? fens[endPly]} enabled={userTurn && viewPly === null && !busy.current} onMove={onUserMove} />
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        {result ? (
          <EndPanel
            line={line}
            mode={mode}
            result={result}
            sans={sans}
            startPly={startPly}
            selected={viewPly}
            onSelect={p => setViewPly(v => (v === p ? null : p))}
            actions={renderEnd ? renderEnd(result, restart) : <button className="btn btn-primary w-full" onClick={restart}>Nog een keer</button>}
            extra={renderEndExtra?.(result)}
          />
        ) : (
          <>
            {intro ? (
              <div className="card order-2 p-4 animate-fade-up lg:order-none">
                <h3 className="font-semibold">{line.title}</h3>
                {info && <p className="mt-1 text-sm text-muted">{info.idea}</p>}
                <p className="mt-2 text-sm">Zettenreeks: <span className="font-mono text-xs">{formatMoves(sans.slice(0, endPly))}</span></p>
                <p className="mt-2 text-sm text-muted">De computer speelt de zetten van de tegenstander. Jij speelt de aangegeven zetten; de pijl laat zien wat je moet doen.</p>
                <button className="btn btn-primary mt-3 w-full" onClick={() => setIntro(false)}>Start <kbd className="ml-1 hidden rounded border border-white/40 px-1 text-xs font-normal lg:inline">Enter</kbd></button>
              </div>
            ) : (
              <FeedbackBox feedback={feedback} opponentLine={opponentLine} userTurn={userTurn} done={done} showFull={showFull} />
            )}

            {!intro && (
              <div className="order-1 grid grid-cols-4 gap-2 lg:order-none">
                <IconButton icon={<Lightbulb size={18} />} label="Hint" shortcut="H" onClick={hint} disabled={!canHint} />
                <IconButton icon={<BookOpen size={18} />} label="Uitleg" shortcut="U" onClick={() => setShowExplain(s => !s)} pressed={showExplain} />
                <IconButton icon={<Undo2 size={18} />} label="Terug" shortcut="Z" onClick={previousMove} disabled={ply <= startPly} />
                <div className="relative" ref={menuRef}>
                  <IconButton icon={<Ellipsis size={18} />} label="Meer" onClick={() => setMenuOpen(o => !o)} expanded={menuOpen} />
                  {menuOpen && (
                    <div className="card absolute right-0 z-20 mt-2 w-60 p-1.5 shadow-xl animate-fade-up" role="menu">
                      <MenuItem icon={<RotateCcw size={16} />} label="Opnieuw beginnen" shortcut="R" onClick={() => { restart(); setMenuOpen(false) }} />
                      <MenuItem icon={<Eye size={16} />} label={showFull ? 'Terug naar training' : 'Toon volledige variant'} onClick={() => { setShowFull(s => !s); setViewPly(null); setMenuOpen(false) }} />
                      <MenuItem icon={<ListOrdered size={16} />} label={showMoves ? 'Verberg alle zetten' : 'Bekijk alle zetten'} onClick={() => { setShowMoves(s => !s); setMenuOpen(false) }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {mode === 'mastery' && userTurn && (plyState[ply]?.mistakes ?? 0) > 0 && (
              <button className="btn btn-quiet order-1 lg:order-none" onClick={showMove}>Ik weet het niet: toon de zet</button>
            )}

            <div className="card order-3 p-4 lg:order-first">
              <h2 className="font-bold leading-snug text-balance">{line.title}</h2>
              <div className="mt-0.5 text-sm text-muted">{meta}</div>
              <ProgressBar className="mt-3" value={userPlies.length ? doneUser / userPlies.length : done ? 1 : 0} label="Voortgang in deze lijn" />
              <div className="mt-1 text-xs text-muted">
                {startPly > 0 && endPly - startPly <= 1
                  ? 'Losse positie: vind de zet die je eerder leerde.'
                  : <>{doneUser} van {plural(userPlies.length, 'zet', 'zetten')} van jouw kant · de lijn eindigt na {endPly} halve zetten{line.variationId ? ' (einde van de Lichess-data)' : ''}</>}
              </div>
            </div>

            {showFull && (
              <div className="card order-3 p-4 animate-fade-up lg:order-none">
                <div className="mb-2 text-sm font-semibold">Volledige variant (bekijkmodus, telt niet mee)</div>
                <MoveList sans={sans.slice(0, endPly)} current={displayPly} onSelect={setViewPly} />
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-ghost min-h-11 flex-1" onClick={() => setViewPly(v => Math.max(0, (v ?? endPly) - 1))} aria-label="Vorige zet"><ChevronLeft size={18} aria-hidden /></button>
                  <button className="btn btn-ghost min-h-11 flex-1" onClick={() => setViewPly(v => Math.min(endPly, (v ?? endPly) + 1))} aria-label="Volgende zet"><ChevronRight size={18} aria-hidden /></button>
                  <button className="btn btn-primary min-h-11 flex-[2]" onClick={() => { setShowFull(false); setViewPly(null) }}>Terug naar training</button>
                </div>
              </div>
            )}

            {(showMoves || startPly > 0) && !showFull && (
              <div className="card order-3 p-4 lg:order-none">
                <div className="mb-2 text-sm font-semibold">{startPly > 0 ? 'Zo ontstond deze stelling' : 'Gespeelde zetten'}</div>
                <MoveList sans={sans.slice(0, ply)} current={viewPly ?? ply} onSelect={p => setViewPly(p >= ply ? null : p)} />
                {currentName && <div className="mt-2 text-xs text-muted">Stelling: {currentName}</div>}
              </div>
            )}

            {showExplain && (
              <div className="order-3 lg:order-none">
                <Explanation
                  fen={fens[displayPly]}
                  name={currentName}
                  info={info}
                  stats={stats}
                  side={line.side}
                  elo={settings?.elo ?? 1500}
                  lastSan={displayPly > 0 ? sans[displayPly - 1] : undefined}
                  famIndex={famIndex}
                  family={family}
                  hideAnswer={userTurn && mode !== 'learn' && revealedPly !== ply && viewPly === null}
                  onReveal={revealStats}
                />
              </div>
            )}
            <p className="order-4 hidden text-xs text-muted lg:block">Sneltoetsen: H hint · U uitleg · Z terug · R opnieuw · ← → door de zetten. Je kunt een zet ook typen onder het bord.</p>
          </>
        )}
      </aside>
    </div>
  )
}

function IconButton({ icon, label, onClick, disabled, shortcut, pressed, expanded }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; shortcut?: string; pressed?: boolean; expanded?: boolean }) {
  return (
    <button
      className={`btn btn-ghost min-h-12 w-full flex-col gap-0.5 px-1 py-1.5 text-xs ${pressed || expanded ? 'border-brand' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? 'menu' : undefined}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  )
}

function MenuItem({ icon, label, onClick, shortcut }: { icon: ReactNode; label: string; onClick: () => void; shortcut?: string }) {
  return (
    <button role="menuitem" className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-surface-2" onClick={onClick}>
      <span aria-hidden className="text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <kbd className="text-xs text-muted">{shortcut}</kbd>}
    </button>
  )
}

function lastNamed(names: Record<string, [string, string, string]> | null, fens: string[], ply: number) {
  if (!names) return undefined
  for (let p = ply; p >= 0; p--) {
    const n = names[epdOf(fens[p])]
    if (n) return n[1]
  }
  return undefined
}

const FEEDBACK_STYLE: Record<FeedbackKind, { tone: string; icon: ReactNode; label: string }> = {
  correct: { tone: 'bg-brand-soft text-brand-strong', icon: <CircleCheck size={18} />, label: 'Goed' },
  learn: { tone: 'bg-brand-soft text-brand-strong', icon: <ChessKnight size={18} />, label: 'Leren' },
  wrong: { tone: 'bg-danger-soft text-danger-ink', icon: <CircleX size={18} />, label: 'Niet goed' },
  hint: { tone: 'bg-info-soft text-info-ink', icon: <Lightbulb size={18} />, label: 'Hint' },
  info: { tone: 'bg-info-soft text-info-ink', icon: <Info size={18} />, label: 'Info' },
  illegal: { tone: 'bg-accent-soft text-ink', icon: <CircleAlert size={18} />, label: 'Ongeldig' },
}

function FeedbackBox({ feedback, opponentLine, userTurn, done, showFull }: { feedback: Feedback; opponentLine: string | null; userTurn: boolean; done: boolean; showFull: boolean }) {
  const style = feedback && !showFull ? FEEDBACK_STYLE[feedback.kind] : null
  const status = showFull ? 'Bekijkmodus.' : done ? 'Lijn afgerond.' : userTurn ? 'Jij bent aan zet.' : 'De tegenstander is aan zet…'
  return (
    <div className={`order-first flex gap-2.5 rounded-2xl px-4 py-3 text-sm lg:order-none ${style?.tone ?? 'bg-surface-2 text-ink'} ${feedback?.kind === 'wrong' ? 'animate-shake' : ''}`} aria-live="polite" aria-atomic="true">
      {style && <span aria-hidden className="mt-0.5 shrink-0">{style.icon}</span>}
      <div className="min-w-0">
        {style && <span className="sr-only">{style.label}: </span>}
        {feedback && !showFull ? feedback.text : null}
        {opponentLine && !showFull && <span className={feedback ? ' block' : ''}>{feedback ? ' ' : ''}{opponentLine}</span>}
        {(!feedback || showFull || opponentLine || feedback.kind === 'correct') && <span className={feedback || opponentLine ? 'block font-semibold' : ''}>{status}</span>}
      </div>
    </div>
  )
}

export function MoveList({ sans, current, onSelect, startPly = 0, marked }: { sans: string[]; current: number; onSelect?: (ply: number) => void; startPly?: number; marked?: Set<number> }) {
  if (!sans.length) return <div className="text-sm text-muted">Nog geen zetten.</div>
  return (
    <ol className="flex max-h-48 flex-wrap gap-x-1 gap-y-1 overflow-y-auto font-mono text-sm scrollbar-thin" aria-label="Zetten">
      {sans.map((s, i) => {
        const ply = startPly + i
        const miss = marked?.has(ply)
        return (
          <li key={i} className="inline-flex items-center">
            {(ply % 2 === 0 || i === 0) && <span className="mr-0.5 text-muted">{moveNumberLabel(ply)}</span>}
            <button
              className={`min-h-8 rounded px-1 ${current === ply + 1 ? 'bg-brand text-on-brand' : miss ? 'bg-danger-soft text-danger-ink underline decoration-dotted' : 'hover:bg-surface-2'}`}
              onClick={() => onSelect?.(ply + 1)}
              aria-current={current === ply + 1 ? 'step' : undefined}
              aria-label={miss ? `${s}, hier ging het mis` : undefined}
            >
              {s}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function EndPanel({ line, mode, result, sans, startPly, selected, onSelect, actions, extra }: { line: TrainingLine; mode: TrainMode; result: LineResult; sans: string[]; startPly: number; selected: number | null; onSelect: (ply: number) => void; actions: ReactNode; extra?: ReactNode }) {
  const single = (line.endPly ?? line.uci.length) - startPly <= 1
  const perfect = result.mistakes + result.hints + result.shown === 0
  const title = mode === 'learn' ? 'Variant doorlopen' : single ? (perfect ? 'Goed onthouden' : 'Afgerond') : perfect ? 'Foutloos gespeeld' : 'Variant afgerond'
  return (
    <div className="card p-5 animate-pop" aria-live="polite">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-muted">{line.title}</p>
      {mode !== 'learn' && !single && (
        <div className="mt-3">
          <Stars count={result.stars} size="text-2xl" />
          <p className="mt-1 text-xs text-muted">3 sterren: zonder fouten en hints · 2 sterren: hooguit enkele fouten · 1 ster: afgerond</p>
        </div>
      )}
      {single && <p className="mt-2 text-sm">{perfect ? 'Het interval wordt langer: je ziet deze stelling later pas terug.' : 'Deze stelling komt over 10 minuten terug.'}</p>}
      {/* Direct onder de titel, en op mobiel onderin vastgeplakt: nooit scrollen om verder te kunnen */}
      <div className={`mt-4 grid grid-cols-1 gap-2 ${STICKY_ACTIONS} max-lg:-mx-5 max-lg:px-5`}>{actions}</div>
      {!single && <ResultNumbers result={result} />}
      <BadgesEarned badges={result.badges} className="mt-3" />
      {result.misses.length > 0 && !single && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Hier ging het mis</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {result.misses.map(m => (
              <li key={m.ply}>
                <button className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-2 ${selected === m.ply ? 'bg-surface-2' : ''}`} onClick={() => onSelect(m.ply)} aria-pressed={selected === m.ply}>
                  <span className="font-mono text-muted">{moveNumberLabel(m.ply)}</span>
                  <span>
                    {m.played.length ? <>Jij: <span className="font-mono">{m.played.join(', ')}</span> · </> : null}
                    juist: <b className="font-mono">{m.expected}</b>
                    {m.shown ? ' (getoond)' : m.hinted ? ' (met hint)' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Klik op een regel om de stelling op het bord te zien, met de juiste zet als pijl.</p>
        </div>
      )}
      {!single && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">De hele lijn</h3>
          <div className="mt-1"><MoveList sans={sans.slice(0, line.endPly ?? line.uci.length)} current={selected ?? -1} marked={new Set(result.misses.map(m => m.ply))} onSelect={p => onSelect(p - 1)} /></div>
        </div>
      )}
      {extra && <div className="mt-4 grid grid-cols-1 gap-2">{extra}</div>}
    </div>
  )
}

export function ResultNumbers({ result }: { result: LineResult }) {
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">direct goed</dt><dd className="text-lg font-bold tabular-nums">{result.correctFirstTry}/{result.userMoves}</dd></div>
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">{result.mistakes === 1 ? 'fout' : 'fouten'}</dt><dd className="text-lg font-bold tabular-nums">{result.mistakes}</dd></div>
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">XP</dt><dd className="text-lg font-bold tabular-nums">+{result.xp}</dd></div>
    </dl>
  )
}

function Explanation({ fen, name, info, stats, side, elo, lastSan, famIndex, family, hideAnswer, onReveal }: {
  fen: string; name?: string; info?: (typeof OPENING_INFO)[string]; stats: StatsFile | null; side: 'white' | 'black'; elo: number
  lastSan?: string; famIndex?: Map<string, PositionRef[]>; family?: FamilyFile; hideAnswer: boolean; onReveal: () => void
}) {
  const epd = epdOf(fen)
  const pos = stats?.positions[epd]
  const band = elo < 1200 ? 0 : elo < 1600 ? 1 : elo < 2000 ? 2 : 3
  const toMove = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const refs = famIndex?.get(epd) ?? []
  const lineNames = family ? [...new Set(refs.map(r => family.variations.find(v => v.id === r.variationId)).filter(Boolean).map(v => v!.path.join(', ') || family.family.name))] : []
  return (
    <div className="card space-y-3 p-4 text-sm animate-fade-up">
      <div>
        <h3 className="font-semibold">Uitleg bij deze stelling</h3>
        {name && <div className="text-muted">Lichess-naam: {name}</div>}
        {lastSan && <div className="text-muted">Laatste zet: {lastSan}, {describeSan(lastSan)}</div>}
      </div>
      {info && (
        <div>
          <div className="font-medium">Het idee van de opening</div>
          <p className="text-muted">{info.idea}</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{info.plans.slice(0, 3).map(p => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {lineNames.length > 0 && (
        <div className="text-muted">Deze stelling komt voor in {plural(lineNames.length, 'benoemde variant', 'benoemde varianten')}{lineNames.length <= 4 ? `: ${lineNames.join(' · ')}` : ''}.</div>
      )}
      <div>
        <div className="font-medium">Wat wordt hier gespeeld? <span className="font-normal text-muted">({toMove === 'white' ? 'wit' : 'zwart'} aan zet)</span></div>
        {hideAnswer ? (
          <div className="mt-1 rounded-lg bg-surface-2 p-3">
            <p className="text-muted">De statistiek verklapt de zet die je nu moet spelen.</p>
            <button className="btn btn-ghost mt-2 min-h-11" onClick={onReveal}>Toch tonen (telt als hint)</button>
          </div>
        ) : pos ? (
          <table className="mt-1 w-full text-xs">
            <thead className="text-muted"><tr><th className="text-left font-medium">Zet</th><th className="text-right font-medium">Alle niveaus</th><th className="text-right font-medium">Jouw niveau</th><th className="text-right font-medium">Score {side === 'white' ? 'wit' : 'zwart'}</th></tr></thead>
            <tbody>
              {pos.m.slice(0, 5).map(m => {
                const all = moveScore(m, side)
                const mine = moveScore(m, side, band)
                return (
                  <tr key={m[0]} className="border-t border-line">
                    <td className="py-1 font-mono">{m[1]}</td>
                    <td className="text-right">{pct(m[2] / pos.n)}</td>
                    <td className="text-right">{mine.n ? pct(mine.n / Math.max(1, pos.m.reduce((a, x) => a + bandCount(x, band), 0))) : '–'}</td>
                    <td className="text-right">{pct(all.score)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">Geen partijstatistiek voor deze stelling in de steekproef (te zeldzaam of te diep).</p>
        )}
        {pos && !hideAnswer && <p className="mt-1 text-xs text-muted">Bron: {nf(pos.n)} rated blitz/rapid/classical-partijen uit de Lichess-database (steekproef). Score = winst + ½ remise. Dit zegt iets over de praktijk, niet over de objectieve stellingswaarde.</p>}
      </div>
    </div>
  )
}
