import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chess } from 'chess.js'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Dumbbell, ExternalLink, FlipVertical2, Share2, SkipForward, X } from 'lucide-react'
import { db, saveSettings, type GameReviewRecord } from '../lib/db'
import { analyse } from '../lib/engine'
import { loadNames } from '../lib/data'
import { useAsync } from '../lib/hooks'
import {
  CLASS_INFO, CLASS_ORDER, MIN_RATED_MOVES, ENGINE_NAME, bookInfo, decodeShare, encodeShare, gameToPgn, highlightsOf, isOwnGame, estimateRating, fetchLichessGame, findChesscomGame, gameFromPgn, parseGameLink, classifyGame, explainMove, fetchChesscomRecent, fetchLichessRecent, formatScore, summarize, winPct,
  type Highlight, type HighlightKind, type MoveClass, type PosEval, type ReviewGame, type ReviewedMove,
} from '../lib/review'
import { Board, MiniBoard } from '../components/Board'
import { mistakeItems, saveMistakeCards, type MistakeItem } from '../lib/mistakes'
import { MoveClassIcon } from '../components/MoveClassIcon'
import { renderShareImage, SHARE_TITLE } from '../components/ShareImage'
import { Empty, ErrorBox, FocusBar, PageHeader, ProgressBar, Spinner, Tabs, plural, useSettings } from '../components/ui'
import type { Side } from '../lib/types'

/** Rekendiepte van Stockfish per stelling. Snel: een halve minuut per partij; grondig: een paar minuten. */
const QUICK_DEPTH = 14
const DEEP_DEPTH = 18
const DEPTH_KEY = 'schaakroute.analyseDiepte'
const validDepth = (d: number) => d === QUICK_DEPTH || d === DEEP_DEPTH
/** Is de analyse van dit record compleet (op een geldige diepte)? */
const isAnalysed = (r: GameReviewRecord) => validDepth(r.depth) && r.evals.length >= r.game.san.length + 1

function readDepth(): number {
  try {
    return Number(localStorage.getItem(DEPTH_KEY)) === DEEP_DEPTH ? DEEP_DEPTH : QUICK_DEPTH
  } catch {
    return QUICK_DEPTH
  }
}

