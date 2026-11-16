import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess } from 'chess.js'
import { Check, ExternalLink, Eye, Keyboard, Lightbulb, Swords, X } from 'lucide-react'
import { Board } from './Board'
import { MoveInput, useTypingOpen } from './MoveInput'
import { MoveList } from './Trainer'
import { EvalButton } from './EvalButton'
import { BadgesEarned } from './ui'
import { BottomAction } from './TrainingModeChrome'
import type { PuzzleResult } from './PuzzleTrainer'
import { parseUci, uciOf, START_FEN, epdOf } from '../lib/chess'
import { recordPuzzle, checkBadges } from '../lib/progress'
import { explainThemes } from '../content/themes'
import type { Puzzle, Side } from '../lib/types'
import { InlineWait } from './PieceMotion'
import { locale, t } from '../lib/i18n'

type Tone = 'wait' | 'chance' | 'good' | 'bad' | 'hint' | 'reveal'
interface Msg { tone: Tone; title: string; body?: string; glyph?: string }

const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', O: '♚' }
const glyphOf = (san: string) => `${GLYPH[san[0]] ?? '♟'}︎`

const TONE: Record<Tone, string> = {
  wait: 'bg-surface-2 text-muted',
  chance: 'bg-danger-soft text-danger-ink',
  good: 'bg-brand-soft text-brand-strong',
  bad: 'bg-danger-soft text-danger-ink',
  hint: 'bg-accent-soft text-accent-ink',
  reveal: 'bg-info-soft text-info-ink',
}

/** Tweede knop onder het bord: icoon boven de tekst, zodat drie knoppen naast elkaar passen */
const KEY = 'tap flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px]! px-2 py-2 text-sm font-bold disabled:opacity-50'

const waiting = (): Msg => ({ tone: 'wait', title: t('Kijk goed…'), body: t('Je tegenstander staat op het punt een fout te maken.') })

/**
 * Afstraffen in de trainingsmodus van ontwerpronde 10 (scherm 10l). Zelfde werking als PuzzleTrainer
 * (de tegenstander speelt een echte, door Lichess geverifieerde fout; jij vindt de sterkste reactie en
 * speelt de combinatie uit; het resultaat gaat via recordPuzzle en checkBadges), maar met de nieuwe
 * indeling: kop, bord, één terugkoppelkaart en daaronder de toetsen Hint en Toon zet.
 */
