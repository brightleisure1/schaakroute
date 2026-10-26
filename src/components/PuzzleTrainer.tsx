import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Lightbulb, Swords } from 'lucide-react'
import { Board } from './Board'
import { MoveInput } from './MoveInput'
import { MoveList } from './Trainer'
import { EvalButton } from './EvalButton'
import { STICKY_ACTIONS, BadgesEarned } from './ui'
import { parseUci, uciOf, START_FEN, epdOf } from '../lib/chess'
import { recordPuzzle, checkBadges } from '../lib/progress'
import { explainThemes } from '../content/themes'
import type { Puzzle, Side } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

export interface PuzzleResult {
  solved: boolean
  mistakes: number
  hints: number
  badges: BadgeDef[]
}

/**
 * Crushing: de tegenstander maakt een (echte, door Lichess met Stockfish geverifieerde) fout;
 * jij vindt de beste reactie en speelt de combinatie uit.
 */
export function PuzzleTrainer({ puzzle, familyId, onDone, nextLabel = 'Volgende', onNext }: { puzzle: Puzzle; familyId: string; onDone?: (r: PuzzleResult) => void; nextLabel?: string; onNext?: () => void }) {
  const solver: Side = puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white'
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
  const [mistakes, setMistakes] = useState(0)
  const [hints, setHints] = useState(0)
  const [hintSq, setHintSq] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'info' | 'good' | 'bad' | 'chance'; text: string }>({ tone: 'info', text: 'Kijk goed: je tegenstander staat op het punt een fout te maken…' })
  const [result, setResult] = useState<PuzzleResult | null>(null)
  const [temp, setTemp] = useState<string | null>(null)
  const [history, setHistory] = useState<{ san: string[]; loading: boolean; error?: string } | null>(null)
  const recorded = useRef(false)

  useEffect(() => {
    setPly(0); setMistakes(0); setHints(0); setHintSq(null); setResult(null); setTemp(null); setHistory(null)
    recorded.current = false
    setMsg({ tone: 'info', text: 'Kijk goed: je tegenstander staat op het punt een fout te maken…' })
  }, [puzzle.id])

  const done = ply >= puzzle.uci.length
  const userTurn = !done && ply % 2 === 1

  // tegenstanderszetten (ply 0 = de fout, daarna de antwoorden binnen de combinatie)
  useEffect(() => {
    if (done || userTurn) return
    const t = setTimeout(() => {
      setPly(p => p + 1)
      if (ply === 0) setMsg({ tone: 'chance', text: `Je tegenstander speelt ${puzzle.san[0]}: een fout. Vind de sterkste reactie.` })
      else setMsg(m => ({ ...m, text: `${m.text} Tegenstander antwoordt ${puzzle.san[ply]}.` }))
    }, ply === 0 ? 900 : 550)
    return () => clearTimeout(t)
  }, [ply, done, userTurn, puzzle.san])

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
      setHintSq(null)
      setPly(p => p + 1)
      setMsg({ tone: 'good', text: ply === puzzle.uci.length - 1 ? `${mv.san}! Opgelost.` : `${mv.san}: sterk. Ga door.` })
      return true
    }
    setMistakes(m => m + 1)
    setTemp(c.fen())
    setTimeout(() => setTemp(null), 650)
    setMsg({ tone: 'bad', text: `${mv.san} is niet de sterkste zet. Probeer opnieuw.` })
    return false
  }

  function hint() {
    if (!userTurn) return
    setHints(h => h + 1)
    setHintSq(puzzle.uci[ply].slice(0, 2))
    setMsg({ tone: 'info', text: 'Hint: het gemarkeerde stuk is de sleutel.' })
  }
  function reveal() {
    if (!userTurn) return
    setHints(h => h + 2)
    setPly(p => p + 1)
    setMsg({ tone: 'info', text: `De oplossing was ${puzzle.san[ply]}.` })
  }

  async function loadHistory() {
    setHistory({ san: [], loading: true })
    try {
      const gameId = puzzle.gameUrl.match(/lichess\.org\/(\w{8})/)?.[1]
      // Officiële export-endpoint op ID (werkt zonder token; de losse /game/export vraagt bij oudere partijen om in te loggen)
      const res = await fetch('https://lichess.org/api/games/export/_ids?moves=true&tags=false&clocks=false&evals=false', { method: 'POST', body: gameId, headers: { Accept: 'application/x-ndjson' } })
      if (!res.ok) throw new Error(`Lichess gaf foutcode ${res.status}`)
      const line = (await res.text()).split('\n').find(Boolean)
      if (!line) throw new Error('Partij niet gevonden')
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
      setHistory({ san: [], loading: false, error: 'Niet beschikbaar (offline of Lichess niet bereikbaar).' + (e instanceof Error ? ` ${e.message}` : '') })
    }
  }

  const themes = explainThemes(puzzle.themes)
  const lastIdx = Math.max(0, ply - 1)
  const tone = msg.tone === 'good' ? 'bg-brand-soft text-brand-strong' : msg.tone === 'bad' ? 'bg-danger-soft text-danger-ink' : msg.tone === 'chance' ? 'bg-accent-soft text-accent-ink' : 'bg-info-soft text-info-ink'

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="-mx-2 sm:mx-auto sm:w-full sm:max-w-[min(92vw,620px,calc(100dvh-180px))]">
        <Board
          label={`Schaakbord, je speelt ${solver === 'white' ? 'wit' : 'zwart'}`}
          id={`pz-${puzzle.id}`}
          fen={temp ?? fens[ply]}
          orientation={solver}
          movable={userTurn ? solver : undefined}
          onMove={onMove}
          lastMove={ply > 0 ? [puzzle.uci[lastIdx].slice(0, 2), puzzle.uci[lastIdx].slice(2, 4)] : null}
          hintSquare={hintSq}
        />
        {!done && <div className="px-2 sm:px-0"><MoveInput fen={fens[ply]} enabled={userTurn} onMove={onMove} /></div>}
      </div>
      <aside className="flex flex-col gap-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Crushing · je speelt {solver === 'white' ? 'wit' : 'zwart'} · puzzelrating {puzzle.rating}</div>
          {puzzle.variation && <div className="mt-1 font-semibold">{puzzle.variation}</div>}
          <div className="text-xs text-muted">Uit een echte Lichess-partij (zet {Math.ceil(puzzle.ply / 2)}), {puzzle.plays.toLocaleString('nl-NL')}× gespeeld als puzzel.</div>
        </div>
        <div className={`order-first flex gap-2 rounded-2xl px-4 py-3 text-sm lg:order-none ${tone}`} aria-live="polite">
          {msg.tone === 'chance' && <Swords size={18} aria-hidden className="mt-0.5 shrink-0" />}
          <span>{msg.text}{userTurn && <span className="block font-semibold">Jij bent aan zet.</span>}</span>
        </div>
        {!done && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost min-h-12" onClick={hint} disabled={!userTurn}><Lightbulb size={18} aria-hidden />Hint</button>
            <button className="btn btn-ghost min-h-12" onClick={reveal} disabled={!userTurn}>Toon zet</button>
          </div>
        )}
        {done && result && (
          <div className="card order-first space-y-3 p-4 animate-fade-up lg:order-none">
            <div className="text-lg font-bold">{result.solved ? 'Afgestraft!' : 'Combinatie bekeken'}</div>
            {onNext && <div className={`${STICKY_ACTIONS} max-lg:-mx-4 max-lg:px-4`}><button className="btn btn-primary min-h-12 w-full" onClick={onNext} autoFocus>{nextLabel}</button></div>}
            <BadgesEarned badges={result.badges} />
            <div className="text-sm">
              <div className="font-medium">Waarom werkt dit?</div>
              <ul className="mt-1 space-y-1 text-muted">
                {themes.filter(t => t.why).map(t => <li key={t.id}><b className="text-ink">{t.name}:</b> {t.why}</li>)}
              </ul>
              <div className="mt-2 flex flex-wrap gap-1">{themes.filter(t => !t.why).map(t => <span key={t.id} className="chip">{t.name}</span>)}</div>
            </div>
            <div className="text-sm"><div className="font-medium">Oplossing</div><MoveList sans={puzzle.san} current={puzzle.san.length} startPly={(Number(puzzle.fen.split(' ')[5] ?? 1) - 1) * 2 + (puzzle.fen.split(' ')[1] === 'b' ? 1 : 0)} /></div>
            <p className="text-xs text-muted">Bron: Lichess-puzzeldatabase (CC0). De oplossing is door Lichess met Stockfish gecontroleerd; SchaakRoute verzint geen combinaties.</p>
            <EvalButton fen={fens[1]} label="Stockfish: evaluatie na de fout" />
          </div>
        )}
        <div className="card p-4 text-sm">
          <div className="font-medium">Hoe ontstond deze stelling?</div>
          {!history ? (
            <button className="btn btn-quiet mt-1 px-0" onClick={loadHistory}>Haal de partij op bij Lichess (online)</button>
          ) : history.loading ? <div className="text-muted">Laden…</div> : history.error ? <div className="text-muted">{history.error}</div> : <MoveList sans={history.san} current={history.san.length} />}
          <a className="mt-1 inline-flex min-h-11 items-center text-xs text-muted underline" href={puzzle.gameUrl} target="_blank" rel="noreferrer">Bekijk de partij op lichess.org</a>
        </div>
      </aside>
    </div>
  )
}
