import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chess } from 'chess.js'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FlipVertical2, SkipForward } from 'lucide-react'
import { db, saveSettings, type GameReviewRecord } from '../lib/db'
import { analyse } from '../lib/engine'
import { loadNames } from '../lib/data'
import { useAsync } from '../lib/hooks'
import {
  CLASS_INFO, CLASS_ORDER, bookInfo, classifyGame, explainMove, fetchChesscomRecent, fetchLichessRecent, formatScore, summarize, winPct,
  type MoveClass, type PosEval, type ReviewGame, type ReviewedMove,
} from '../lib/review'
import { Board } from '../components/Board'
import { Empty, ErrorBox, PageHeader, ProgressBar, Spinner, Tabs, plural, useSettings } from '../components/ui'
import type { Side } from '../lib/types'

/** Rekendiepte van Stockfish per stelling: een paar seconden per partij op een gewone laptop of telefoon */
const DEPTH = 14

const SPEED: Record<string, string> = {
  ultraBullet: 'Bullet', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Klassiek', daily: 'Per dag', correspondence: 'Per dag',
}
const SOURCE_NAME = { lichess: 'Lichess', chesscom: 'Chess.com' } as const
const SOURCE_KEY = 'schaakroute.analyseBron'

const fmtPct = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDate = (t: number) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })

function outcome(g: ReviewGame): 'win' | 'loss' | 'draw' | 'open' {
  if (g.result === '*') return 'open'
  if (g.result === '1/2-1/2') return 'draw'
  return (g.result === '1-0') === (g.myColor === 'white') ? 'win' : 'loss'
}
const OUTCOME = {
  win: { label: 'Winst', cls: 'bg-brand-soft text-brand-strong' },
  loss: { label: 'Verlies', cls: 'bg-danger-soft text-danger-ink' },
  draw: { label: 'Remise', cls: 'bg-surface-2 text-muted' },
  open: { label: 'Bezig', cls: 'bg-info-soft text-info-ink' },
}

function readSource(): 'lichess' | 'chesscom' {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'chesscom' ? 'chesscom' : 'lichess'
  } catch {
    return 'lichess'
  }
}

// ---------------- Partijlijst ----------------