const SPEED: Record<string, string> = {
  ultraBullet: 'Bullet', bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Klassiek', daily: 'Per dag', correspondence: 'Per dag',
}
const SOURCE_NAME = { lichess: 'Lichess', chesscom: 'Chess.com', pgn: 'PGN' } as const
const scaleOf = (s: ReviewGame['source']) => (s === 'chesscom' ? 'chesscom' : 'lichess')
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
  const brilliants = useHighlights()?.filter(h => h.kind === 'brilliant').length ?? 0
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
    if (!(await db.reviews.get(g.id))) await db.reviews.put({ id: g.id, game: withOpening(g, names.data), evals: [], depth: depthPref, savedAt: Date.now() })
    else await db.reviews.update(g.id, { savedAt: Date.now() })
    navigate(`/analyse/${encodeURIComponent(g.id)}`)
  }

  // Eén partij via een link of een geplakte PGN
  const [depthPref, setDepthPref] = useState(readDepth)
  function pickDepth(d: number) {
    setDepthPref(d)
    try { localStorage.setItem(DEPTH_KEY, String(d)) } catch { /* geen opslag */ }
  }
  const [paste, setPaste] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteErr, setPasteErr] = useState<string | null>(null)
  const [botLink, setBotLink] = useState<string | null>(null)
  const myNames = [settings?.lichessUser, settings?.chesscomUser].filter((n): n is string => !!n)

  async function openPasted(e: FormEvent) {
    e.preventDefault()
    const text = paste.trim()
    if (!text) return
    setPasteBusy(true); setPasteErr(null); setBotLink(null)
    try {
      const link = parseGameLink(text)
      let game: ReviewGame | null = null
      if (link?.kind === 'lichess') game = await fetchLichessGame(link.id, myNames)
      else if (link?.kind === 'chesscom') {
        if (link.type === 'computer') {
          setBotLink(`https://www.chess.com/game/computer/${link.id}`)
          throw new Error('Partijen tegen een bot haalt Chess.com niet op voor andere apps. Kopieer de PGN op Chess.com en plak die hier: open de partij, tik op Delen (het pijltje) → PGN → Kopiëren.')
        }
        const known = await db.reviews.get('cc:' + link.id)
        game = known?.game ?? games?.find(g => g.id === 'cc:' + link.id) ?? null
        if (!game && settings?.chesscomUser) game = await findChesscomGame(settings.chesscomUser, link.id)
        if (!game) throw new Error(settings?.chesscomUser
          ? `Deze partij staat niet in de partijen van ${settings.chesscomUser}. Kopieer op Chess.com de PGN (Delen → PGN) en plak die hier.`
          : 'Chess.com-partijen zoek ik op via je gebruikersnaam. Haal eerst je Chess.com-partijen op hierboven, of plak de PGN (Delen → PGN op Chess.com).')
      } else if (/^\s*(\[|1\.)/.test(text)) game = gameFromPgn(text, myNames)
      else throw new Error('Dit herken ik niet. Plak een link naar een partij op Lichess of Chess.com, of een PGN.')
      setPaste('')
      await open(game)
    } catch (e) {
      setPasteErr(e instanceof TypeError ? 'Kon de partij niet ophalen. Controleer je internetverbinding.' : (e as Error).message)
    } finally {
      setPasteBusy(false)
    }
  }

  const earlier = saved.filter(r => !games?.some(g => g.id === r.id))

  return (
    <div className="space-y-5">
      <PageHeader title="Partij-analyse" subtitle="Vul je gebruikersnaam in, kies een partij en zie per zet hoe goed hij was: van briljant tot blunder."
        actions={<Link className="btn btn-ghost" to="/analyse/briljant"><MoveClassIcon cls="brilliant" size={20} />Mijn briljante zetten{brilliants ? <span className="font-normal text-muted">({brilliants})</span> : null}</Link>} />
      <form className="card space-y-3 p-4" onSubmit={load}>
        <Tabs value={source} onChange={pickSource} options={[{ value: 'lichess', label: 'Lichess' }, { value: 'chesscom', label: 'Chess.com' }]} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="review-user">Gebruikersnaam op {SOURCE_NAME[source]}</label>
          <input id="review-user" className="input sm:flex-1" placeholder={`Gebruikersnaam op ${SOURCE_NAME[source]}`} autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={name ?? stored ?? ''} onChange={e => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy || !username}>Partijen ophalen</button>
        </div>
        <p className="text-xs text-muted">Je laatste 30 partijen. Stockfish rekent alles op je eigen apparaat; er wordt niets naar ons gestuurd.</p>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">Hoe grondig analyseren</legend>
          <span className="text-muted">Analyse:</span>
          {[{ d: QUICK_DEPTH, label: 'Snel', hint: 'ongeveer een halve minuut' }, { d: DEEP_DEPTH, label: 'Grondig', hint: 'een paar minuten, preciezer' }].map(o => (
            <label key={o.d} className={`chip cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${depthPref === o.d ? 'chip-on' : ''}`}>
              <input type="radio" name="review-depth" className="sr-only" checked={depthPref === o.d} onChange={() => pickDepth(o.d)} />
              {o.label} <span className="font-normal opacity-70">· {o.hint}</span>
            </label>
          ))}
        </fieldset>
      </form>

      <form className="card space-y-2 p-4" onSubmit={openPasted}>
        <label htmlFor="review-paste" className="font-semibold">Of analyseer één partij</label>
        <textarea id="review-paste" className="input min-h-20 font-mono text-sm" rows={3} spellCheck={false} autoCapitalize="none"
          placeholder="Plak een link (Lichess of Chess.com) of een PGN" value={paste} onChange={e => setPaste(e.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Ook voor partijen tegen een bot: op Chess.com via Delen → PGN → Kopiëren.</p>
          <button className="btn btn-primary" disabled={pasteBusy || !paste.trim()}>{pasteBusy ? 'Bezig…' : 'Analyseren'}</button>
        </div>
        {pasteErr && <ErrorBox error={pasteErr} />}
        {botLink && <a className="btn btn-ghost w-full" href={botLink} target="_blank" rel="noreferrer">Partij openen op Chess.com <ExternalLink size={14} aria-hidden /></a>}
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
  if (!names || (g.source === 'lichess' && g.bookPly !== undefined)) return g
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
          // Altijd met de huidige formule rekenen, ook voor eerder opgeslagen analyses
          const rec = saved.get(g.id)
          const est = rec?.rating?.[g.myColor] != null && rec.accuracy ? estimateRating(rec.accuracy[g.myColor], scaleOf(g.source)) : null
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
                  ? <span className="shrink-0 text-right"><span className="block text-lg font-bold tabular-nums">{est ?? fmtPct(acc)}</span><span className="block text-xs text-muted">{est ? 'partijrating' : 'nauwkeurig'}</span></span>
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

async function evalPosition(fen: string, depth = QUICK_DEPTH): Promise<PosEval> {
  const c = new Chess(fen)
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000 }
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0 }
  const a = await analyse(fen, { depth, multipv: 2 })
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

interface EngineProgress { done: number; total: number; depth: number; deepening: boolean }

/**
 * Laat Stockfish de stellingen beoordelen die nog ontbreken, en bewaart tussendoor.
 * Bij een grondigere analyse blijft de bestaande beoordeling zichtbaar tot de nieuwe klaar is.
 */
function useEngineReview(record: GameReviewRecord | undefined) {
  const [evals, setEvals] = useState<PosEval[] | null>(null)
  const [progress, setProgress] = useState<EngineProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = record?.id
  const deepDepth = record?.deep?.depth
  useEffect(() => {
    if (!record) return
    let cancelled = false
    const fens = fensOf(record.game.san)
    const base = validDepth(record.depth) ? [...record.evals] : []
    const deep = record.deep
    const depth = deep?.depth ?? (validDepth(record.depth) ? record.depth : QUICK_DEPTH)
    const list = deep ? [...deep.evals] : base
    // Tijdens een grondige analyse de oude, complete beoordeling laten staan
    const keepOld = !!deep && base.length >= fens.length
    setEvals(keepOld ? base : list)
    setError(null)
    setProgress({ done: list.length, total: fens.length, depth, deepening: !!deep })
    if (list.length >= fens.length && !deep) return
    ;(async () => {
      try {
        for (let i = list.length; i < fens.length && !cancelled; i++) {
          list.push(await evalPosition(fens[i], depth))
          if (cancelled) return
          setProgress({ done: list.length, total: fens.length, depth, deepening: !!deep })
          if (!keepOld) setEvals([...list])
          if (i % 8 === 0) await db.reviews.update(record.id, deep ? { deep: { depth, evals: [...list] } } : { evals: [...list], depth })
        }
        if (cancelled) return
        setEvals([...list])
        setProgress({ done: list.length, total: fens.length, depth, deepening: false })
        await db.reviews.update(record.id, { evals: list, depth, analysedAt: Date.now(), deep: undefined })
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [id, deepDepth]) // eslint-disable-line react-hooks/exhaustive-deps
  return { evals, error, progress }
}

// ---------------- Delen ----------------

const shareUrl = (g: ReviewGame, ply?: number) => `${location.origin}${location.pathname}#/delen/${encodeShare(g, ply)}`

function ShareDialog({ game, ply, move, onClose }: { game: ReviewGame; ply: number; move?: ReviewedMove; onClose: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const first = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    first.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); opener?.focus() }
  }, [])
  const opp = game.myColor === 'white' ? game.black : game.white
  const moveText = move ? `${formatLine([move.san], move.ply)}${['brilliant', 'great', 'blunder'].includes(move.cls) ? ` (${CLASS_INFO[move.cls].label.toLowerCase()})` : ''}` : ''

  // Deelplaatje van de huidige zet, zoals de kaartjes van schaaksites
  const [image, setImage] = useState<{ blob: Blob; url: string } | 'error' | null>(null)
  useEffect(() => {
    if (!(ply > 0 && move)) return
    let url = ''
    let cancelled = false
    const c = new Chess()
    for (const s of game.san.slice(0, ply)) c.move(s)
    renderShareImage({
      fen: c.fen(), orientation: move.side, from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), cls: move.cls, moveText: move.san,
      player: (move.side === 'white' ? game.white : game.black).name,
      sub: `Zet ${Math.floor(move.ply / 2) + 1} · tegen ${(move.side === 'white' ? game.black : game.white).name} · ${fmtDate(game.playedAt)}`,
    }).then(blob => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setImage({ blob, url })
    }).catch(() => { if (!cancelled) setImage('error') })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const fileName = move ? `schaakroute-${move.san.replace(/[^a-zA-Z0-9]/g, '')}.png` : 'schaakroute.png'

  async function shareImage() {
    if (!image || image === 'error' || !move) return
    const file = new File([image.blob], fileName, { type: 'image/png' })
    const text = `${SHARE_TITLE[move.cls]} ${formatLine([move.san], move.ply)} tegen ${opp.name}\n${shareUrl(game, ply)}`
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'SchaakRoute', text })
        onClose()
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    // Geen deelmenu met plaatjes (bijv. op een computer): downloaden
    const a = document.createElement('a')
    a.href = image.url
    a.download = fileName
    a.click()
    setStatus('Plaatje opgeslagen.')
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text)
      setStatus(done)
    } catch {
      setManual(text) // geen klembord: laat de tekst zien om zelf te kopiëren
    }
  }
  async function share(url: string, text: string) {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'SchaakRoute', text, url })
        onClose()
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    await copy(url, 'Link gekopieerd. Plak hem waar je wilt.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" aria-hidden onClick={onClose} />
      <div className="safe-bottom relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4 shadow-2xl animate-fade-up sm:rounded-3xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="share-title" className="text-lg font-bold">Delen</h2>
          <button className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={onClose} aria-label="Sluiten"><X size={22} aria-hidden /></button>
        </div>
        {ply > 0 && move && (
          <div className="mb-3 overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: '1200 / 630' }}>
            {image && image !== 'error'
              ? <img src={image.url} alt={`Deelplaatje: ${SHARE_TITLE[move.cls]} ${move.san}`} className="block h-full w-full" />
              : <div className="flex h-full items-center justify-center text-sm text-muted">{image === 'error' ? 'Plaatje maken lukte niet; deel de link.' : 'Plaatje maken…'}</div>}
          </div>
        )}
        <div className="grid gap-2">
          {ply > 0 && move && (
            <>
              <button ref={first} className="btn btn-primary min-h-12 justify-start" disabled={!image || image === 'error'} onClick={shareImage}>
                <MoveClassIcon cls={move.cls} size={22} />Plaatje van deze zet delen
              </button>
              <button className="btn btn-ghost min-h-12 justify-start" onClick={() => share(shareUrl(game, ply), `Bekijk ${moveText} uit mijn partij tegen ${opp.name}`)}>
                <Share2 size={20} aria-hidden />Link naar deze zet <span className="font-mono font-normal opacity-80">{formatLine([move.san], move.ply)}</span>
              </button>
            </>
          )}
          <button ref={ply > 0 && move ? undefined : first} className={`btn ${ply > 0 && move ? 'btn-ghost' : 'btn-primary'} min-h-12 justify-start`} onClick={() => share(shareUrl(game), `Bekijk mijn partij tegen ${opp.name}`)}>
            <Share2 size={20} aria-hidden />Hele partij delen
          </button>
          <button className="btn btn-ghost min-h-12 justify-start" onClick={() => copy(gameToPgn(game), 'PGN gekopieerd.')}>PGN kopiëren</button>
        </div>
        {status && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong" role="status">{status}</p>}
        {manual && (
          <label className="mt-3 block text-sm">Kopieer zelf:
            <textarea className="input mt-1 h-24 font-mono text-xs" readOnly value={manual} onFocus={e => e.currentTarget.select()} autoFocus />
          </label>
        )}
        <p className="mt-3 text-xs text-muted">Wie de link opent, ziet de partij in SchaakRoute en laat hem daar zelf analyseren.</p>
      </div>
    </div>
  )
}