export function CrushingPuzzle({ puzzle, familyId, heading, onDone, onNext, nextLabel }: { puzzle: Puzzle; familyId: string; heading: ReactNode; onDone?: (r: PuzzleResult) => void; onNext: () => void; nextLabel?: string }) {
  const solver: Side = puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white'
  const me = solver === 'white' ? t('wit') : t('zwart')
  const opp = solver === 'white' ? t('Zwart') : t('Wit')
  const fens = useMemo(() => {
    const c = new Chess(puzzle.fen)
    const out = [c.fen()]
    for (const u of puzzle.uci) {
      c.move(parseUci(u))
      out.push(c.fen())
    }
    return out
  }, [puzzle])
  const [ply, setPly] = useState(0)
  const [typing, setTyping] = useTypingOpen()
  const [focusTyping, setFocusTyping] = useState(false)
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [hintSq, setHintSq] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(waiting)
  const [result, setResult] = useState<PuzzleResult | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const [history, setHistory] = useState<{ san: string[]; loading: boolean; error?: string } | null>(null)
  const recorded = useRef(false)

  useEffect(() => {
    setPly(0); setMistakes(0); setHints(0); setHintSq(null); setResult(null); setTemp(null); setHistory(null)
    recorded.current = false
    setMsg(waiting())
  }, [puzzle.id])

  const done = ply >= puzzle.uci.length
  const userTurn = !done && ply % 2 === 1

  // tegenstanderszetten (ply 0 = de fout, daarna de antwoorden binnen de combinatie)
  useEffect(() => {
    if (done || userTurn) return
    const timer = setTimeout(() => {
      setPly(p => p + 1)
      const san = puzzle.san[ply]
      if (ply === 0) {
        setMsg({
          tone: 'chance',
          glyph: glyphOf(san),
          title: san.includes('x') ? t('{opp} sloeg met {san}: een fout', { opp, san }) : t('{opp} speelde {san}: een fout', { opp, san }),
          body: `${t('Jij bent aan zet met {me}.', { me })} ${t('Uit een echte partij, {n} keer als puzzel gespeeld.', { n: puzzle.plays.toLocaleString(locale()) })}`,
        })
      } else {
        setMsg(m => ({ ...m, body: t('{opp} antwoordt {san}. Jij bent weer aan zet.', { opp, san }) }))
      }
    }, ply === 0 ? 900 : 550)
    return () => clearTimeout(timer)
  }, [ply, done, userTurn, puzzle.san]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!done || recorded.current) return
    recorded.current = true
    const solved = mistakes === 0 && hints === 0
    ;(async () => {
      await recordPuzzle(puzzle.id, familyId, solved)
      const badges = await checkBadges()
      const r = { solved, mistakes, hints, badges }
      setResult(r)
      onDone?.(r)
    })()
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  function onMove(from: string, to: string, promotion?: string) {
    if (!userTurn) return false
    const c = new Chess(fens[ply])
    let mv
    try { mv = c.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const expected = puzzle.uci[ply]
    // Lichess accepteert op de laatste zet ook een alternatief mat
    if (uciOf(mv) === expected || (c.isCheckmate() && ply === puzzle.uci.length - 1)) {
      const last = ply === puzzle.uci.length - 1
      setHintSq(null)
      setPly(p => p + 1)
      setMsg(last ? { tone: 'good', title: t('{san}! Opgelost.', { san: mv.san }) } : { tone: 'good', title: t('{san}: sterk. Ga door.', { san: mv.san }), body: t('{opp} antwoordt…', { opp }) })
      return true
    }
    setMistakes(m => m + 1)
    setTemp(c.fen())
    setTimeout(() => setTemp(null), 650)
    setMsg({ tone: 'bad', title: t('{san} is niet de sterkste zet', { san: mv.san }), body: `${t('Probeer opnieuw.')} ${t('Jij bent aan zet met {me}.', { me })}` })
    return false
  }

  function hint() {
    if (!userTurn) return
    setHints(h => h + 1)
    setHintSq(puzzle.uci[ply].slice(0, 2))
    setMsg({ tone: 'hint', title: t('Hint: het gemarkeerde stuk is de sleutel'), body: t('Jij bent aan zet met {me}.', { me }) })
  }
  function reveal() {
    if (!userTurn) return
    const last = ply === puzzle.uci.length - 1
    setHints(h => h + 2)
    setHintSq(null)
    setPly(p => p + 1)
    setMsg({ tone: 'reveal', title: t('De oplossing was {san}', { san: puzzle.san[ply] }), body: last ? undefined : t('{opp} antwoordt…', { opp }) })
  }

  async function loadHistory() {
    setHistory({ san: [], loading: true })
    try {
      const gameId = puzzle.gameUrl.match(/lichess\.org\/(\w{8})/)?.[1]
      // Officiële export-endpoint op ID (werkt zonder token; de losse /game/export vraagt bij oudere partijen om in te loggen)
      const res = await fetch('https://lichess.org/api/games/export/_ids?moves=true&tags=false&clocks=false&evals=false', { method: 'POST', body: gameId, headers: { Accept: 'application/x-ndjson' } })
      if (!res.ok) throw new Error(t('Lichess gaf foutcode {status}', { status: res.status }))
      const line = (await res.text()).split('\n').find(Boolean)
      if (!line) throw new Error(t('Partij niet gevonden'))
      const g = JSON.parse(line)
      const moves = String(g.moves ?? '').split(' ')
      // zoek de stelling van de puzzel in de partij
      const c = new Chess(START_FEN)
      const target = epdOf(puzzle.fen)
      const sans: string[] = []
      for (const m of moves) {
        if (epdOf(c.fen()) === target) break
        sans.push(c.move(m).san)
      }
      setHistory({ san: sans, loading: false })
    } catch (e) {
      setHistory({ san: [], loading: false, error: t('Niet beschikbaar (offline of Lichess niet bereikbaar).') + (e instanceof Error ? ` ${e.message}` : '') })
    }
  }

  const themes = explainThemes(puzzle.themes)
  const lastIdx = Math.max(0, ply - 1)
  const shown: Msg = done && result
    ? { tone: result.solved ? 'good' : 'reveal', title: result.solved ? t('Afgestraft!') : t('Combinatie bekeken'), body: `${msg.title.endsWith('.') ? msg.title : `${msg.title}.`}${result.solved ? '' : ` ${t('Met een hint of fout telt hij nog niet als opgelost.')}`}` }
    : msg
  const icon = shown.tone === 'chance' ? <span className="text-[22px] leading-none">{shown.glyph}</span>
    : shown.tone === 'good' ? <Check size={22} strokeWidth={2.5} />
    : shown.tone === 'bad' ? <X size={22} strokeWidth={2.5} />
    : shown.tone === 'hint' ? <Lightbulb size={20} />
    : shown.tone === 'reveal' ? <Eye size={20} />
    : <Swords size={20} />

  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-4">
      <div className="lg:col-start-2 lg:row-start-1">{heading}</div>

      <div className="w-full sm:mx-auto sm:max-w-[min(100%,560px,calc(100dvh-300px))] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:max-w-[min(100%,640px,calc(100dvh-140px))]">
        <div className="rounded-xl shadow-[0_1px_0_var(--board-edge),0_10px_26px_rgba(30,40,30,0.14)]">
          <Board
            label={solver === 'white' ? t('Schaakbord, je speelt wit') : t('Schaakbord, je speelt zwart')}
            id={`pz-${puzzle.id}`}
            fen={temp ?? fens[ply]}
            orientation={solver}
            movable={userTurn ? solver : undefined}
            onMove={onMove}
            lastMove={ply > 0 ? [puzzle.uci[lastIdx].slice(0, 2), puzzle.uci[lastIdx].slice(2, 4)] : null}
            hintSquare={hintSq}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3.5 lg:col-start-2 lg:row-start-2">
        <div key={shown.tone === 'bad' ? `bad-${mistakes}` : 'msg'} className={`flex items-start gap-3 rounded-[18px] border-2 border-line bg-surface p-3.5 ${shown.tone === 'bad' ? 'animate-shake' : ''}`} aria-live="polite">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[shown.tone]}`} aria-hidden>{icon}</span>
          <div className="min-w-0">
            <div className="font-bold leading-snug">{shown.title}</div>
            {shown.body && <div className="mt-0.5 text-sm leading-snug text-muted">{shown.body}</div>}
          </div>
        </div>

        {!done && (
          <>
            {/* Drie gelijke toetsen (ontwerp 16g): het toetsenbord-icoon is een echte knop "Typ zet" geworden */}
            <div className="grid grid-cols-3 gap-2.5">
              <button type="button" className={KEY} onClick={hint} disabled={!userTurn}>
                <Lightbulb size={20} aria-hidden className="text-muted" />{t('Hint')}
              </button>
              <button type="button" className={KEY} onClick={reveal} disabled={!userTurn}>
                <Eye size={20} aria-hidden className="text-muted" />{t('Toon zet')}
              </button>
              <button type="button" className={`${KEY} ${typing ? 'tap-on' : ''}`} aria-expanded={typing} onClick={() => { setFocusTyping(!typing); setTyping(!typing) }}>
                <Keyboard size={20} aria-hidden className={typing ? 'text-brand-strong' : 'text-muted'} />{t('Typ zet')}
              </button>
            </div>
            {typing && <MoveInput fen={fens[ply]} enabled={userTurn} onMove={onMove} autoFocus={focusTyping} />}
          </>
        )}

        {done && result && (
          <>
            <div className="space-y-4 rounded-[18px] border-2 border-line bg-surface p-4 animate-fade-up">
              <div className="text-xs font-semibold text-muted">
                {t('Puzzelrating {r}', { r: puzzle.rating })}{puzzle.variation ? ` · ${puzzle.variation}` : ''} · {t('zet {n} uit de partij', { n: Math.ceil(puzzle.ply / 2) })}
              </div>
              <BadgesEarned badges={result.badges} />
              <div className="text-sm">
                <div className="font-semibold">{t('Waarom werkt dit?')}</div>
                <ul className="mt-1 space-y-1 text-muted">
                  {themes.filter(th => th.why).map(th => <li key={th.id}><b className="text-ink">{th.name}:</b> {th.why}</li>)}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1">{themes.filter(th => !th.why).map(th => <span key={th.id} className="chip">{th.name}</span>)}</div>
              </div>
              <div className="text-sm">
                <div className="mb-1 font-semibold">{t('Oplossing')}</div>
                <MoveList sans={puzzle.san} current={puzzle.san.length} startPly={(Number(puzzle.fen.split(' ')[5] ?? 1) - 1) * 2 + (puzzle.fen.split(' ')[1] === 'b' ? 1 : 0)} />
              </div>
              <EvalButton fen={fens[1]} label={t('Stockfish: evaluatie na de fout')} />
              <div className="border-t border-line pt-3 text-sm">
                <div className="font-semibold">{t('Hoe ontstond deze stelling?')}</div>
                {!history ? (
                  <button type="button" className="btn btn-quiet mt-1 min-h-11 px-0" onClick={loadHistory}>{t('Haal de partij op bij Lichess (online)')}</button>
                ) : history.loading ? <InlineWait className="mt-1" /> : history.error ? <div className="mt-1 text-muted">{history.error}</div> : <div className="mt-1"><MoveList sans={history.san} current={history.san.length} /></div>}
                <a className="inline-flex min-h-11 items-center gap-1 text-xs text-muted underline" href={puzzle.gameUrl} target="_blank" rel="noreferrer">
                  {t('Bekijk de partij op lichess.org')}<ExternalLink size={12} aria-hidden />
                </a>
              </div>
            </div>
            <BottomAction>
              <button type="button" className="btn btn-primary w-full" onClick={onNext} autoFocus>{nextLabel ?? t('Volgende')}</button>
            </BottomAction>
          </>
        )}
      </div>
    </div>
  )
}