export function GameReviewList() {
  const settings = useSettings()
  const navigate = useNavigate()
  const [source, setSource] = useState<'lichess' | 'chesscom'>(readSource)
  const [name, setName] = useState<string | null>(null)
  const [games, setGames] = useState<ReviewGame[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState('')
  const names = useAsync(() => loadNames(), [])
  const saved = useLiveQuery(() => db.reviews.orderBy('savedAt').reverse().toArray(), [], [] as GameReviewRecord[])
  const savedById = useMemo(() => new Map(saved.map(r => [r.id, r])), [saved])

  const stored = source === 'lichess' ? settings?.lichessUser : settings?.chesscomUser
  const username = (name ?? stored ?? '').trim()

  // Alleen het antwoord op het laatste verzoek telt (bij wisselen van tabblad loopt een ouder verzoek soms nog)
  const request = useRef(0)

  function pickSource(s: 'lichess' | 'chesscom') {
    request.current++
    setSource(s); setName(null); setGames(null); setErr(null); setBusy(false)
    try { localStorage.setItem(SOURCE_KEY, s) } catch { /* geen opslag */ }
  }

  async function load(e?: FormEvent) {
    e?.preventDefault()
    if (!username) return
    const ticket = ++request.current
    setBusy(true); setErr(null); setGames(null); setShownFor(username)
    try {
      const list = source === 'lichess' ? await fetchLichessRecent(username) : await fetchChesscomRecent(username)
      if (ticket !== request.current) return
      setGames(list)
      await saveSettings(source === 'lichess' ? { lichessUser: username } : { chesscomUser: username })
    } catch (e) {
      if (ticket !== request.current) return
      setErr(e instanceof TypeError ? `Kon ${SOURCE_NAME[source]} niet bereiken. Controleer je internetverbinding.` : (e as Error).message)
    } finally {
      if (ticket === request.current) setBusy(false)
    }
  }

  // Bij een opgeslagen gebruikersnaam meteen de partijen laten zien
  const autoLoaded = useRef<string | null>(null)
  useEffect(() => {
    if (!settings || name !== null || !stored || autoLoaded.current === source) return
    autoLoaded.current = source
    load()
  }, [settings, source]) // eslint-disable-line react-hooks/exhaustive-deps

  async function open(g: ReviewGame) {
    if (!(await db.reviews.get(g.id))) await db.reviews.put({ id: g.id, game: withOpening(g, names.data), evals: [], depth: DEPTH, savedAt: Date.now() })
    else await db.reviews.update(g.id, { savedAt: Date.now() })
    navigate(`/analyse/${encodeURIComponent(g.id)}`)
  }

  const earlier = saved.filter(r => !games?.some(g => g.id === r.id))

  return (
    <div className="space-y-5">
      <PageHeader title="Partij-analyse" subtitle="Vul je gebruikersnaam in, kies een partij en zie per zet hoe goed hij was: van briljant tot blunder." />
      <form className="card space-y-3 p-4" onSubmit={load}>
        <Tabs value={source} onChange={pickSource} options={[{ value: 'lichess', label: 'Lichess' }, { value: 'chesscom', label: 'Chess.com' }]} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="review-user">Gebruikersnaam op {SOURCE_NAME[source]}</label>
          <input id="review-user" className="input sm:flex-1" placeholder={`Gebruikersnaam op ${SOURCE_NAME[source]}`} autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={name ?? stored ?? ''} onChange={e => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !username}>Partijen ophalen</button>
        </div>
        <p className="text-xs text-muted">Je laatste 30 partijen. Stockfish rekent alles op je eigen apparaat; er wordt niets naar ons gestuurd.</p>
      </form>

      {busy && <Spinner label={`Partijen ophalen van ${SOURCE_NAME[source]}…`} />}
      {err && <ErrorBox error={err} />}
      {games && (games.length === 0
        ? <Empty title="Geen partijen gevonden">{shownFor} heeft nog geen gewone schaakpartijen op {SOURCE_NAME[source]}.</Empty>
        : <GameList title={`Laatste partijen van ${shownFor}`} games={games.map(g => withOpening(g, names.data))} saved={savedById} onOpen={open} />)}

      {earlier.length > 0 && (
        <GameList title="Eerder geopend" games={earlier.map(r => r.game)} saved={savedById} onOpen={open}
          action={<button className="btn btn-quiet text-sm" onClick={async () => { if (confirm('Alle opgeslagen analyses wissen?')) await db.reviews.clear() }}>Wissen</button>} />
      )}
    </div>
  )
}

/** Chess.com geeft alleen een URL-naam ("Kings Indian Attack"); de namenlijst van Lichess is netter en geeft ook de theorielengte */
function withOpening(g: ReviewGame, names?: Record<string, [string, string, string]>): ReviewGame {
  if (!names || g.source !== 'chesscom') return g
  const b = bookInfo(g.san, names)
  return { ...g, opening: b.name ?? g.opening, bookPly: b.ply }
}

function GameList({ title, games, saved, onOpen, action }: { title: string; games: ReviewGame[]; saved: Map<string, GameReviewRecord>; onOpen: (g: ReviewGame) => void; action?: ReactNode }) {
  return (
    <section className="card p-2 sm:p-3">
      <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <ul className="divide-y divide-line">
        {games.map(g => {
          const me = g.myColor === 'white' ? g.white : g.black
          const opp = g.myColor === 'white' ? g.black : g.white
          const o = OUTCOME[outcome(g)]
          const acc = saved.get(g.id)?.accuracy?.[g.myColor]
          return (
            <li key={g.id}>
              <button className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2" onClick={() => onOpen(g)}>
                <span className={`w-16 shrink-0 rounded-lg px-1.5 py-1 text-center text-xs font-bold ${o.cls}`}>{o.label}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <span className={`inline-block h-3 w-3 shrink-0 rounded-full border border-line ${g.myColor === 'white' ? 'bg-white' : 'bg-neutral-800'}`} aria-label={g.myColor === 'white' ? 'jij speelde wit' : 'jij speelde zwart'} />
                    <span className="truncate">tegen {opp.name}{opp.rating ? ` (${opp.rating})` : ''}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {[g.opening, g.speed && SPEED[g.speed], fmtDate(g.playedAt), `${Math.ceil(g.san.length / 2)} zetten`, me.rating && `jij ${me.rating}`].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {acc !== undefined
                  ? <span className="shrink-0 text-right"><span className="block text-lg font-bold tabular-nums">{fmtPct(acc)}</span><span className="block text-xs text-muted">nauwkeurig</span></span>
                  : <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---------------- Analyse van één partij ----------------

async function evalPosition(fen: string): Promise<PosEval> {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 }
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0 }
  const a = await analyse(fen, { depth: DEPTH, multipv: 2 })
  if (!a?.lines[0]) throw new Error('Stockfish kon niet laden. Probeer de pagina opnieuw te laden.')
  const stm = c.turn() === 'w' ? 1 : -1
  const conv = (l: { cp?: number; mate?: number }) => (l.mate !== undefined ? { mate: stm * l.mate } : { cp: stm * (l.cp ?? 0) })
  const first = conv(a.lines[0])
  const second = a.lines[1] ? conv(a.lines[1]) : undefined
  return { ...first, best: a.bestmove ?? undefined, pv: a.lines[0].pv.slice(0, 8), cp2: second?.cp, mate2: second?.mate, depth: a.lines[0].depth }
}

function fensOf(san: string[]): string[] {
  const c = new Chess()
  const out = [c.fen()]
  for (const s of san) {
    c.move(s)
    out.push(c.fen())
  }
  return out
}

/** Laat Stockfish de stellingen beoordelen die nog ontbreken, en bewaart tussendoor */
function useEngineReview(record: GameReviewRecord | undefined) {
  const [evals, setEvals] = useState<PosEval[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = record?.id
  useEffect(() => {
    if (!record) return
    let cancelled = false
    const fens = fensOf(record.game.san)
    const list = record.depth === DEPTH ? [...record.evals] : []
    setEvals(list)
    setError(null)
    if (list.length >= fens.length) return
    ;(async () => {
      try {
        for (let i = list.length; i < fens.length && !cancelled; i++) {
          list.push(await evalPosition(fens[i]))
          if (cancelled) return
          setEvals([...list])
          if (i % 8 === 0) await db.reviews.update(record.id, { evals: [...list], depth: DEPTH })
        }
        if (cancelled) return
        await db.reviews.update(record.id, { evals: list, depth: DEPTH, analysedAt: Date.now() })
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  return { evals, error }
}

export function GameReviewView() {
  const { id = '' } = useParams()
  const record = useLiveQuery(() => db.reviews.get(id), [id], null as GameReviewRecord | null | undefined)
  if (record === null) return <Spinner label="Partij laden…" />
  if (!record) return <Navigate to="/analyse" replace />
  return <ReviewBoard record={record} />
}

const NOTABLE: MoveClass[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
const ERRORS: MoveClass[] = ['inaccuracy', 'mistake', 'miss', 'blunder']

function ReviewBoard({ record }: { record: GameReviewRecord }) {
  const game = record.game
  const { evals, error } = useEngineReview(record)
  const names = useAsync(() => loadNames(), [])
  const fens = useMemo(() => fensOf(game.san), [game.san])
  const book = useMemo(() => {
    const own = names.data ? bookInfo(game.san, names.data) : { ply: 0 }
    return { ply: Math.max(own.ply, game.bookPly ?? 0), name: game.opening ?? own.name }
  }, [names.data, game])
  const total = game.san.length
  const done = evals ? Math.min(evals.length, fens.length) : 0
  const ready = done >= fens.length
  const moves = useMemo(() => (evals ? classifyGame(game.san, evals, book.ply) : []), [evals, game.san, book.ply])
  // Nauwkeurigheid bewaren voor de partijlijst, met dezelfde theorielengte als hier
  useEffect(() => {
    if (!ready || !names.data || !moves.length) return
    const accuracy = { white: summarize(moves, 'white').accuracy, black: summarize(moves, 'black').accuracy }
    if (record.accuracy?.white !== accuracy.white || record.accuracy?.black !== accuracy.black) db.reviews.update(record.id, { accuracy })
  }, [ready, names.data, moves]) // eslint-disable-line react-hooks/exhaustive-deps
  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<Side>(game.myColor)
  const current: ReviewedMove | undefined = moves[ply - 1]

  const go = (p: number) => setPly(Math.max(0, Math.min(total, p)))
  const nextError = () => {
    const m = moves.find(m => m.ply >= ply && m.side === game.myColor && ERRORS.includes(m.cls))
    if (m) setPly(m.ply + 1)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPly(p => Math.max(0, p - 1)) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPly(p => Math.min(total, p + 1)) }
      else if (e.key === 'Home') { e.preventDefault(); setPly(0) }
      else if (e.key === 'End') { e.preventDefault(); setPly(total) }
      else if (e.key === 'f') setOrientation(o => (o === 'white' ? 'black' : 'white'))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [total])

  const lastMove = ply > 0 ? (() => { const u = moves[ply - 1]?.uci ?? uciAt(fens[ply - 1], game.san[ply - 1]); return [u.slice(0, 2), u.slice(2, 4)] as [string, string] })() : null
  const arrows = current && current.bestUci && current.bestUci !== current.uci && !['best', 'book', 'brilliant', 'great'].includes(current.cls)
    ? [{ startSquare: current.bestUci.slice(0, 2), endSquare: current.bestUci.slice(2, 4), color: 'rgba(47,125,79,0.8)' }]
    : []
  const evalNow = evals?.[ply]
  const top = orientation === 'white' ? game.black : game.white
  const bottom = orientation === 'white' ? game.white : game.black

  return (
    <div className="space-y-4">
      <PageHeader back="/analyse" title={<>{game.white.name} <span className="text-muted">–</span> {game.black.name}</>}
        subtitle={<>{[game.result === '*' ? 'Nog bezig' : game.result.replace('1/2-1/2', '½-½'), game.ending, book.name, fmtDate(game.playedAt)].filter(Boolean).join(' · ')}
          {' · '}<a className="inline-flex items-center gap-1 underline hover:text-ink" href={game.url} target="_blank" rel="noreferrer">{SOURCE_NAME[game.source]}<ExternalLink size={13} aria-hidden /></a></>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="-mx-2 sm:mx-auto sm:w-full sm:max-w-[min(92vw,640px)] lg:max-w-[min(680px,calc(100dvh-200px))]">
          <PlayerRow p={top} side={orientation === 'white' ? 'black' : 'white'} />
          <div className="flex items-stretch gap-1.5">
            <EvalBar e={evalNow} orientation={orientation} />
            <div className="relative min-w-0 flex-1">
              <Board fen={fens[ply]} orientation={orientation} lastMove={lastMove} arrows={arrows} id="review" label={`Partijstelling na ${ply} halve zetten`} />
              {current && lastMove && <SquareBadge square={lastMove[1]} cls={current.cls} orientation={orientation} />}
            </div>
          </div>
          <PlayerRow p={bottom} side={orientation} />
          <div className="px-2 sm:px-0 lg:hidden"><MoveComment move={current} evalAfter={evalNow} ply={ply} ready={!!evals && done > ply} compact /></div>
          <div className="mt-2 grid grid-cols-5 gap-1.5 px-2 sm:px-0">
            <NavButton label="Begin" onClick={() => go(0)} disabled={ply === 0}><ChevronsLeft size={22} /></NavButton>
            <NavButton label="Vorige zet" onClick={() => go(ply - 1)} disabled={ply === 0}><ChevronLeft size={22} /></NavButton>
            <NavButton label="Volgende zet" onClick={() => go(ply + 1)} disabled={ply === total}><ChevronRight size={22} /></NavButton>
            <NavButton label="Einde" onClick={() => go(total)} disabled={ply === total}><ChevronsRight size={22} /></NavButton>
            <NavButton label="Bord draaien" onClick={() => setOrientation(o => (o === 'white' ? 'black' : 'white'))}><FlipVertical2 size={20} /></NavButton>
          </div>
        </div>

        <aside className="space-y-4">
          {!ready && (
            <div className="card space-y-2 p-4" aria-live="polite">
              <div className="flex justify-between text-sm"><span className="font-semibold">Stockfish analyseert…</span><span className="tabular-nums text-muted">{done}/{fens.length}</span></div>
              <ProgressBar value={done / fens.length} label="Voortgang van de analyse" />
              {error ? <ErrorBox error={error} /> : <p className="text-xs text-muted">Dit gebeurt op je eigen apparaat. Je kunt intussen al door de partij bladeren.</p>}
            </div>
          )}

          <div className="max-lg:hidden"><MoveComment move={current} evalAfter={evalNow} ply={ply} ready={!!evals && done > ply} /></div>

          {ready && <Summary moves={moves} game={game} onNextError={nextError} />}

          <EvalGraph evals={evals ?? []} total={total} ply={ply} moves={moves} onPick={go} />

          <MoveList san={game.san} moves={moves} ply={ply} onPick={go} />
        </aside>
      </div>
    </div>
  )
}

function uciAt(fen: string, san: string): string {
  const m = new Chess(fen).move(san)
  return m.from + m.to + (m.promotion ?? '')
}

function NavButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button className="btn btn-ghost min-h-12 px-0" onClick={onClick} disabled={disabled} aria-label={label} title={label}>{children}</button>
}

function PlayerRow({ p, side }: { p: { name: string; rating?: number }; side: Side }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm sm:px-0">
      <span className={`inline-block h-3.5 w-3.5 rounded-sm border border-line ${side === 'white' ? 'bg-white' : 'bg-neutral-800'}`} aria-hidden />
      <span className="font-semibold">{p.name}</span>
      {p.rating && <span className="text-muted">({p.rating})</span>}
    </div>
  )
}

function ClassIcon({ cls, size = 20 }: { cls: MoveClass; size?: number }) {
  const info = CLASS_INFO[cls]
  const emoji = cls === 'excellent' || cls === 'book'
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white shadow-sm"
      style={{ backgroundColor: info.color, width: size, height: size, fontSize: emoji ? size * 0.55 : size * (info.symbol.length > 1 ? 0.48 : 0.62), lineHeight: 1 }}
      aria-hidden>{info.symbol}</span>
  )
}

function SquareBadge({ square, cls, orientation }: { square: string; cls: MoveClass; orientation: Side }) {
  const f = 'abcdefgh'.indexOf(square[0])
  const r = Number(square[1])
  const col = orientation === 'white' ? f : 7 - f
  const row = orientation === 'white' ? 8 - r : r - 1
  return (
    <div className="pointer-events-none absolute z-10" style={{ left: `calc(${(col + 1) * 12.5}% - 1.15rem)`, top: `calc(${row * 12.5}% + 0.15rem)` }}>
      <span className="block animate-pop"><ClassIcon cls={cls} size={22} /></span>
    </div>
  )
}

function EvalBar({ e, orientation }: { e: PosEval | undefined; orientation: Side }) {
  const white = winPct(e)
  const score = formatScore(e)
  const whiteAhead = white >= 50
  return (
    <div className={`relative w-3.5 shrink-0 overflow-hidden rounded-md bg-neutral-700 sm:w-5 ${orientation === 'black' ? 'rotate-180' : ''}`} role="img" aria-label={`Evaluatie ${score}`}>
      <div className="absolute inset-x-0 bottom-0 bg-neutral-100 transition-[height] duration-500" style={{ height: `${white}%` }} />
      <span className={`absolute inset-x-0 hidden text-center text-[9px] font-bold sm:block ${orientation === 'black' ? 'rotate-180' : ''} ${whiteAhead ? 'text-neutral-800' : 'text-neutral-100'}`}
        style={whiteAhead === (orientation === 'white') ? { bottom: 2 } : { top: 2 }}>{e ? score.replace(/^[+−]/, '') : ''}</span>
    </div>
  )
}

function MoveComment({ move, evalAfter, ply, ready, compact }: { move?: ReviewedMove; evalAfter?: PosEval; ply: number; ready: boolean; compact?: boolean }) {
  const box = compact ? 'card min-h-16 px-3 py-2' : 'card p-4'
  if (ply === 0) return <div className={`${box} flex items-center text-sm text-muted`}>Beginstelling. Blader met de pijltjes of klik op een zet.</div>
  if (!move || !ready) return <div className={`${box} flex items-center text-sm text-muted`}>Deze zet wordt nog beoordeeld…</div>
  const info = CLASS_INFO[move.cls]
  const showLine = !compact && move.bestLine.length > 0 && move.bestUci !== move.uci && move.cls !== 'book'
  return (
    <div className={box} aria-live="polite">
      <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
        <ClassIcon cls={move.cls} size={compact ? 26 : 30} />
        <div className="min-w-0 flex-1">
          <div className="font-bold" style={{ color: info.color }}>{info.label}</div>
          <div className="text-sm">{explainMove(move)}</div>
        </div>
        <span className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-mono text-sm font-bold tabular-nums">{formatScore(evalAfter)}</span>
      </div>
      {showLine && <p className="mt-2 text-sm text-muted">Beste lijn: <span className="font-mono">{formatLine(move.bestLine, move.ply)}</span></p>}
    </div>
  )
}

function formatLine(san: string[], startPly: number): string {
  return san.map((s, i) => {
    const p = startPly + i
    if (p % 2 === 0) return `${p / 2 + 1}. ${s}`
    return i === 0 ? `${(p + 1) / 2}… ${s}` : s
  }).join(' ')
}

function Summary({ moves, game, onNextError }: { moves: ReviewedMove[]; game: ReviewGame; onNextError: () => void }) {
  const w = summarize(moves, 'white')
  const b = summarize(moves, 'black')
  const myErrors = moves.filter(m => m.side === game.myColor && ERRORS.includes(m.cls)).length
  return (
    <div className="card p-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 text-center">
        <div><div className="truncate text-sm text-muted">{game.white.name}</div><div className="text-3xl font-extrabold tabular-nums">{fmtPct(w.accuracy)}</div></div>
        <div className="pb-1.5 text-xs text-muted">nauw&shy;keurig&shy;heid</div>
        <div><div className="truncate text-sm text-muted">{game.black.name}</div><div className="text-3xl font-extrabold tabular-nums">{fmtPct(b.accuracy)}</div></div>
      </div>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Aantal zetten per beoordeling, wit en zwart</caption>
        <tbody>
          {CLASS_ORDER.filter(k => w.counts[k] + b.counts[k] > 0 || k === 'blunder' || k === 'best').map(k => (
            <tr key={k} className="border-t border-line">
              <td className="w-10 py-1 text-center tabular-nums font-semibold" style={{ color: w.counts[k] ? CLASS_INFO[k].color : undefined }}>{w.counts[k]}</td>
              <td className="py-1"><span className="flex items-center justify-center gap-2"><ClassIcon cls={k} size={18} />{CLASS_INFO[k].label}</span></td>
              <td className="w-10 py-1 text-center tabular-nums font-semibold" style={{ color: b.counts[k] ? CLASS_INFO[k].color : undefined }}>{b.counts[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {myErrors > 0 && <button className="btn btn-primary mt-3 w-full" onClick={onNextError}><SkipForward size={18} aria-hidden />Naar je volgende fout <span className="font-normal opacity-80">({myErrors})</span></button>}
    </div>
  )
}

function EvalGraph({ evals, total, ply, moves, onPick }: { evals: PosEval[]; total: number; ply: number; moves: ReviewedMove[]; onPick: (p: number) => void }) {
  if (evals.length < 2) return null
  const W = Math.max(total, 1)
  const pts = evals.map((e, i) => `${i},${100 - winPct(e)}`)
  const area = `M0,100 L${pts.join(' L')} L${evals.length - 1},100 Z`
  return (
    <div className="card overflow-hidden p-0">
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="block h-24 w-full cursor-pointer bg-neutral-700" role="img" aria-label="Verloop van de evaluatie. Klik om naar die zet te gaan."
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          onPick(Math.round(((e.clientX - r.left) / r.width) * W))
        }}>
        <path d={area} fill="#f2f2ef" />
        <line x1="0" x2={W} y1="50" y2="50" stroke="#888" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {moves.filter(m => ['mistake', 'miss', 'blunder', 'brilliant', 'great'].includes(m.cls)).map(m => (
          <line key={m.ply} x1={m.ply + 1} x2={m.ply + 1} y1="0" y2="100" stroke={CLASS_INFO[m.cls].color} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.85" />
        ))}
        <line x1={ply} x2={ply} y1="0" y2="100" stroke="var(--brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function MoveList({ san, moves, ply, onPick }: { san: string[]; moves: ReviewedMove[]; ply: number; onPick: (p: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="true"]')
    const box = ref.current
    if (el && box) box.scrollTop = el.offsetTop - box.clientHeight / 2
  }, [ply])
  const rows = Array.from({ length: Math.ceil(san.length / 2) }, (_, i) => i)
  const cell = (p: number) => {
    if (p >= san.length) return <span />
    const m = moves[p]
    const notable = m && NOTABLE.includes(m.cls)
    return (
      <button aria-current={ply === p + 1 ? 'true' : undefined} onClick={() => onPick(p + 1)}
        className={`flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left font-mono text-sm ${ply === p + 1 ? 'bg-brand-soft font-bold text-brand-strong' : 'hover:bg-surface-2'}`}
        aria-label={`${san[p]}${m ? `, ${CLASS_INFO[m.cls].label.toLowerCase()}` : ''}`}>
        {notable && <ClassIcon cls={m.cls} size={16} />}
        <span style={notable ? { color: CLASS_INFO[m.cls].color } : undefined}>{san[p]}</span>
      </button>
    )
  }
  return (
    <div className="card p-2">
      <h2 className="px-2 pt-1 pb-1 text-sm font-semibold">Zetten <span className="font-normal text-muted">· {plural(rows.length, 'zet', 'zetten')}</span></h2>
      <div ref={ref} className="relative max-h-72 overflow-y-auto">
        <ol className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-1">
          {rows.map(i => (
            <li key={i} className="contents">
              <span className="flex min-h-9 items-center justify-end pr-1 text-xs tabular-nums text-muted">{i + 1}.</span>
              {cell(i * 2)}
              {cell(i * 2 + 1)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

