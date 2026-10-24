import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { Board } from './Board'
import { ProgressBar, Stars, useSettings, pct, nf } from './ui'
import { START_FEN, describeSan, epdOf, formatMoves, moveNumberLabel, parseUci, uciOf } from '../lib/chess'
import { loadNames, loadStats, positionIndex, type PositionRef } from '../lib/data'
import { judgeMove, isUserPly, qualityFor, starsFor, moveScore, bandCount } from '../lib/trainer'
import { completeVariation, recordMistake, recordMove, checkBadges } from '../lib/progress'
import { moveLoss } from '../lib/engine'
import { OPENING_INFO } from '../content/openingInfo'
import type { FamilyFile, StatsFile, TrainingLine, TrainMode } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

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
}

interface PlyState {
  mistakes: number
  hints: number
  alternatives: number
  shown: boolean
}

type Feedback =
  | { kind: 'correct' | 'wrong' | 'alt' | 'illegal' | 'info' | 'hint' | 'learn' | 'bad' | 'ok'; text: ReactNode }
  | null

export interface TrainerProps {
  line: TrainingLine
  mode: TrainMode
  family?: FamilyFile
  sessionId?: number
  /** Wordt aangeroepen zodra de lijn uitgespeeld is */
  onComplete?: (r: LineResult) => void
  /** Eigen eindscherm; zonder dit toont de trainer een standaard samenvatting */
  renderEnd?: (r: LineResult, restart: () => void) => ReactNode
  /** Kleine kop boven het bord (bijv. voortgang in een dagelijkse sessie) */
  header?: ReactNode
  autoIntro?: boolean
}

const MODE_LABEL: Record<TrainMode, string> = { learn: 'Leren', practice: 'Oefenen', mastery: 'Mastery', review: 'Herhaling' }

