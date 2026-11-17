import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { ArrowDownUp, BookOpen, Brain, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CircleX, Ellipsis, Eye, Hourglass, Info, Keyboard, Lightbulb, ListOrdered, MoveUpRight, RotateCcw, Undo2 } from 'lucide-react'
import { Board } from './Board'
import { PieceIcon } from './CropBoard'
import { TrainingHeading, TrainingSheet, TrainingTopBar } from './TrainingModeChrome'
import { MoveInput, TypeToggle, useTypingOpen } from './MoveInput'
import { ProgressBar, Stars, Tabs, useSettings, useWide, pct, BadgesEarned } from './ui'
import { START_FEN, describeSan, epdOf, moveNumberLabel, parseUci, uciOf } from '../lib/chess'
import { loadNames, loadStats, positionIndex, type PositionRef } from '../lib/data'
import { judgeMove, isUserPly, qualityFor, starsFor, moveScore, bandCount } from '../lib/trainer'
import { completeVariation, recordMistake, recordMove, checkBadges } from '../lib/progress'
import { moveLoss } from '../lib/engine'
import { OPENING_INFO } from '../content/openingInfo'
import type { FamilyFile, StatsFile, TrainingLine, TrainMode } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'
import { locale, t, tn, tr } from '../lib/i18n'

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
type Feedback = { kind: FeedbackKind; title?: ReactNode; text: ReactNode } | null

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
  /** Telt de lijn als afgeronde variant? Standaard alleen als de hele lijn vanaf zet 1 gespeeld is */
  completes?: boolean
  /** Eigen kop in de eindsamenvatting */
  endTitle?: string
  /** Trainingsmodus (ontwerp 10f/12d): bovenbalk met sluiten, voortgangsbalk en teller */
  onClose?: () => void
  closeLabel?: string
  /** Wisselen tussen Leren, Oefenen en Uit het hoofd, in het vel achter Meer (ontwerp 12f); op desktop onderaan het paneel (15b) */
  modes?: { value: TrainMode; onChange: (m: TrainMode) => void }
  /**
   * Desktop (ontwerp 15b/15c): de training vult het hele scherm zonder zijmenu. Een witte balk bovenin over de
   * volle breedte, en na een goede zet een groene balk onderin over de volle breedte.
   */
  fullScreen?: boolean
  /** Melding bovenaan het paneel naast het bord (alleen desktop), bijv. een vraag voor je van soort training wisselt */
  notice?: ReactNode
}