/** Opent een gedeelde partij: bewaart hem lokaal en gaat naar de analyse */
export function SharedGameView() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const shared = useMemo(() => decodeShare(code), [code])
  useEffect(() => {
    if (!shared) return
    ;(async () => {
      const { game, ply } = shared
      if (!(await db.reviews.get(game.id))) await db.reviews.put({ id: game.id, game, evals: [], depth: readDepth(), savedAt: Date.now(), shared: true })
      navigate(`/analyse/${encodeURIComponent(game.id)}${ply ? `?zet=${ply}` : ''}`, { replace: true })
    })()
  }, [shared, navigate])
  if (!shared) return <Empty title="Deze link klopt niet" action={<Link className="btn btn-primary" to="/analyse">Naar partij-analyse</Link>}>De gedeelde partij kon niet gelezen worden. Misschien is de link niet helemaal gekopieerd.</Empty>
  return <Spinner label="Gedeelde partij openen…" />
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
  const { evals, error, progress } = useEngineReview(record)
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
    const w = summarize(moves, 'white', game.source)
    const b = summarize(moves, 'black', game.source)
    const accuracy = { white: w.accuracy, black: b.accuracy }
    const rating = { white: w.rating, black: b.rating }
    if (record.accuracy?.white !== accuracy.white || record.accuracy?.black !== accuracy.black || record.rating?.white !== rating.white || record.rating?.black !== rating.black) {
      db.reviews.update(record.id, { accuracy, rating })
    }
  }, [ready, names.data, moves]) // eslint-disable-line react-hooks/exhaustive-deps
  const [params] = useSearchParams()
  const [ply, setPly] = useState(() => Math.max(0, Math.min(game.san.length, Number(params.get('zet')) || 0)))
  const [sharing, setSharing] = useState(false)
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
      if (document.querySelector('[role="dialog"]')) return
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
          {game.url && <>{' · '}<a className="inline-flex items-center gap-1 underline hover:text-ink" href={game.url} target="_blank" rel="noreferrer">{SOURCE_NAME[game.source]}<ExternalLink size={13} aria-hidden /></a></>}</>} />

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
          <div className="mt-2 grid grid-cols-6 gap-1.5 px-2 sm:px-0">
            <NavButton label="Begin" onClick={() => go(0)} disabled={ply === 0}><ChevronsLeft size={22} /></NavButton>
            <NavButton label="Vorige zet" onClick={() => go(ply - 1)} disabled={ply === 0}><ChevronLeft size={22} /></NavButton>
            <NavButton label="Volgende zet" onClick={() => go(ply + 1)} disabled={ply === total}><ChevronRight size={22} /></NavButton>
            <NavButton label="Einde" onClick={() => go(total)} disabled={ply === total}><ChevronsRight size={22} /></NavButton>
            <NavButton label="Bord draaien" onClick={() => setOrientation(o => (o === 'white' ? 'black' : 'white'))}><FlipVertical2 size={20} /></NavButton>
            <NavButton label="Delen" onClick={() => setSharing(true)}><Share2 size={20} /></NavButton>
          </div>
        </div>

        <aside className="space-y-4">
          {(!ready || progress?.deepening) && (
            <div className="card space-y-2 p-4" aria-live="polite">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{progress?.deepening ? `Grondige analyse (diepte ${progress.depth})…` : 'Stockfish analyseert…'}</span>
                <span className="tabular-nums text-muted">{progress?.done ?? done}/{fens.length}</span>
              </div>
              <ProgressBar value={(progress?.done ?? done) / fens.length} label="Voortgang van de analyse" />
              {error ? <ErrorBox error={error} /> : <p className="text-xs text-muted">{progress?.deepening
                ? 'De huidige beoordeling blijft staan tot dit klaar is. Dit gebeurt op je eigen apparaat en kan een paar minuten duren.'
                : 'Dit gebeurt op je eigen apparaat. Je kunt intussen al door de partij bladeren.'}</p>}
            </div>
          )}

          <div className="max-lg:hidden"><MoveComment move={current} evalAfter={evalNow} ply={ply} ready={!!evals && done > ply} /></div>

          {ready && <Summary moves={moves} game={game} onNextError={nextError} depth={record.depth}
            onDeepen={record.depth < DEEP_DEPTH && !progress?.deepening ? () => db.reviews.update(record.id, { deep: { depth: DEEP_DEPTH, evals: [] } }) : undefined} />}

          <EvalGraph evals={evals ?? []} total={total} ply={ply} moves={moves} onPick={go} />

          <MoveList san={game.san} moves={moves} ply={ply} onPick={go} />
        </aside>
      </div>
      {sharing && <ShareDialog game={game} ply={ply} move={current} onClose={() => setSharing(false)} />}
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