export function Trainer({ line, mode, family, sessionId, onComplete, renderEnd, header, autoIntro = true }: TrainerProps) {
  const settings = useSettings()
  const startPly = line.startPly ?? 0
  const endPly = Math.min(line.endPly ?? line.uci.length, line.uci.length)

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
  const [hintLevel, setHintLevel] = useState(0)
  const [tempFen, setTempFen] = useState<{ fen: string; move: [string, string] } | null>(null)
  const [flash, setFlash] = useState<{ square: string; kind: 'good' | 'bad' | 'info' } | null>(null)
  const [showMoves, setShowMoves] = useState(false)
  const [showExplain, setShowExplain] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const [result, setResult] = useState<LineResult | null>(null)
  const [intro, setIntro] = useState(autoIntro && startPly === 0 && (mode === 'learn' || mode === 'practice'))
  const [names, setNames] = useState<Record<string, [string, string, string]> | null>(null)
  const [stats, setStats] = useState<StatsFile | null>(null)
  const xpRef = useRef(0)
  const newCardsRef = useRef(0)
  const busy = useRef(false)
  const runId = useRef(0)

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
    setHintLevel(0)
    setTempFen(null)
    setFlash(null)
    setResult(null)
    setShowFull(false)
    xpRef.current = 0
    newCardsRef.current = 0
    busy.current = false
  }, [startPly])

  // Bij een nieuwe lijn alles resetten
  useEffect(() => {
    restart()
    setIntro(autoIntro && startPly === 0 && (mode === 'learn' || mode === 'practice'))
  }, [line.key, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = ply >= endPly
  const userTurn = !done && isUserPly(ply, line.side)

  // Tegenstander speelt automatisch de boekzet
  useEffect(() => {
    if (done || userTurn || intro || showFull || result) return
    const id = runId.current
    const t = setTimeout(() => {
      if (id !== runId.current) return
      setPly(p => p + 1)
      setHintLevel(0)
    }, ply === startPly ? 350 : 520)
    return () => clearTimeout(t)
  }, [ply, done, userTurn, intro, showFull, result, startPly])

  // Leermodus: de zet wordt voorgedaan
  useEffect(() => {
    if (mode === 'learn' && userTurn && !intro) {
      setFeedback({ kind: 'learn', text: <>Speel <b>{sans[ply]}</b> — {describeSan(sans[ply])}.</> })
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
    const stars = mode === 'learn' ? 0 : starsFor(userPlies.length, mistakes + shown, hints)
    const finish = async () => {
      let xp = xpRef.current
      if (line.variationId && line.familyId && startPly === 0) {
        xp += await completeVariation({ variationId: line.variationId, familyId: line.familyId, stars, mistakes, hints, correct: correctFirstTry, mode })
      }
      const badges = await checkBadges()
      const r: LineResult = { userMoves: userPlies.length, correctFirstTry, mistakes, hints, alternatives, shown, stars, xp, newCards: newCardsRef.current, badges }
      setResult(r)
      onComplete?.(r)
    }
    const t = setTimeout(finish, 350)
    return () => clearTimeout(t)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const updatePly = (p: number, patch: (s: PlyState) => PlyState) =>
    setPlyState(prev => ({ ...prev, [p]: patch(prev[p] ?? { mistakes: 0, hints: 0, alternatives: 0, shown: false }) }))

  async function acceptCorrect(p: number, from: string, to: string) {
    const st = plyState[p] ?? { mistakes: 0, hints: 0, alternatives: 0, shown: false }
    const quality = mode === 'learn' ? 5 : qualityFor(st.mistakes, st.hints, st.alternatives, st.shown)
    setFlash({ square: to, kind: 'good' })
    setTimeout(() => setFlash(f => (f?.square === to ? null : f)), 600)
    setFeedback(mode === 'learn' ? { kind: 'correct', text: <>Goed! <b>{sans[p]}</b></> } : { kind: 'correct', text: <>{quality === 5 ? 'Correct' : 'Goed'}: <b>{sans[p]}</b></> })
    setPly(p + 1)
    setHintLevel(0)
    void from
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
    if (!userTurn || busy.current || viewPly !== null || showFull) return false
    const p = ply
    const verdict = judgeMove({ fen: fens[p], expected: line.uci[p], from, to, promotion, familyIndex: famIndex, names: names ?? undefined, stats })
    if (verdict.kind === 'illegal') {
      setFeedback({ kind: 'illegal', text: 'Dat is geen legale zet in deze stelling.' })
      return false
    }
    if (verdict.kind === 'correct') {
      void acceptCorrect(p, from, to)
      return true
    }
    // Verkeerde of alternatieve zet: kort tonen, dan terugzetten
    const c = new Chess(fens[p])
    c.move({ from, to, promotion: promotion ?? 'q' })
    busy.current = true
    setTempFen({ fen: c.fen(), move: [from, to] })
    const id = runId.current
    setTimeout(() => {
      if (id !== runId.current) return
      setTempFen(null)
      setFlash(null)
      busy.current = false
    }, 750)
    const playedUci = uciOf(verdict.move)
    if (verdict.kind === 'alternative') {
      updatePly(p, s => ({ ...s, alternatives: s.alternatives + 1 }))
      setFlash({ square: to, kind: 'info' })
      setFeedback({
        kind: 'alt',
        text: verdict.source === 'book'
          ? <><b>{verdict.move.san}</b> is ook theorie{verdict.name ? <> ({verdict.name})</> : null} — geen fout! Maar in deze variant leer je een andere zet. Probeer opnieuw.</>
          : <><b>{verdict.move.san}</b> wordt in de praktijk vaak gespeeld ({pct(verdict.share ?? 0)} van {nf(verdict.games ?? 0)} partijen), maar is niet de zet van deze variant. Probeer opnieuw.</>,
      })
      recordMistake({ sessionId, epd: epdOf(fens[p]), expected: line.uci[p], played: playedUci, result: 'alternative', familyId: line.familyId, variationId: line.variationId }).catch(() => {})
      return false
    }
    // fout
    const st = plyState[p] ?? { mistakes: 0, hints: 0, alternatives: 0, shown: false }
    const mistakes = st.mistakes + (mode === 'learn' ? 0 : 1)
    updatePly(p, s => ({ ...s, mistakes }))
    setFlash({ square: to, kind: 'bad' })
    recordMistake({ sessionId, epd: epdOf(fens[p]), expected: line.uci[p], played: playedUci, result: 'mistake', familyId: line.familyId, variationId: line.variationId }).catch(() => {})
    let text: ReactNode = <><b>{verdict.move.san}</b> is niet de aangeleerde zet{verdict.name ? <> (hij heeft wel een naam: {verdict.name}, maar wordt hier zelden gespeeld)</> : null}. {mode === 'mastery' ? 'Probeer het nog eens.' : 'Probeer het nog eens of vraag een hint.'}</>
    if (mode === 'learn') text = <>Speel de aangegeven zet <b>{sans[p]}</b>.</>
    else if (mistakes >= 3) {
      updatePly(p, s => ({ ...s, shown: true }))
      setHintLevel(2)
      text = <>De zet was <b>{sans[p]}</b> ({describeSan(sans[p])}). Speel hem nu zelf — deze positie komt snel terug in je herhalingen.</>
    } else if (mistakes === 2 && mode !== 'mastery') {
      setHintLevel(h => Math.max(h, 1))
      text = <><b>{verdict.move.san}</b> is het niet. Hint: het gemarkeerde stuk moet bewegen.</>
    }
    setFeedback({ kind: 'wrong', text })
    // Optioneel: Stockfish onderscheidt een speelbare zet van een echte fout
    if (settings?.engineEnabled && mode !== 'learn') {
      moveLoss(fens[p], playedUci).then(r => {
        if (!r || id !== runId.current) return
        setFeedback(prev => {
          if (!prev || prev.kind !== 'wrong') return prev
          const extra = r.loss >= 150
            ? <div className="mt-1 text-danger">Stockfish: dit is ook objectief een slechte zet (ongeveer {(r.loss / 100).toFixed(1).replace('.', ',')} pion verlies).</div>
            : r.loss <= 50
              ? <div className="mt-1 text-info">Stockfish: objectief een speelbare zet (minder dan een halve pion verschil) — alleen niet de zet van deze lijn.</div>
              : <div className="mt-1 text-muted">Stockfish: een onnauwkeurigheid (ongeveer {(r.loss / 100).toFixed(1).replace('.', ',')} pion).</div>
          return { kind: prev.kind, text: <>{prev.text}{extra}</> }
        })
      }).catch(() => {})
    }
    return false
  }

  function hint() {
    if (!userTurn || mode === 'mastery') return
    const next = Math.min(2, hintLevel + 1)
    setHintLevel(next)
    updatePly(ply, s => ({ ...s, hints: s.hints + 1 }))
    setFeedback({ kind: 'hint', text: next === 1 ? 'Hint: verplaats het gemarkeerde stuk.' : <>De zet is <b>{sans[ply]}</b> — de pijl laat hem zien.</> })
  }

  function showMove() {
    if (!userTurn) return
    updatePly(ply, s => ({ ...s, shown: true }))
    setHintLevel(2)
    setFeedback({ kind: 'hint', text: <>De zet is <b>{sans[ply]}</b>. Speel hem nu zelf.</> })
  }

  function previousMove() {
    runId.current++
    busy.current = false
    setTempFen(null)
    setResult(null)
    // terug naar de vorige keer dat jij aan zet was
    let target = ply - 1
    while (target > startPly && !isUserPly(target, line.side)) target--
    if (target < startPly) target = startPly
    setPly(Math.max(startPly, target))
    setFeedback({ kind: 'info', text: 'Een zet teruggenomen. Speel opnieuw.' })
    setHintLevel(0)
  }

  // ---------- weergave ----------
  const displayPly = showFull ? (viewPly ?? endPly) : viewPly ?? ply
  const boardFen = !showFull && viewPly === null && tempFen ? tempFen.fen : fens[displayPly]
  const lastMove = !showFull && viewPly === null && tempFen ? tempFen.move : displayPly > 0 ? moves[displayPly - 1] : null
  const arrows: Arrow[] = []
  const expected = userTurn && viewPly === null && !showFull ? parseUci(line.uci[ply]) : null
  if (expected && (mode === 'learn' || hintLevel >= 2)) arrows.push({ startSquare: expected.from, endSquare: expected.to, color: mode === 'learn' ? 'rgba(47,125,79,0.85)' : 'rgba(58,110,165,0.85)' })
  const hintSquare = expected && hintLevel === 1 ? expected.from : null
  const doneUser = userPlies.filter(p => p < ply).length
  const info = line.familyId ? OPENING_INFO[line.familyId] : undefined
  const currentName = names?.[epdOf(fens[displayPly])]?.[1] ?? lastNamed(names, fens, displayPly)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowLeft') setViewPly(v => Math.max(0, (v ?? ply) - 1))
      if (e.key === 'ArrowRight') setViewPly(v => (v === null ? null : v + 1 >= ply && !showFull ? null : Math.min(endPly, v + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ply, endPly, showFull])

  if (result && !showFull) {
    return renderEnd ? <>{renderEnd(result, restart)}</> : <DefaultEnd result={result} restart={restart} mode={mode} />
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="mx-auto w-full max-w-[min(92vw,620px)] lg:max-w-[640px]">
        {header}
        <div className="relative">
        {intro && (
          <button className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/25 lg:hidden" onClick={() => setIntro(false)} aria-label="Start de training">
            <span className="btn btn-primary px-8 py-3 text-base shadow-lg">▶ Start</span>
          </button>
        )}
        <Board
          id={`trainer-${line.key}`}
          fen={boardFen}
          orientation={line.side}
          movable={userTurn && viewPly === null && !showFull && !intro ? line.side : undefined}
          onMove={onUserMove}
          lastMove={lastMove}
          arrows={arrows}
          hintSquare={hintSquare}
          flash={flash}
        />
        </div>
        {viewPly !== null && !showFull && (
          <div className="mt-2 flex items-center justify-between rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
            <span>Je bekijkt een eerdere stelling (na {viewPly} {viewPly === 1 ? 'zet' : 'halve zetten'}).</span>
            <button className="font-semibold underline" onClick={() => setViewPly(null)}>Terug naar training</button>
          </div>
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand">{MODE_LABEL[mode]} · {line.side === 'white' ? 'je speelt wit' : 'je speelt zwart'}</div>
              <h2 className="mt-0.5 font-bold leading-snug">{line.title}</h2>
              {line.subtitle && <div className="text-sm text-muted">{line.subtitle}</div>}
            </div>
          </div>
          <ProgressBar className="mt-3" value={userPlies.length ? doneUser / userPlies.length : done ? 1 : 0} label="Voortgang in deze lijn" />
          <div className="mt-1 text-xs text-muted">{startPly > 0 && endPly - startPly <= 1
            ? 'Losse positie: vind de zet die je eerder leerde.'
            : <>{doneUser} van {userPlies.length} zetten van jouw kant · lijn eindigt na {endPly} halve zetten{line.variationId ? ' (einde van de Lichess-data)' : ''}</>}</div>
        </div>

        {intro ? (
          <div className="card p-4 animate-fade-up">
            <h3 className="font-semibold">{info ? info.nameNl : 'Nieuwe variant'}</h3>
            {info && <p className="mt-1 text-sm text-muted">{info.idea}</p>}
            <p className="mt-2 text-sm">Zettenreeks: <span className="font-mono text-xs">{formatMoves(sans.slice(0, endPly))}</span></p>
            <p className="mt-2 text-sm text-muted">{mode === 'learn' ? 'De computer speelt de zetten van de tegenstander. Jij speelt de aangegeven zetten — de pijl laat zien wat je moet doen.' : 'Speel alle zetten van jouw kant uit je hoofd. De computer antwoordt met de boekzetten van de tegenstander.'}</p>
            <button className="btn btn-primary mt-3 w-full" onClick={() => setIntro(false)}>Start</button>
          </div>
        ) : (
          <FeedbackBox feedback={feedback} userTurn={userTurn} done={done} showFull={showFull} />
        )}

        <div className="grid grid-cols-3 gap-2">
          <button className="btn btn-ghost" onClick={hint} disabled={!userTurn || mode === 'mastery' || mode === 'learn' || intro} title="Hint">💡 Hint</button>
          <button className="btn btn-ghost" onClick={() => setShowExplain(s => !s)} title="Uitleg">📖 Uitleg</button>
          <button className="btn btn-ghost" onClick={previousMove} disabled={ply <= startPly || intro} title="Vorige zet">↶ Terug</button>
          <button className="btn btn-ghost" onClick={restart} title="Opnieuw beginnen">⟲ Opnieuw</button>
          <button className={`btn btn-ghost ${showFull ? 'border-brand' : ''}`} onClick={() => { setShowFull(s => !s); setViewPly(null) }} title="Toon volledige variant">👁 Variant</button>
          <button className={`btn btn-ghost ${showMoves ? 'border-brand' : ''}`} onClick={() => setShowMoves(s => !s)} title="Bekijk alle zetten">☰ Zetten</button>
        </div>
        {mode === 'mastery' && userTurn && (plyState[ply]?.mistakes ?? 0) > 0 && (
          <button className="btn btn-quiet" onClick={showMove}>Ik weet het niet — toon de zet</button>
        )}

        {showFull && (
          <div className="card p-4 animate-fade-up">
            <div className="mb-2 text-sm font-semibold">Volledige variant (bekijkmodus, niet gescoord)</div>
            <MoveList sans={sans.slice(0, endPly)} current={displayPly} onSelect={setViewPly} />
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost flex-1" onClick={() => setViewPly(v => Math.max(0, (v ?? endPly) - 1))}>◀</button>
              <button className="btn btn-ghost flex-1" onClick={() => setViewPly(v => Math.min(endPly, (v ?? endPly) + 1))}>▶</button>
              <button className="btn btn-primary flex-[2]" onClick={() => { setShowFull(false); setViewPly(null) }}>Terug naar training</button>
            </div>
          </div>
        )}

        {(showMoves || startPly > 0) && !showFull && (
          <div className="card p-4">
            <div className="mb-2 text-sm font-semibold">{startPly > 0 ? 'Zo ontstond deze stelling' : 'Gespeelde zetten'}</div>
            <MoveList sans={sans.slice(0, ply)} current={viewPly ?? ply} onSelect={p => setViewPly(p >= ply ? null : p)} />
            {currentName && <div className="mt-2 text-xs text-muted">Stelling: {currentName}</div>}
          </div>
        )}

        {showExplain && (
          <Explanation
            fen={fens[displayPly]}
            name={currentName}
            info={info}
            stats={stats}
            side={line.side}
            elo={settings?.elo ?? 1500}
            nextSan={done ? undefined : userTurn ? undefined : sans[displayPly]}
            lastSan={displayPly > 0 ? sans[displayPly - 1] : undefined}
            famIndex={famIndex}
            family={family}
          />
        )}
      </aside>
    </div>
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

function FeedbackBox({ feedback, userTurn, done, showFull }: { feedback: Feedback; userTurn: boolean; done: boolean; showFull: boolean }) {
  const tone = !feedback ? 'bg-surface-2 text-muted'
    : feedback.kind === 'correct' ? 'bg-brand-soft text-brand-strong'
    : feedback.kind === 'wrong' || feedback.kind === 'bad' ? 'bg-danger-soft text-danger'
    : feedback.kind === 'alt' || feedback.kind === 'hint' || feedback.kind === 'info' ? 'bg-info-soft text-info'
    : feedback.kind === 'illegal' ? 'bg-accent-soft text-ink'
    : 'bg-brand-soft text-brand-strong'
  const base = showFull ? 'Bekijkmodus' : done ? 'Lijn afgerond!' : userTurn ? 'Jij bent aan zet.' : 'De tegenstander denkt na…'
  return (
    <div className={`rounded-2xl px-4 py-3 text-sm ${tone} ${feedback?.kind === 'wrong' ? 'animate-shake' : ''}`} aria-live="polite">
      {feedback && !showFull ? feedback.text : base}
      {feedback && !showFull && userTurn && feedback.kind === 'correct' && <span className="ml-1 text-muted">— jij weer.</span>}
    </div>
  )
}

export function MoveList({ sans, current, onSelect, startPly = 0 }: { sans: string[]; current: number; onSelect?: (ply: number) => void; startPly?: number }) {
  if (!sans.length) return <div className="text-sm text-muted">Nog geen zetten.</div>
  return (
    <div className="flex max-h-48 flex-wrap gap-x-1 gap-y-1 overflow-y-auto font-mono text-sm scrollbar-thin">
      {sans.map((s, i) => {
        const ply = startPly + i
        return (
          <span key={i} className="inline-flex items-center">
            {(ply % 2 === 0 || i === 0) && <span className="mr-0.5 text-muted">{moveNumberLabel(ply)}</span>}
            <button
              className={`rounded px-1 ${current === ply + 1 ? 'bg-brand text-white' : 'hover:bg-surface-2'}`}
              onClick={() => onSelect?.(ply + 1)}
            >
              {s}
            </button>
          </span>
        )
      })}
    </div>
  )
}

function Explanation({ fen, name, info, stats, side, elo, lastSan, famIndex, family }: {
  fen: string; name?: string; info?: (typeof OPENING_INFO)[string]; stats: StatsFile | null; side: 'white' | 'black'; elo: number
  nextSan?: string; lastSan?: string; famIndex?: Map<string, PositionRef[]>; family?: FamilyFile
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
        <div className="font-semibold">Uitleg bij deze stelling</div>
        {name && <div className="text-muted">Lichess-naam: {name}</div>}
        {lastSan && <div className="text-muted">Laatste zet: {lastSan} — {describeSan(lastSan)}</div>}
      </div>
      {info && (
        <div>
          <div className="font-medium">Het idee van de opening</div>
          <p className="text-muted">{info.idea}</p>
          <ul className="mt-1 list-disc pl-5 text-muted">{info.plans.slice(0, 3).map(p => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      {lineNames.length > 0 && (
        <div className="text-muted">Deze stelling komt voor in {lineNames.length} benoemde {lineNames.length === 1 ? 'variant' : 'varianten'}{lineNames.length <= 4 ? `: ${lineNames.join(' · ')}` : ''}.</div>
      )}
      <div>
        <div className="font-medium">Wat wordt hier gespeeld? <span className="font-normal text-muted">({toMove === 'white' ? 'wit' : 'zwart'} aan zet)</span></div>
        {pos ? (
          <table className="mt-1 w-full text-xs tabular-nums">
            <thead className="text-muted"><tr><th className="text-left">Zet</th><th className="text-right">Alle niveaus</th><th className="text-right">Jouw niveau</th><th className="text-right">Score {side === 'white' ? 'wit' : 'zwart'}</th></tr></thead>
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
        {pos && <p className="mt-1 text-xs text-muted">Bron: {nf(pos.n)} rated blitz/rapid/classical-partijen uit de Lichess-database (steekproef). Score = winst + ½ remise. Dit zegt iets over de praktijk, niet over de objectieve stellingswaarde.</p>}
      </div>
    </div>
  )
}

function DefaultEnd({ result, restart, mode }: { result: LineResult; restart: () => void; mode: TrainMode }) {
  return (
    <div className="card mx-auto max-w-md p-6 text-center animate-pop">
      <div className="text-4xl">{mode === 'learn' ? '📘' : result.stars === 3 ? '🏆' : '✅'}</div>
      <h2 className="mt-2 text-xl font-bold">{mode === 'learn' ? 'Variant doorlopen' : 'Lijn afgerond'}</h2>
      {mode !== 'learn' && <div className="mt-1"><Stars count={result.stars} size="text-2xl" /></div>}
      <ResultNumbers result={result} />
      <button className="btn btn-primary mt-4 w-full" onClick={restart}>Nog een keer</button>
    </div>
  )
}

export function ResultNumbers({ result }: { result: LineResult }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-lg font-bold">{result.correctFirstTry}/{result.userMoves}</div><div className="text-muted">direct goed</div></div>
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-lg font-bold">{result.mistakes}</div><div className="text-muted">fouten</div></div>
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-lg font-bold">+{result.xp}</div><div className="text-muted">XP</div></div>
      {result.badges.length > 0 && (
        <div className="col-span-3 rounded-xl bg-accent-soft p-2 animate-pop">
          {result.badges.map(b => <div key={b.id}>{b.icon} Nieuwe badge: <b>{b.title}</b> — {b.description}</div>)}
        </div>
      )}
    </div>
  )
}