const MODE_LABEL: Record<TrainMode, string> = { learn: 'Leren', practice: 'Oefenen', mastery: 'Uit het hoofd', review: 'Herhaling' }
/** Kleur van het label boven de titel: nieuw is goud, herhalen groen (ontwerp ronde 10) */
const MODE_TONE: Record<TrainMode, 'accent' | 'brand'> = { learn: 'accent', practice: 'accent', mastery: 'brand', review: 'brand' }
const MODE_CHOICES: { value: TrainMode; label: string; text: string; icon: ReactNode }[] = [
  { value: 'learn', label: 'Leren', text: 'Met pijlen: je ziet de zet', icon: <MoveUpRight size={20} /> },
  { value: 'practice', label: 'Oefenen', text: 'Zonder pijlen, wel hints', icon: <Lightbulb size={20} /> },
  { value: 'mastery', label: 'Uit het hoofd', text: 'Zonder hulp, zonder terug', icon: <Brain size={20} /> },
]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sideNl = (s: 'white' | 'black') => (s === 'white' ? t('Wit') : t('Zwart'))
/** 'wit' of 'zwart', klein, midden in een zin */
const sideLower = (s: 'white' | 'black') => (s === 'white' ? t('wit') : t('zwart'))
const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function Trainer({ line, mode, family, sessionId, onComplete, renderEnd, renderEndExtra, header, autoIntro = true, onProgressChange, completes, endTitle, onClose, closeLabel = t('Stoppen'), modes, fullScreen, notice }: TrainerProps) {
  const settings = useSettings()
  const startPly = line.startPly ?? 0
  const endPly = Math.min(line.endPly ?? line.uci.length, line.uci.length)
  // Bekende zetten vóór startPly worden snel voorgespeeld, zodat je ziet hoe de stelling ontstond
  const previewStart = Math.min(line.previewFrom ?? startPly, startPly)
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

  const [ply, setPly] = useState(previewStart)
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
  const [flipped, setFlipped] = useState(false)
  const [wrongAt, setWrongAt] = useState<{ ply: number; square: string } | null>(null)
  // Fout uit je partij (line.replayMistake): 'show' = je oude zet staat op het bord, 'done' = teruggenomen, nu jij
  const [mistakeStep, setMistakeStep] = useState<'idle' | 'show' | 'done'>('idle')
  const mistakeRun = useRef(-1)
  const wide = useWide()
  const full = !!fullScreen && wide
  // Laatste goede zet voor de groene balk onderin (desktop, ontwerp 15c); blijft staan tot je volgende actie
  const [good, setGood] = useState<Feedback>(null)
  const [typing, setTyping] = useTypingOpen()
  const [focusTyping, setFocusTyping] = useState(false)
  const toggleTyping = () => { setFocusTyping(!typing); setTyping(!typing) }
  const [result, setResult] = useState<LineResult | null>(null)
  const [intro, setIntro] = useState(wantsIntro)
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
    setPly(previewStart)
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
    setWrongAt(null)
    setMistakeStep('idle')
    setGood(null)
    xpRef.current = 0
    newCardsRef.current = 0
    busy.current = false
  }, [previewStart])

  // Bij een nieuwe lijn alles resetten
  useEffect(() => {
    restart()
    setIntro(wantsIntro)
  }, [line.key, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const done = ply >= endPly
  const previewing = ply < startPly
  const userTurn = !done && !previewing && isUserPly(ply, line.side)

  useEffect(() => {
    // Pas "halverwege" als je zelf een zet hebt gedaan; de openingszet van de computer telt niet
    onProgressChange?.(!result && userPlies.some(p => p < ply))
  }, [ply, result, userPlies]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tegenstander speelt automatisch de boekzet, en dat wordt ook in tekst gemeld
  useEffect(() => {
    if (done || userTurn || intro || showFull || result) return
    const id = runId.current
    const timer = setTimeout(() => {
      if (id !== runId.current) return
      if (ply < startPly) setOpponentLine(t('Voorgespeeld: {move}', { move: `${moveNumberLabel(ply)} ${sans[ply]}` }))
      else {
        const vars = { side: sideNl(opponent), san: sans[ply], desc: describeSan(sans[ply]) }
        setOpponentLine(ply === startPly ? t('{side} speelt {san} ({desc}).', vars) : t('{side} antwoordt {san} ({desc}).', vars))
      }
      setPly(p => p + 1)
      setHintLevel(0)
    }, ply < startPly ? 380 : ply === startPly ? 350 : 520)
    return () => clearTimeout(timer)
  }, [ply, done, userTurn, intro, showFull, result, startPly, opponent, sans])

  // Fout uit je eigen partij: laat eerst zien wat je speelde, markeer het als fout, neem het terug, en dan ben jij
  useEffect(() => {
    const rm = line.replayMistake
    if (!rm || !userTurn || ply !== startPly || mistakeStep !== 'idle' || intro || showFull || result) return
    if (mistakeRun.current === runId.current) return
    mistakeRun.current = runId.current
    const id = runId.current
    let wrong: { fen: string; from: string; to: string } | null = null
    try {
      const c = new Chess(fens[ply])
      const m = c.move(rm.san)
      wrong = { fen: c.fen(), from: m.from, to: m.to }
    } catch { /* zet past niet (meer) in deze stelling: gewoon meteen zelf spelen */ }
    if (!wrong) { setMistakeStep('done'); return }
    const w = wrong
    const show = setTimeout(() => {
      if (id !== runId.current) return
      setMistakeStep('show')
      setOpponentLine(null)
      setTempFen({ fen: w.fen, move: [w.from, w.to] })
      setFlash({ square: w.to, kind: 'bad' })
      setFeedback({ kind: 'wrong', title: t('In je partij speelde je {san}', { san: rm.san }), text: rm.label ? t('Dat was een {label}. Kijk goed, de zet wordt zo teruggenomen.', { label: rm.label }) : t('Dat was een fout. Kijk goed, de zet wordt zo teruggenomen.') })
    }, 450)
    const back = setTimeout(() => {
      if (id !== runId.current) return
      setTempFen(null)
      setFlash(null)
      setMistakeStep('done')
      setFeedback({ kind: 'info', title: t('Teruggenomen'), text: t('Vind nu de betere zet.') })
    }, 450 + 2600)
    // Alleen opruimen bij een nieuwe lijn of opnieuw beginnen (runId verandert), niet bij elke stap van de fout zelf
    return () => { if (id !== runId.current) { clearTimeout(show); clearTimeout(back) } }
  }, [line.replayMistake, userTurn, ply, startPly, mistakeStep, intro, showFull, result, fens]) // eslint-disable-line react-hooks/exhaustive-deps

  // De groene balk verdwijnt zodra er iets anders te melden is (fout, hint, terug …)
  useEffect(() => {
    if (feedback && feedback.kind !== 'correct' && feedback.kind !== 'learn') setGood(null)
  }, [feedback])

  // Leermodus: de zet wordt voorgedaan
  useEffect(() => {
    if (mode === 'learn' && userTurn && !intro) {
      setFeedback({ kind: 'learn', title: t('Speel {san}', { san: sans[ply] }), text: <>{cap(describeSan(sans[ply]))}.</> })
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
      if (line.variationId && line.familyId && (completes ?? startPly === 0)) {
        xp += await completeVariation({ variationId: line.variationId, familyId: line.familyId, stars, mistakes, hints, correct: correctFirstTry, mode })
      }
      const badges = await checkBadges()
      const r: LineResult = { userMoves: userPlies.length, correctFirstTry, mistakes, hints, alternatives, shown, stars, xp, newCards: newCardsRef.current, badges, misses }
      setResult(r)
      setViewPly(null)
      onComplete?.(r)
    }
    const timer = setTimeout(finish, 350)
    return () => clearTimeout(timer)
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  const updatePly = (p: number, patch: (s: PlyState) => PlyState) =>
    setPlyState(prev => ({ ...prev, [p]: patch(prev[p] ?? emptyPly()) }))

  async function acceptCorrect(p: number, to: string) {
    const st = plyState[p] ?? emptyPly()
    const quality = mode === 'learn' ? 5 : qualityFor(st.mistakes, st.hints, st.alternatives, st.shown)
    setFlash({ square: to, kind: 'good' })
    setTimeout(() => setFlash(f => (f?.square === to ? null : f)), 600)
    setOpponentLine(null)
    setWrongAt(null)
    const fb: Feedback = { kind: 'correct', title: t('Goed'), text: <><b>{sans[p]}</b> {mode !== 'learn' && quality === 5 ? t('klopt, in één keer.') : t('is goed.')}</> }
    setFeedback(fb)
    setGood(fb)
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
    // Eerst de fout uit je partij laten zien; tot hij is teruggenomen kun je nog niet zetten
    if (line.replayMistake && ply === startPly && mistakeStep !== 'done') return false
    const p = ply
    const verdict = judgeMove({ fen: fens[p], expected: line.uci[p], from, to, promotion, familyIndex: famIndex, names: names ?? undefined, stats })
    if (verdict.kind === 'illegal') {
      setFeedback({ kind: 'illegal', title: t('Ongeldige zet'), text: t('Dat is geen legale zet in deze stelling.') })
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
    setWrongAt({ ply: p, square: to })
    recordMistake({ sessionId, epd: epdOf(fens[p]), expected: line.uci[p], played: playedUci, result: 'mistake', familyId: line.familyId, variationId: line.variationId }).catch(() => {})
    let title: ReactNode = t('Niet deze zet')
    let text: ReactNode = <><b>{verdict.move.san}</b> {t('is niet de zet uit deze variant.')} {mode === 'mastery' ? t('Probeer het nog eens.') : t('Probeer het nog eens of vraag een hint.')}</>
    if (mode === 'learn') {
      // Ontwerp 12d: rode kaart en een ring op het juiste veld
      title = t('Bijna')
      text = tr(
        <>Niet <b>{verdict.move.san}</b> maar <b>{sans[p]}</b>. Zet het stuk op het veld met de ring ({parseUci(line.uci[p]).to}).</>,
        <>Not <b>{verdict.move.san}</b> but <b>{sans[p]}</b>. Move the piece to the ringed square ({parseUci(line.uci[p]).to}).</>,
      )
    } else if (mistakes >= 3) {
      updatePly(p, s => ({ ...s, shown: true }))
      setHintLevel(2)
      title = t('Zo moet het')
      text = tr(
        <>De zet was <b>{sans[p]}</b> ({describeSan(sans[p])}), naar het veld met de ring. Speel hem nu zelf. Deze stelling komt snel terug in je herhalingen.</>,
        <>The move was <b>{sans[p]}</b> ({describeSan(sans[p])}), to the ringed square. Now play it yourself. This position will come back soon in your reviews.</>,
      )
    } else if (mistakes === 2 && mode !== 'mastery') {
      setHintLevel(h => Math.max(h, 1))
      title = t('Nog niet')
      text = <><b>{verdict.move.san}</b> {t('is het ook niet. Hint: het gemarkeerde stuk moet bewegen.')}</>
    }
    setFeedback({ kind: 'wrong', title, text })
    // Optioneel: Stockfish onderscheidt een speelbare zet van een echte fout
    if (settings?.engineEnabled && mode !== 'learn') {
      moveLoss(fens[p], playedUci).then(r => {
        if (!r || id !== runId.current) return
        setFeedback(prev => {
          if (!prev || prev.kind !== 'wrong') return prev
          const loss = (r.loss / 100).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          const extra = r.loss >= 150
            ? <span className="mt-1 block">{t('Stockfish: dit is ook objectief een slechte zet (ongeveer {loss} pion verlies).', { loss })}</span>
            : r.loss <= 50
              ? <span className="mt-1 block">{t('Stockfish: objectief speelbaar (minder dan een halve pion verschil), alleen niet de zet van deze lijn.')}</span>
              : <span className="mt-1 block">{t('Stockfish: een onnauwkeurigheid (ongeveer {loss} pion).', { loss })}</span>
          return { ...prev, text: <>{prev.text}{extra}</> }
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
    setFeedback({ kind: 'hint', title: t('Hint'), text: next === 1 ? t('Verplaats het gemarkeerde stuk.') : tr(<>De zet is <b>{sans[ply]}</b>; de pijl laat hem zien.</>, <>The move is <b>{sans[ply]}</b>; the arrow shows it.</>) })
  }

  function showMove() {
    if (!userTurn) return
    updatePly(ply, s => ({ ...s, shown: true }))
    setHintLevel(2)
    setFeedback({ kind: 'hint', title: t('De zet'), text: tr(<>De zet is <b>{sans[ply]}</b>. Speel hem nu zelf.</>, <>The move is <b>{sans[ply]}</b>. Now play it yourself.</>) })
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
    setWrongAt(null)
    setFeedback({ kind: 'info', title: t('Teruggenomen'), text: t('Een zet teruggenomen. Speel opnieuw.') })
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
      else if (k === 't') { e.preventDefault(); toggleTyping() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
  const wrongSquare = expected && !tempFen && wrongAt?.ply === ply ? wrongAt.square : null
  const ringSquare = expected && !intro && wrongAt?.ply === ply && (mode === 'learn' || hintLevel >= 2) ? expected.to : null
  const doneUser = userPlies.filter(p => p < ply).length
  const info = line.familyId ? OPENING_INFO[line.familyId] : undefined
  const currentName = names?.[epdOf(fens[displayPly])]?.[1] ?? lastNamed(names, fens, displayPly)
  const canHint = userTurn && mode !== 'mastery' && mode !== 'learn' && !intro
  const meta = [t(MODE_LABEL[mode]), family?.family.name ?? sideNl(line.side)].join(' · ')
  const single = startPly > 0 && endPly - startPly <= 1
  const recent = [displayPly - 2, displayPly - 1].filter(p => p >= 0 && p < sans.length)
  const boardLabel = userTurn ? t('Schaakbord, je speelt {side}, jij bent aan zet', { side: sideLower(line.side) }) : t('Schaakbord, je speelt {side}', { side: sideLower(line.side) })

  const explain = (part?: 'stats' | 'rest') => (
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
      part={part}
    />
  )
  const closeMenu = () => setMenuOpen(false)
  const heading = (
    <TrainingHeading
      tone={MODE_TONE[mode]}
      label={meta}
      title={<span className="line-clamp-2 text-balance">{line.title}</span>}
      sub={line.sub ?? (single ? t('Losse positie: vind de zet die je eerder leerde.') : undefined)}
      action={!wide && recent.length > 0 && (
        <ol className="flex shrink-0 flex-wrap justify-end gap-1.5 pb-0.5" aria-label={t('Laatste zetten')}>
          {recent.map((p, i) => {
            const latest = p === displayPly - 1
            const label = p % 2 === 0 ? `${moveNumberLabel(p)}${sans[p]}` : i === 0 || recent.length === 1 ? `${moveNumberLabel(p)}${sans[p]}` : sans[p]
            return <li key={p} className={`rounded-lg border px-2 py-0.5 text-[13px] font-bold tabular-nums ${latest ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line bg-surface-2 text-ink'}`} aria-current={latest ? 'step' : undefined}>{label}</li>
          })}
        </ol>
      )}
    />
  )
  // Desktop: de zet die je nu zoekt als "3.?" achter de gespeelde zetten (ontwerp 15b)
  const nextPly = userTurn && viewPly === null && !showFull && !intro ? ply : undefined
  const moreButton = (
    <IconButton icon={<Ellipsis size={18} />} label={t('Meer')} onClick={() => setMenuOpen(true)} expanded={menuOpen} square={wide && !!modes} row={wide && !modes} hint={wide ? t('Meer: bord draaien, alle zetten, zet typen (T); ← → bladert door eerdere zetten') : undefined} />
  )

  return (
    <div>
    {onClose && (
      <TrainingTopBar
        value={result || !userPlies.length ? (done ? 1 : 0) : doneUser / userPlies.length}
        count={`${doneUser}/${userPlies.length}`}
        countLabel={tn(userPlies.length, '{done} van {n} zet gespeeld', '{done} van {n} zetten gespeeld', { done: doneUser })}
        onClose={onClose}
        closeLabel={closeLabel}
        full={fullScreen}
      />
    )}
    {/* Desktop (ontwerp 15b): bord links, rechts een paneel met de variant, de feedback, vier knoppen en wat er gespeeld wordt */}
    <div className={`grid gap-4 ${onClose ? 'mt-2.5' : ''} ${fullScreen ? 'lg:mx-auto lg:mt-0 lg:max-w-[1056px] lg:grid-cols-[auto_minmax(320px,400px)] lg:justify-center lg:gap-8 lg:px-8 lg:pb-[124px] lg:pt-7' : 'lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start'}`}>
      <div className={`-mx-2 sm:mx-auto sm:w-full sm:max-w-[min(92vw,620px)] ${fullScreen ? 'lg:mx-0 lg:w-[min(560px,calc(100dvh-220px),calc(100vw-480px))] lg:max-w-none lg:self-start' : 'lg:max-w-[min(640px,calc(100dvh-160px))]'}`}>
        {header && <div className="px-2 sm:px-0">{header}</div>}
        {/* Kop boven het bord (ontwerp 10f): soort training en opening, titel en de laatste zetten. Op desktop in het paneel. */}
        {!wide && <div className="mb-3.5 px-2 sm:px-0">{heading}</div>}
        <div className="relative">
          {intro && (
            <button className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/25 lg:hidden" onClick={() => setIntro(false)} aria-label={t('Start de training')}>
              <span className="btn btn-primary px-8 py-3 text-base shadow-lg">{tr('Start', 'Start')}</span>
            </button>
          )}
          <Board
            id={`trainer-${line.key}`}
            label={boardLabel}
            fen={boardFen}
            orientation={flipped ? opponent : line.side}
            movable={userTurn && viewPly === null && !showFull && !intro && !result ? line.side : undefined}
            onMove={onUserMove}
            lastMove={lastMove}
            arrows={arrows}
            hintSquare={hintSquare}
            flash={flash}
            wrongSquare={wrongSquare}
            ringSquare={ringSquare}
          />
        </div>
        <div className="px-2 sm:px-0">
          {/* Voortgang direct onder het bord, zodat je hem ziet zonder te scrollen (in de trainingsmodus staat hij bovenaan) */}
          {!result && !onClose && (
            <div className="mt-1 flex min-h-11 items-center gap-3">
              {!single && (
                <>
                  {userPlies.length > 1 && userPlies.length <= 16
                    ? <MoveSquares plies={userPlies} ply={ply} state={plyState} />
                    : <ProgressBar className="flex-1" value={userPlies.length ? doneUser / userPlies.length : done ? 1 : 0} label={t('Voortgang in deze lijn')} />}
                  <span className="shrink-0 text-xs tabular-nums text-muted">{doneUser}/{tn(userPlies.length, '{n} zet', '{n} zetten')}</span>
                </>
              )}
              {!showFull && !intro && <TypeToggle open={typing} onToggle={toggleTyping} className="ml-auto -mr-2" />}
            </div>
          )}
          {!result && onClose && !fullScreen && !showFull && !intro && (
            <div className="mt-1 hidden min-h-11 items-center justify-end lg:flex"><TypeToggle open={typing} onToggle={toggleTyping} className="-mr-2" /></div>
          )}
          {viewPly !== null && !showFull && !result && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info-ink">
              <span>{tn(viewPly, 'Je bekijkt een eerdere stelling (na {n} halve zet).', 'Je bekijkt een eerdere stelling (na {n} halve zetten).')}</span>
              <button className="min-h-11 font-semibold underline" onClick={() => setViewPly(null)}>{t('Terug naar training')}</button>
            </div>
          )}
          {!result && !showFull && !intro && typing && (
            <MoveInput fen={fens[ply] ?? fens[endPly]} enabled={userTurn && viewPly === null && !busy.current} onMove={onUserMove} autoFocus={focusTyping} className="mt-1" />
          )}
        </div>
      </div>

      <aside className={`flex flex-col gap-3 ${wide ? 'lg:gap-2.5' : ''}`}>
        {wide && !result && (
          <div>
            {heading}
            <MoveChips sans={sans} upto={displayPly} next={nextPly} />
          </div>
        )}
        {wide && !result && notice}
        {result ? (
          <EndPanel
            line={line}
            mode={mode}
            result={result}
            sans={sans}
            startPly={startPly}
            selected={viewPly}
            onSelect={p => setViewPly(v => (v === p ? null : p))}
            actions={renderEnd ? renderEnd(result, restart) : <button className="btn btn-primary w-full" onClick={restart}>{t('Nog een keer')}</button>}
            extra={renderEndExtra?.(result)}
            title={endTitle}
          />
        ) : (
          <>
            {intro ? (
              <div className="card order-2 p-4 animate-fade-up lg:order-none">
                <p className="text-sm text-muted">{t('Speel de zet van de pijl; de computer speelt de tegenstander.')}</p>
                <button className="btn btn-primary mt-3 w-full max-lg:hidden" onClick={() => setIntro(false)}>{tr('Start', 'Start')} <kbd className="ml-1 hidden rounded border border-white/40 px-1 text-xs font-normal lg:inline">Enter</kbd></button>
              </div>
            ) : (
              // Desktop over het hele scherm: een goede zet staat in de groene balk onderin, niet hier
              <FeedbackBox feedback={full && feedback?.kind === 'correct' ? null : feedback} opponentLine={opponentLine} userTurn={userTurn} done={done} showFull={showFull} chips={wide} />
            )}

            {!intro && (wide ? (
              // Desktop (ontwerp 15b): twee bij twee, met de sneltoets op de knop; Meer staat onderaan het paneel
              <div className="grid grid-cols-2 gap-2.5">
                <IconButton icon={<Lightbulb size={18} />} label={t('Hint')} shortcut="H" onClick={hint} disabled={!canHint} row />
                <IconButton icon={<BookOpen size={18} />} label={t('Uitleg')} shortcut="U" onClick={() => setShowExplain(s => !s)} pressed={showExplain} row />
                <IconButton icon={<Undo2 size={18} />} label={t('Terug')} shortcut="Z" onClick={previousMove} disabled={ply <= startPly} row />
                <IconButton icon={<RotateCcw size={18} />} label={t('Opnieuw')} shortcut="R" onClick={restart} row />
              </div>
            ) : (
              <div className="order-1 grid grid-cols-4 gap-2 lg:order-none">
                <IconButton icon={<Lightbulb size={18} />} label={t('Hint')} shortcut="H" onClick={hint} disabled={!canHint} />
                <IconButton icon={<BookOpen size={18} />} label={t('Uitleg')} shortcut="U" onClick={() => setShowExplain(s => !s)} pressed={showExplain} />
                <IconButton icon={<Undo2 size={18} />} label={t('Terug')} shortcut="Z" onClick={previousMove} disabled={ply <= startPly} />
                {moreButton}
              </div>
            ))}
            {mode === 'mastery' && userTurn && (plyState[ply]?.mistakes ?? 0) > 0 && (
              <button className="btn btn-quiet order-1 lg:order-none" onClick={showMove}>{t('Ik weet het niet: toon de zet')}</button>
            )}

            {showFull && (
              <div className="card order-3 p-4 animate-fade-up lg:order-none">
                <div className="mb-2 text-sm font-semibold">{t('Volledige variant (bekijkmodus, telt niet mee)')}</div>
                <MoveList sans={sans.slice(0, endPly)} current={displayPly} onSelect={setViewPly} />
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-ghost min-h-11 flex-1" onClick={() => setViewPly(v => Math.max(0, (v ?? endPly) - 1))} aria-label={t('Vorige zet')}><ChevronLeft size={18} aria-hidden /></button>
                  <button className="btn btn-ghost min-h-11 flex-1" onClick={() => setViewPly(v => Math.min(endPly, (v ?? endPly) + 1))} aria-label={t('Volgende zet')}><ChevronRight size={18} aria-hidden /></button>
                  <button className="btn btn-primary min-h-11 flex-[2]" onClick={() => { setShowFull(false); setViewPly(null) }}>{t('Terug naar training')}</button>
                </div>
              </div>
            )}

            {(showMoves || startPly > 0) && !showFull && (
              <div className="card order-3 p-4 lg:order-none">
                <div className="mb-2 text-sm font-semibold">{startPly > 0 ? t('Zo ontstond deze stelling') : t('Gespeelde zetten')}</div>
                <MoveList sans={sans.slice(0, ply)} current={viewPly ?? ply} onSelect={p => setViewPly(p >= ply ? null : p)} />
                {currentName && <div className="mt-2 text-xs text-muted">{t('Stelling:')} {currentName}</div>}
              </div>
            )}

            {/* Groot scherm: wat er gespeeld wordt staat altijd naast het bord (ontwerp 15b); Uitleg voegt het idee toe.
                Telefoon: alles als vel over het bord (ontwerp 12e) */}
            {wide && explain('stats')}
            {wide && showExplain && explain('rest')}
            {wide && (
              <div className="mt-auto pt-1.5">
                <div className="flex items-stretch gap-2">
                  {modes && (
                    <div className="min-w-0 flex-1">
                      <Tabs<TrainMode> stretch label={t('Soort training')} value={modes.value} onChange={modes.onChange} options={MODE_CHOICES.map(c => ({ value: c.value, label: t(c.label) }))} />
                    </div>
                  )}
                  {moreButton}
                </div>
              </div>
            )}
          </>
        )}
      </aside>

      <TrainingSheet open={showExplain && !wide && !result} onClose={() => setShowExplain(false)} title={tr('Uitleg', 'Explanation')} cards>
        {explain()}
      </TrainingSheet>

      {/* Meer (ontwerp 12f): de trainingssoort en de overige acties in één vel. Op desktop staat de soort al onderaan het paneel. */}
      <TrainingSheet open={menuOpen && !result} onClose={closeMenu} title={modes && !wide ? t('Hoe wil je trainen?') : t('Meer')} cards>
        {modes && !wide && (
          <ul className="flex flex-col gap-2.5" aria-label={t('Trainingssoort')}>
            {MODE_CHOICES.map(c => {
              const on = c.value === modes.value
              return (
                <li key={c.value}>
                  <button type="button" className={`tap flex w-full items-center gap-3 rounded-2xl! px-3.5 py-3 text-left ${on ? 'tap-on' : ''}`} aria-pressed={on} onClick={() => { closeMenu(); modes.onChange(c.value) }}>
                    <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-surface text-brand-strong' : 'bg-surface-2 text-ink'}`}>{c.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold leading-tight">{t(c.label)}</span>
                      <span className={`block text-[13px] ${on ? 'text-brand-strong' : 'text-muted'}`}>{t(c.text)}</span>
                    </span>
                    <CircleCheck size={22} strokeWidth={2.25} aria-hidden className={`shrink-0 ${on ? 'text-brand' : 'text-line'}`} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="card divide-y-2 divide-surface-2 overflow-hidden">
          <SheetRow icon={<RotateCcw size={18} />} label={t('Opnieuw beginnen')} shortcut="R" onClick={() => { restart(); closeMenu() }} />
          <SheetRow icon={<Eye size={18} />} label={showFull ? t('Terug naar training') : t('Toon volledige variant')} onClick={() => { setShowFull(s => !s); setViewPly(null); closeMenu() }} />
          <SheetRow icon={<ArrowDownUp size={18} />} label={t('Bord draaien')} onClick={() => { setFlipped(f => !f); closeMenu() }} pressed={flipped} />
          <SheetRow icon={<ListOrdered size={18} />} label={showMoves ? t('Verberg alle zetten') : t('Bekijk alle zetten')} onClick={() => { setShowMoves(s => !s); closeMenu() }} />
          {!showFull && !intro && <SheetRow icon={<Keyboard size={18} />} label={typing ? t('Zet typen verbergen') : t('Zet typen')} shortcut="T" onClick={() => { closeMenu(); toggleTyping() }} />}
        </div>
      </TrainingSheet>
    </div>

    {/* Desktop over het hele scherm (ontwerp 15c): na een goede zet een groene balk onderin over de volle breedte */}
    {fullScreen && (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 max-lg:hidden" role="status" aria-live="polite" aria-atomic="true">
        {full && good && !result && !showFull && (
          <div className="pointer-events-auto border-t-2 border-brand/30 bg-brand-soft px-8 py-3.5 animate-fade-up">
            <div className="mx-auto flex w-full max-w-[992px] items-center gap-4">
              <span aria-hidden className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_4px_0_var(--brand-shadow)]"><Check size={30} strokeWidth={3} /></span>
              <div className="min-w-0 flex-1 text-brand-strong">
                <div className="text-[22px] font-extrabold leading-tight tracking-[-0.01em]">{good.title}</div>
                <div className="text-[15px]">{good.text}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  )
}

/** Desktop (ontwerp 15b): de laatste zetten als blokjes onder de titel, de laatste groen; "3.?" als jij aan zet bent */
function MoveChips({ sans, upto, next }: { sans: string[]; upto: number; next?: number }) {
  // De laatste twee zetten (vier halve zetten), zodat het op één regel past; de hele lijn staat onder Meer
  const MAX = 4
  const from = Math.max(0, upto - MAX)
  const plies = Array.from({ length: upto - from }, (_, i) => from + i)
  if (!plies.length && next === undefined) return null
  const chip = 'rounded-lg border px-2.5 py-[5px] text-[15px] font-bold tabular-nums'
  const off = 'border-line bg-surface-2 text-ink'
  const on = 'border-brand bg-brand-soft text-brand-strong'
  return (
    <ol className="mt-2.5 flex flex-wrap gap-1.5" aria-label={t('Zetten tot nu toe')}>
      {from > 0 && <li className="self-center px-0.5 text-[15px] font-bold text-muted" aria-label={tn(from, '{n} eerdere halve zet', '{n} eerdere halve zetten')}>…</li>}
      {plies.map(p => {
        const latest = next === undefined && p === upto - 1
        return <li key={p} className={`${chip} ${latest ? on : off}`} aria-current={latest ? 'step' : undefined}>{p % 2 === 0 || p === from ? moveNumberLabel(p) : ''}{sans[p]}</li>
      })}
      {next !== undefined && <li className={`${chip} ${on}`} aria-current="step"><span aria-hidden>{moveNumberLabel(next)}?</span><span className="sr-only">{t('jij bent aan zet')}</span></li>}
    </ol>
  )
}

/** Regel in het Meer-vel: icoon, naam en een pijltje */
function SheetRow({ icon, label, onClick, shortcut, pressed }: { icon: ReactNode; label: string; onClick: () => void; shortcut?: string; pressed?: boolean }) {
  return (
    <button type="button" className="flex min-h-[52px] w-full items-center gap-3 px-3.5 py-1.5 text-left hover:bg-surface-2" onClick={onClick} aria-keyshortcuts={shortcut} aria-pressed={pressed}>
      <span aria-hidden className="text-muted">{icon}</span>
      <span className="flex-1 text-[15px] font-semibold">{label}</span>
      {shortcut && <kbd className="hidden text-xs text-muted lg:inline">{shortcut}</kbd>}
      <ChevronRight size={16} aria-hidden className="shrink-0 text-muted" />
    </button>
  )
}

/** Een vakje per eigen zet: groen = in één keer goed, rood = met fout of hint, omrand = nu aan de beurt */
function MoveSquares({ plies, ply, state }: { plies: number[]; ply: number; state: Record<number, PlyState> }) {
  const good = plies.filter(p => p < ply && !(state[p]?.mistakes || state[p]?.hints || state[p]?.shown)).length
  return (
    <ol className="flex flex-1 gap-1.5" aria-label={t('{good} van {n} zetten in één keer goed', { good, n: plies.length })}>
      {plies.map(p => {
        const s = state[p]
        const tone = p >= ply ? (p === plies.find(x => x >= ply) ? 'bg-track ring-2 ring-brand/60' : 'bg-track') : s?.mistakes || s?.hints || s?.shown ? 'bg-danger' : 'bg-brand'
        return <li key={p} className={`h-3 flex-1 rounded-[4px] transition-colors ${tone}`} />
      })}
    </ol>
  )
}

/** Knop onder het bord (ontwerp 10f): aantikbare kaart met icoon en naam */
function IconButton({ icon, label, onClick, disabled, shortcut, pressed, expanded, row, square, hint }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; shortcut?: string; pressed?: boolean; expanded?: boolean; /** Tooltip in plaats van de standaard */ hint?: string; /** Desktop (ontwerp 15b): icoon, naam en sneltoets naast elkaar */ row?: boolean; /** Alleen het icoon, vierkant */ square?: boolean }) {
  const layout = row
    ? 'min-h-[50px] gap-2.5 px-3.5 text-[15px]'
    : square
      ? 'w-12! shrink-0 px-0'
      : 'min-h-[54px] flex-col justify-center gap-[3px] px-1 py-1.5 text-[13px]'
  return (
    <button
      type="button"
      className={`tap flex w-full items-center rounded-[14px]! font-semibold disabled:pointer-events-none disabled:opacity-45 ${square ? 'justify-center' : ''} ${layout} ${pressed || expanded ? 'tap-on' : ''}`}
      aria-label={square ? label : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? 'dialog' : undefined}
      aria-keyshortcuts={shortcut}
      title={hint ?? (shortcut ? `${label} (${shortcut})` : label)}
    >
      <span aria-hidden className={pressed || expanded ? 'text-brand-strong' : 'text-muted'}>{icon}</span>
      {row ? <span className="flex-1 text-left">{label}</span> : !square && label}
      {row && shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}

/** Toets als klein blokje met onderrand (ontwerp 15b) */
function Kbd({ children }: { children: ReactNode }) {
  return <kbd aria-hidden className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border-2 border-line bg-surface px-[5px] font-sans text-xs font-bold text-ink shadow-[0_2px_0_var(--line)]">{children}</kbd>
}

function lastNamed(names: Record<string, [string, string, string]> | null, fens: string[], ply: number) {
  if (!names) return undefined
  for (let p = ply; p >= 0; p--) {
    const n = names[epdOf(fens[p])]
    if (n) return n[1]
  }
  return undefined
}

/** Feedbackkaart (ontwerp 10f/12d): icoontegel, vette titel en een regel uitleg, in de kleur van de uitkomst */
const FEEDBACK_STYLE: Record<FeedbackKind | 'status', { box: string; tile: string; title: string; icon: ReactNode; label: string }> = {
  learn: { box: 'bg-surface border-line', tile: 'bg-brand-soft', title: 'text-ink', icon: <PieceIcon piece="bN" size={28} />, label: 'Leren' },
  correct: { box: 'bg-brand-soft border-brand/30', tile: 'bg-surface text-brand-strong', title: 'text-brand-strong', icon: <CircleCheck size={20} strokeWidth={2.25} />, label: 'Goed' },
  wrong: { box: 'bg-danger-soft border-danger/30', tile: 'bg-surface text-danger-ink', title: 'text-danger-ink', icon: <CircleX size={20} strokeWidth={2.25} />, label: 'Niet goed' },
  hint: { box: 'bg-info-soft border-info/30', tile: 'bg-surface text-info-ink', title: 'text-info-ink', icon: <Lightbulb size={20} strokeWidth={2.25} />, label: 'Hint' },
  info: { box: 'bg-info-soft border-info/30', tile: 'bg-surface text-info-ink', title: 'text-info-ink', icon: <Info size={20} strokeWidth={2.25} />, label: 'Info' },
  illegal: { box: 'bg-accent-soft border-accent/35', tile: 'bg-surface text-accent-ink', title: 'text-accent-ink', icon: <CircleAlert size={20} strokeWidth={2.25} />, label: 'Ongeldig' },
  status: { box: 'bg-surface border-line', tile: 'bg-surface-2 text-muted', title: 'text-ink', icon: <Hourglass size={20} />, label: 'Status' },
}

function FeedbackBox({ feedback, opponentLine, userTurn, done, showFull, chips }: { feedback: Feedback; opponentLine: string | null; userTurn: boolean; done: boolean; showFull: boolean; /** De zetten staan al als blokjes in beeld (desktop): de zet van de tegenstander bij "Speel …" alleen voorlezen */ chips?: boolean }) {
  const fb = showFull ? null : feedback
  const style = FEEDBACK_STYLE[fb?.kind ?? 'status']
  const status = showFull ? t('Bekijkmodus.') : done ? t('Lijn afgerond.') : userTurn ? t('Jij bent aan zet.') : t('De tegenstander is aan zet…')
  const title = fb?.title ?? (fb ? null : status)
  const showStatus = !!fb && fb.kind !== 'learn' && (opponentLine || fb.kind === 'correct')
  return (
    <div className={`order-first flex items-start gap-3 rounded-[18px] border-2 p-3.5 lg:order-none ${style.box} ${feedback?.kind === 'wrong' && !showFull ? 'animate-shake' : ''}`} aria-live="polite" aria-atomic="true">
      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.tile}`}>{style.icon}</span>
      <div className="min-w-0 pt-px">
        {fb && <span className="sr-only">{t(style.label)}: </span>}
        {title && <div className={`text-base font-extrabold leading-snug ${style.title}`}>{title}</div>}
        <div className={`mt-0.5 text-sm leading-snug ${fb?.kind === 'learn' || !fb ? 'text-muted' : 'text-ink'}`}>
          {fb?.text}
          {opponentLine && !showFull && <span className={chips && fb?.kind === 'learn' ? 'sr-only' : fb?.text ? 'block' : ''}>{opponentLine}</span>}
          {showStatus && <span className="block font-semibold">{status}</span>}
          {showFull && t('Je bekijkt de hele variant; dit telt niet mee.')}
        </div>
      </div>
    </div>
  )
}

export function MoveList({ sans, current, onSelect, startPly = 0, marked }: { sans: string[]; current: number; onSelect?: (ply: number) => void; startPly?: number; marked?: Set<number> }) {
  if (!sans.length) return <div className="text-sm text-muted">{t('Nog geen zetten.')}</div>
  return (
    <ol className="flex max-h-48 flex-wrap gap-x-1 gap-y-1 overflow-y-auto font-mono text-sm scrollbar-thin" aria-label={t('Zetten')}>
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
              aria-label={miss ? t('{san}, hier ging het mis', { san: s }) : undefined}
            >
              {s}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function EndPanel({ line, mode, result, sans, startPly, selected, onSelect, actions, extra, title: customTitle }: { line: TrainingLine; mode: TrainMode; result: LineResult; sans: string[]; startPly: number; selected: number | null; onSelect: (ply: number) => void; actions: ReactNode; extra?: ReactNode; title?: string }) {
  const single = (line.endPly ?? line.uci.length) - startPly <= 1
  const perfect = result.mistakes + result.hints + result.shown === 0
  const title = customTitle ?? (mode === 'learn' ? t('Variant doorlopen') : single ? (perfect ? t('Goed onthouden') : t('Afgerond')) : perfect ? t('Foutloos gespeeld') : t('Variant afgerond'))
  // Niet meer onderin vastgeplakt: in Safari op iOS viel die balk half onder de werkbalk en over de titel.
  // In plaats daarvan schuift de knop (met de titel erboven) vanzelf in beeld als de variant klaar is.
  const actionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = actionsRef.current
    if (!el) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="card p-5 animate-pop" aria-live="polite">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-sm text-muted">{line.title}</p>
      {mode !== 'learn' && !single && (
        <div className="mt-3">
          <Stars count={result.stars} size="text-2xl" />
        </div>
      )}
      {single && <p className="mt-2 text-sm">{perfect ? t('Het interval wordt langer: je ziet deze stelling later pas terug.') : t('Deze stelling komt over 10 minuten terug.')}</p>}
      {/* Direct onder de titel, en op mobiel onderin vastgeplakt: nooit scrollen om verder te kunnen */}
      <div ref={actionsRef} className="mt-4 grid grid-cols-1 gap-2 scroll-mb-[calc(6rem+env(safe-area-inset-bottom))]">{actions}</div>
      {!single && <ResultNumbers result={result} />}
      <BadgesEarned badges={result.badges} className="mt-3" />
      {result.misses.length > 0 && !single && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t('Hier ging het mis')}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {result.misses.map(m => (
              <li key={m.ply}>
                <button className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-surface-2 ${selected === m.ply ? 'bg-surface-2' : ''}`} onClick={() => onSelect(m.ply)} aria-pressed={selected === m.ply}>
                  <span className="font-mono text-muted">{moveNumberLabel(m.ply)}</span>
                  <span>
                    {m.played.length ? <>{t('Jij:')} <span className="font-mono">{m.played.join(', ')}</span> · </> : null}
                    {t('juist:')} <b className="font-mono">{m.expected}</b>
                    {m.shown ? ` (${t('getoond')})` : m.hinted ? ` (${t('met hint')})` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!single && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t('De hele lijn')}</h3>
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
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">{t('direct goed')}</dt><dd className="text-lg font-bold tabular-nums">{result.correctFirstTry}/{result.userMoves}</dd></div>
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">{result.mistakes === 1 ? t('fout') : t('fouten')}</dt><dd className="text-lg font-bold tabular-nums">{result.mistakes}</dd></div>
      <div className="flex flex-col-reverse rounded-xl bg-surface-2 p-2"><dt className="text-muted">XP</dt><dd className="text-lg font-bold tabular-nums">+{result.xp}</dd></div>
    </dl>
  )
}

function Explanation({ fen, name, info, stats, side, elo, lastSan, famIndex, family, hideAnswer, onReveal, part }: {
  fen: string; name?: string; info?: (typeof OPENING_INFO)[string]; stats: StatsFile | null; side: 'white' | 'black'; elo: number
  lastSan?: string; famIndex?: Map<string, PositionRef[]>; family?: FamilyFile; hideAnswer: boolean; onReveal: () => void
  /** Alleen wat er gespeeld wordt, of alleen de rest (het idee en de namen); zonder: alles */
  part?: 'stats' | 'rest'
}) {
  const epd = epdOf(fen)
  const pos = stats?.positions[epd]
  const band = elo < 1200 ? 0 : elo < 1600 ? 1 : elo < 2000 ? 2 : 3
  const toMove = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const refs = famIndex?.get(epd) ?? []
  const lineNames = family ? [...new Set(refs.map(r => family.variations.find(v => v.id === r.variationId)).filter(Boolean).map(v => v!.path.join(', ') || family.family.name))] : []
  // Ontwerp 12e: aandeel op jouw niveau als balk, daarnaast de score voor jouw kleur
  const bandTotal = pos ? pos.m.reduce((a, x) => a + bandCount(x, band), 0) : 0
  const useBand = bandTotal >= 20
  const rows = pos ? pos.m.slice(0, part === 'stats' ? 4 : 5).map(m => {
    const mine = moveScore(m, side, band)
    const all = moveScore(m, side)
    return { san: m[1], share: useBand ? mine.n / bandTotal : (m[2] as number) / pos.n, score: (useBand && mine.n >= 10 ? mine : all).score }
  }) : []
  return (
    <div className="space-y-3.5 animate-fade-up">
      {info && part !== 'stats' && (
        <section className="card flex flex-col gap-2.5 p-3.5">
          <h3 className="text-xs font-bold uppercase tracking-[0.04em] text-muted">{t('Het idee')}</h3>
          <p className="text-base font-medium leading-[1.45]">{info.idea}</p>
          <ol className="space-y-2 text-sm leading-snug">
            {info.plans.slice(0, 3).map((plan, i) => <li key={plan} className="flex gap-2.5"><span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-strong">{i + 1}</span><span className="pt-px">{plan}</span></li>)}
          </ol>
        </section>
      )}
      {part !== 'rest' && <section className="card px-3.5 py-3 lg:px-4 lg:py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-[15px] font-bold">{t('Wat wordt hier gespeeld?')}</h3>
          <span className="text-xs text-muted">{useBand ? t('jouw niveau') : t('alle niveaus')} · {t('score {side}', { side: sideLower(side) })}</span>
        </div>
        <p className="sr-only">{t('{side} aan zet.', { side: sideNl(toMove) })}</p>
        {hideAnswer ? (
          <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="text-muted">{t('De statistiek verklapt de zet die je nu moet spelen.')}</p>
            <button className="btn btn-ghost mt-2 min-h-11" onClick={onReveal}>{t('Toch tonen (telt als hint)')}</button>
          </div>
        ) : rows.length ? (
          <table className="mt-1.5 w-full text-sm">
            <thead className="sr-only"><tr><th>{t('Zet')}</th><th>{t('Hoe vaak gespeeld')}</th><th>{t('Aandeel')}</th><th>{t('Score {side}', { side: sideLower(side) })}</th></tr></thead>
            <tbody className="divide-y-2 divide-surface-2">
              {rows.map(r => (
                <tr key={r.san} className={part === 'stats' ? 'h-[34px]' : 'h-[38px]'}>
                  <td className="w-11 text-[15px] font-extrabold">{r.san}</td>
                  <td className="px-2.5" aria-hidden><div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, Math.round(r.share * 100))}%` }} /></div></td>
                  <td className="w-11 text-right text-[13px] font-bold tabular-nums">{pct(r.share)}</td>
                  <td className="w-[52px] text-right text-[13px] tabular-nums text-muted">{pct(r.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1.5 text-sm text-muted">{t('Geen statistiek voor deze stelling.')}</p>
        )}
      </section>}
      {part !== 'stats' && (name || lastSan || lineNames.length > 0) && (
        <section className="card space-y-0.5 px-3.5 py-3 text-sm text-muted">
          {name && <div>{t('Lichess-naam:')} <span className="text-ink">{name}</span></div>}
          {lastSan && <div>{t('Laatste zet:')} {lastSan}, {describeSan(lastSan)}</div>}
          {lineNames.length > 0 && <div>{tn(lineNames.length, 'Komt voor in {n} benoemde variant', 'Komt voor in {n} benoemde varianten')}{lineNames.length <= 4 ? `: ${lineNames.join(' · ')}` : ''}.</div>}
        </section>
      )}
    </div>
  )
}