function SquareBadge({ square, cls, orientation, size = 26 }: { square: string; cls: MoveClass; orientation: Side; size?: number }) {
  const f = 'abcdefgh'.indexOf(square[0])
  const r = Number(square[1])
  const col = orientation === 'white' ? f : 7 - f
  const row = orientation === 'white' ? 8 - r : r - 1
  return (
    <div className="pointer-events-none absolute z-10" style={size < 26
      // Klein bord: binnen het veld houden, zodat het icoontje aan de rand niet wegvalt
      ? { left: `calc(${(col + 1) * 12.5}% - ${size + 1}px)`, top: `calc(${row * 12.5}% + 1px)` }
      : { left: `calc(${(col + 1) * 12.5}% - 1.3rem)`, top: `calc(${row * 12.5}% - 0.2rem)` }}>
      <span className="block animate-pop"><MoveClassIcon cls={cls} size={size} ring /></span>
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
        <MoveClassIcon cls={move.cls} size={compact ? 26 : 30} />
        <div className="min-w-0 flex-1">
          <div className="font-bold" style={{ color: info.color }}>{info.label}</div>
          <div className="text-sm">{explainMove(move)}</div>
        </div>
        <span className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 font-mono text-sm font-bold tabular-nums">{formatScore(evalAfter)}</span>
      </div>
      {move.missedBrilliant && !compact && <p className="mt-2 flex items-center gap-2 text-sm font-semibold" style={{ color: CLASS_INFO.brilliant.color }}><MoveClassIcon cls="brilliant" size={18} />Gemiste briljante zet: {move.bestSan}</p>}
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

function Summary({ moves, game, onNextError, depth, onDeepen }: { moves: ReviewedMove[]; game: ReviewGame; onNextError: () => void; depth: number; onDeepen?: () => void }) {
  const navigate = useNavigate()
  const w = summarize(moves, 'white', game.source)
  const b = summarize(moves, 'black', game.source)
  const myErrors = moves.filter(m => m.side === game.myColor && ERRORS.includes(m.cls)).length
  return (
    <div className="card p-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 text-center">
        <div><div className="truncate text-sm text-muted">{game.white.name}</div><div className="text-3xl font-extrabold tabular-nums">{fmtPct(w.accuracy)}</div></div>
        <div className="pb-1.5 text-xs text-muted">nauw&shy;keurig&shy;heid</div>
        <div><div className="truncate text-sm text-muted">{game.black.name}</div><div className="text-3xl font-extrabold tabular-nums">{fmtPct(b.accuracy)}</div></div>
        <div className="text-xl font-bold tabular-nums">{w.rating ?? '–'}</div>
        <div className="pb-0.5 text-xs text-muted">partij&shy;rating</div>
        <div className="text-xl font-bold tabular-nums">{b.rating ?? '–'}</div>
        <div className="-mt-2 text-xs text-muted">{game.white.rating ? `rating ${game.white.rating}` : ''}</div>
        <div />
        <div className="-mt-2 text-xs text-muted">{game.black.rating ? `rating ${game.black.rating}` : ''}</div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">{w.rating === null || b.rating === null
        ? `Een partijrating komt er vanaf ${MIN_RATED_MOVES} eigen zetten na de theorie.`
        : `Partijrating (${game.source === 'chesscom' ? 'Chess.com' : 'Lichess'}-schaal): de rating die typisch hoort bij deze nauwkeurigheid. Eén partij zegt niet alles.`}</p>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Aantal zetten per beoordeling, wit en zwart</caption>
        <tbody>
          {CLASS_ORDER.filter(k => w.counts[k] + b.counts[k] > 0 || k === 'blunder' || k === 'best').map(k => (
            <tr key={k} className="border-t border-line">
              <td className="w-10 py-1 text-center tabular-nums font-semibold" style={{ color: w.counts[k] ? CLASS_INFO[k].color : undefined }}>{w.counts[k]}</td>
              <td className="py-1"><span className="flex items-center justify-center gap-2"><MoveClassIcon cls={k} size={18} />{CLASS_INFO[k].label}</span></td>
              <td className="w-10 py-1 text-center tabular-nums font-semibold" style={{ color: b.counts[k] ? CLASS_INFO[k].color : undefined }}>{b.counts[k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(w.missedBrilliants > 0 || b.missedBrilliants > 0) && (
        <p className="mt-2 flex items-center justify-center gap-2 text-sm"><MoveClassIcon cls="brilliant" size={18} />
          Gemiste briljante zetten: <b>{w.missedBrilliants}</b> wit, <b>{b.missedBrilliants}</b> zwart</p>
      )}
      {myErrors > 0 && (
        <div className="mt-3 grid gap-2">
          <button className="btn btn-primary min-h-12 w-full" onClick={() => navigate(`/analyse/${encodeURIComponent(game.id)}/fouten`)}><Dumbbell size={18} aria-hidden />Train je fouten <span className="font-normal opacity-80">({myErrors})</span></button>
          <button className="btn btn-ghost w-full" onClick={onNextError}><SkipForward size={18} aria-hidden />Naar je volgende fout</button>
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted">{ENGINE_NAME} · diepte {depth}{depth >= DEEP_DEPTH ? ' (grondig)' : ''} · op je eigen apparaat</p>
      {onDeepen && <button className="btn btn-quiet mt-1 w-full text-sm" onClick={onDeepen}>Grondiger analyseren (diepte {DEEP_DEPTH}, duurt een paar minuten)</button>}
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
        {notable && <MoveClassIcon cls={m.cls} size={16} />}
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


// ---------------- Fouten-trainer ----------------

export function MistakeTrainerView() {
  const { id = '' } = useParams()
  const record = useLiveQuery(() => db.reviews.get(id), [id], null as GameReviewRecord | null | undefined)
  // Eén keer vastleggen: tussentijdse updates van het record (nauwkeurigheid) mogen de trainer niet herstarten
  const [snapshot, setSnapshot] = useState<GameReviewRecord | null>(null)
  useEffect(() => { if (record && !snapshot) setSnapshot(record) }, [record, snapshot])
  if (record === null || (record && !snapshot)) return <Spinner label="Partij laden…" />
  if (!record || !snapshot) return <Navigate to="/analyse" replace />
  return <MistakeTrainer record={snapshot} />
}

function MistakeTrainer({ record }: { record: GameReviewRecord }) {
  const game = record.game
  const navigate = useNavigate()
  const back = `/analyse/${encodeURIComponent(game.id)}`
  const names = useAsync(() => loadNames(), [])
  const fens = useMemo(() => fensOf(game.san), [game.san])
  const analysed = isAnalysed(record)
  const items = useMemo(() => {
    if (!names.data || !analysed) return null
    const ply = Math.max(bookInfo(game.san, names.data).ply, game.bookPly ?? 0)
    return mistakeItems(classifyGame(game.san, record.evals, ply), game.myColor, fens)
  }, [names.data, analysed, game, record.evals, fens])
  const [round, setRound] = useState(0)
  const [queue, setQueue] = useState<number[] | null>(null)
  const [pos, setPos] = useState(0)
  const [solved, setSolved] = useState<Map<number, boolean>>(new Map())
  const [added, setAdded] = useState<number | null>(null)
  useEffect(() => { if (items && !queue) setQueue(items.map((_, i) => i)) }, [items, queue])

  if (!analysed) return <Empty title="Deze partij is nog niet geanalyseerd" action={<Link className="btn btn-primary" to={back}>Naar de analyse</Link>}>Laat Stockfish eerst de partij beoordelen.</Empty>
  if (!items || !queue) return <Spinner label="Fouten zoeken…" />
  if (!items.length) return <Empty title="Geen fouten om te trainen" action={<Link className="btn btn-primary" to={back}>Terug naar de analyse</Link>}>In deze partij maakte je geen onnauwkeurigheden, fouten of blunders. Knap!</Empty>

  const close = () => navigate(back)
  if (pos >= queue.length) {
    const firstTry = items.filter(it => solved.get(it.ply)).length
    const failed = items.map((it, i) => (solved.get(it.ply) ? -1 : i)).filter(i => i >= 0)
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <FocusBar value={1} count={`${items.length} / ${items.length}`} sub="Fouten-trainer" onClose={close} closeLabel="Terug naar de analyse" />
        <div className="card p-5 text-center">
          <h1 className="text-2xl font-bold">{firstTry === items.length ? 'Alles in één keer goed!' : 'Klaar met je fouten'}</h1>
          <p className="mt-1 text-muted">{firstTry} van {plural(items.length, 'stelling', 'stellingen')} goed, zonder hint en in één keer.</p>
          <ul className="mt-4 divide-y divide-line text-left text-sm">
            {items.map(it => (
              <li key={it.ply} className="flex items-center gap-2 py-2">
                <MoveClassIcon cls={it.played.cls} size={20} />
                <span className="font-mono">{formatLine([it.played.san], it.ply)}</span>
                <span className="text-muted">→ {it.bestSan}</span>
                <span className={`ml-auto font-semibold ${solved.get(it.ply) ? 'text-brand-strong' : 'text-danger-ink'}`}>{solved.get(it.ply) ? 'goed' : 'nog oefenen'}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid gap-2">
            {added === null
              ? <button className="btn btn-primary min-h-12" onClick={async () => setAdded(await saveMistakeCards(items, p => !!solved.get(p), game.myColor))}>Zet deze stellingen in Herhalen</button>
              : <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong">{added ? `${plural(added, 'stelling', 'stellingen')} toegevoegd aan Herhalen.` : 'Deze stellingen staan al in Herhalen.'} Wat je nog moet oefenen komt meteen terug.</p>}
            {failed.length > 0 && <button className="btn btn-ghost min-h-12" onClick={() => { setQueue(failed); setPos(0); setRound(r => r + 1) }}>Mislukte opnieuw ({failed.length})</button>}
            <Link className="btn btn-quiet min-h-12" to={back}>Terug naar de analyse</Link>
          </div>
        </div>
      </div>
    )
  }

  const item = items[queue[pos]]
  return (
    <div>
      <FocusBar value={pos / queue.length} count={`${pos + 1} / ${queue.length}`} sub={round ? 'Fouten-trainer · herkansing' : 'Fouten-trainer'} onClose={close} closeLabel="Stoppen, terug naar de analyse" />
      <MistakeStep key={`${round}-${item.ply}`} item={item} game={game} fens={fens} evals={record.evals}
        onDone={ok => { if (round === 0) setSolved(m => new Map(m).set(item.ply, ok)); else if (ok) setSolved(m => new Map(m).set(item.ply, true)) }}
        onNext={() => setPos(p => p + 1)} last={pos + 1 >= queue.length} />
    </div>
  )
}

/** Zoveel halve zetten vóór de fout worden voorgespeeld */
const TRAIN_CONTEXT = 4

function MistakeStep({ item, game, fens, evals, onDone, onNext, last }: {
  item: MistakeItem; game: ReviewGame; fens: string[]; evals: PosEval[]; onDone: (solved: boolean) => void; onNext: () => void; last: boolean
}) {
  const me = game.myColor
  const start = Math.max(0, item.ply - TRAIN_CONTEXT)
  const [shown, setShown] = useState(start) // ply die op het bord staat tijdens het voorspelen
  const [phase, setPhase] = useState<'preview' | 'solve' | 'checking' | 'done'>(start < item.ply ? 'preview' : 'solve')
  const [board, setBoard] = useState<{ fen: string; last: [string, string] | null }>({ fen: fens[start], last: null })
  const [tries, setTries] = useState(0)
  const [hint, setHint] = useState(false)
  const [solution, setSolution] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  // Voorspelen: de zetten voor de fout, één voor één
  useEffect(() => {
    if (phase !== 'preview') return
    timer.current = setTimeout(() => {
      const next = shown + 1
      const u = uciAt(fens[shown], game.san[shown])
      setBoard({ fen: fens[next], last: [u.slice(0, 2), u.slice(2, 4)] })
      setShown(next)
      if (next >= item.ply) setPhase('solve')
    }, shown === start ? 700 : 600)
    return () => clearTimeout(timer.current)
  }, [phase, shown]) // eslint-disable-line react-hooks/exhaustive-deps

  const forMe = (wpWhite: number) => (me === 'white' ? wpWhite : 100 - wpWhite)
  function finish(ok: boolean, text: string, kind: 'good' | 'info' = 'good') {
    setFeedback({ kind, text })
    setPhase('done')
    onDone(ok)
  }
  function wrong(text: string) {
    const n = tries + 1
    setTries(n)
    setFeedback({ kind: 'bad', text })
    timer.current = setTimeout(() => {
      setBoard({ fen: item.fen, last: null })
      if (n >= 2) showSolution()
      else setPhase('solve')
    }, 1100)
  }
  function showSolution() {
    setSolution(true)
    setBoard({ fen: item.fen, last: null })
    finish(false, `De beste zet was ${item.bestSan}.`, 'info')
  }

  async function onMove(from: string, to: string, promotion?: string) {
    if (phase !== 'solve') return false
    const c = new Chess(item.fen)
    let m
    try { m = c.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const uci = m.from + m.to + (m.promotion ?? '')
    setBoard({ fen: c.fen(), last: [m.from, m.to] })
    const clean = tries === 0 && !hint
    if (uci === item.bestUci) return finish(clean, `Precies! ${m.san} is de beste zet.`), true
    if (uci === item.played.uci) return wrong(`${m.san} speelde je in de partij. Zoek iets beters.`), true
    setPhase('checking')
    setFeedback({ kind: 'info', text: `Stockfish bekijkt ${m.san}…` })
    try {
      const e = await evalPosition(c.fen())
      const loss = forMe(winPct(evals[item.ply])) - forMe(winPct(e))
      if (loss <= 2.5) finish(clean, `Ook goed! ${m.san} is bijna net zo sterk als ${item.bestSan}.`)
      else wrong(`${m.san} is niet goed genoeg${loss > 20 ? ': dat verliest veel' : ''}. Probeer het nog eens.`)
    } catch {
      wrong(`Kon ${m.san} niet beoordelen. Probeer de beste zet te vinden.`)
    }
    return true
  }

  const arrows = solution ? [{ startSquare: item.bestUci.slice(0, 2), endSquare: item.bestUci.slice(2, 4), color: 'rgba(47,125,79,0.85)' }] : []
  const flash = feedback && board.last && (feedback.kind === 'good' || feedback.kind === 'bad') ? { square: board.last[1], kind: feedback.kind } : null
  const info = CLASS_INFO[item.played.cls]
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="-mx-2 sm:mx-auto sm:w-full sm:max-w-[min(92vw,620px)] lg:max-w-[min(640px,calc(100dvh-160px))]">
        <Board fen={board.fen} orientation={me} movable={phase === 'solve' ? me : undefined} onMove={(f, t, p) => { void onMove(f, t, p) }}
          lastMove={board.last} arrows={arrows} hintSquare={hint && phase === 'solve' ? item.bestUci.slice(0, 2) : null} flash={flash} id="mistake" label="Vind een betere zet" />
      </div>
      <aside className="card space-y-3 p-4" aria-live="polite">
        {phase === 'preview' ? (
          <p className="text-sm text-muted">Voorgespeeld: de zetten vóór je fout…</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <MoveClassIcon cls={item.played.cls} size={28} />
              <div>
                <h2 className="font-bold">Vind een betere zet</h2>
                <p className="text-sm text-muted">In de partij speelde je <b className="font-mono" style={{ color: info.color }}>{item.played.san}</b> ({info.label.toLowerCase()}).</p>
              </div>
            </div>
            {feedback && (
              <p className={`rounded-lg px-3 py-2 text-sm ${feedback.kind === 'good' ? 'bg-brand-soft text-brand-strong' : feedback.kind === 'bad' ? 'bg-danger-soft text-danger-ink' : 'bg-info-soft text-info-ink'}`}>{feedback.text}</p>
            )}
            {phase === 'done' && item.played.bestLine.length > 1 && (
              <p className="text-sm text-muted">Beste lijn: <span className="font-mono">{formatLine(item.played.bestLine, item.ply)}</span></p>
            )}
            {phase === 'done' ? (
              <button className="btn btn-primary min-h-12 w-full" autoFocus onClick={onNext}>{last ? 'Afronden' : 'Volgende fout'}</button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn btn-ghost min-h-11" disabled={hint || phase !== 'solve'} onClick={() => setHint(true)}>Hint</button>
                <button className="btn btn-ghost min-h-11" disabled={phase !== 'solve'} onClick={showSolution}>Toon oplossing</button>
              </div>
            )}
            {phase === 'solve' && tries > 0 && <p className="text-xs text-muted">Nog {2 - tries} poging over.</p>}
          </>
        )}
      </aside>
    </div>
  )
}

// ---------------- Briljante zetten bijhouden ----------------

interface FoundHighlight extends Highlight { record: GameReviewRecord; fenBefore: string; fenAfter: string }

/** Alle hoogtepunten uit je geanalyseerde partijen, nieuwste partij eerst */
function useHighlights(): FoundHighlight[] | null {
  const settings = useSettings()
  const names = useAsync(() => loadNames(), [])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  return useMemo(() => {
    if (!settings || !names.data || !reviews) return null
    const mine = [settings.lichessUser, settings.chesscomUser].filter((n): n is string => !!n)
    const out: FoundHighlight[] = []
    for (const r of [...reviews].sort((a, b) => b.game.playedAt - a.game.playedAt)) {
      const g = r.game
      if (!isAnalysed(r) || !isOwnGame(g, mine, r.shared)) continue
      const book = Math.max(bookInfo(g.san, names.data).ply, g.bookPly ?? 0)
      const found = highlightsOf(classifyGame(g.san, r.evals, book), g.myColor)
      if (!found.length) continue
      const fens = fensOf(g.san)
      for (const h of found) out.push({ ...h, record: r, fenBefore: fens[h.move.ply], fenAfter: fens[h.move.ply + 1] })
    }
    return out
  }, [settings, names.data, reviews])
}

const HIGHLIGHT_TABS = [
  { value: 'brilliant', label: 'Briljant' },
  { value: 'great', label: 'Geweldig' },
  { value: 'missed', label: 'Gemist' },
] as const

export function BrilliantsView() {
  const all = useHighlights()
  const [tab, setTab] = useState<HighlightKind>('brilliant')
  if (!all) return <Spinner label="Briljante zetten zoeken…" />
  const count = (k: HighlightKind) => all.filter(h => h.kind === k).length
  const shown = all.filter(h => h.kind === tab)
  const games = new Set(all.map(h => h.record.id)).size
  return (
    <div className="space-y-5">
      <PageHeader back="/analyse" title="Mijn briljante zetten"
        subtitle="Je beste momenten uit je geanalyseerde partijen. Tik op een stelling om de partij op die zet te openen." />
      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        {HIGHLIGHT_TABS.map(t => (
          <div key={t.value} className="card flex flex-col items-center gap-1 p-3 text-center">
            <span className={t.value === 'missed' ? 'opacity-45 grayscale' : undefined}><MoveClassIcon cls={t.value === 'missed' ? 'brilliant' : t.value} size={26} /></span>
            <span className="text-2xl font-extrabold tabular-nums">{count(t.value)}</span>
            <span className="text-xs text-muted">{t.value === 'missed' ? 'gemist' : t.label.toLowerCase()}</span>
          </div>
        ))}
      </div>
      <Tabs value={tab} onChange={setTab} options={HIGHLIGHT_TABS.map(t => ({ value: t.value, label: `${t.label} (${count(t.value)})` }))} />
      {shown.length === 0 ? (
        <Empty title={tab === 'missed' ? 'Geen gemiste briljante zetten' : `Nog geen ${tab === 'brilliant' ? 'briljante' : 'geweldige'} zetten`}
          action={<Link className="btn btn-primary" to="/analyse">Partijen analyseren</Link>}>
          {all.length || games ? 'Analyseer meer partijen; elke briljante zet die je speelt komt hier vanzelf bij.' : 'Analyseer je partijen; elke briljante zet die je speelt komt hier vanzelf bij.'}
        </Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map(h => <HighlightCard key={`${h.record.id}-${h.move.ply}`} h={h} />)}
        </ul>
      )}
      <p className="text-xs text-muted">Alleen zetten uit partijen waarin jij speelde ({plural(games, 'partij', 'partijen')} met hoogtepunten). Gedeelde partijen van anderen tellen niet mee.</p>
    </div>
  )
}

function HighlightCard({ h }: { h: FoundHighlight }) {
  const g = h.record.game
  const opp = g.myColor === 'white' ? g.black : g.white
  const missed = h.kind === 'missed'
  // Gemist: de stelling vóór je zet, zodat je de briljante zet zelf kunt zien; anders de stelling na je zet
  const fen = missed ? h.fenBefore : h.fenAfter
  const to = `/analyse/${encodeURIComponent(g.id)}?zet=${h.move.ply + 1}`
  return (
    <li>
      <Link to={to} className="card block overflow-hidden p-0 transition hover:shadow-md">
        <div className="relative">
          <MiniBoard fen={fen} orientation={g.myColor} id={`hl-${g.id}-${h.move.ply}`} />
          {!missed && <SquareBadge square={h.move.uci.slice(2, 4)} cls={h.kind as MoveClass} orientation={g.myColor} size={15} />}
        </div>
        <div className="p-3">
          <div className="flex items-center gap-1.5 font-bold">
            {missed ? <>Briljant was <span className="font-mono">{h.move.bestSan}</span></> : <span className="font-mono">{formatLine([h.move.san], h.move.ply)}</span>}
          </div>
          {missed && <div className="text-xs text-muted">je speelde <span className="font-mono">{h.move.san}</span></div>}
          <div className="truncate text-xs text-muted">tegen {opp.name} · {fmtDate(g.playedAt)}</div>
        </div>
      </Link>
    </li>
  )
}
