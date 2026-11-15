import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Chess } from 'chess.js'
import { ChevronLeft, ChevronRight, Dumbbell, ExternalLink, FlipVertical2, Play, Share2, SkipForward, X } from 'lucide-react'
import { db, saveSettings, type GameReviewRecord } from '../lib/db'
import { analyse } from '../lib/engine'
import { loadNames } from '../lib/data'
import { useAsync } from '../lib/hooks'
import {
  CLASS_INFO, CLASS_ORDER, ENGINE_NAME, reviewRatings, bookInfo, decodeShare, encodeShare, gameToPgn, highlightsOf, isOwnGame, fetchLichessGame, findChesscomGame, gameFromPgn, parseGameLink, classifyGame, explainMove, fetchChesscomRecent, fetchLichessRecent, formatScore, summarize, winPct,
  type Highlight, type HighlightKind, type MoveClass, type PosEval, type ReviewGame, type ReviewedMove,
} from '../lib/review'
import { Board, MiniBoard } from '../components/Board'
import { mistakeItems, saveMistakeCards, type MistakeItem } from '../lib/mistakes'
import { MoveClassIcon } from '../components/MoveClassIcon'
import { renderShareImage, SHARE_TITLE } from '../components/ShareImage'
import { Empty, ErrorBox, FocusBar, PageHeader, ProgressBar, STICKY_ACTIONS, Spinner, Tabs, plural, useSettings } from '../components/ui'
import type { Side } from '../lib/types'
import { Download, Lock, Search, User } from 'lucide-react'
import { IconField, Note, Segmented } from '../components/Choice'

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

const SOURCE_NAME = { lichess: 'Lichess', chesscom: 'Chess.com', pgn: 'PGN' } as const
const SOURCE_KEY = 'schaakroute.analyseBron'

const fmtPct = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDate = (t: number) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })

function outcome(g: ReviewGame): 'win' | 'loss' | 'draw' | 'open' {
  if (g.result === '*') return 'open'
  if (g.result === '1/2-1/2') return 'draw'
  return (g.result === '1-0') === (g.myColor === 'white') ? 'win' : 'loss'
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


  // Met een opgeslagen gebruikersnaam meteen je partijen ophalen, zodat je ze allemaal ziet
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
          : 'Chess.com-partijen zoek ik op via je gebruikersnaam. Haal eerst je Chess.com-partijen op (tabblad Chess.com), of plak de PGN (Delen → PGN op Chess.com).')
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

  const [pasteMode, setPasteMode] = useState(false)
  // Eén lijst: de opgehaalde partijen plus wat je eerder analyseerde, nieuwste eerst
  const allGames = useMemo(() => {
    const fetched = (games ?? []).map(g => withOpening(g, names.data))
    const ids = new Set(fetched.map(g => g.id))
    return [...fetched, ...saved.filter(r => !ids.has(r.id)).map(r => r.game)].sort((a, b) => b.playedAt - a.playedAt)
  }, [games, saved, names.data])

  const lockIcon = <Lock size={15} strokeWidth={2.25} />
  return (
    <div className="space-y-5">
      <PageHeader title="Partij-analyse" subtitle="Zie per zet hoe goed hij was, van briljant tot blunder." />
      <div className="space-y-4 lg:max-w-2xl">
        <section className="space-y-3 rounded-[22px] border-2 border-line bg-surface p-4" aria-label="Partijen kiezen om te analyseren">
          <Segmented name="review-source" label="Waar komt de partij vandaan?" value={pasteMode ? 'pgn' : source}
            onChange={v => { if (v === 'pgn') setPasteMode(true); else { setPasteMode(false); if (v !== source) pickSource(v) } }}
            options={[{ value: 'lichess', label: 'Lichess' }, { value: 'chesscom', label: 'Chess.com' }, { value: 'pgn', label: 'Plak PGN' }]} />
          {pasteMode ? (
            <form className="space-y-3" onSubmit={openPasted}>
              <label htmlFor="review-paste" className="sr-only">Link of PGN van één partij</label>
              <textarea id="review-paste" className="input !min-h-28 !rounded-[14px] !border-2 font-mono text-sm" rows={4} spellCheck={false} autoCapitalize="none"
                placeholder="Plak een link (Lichess of Chess.com) of een PGN" value={paste} onChange={e => setPaste(e.target.value)} />
              <fieldset>
                <legend className="sr-only">Hoe grondig analyseren</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[{ d: QUICK_DEPTH, label: 'Snel', hint: '± halve minuut' }, { d: DEEP_DEPTH, label: 'Grondig', hint: 'paar minuten' }].map(o => (
                    <label key={o.d} className={`tap flex min-h-12 cursor-pointer flex-col justify-center rounded-[14px]! px-3 py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${depthPref === o.d ? 'tap-on' : ''}`}>
                      <input type="radio" name={`review-depth-${pasteMode ? 'p' : 'u'}`} className="sr-only" checked={depthPref === o.d} onChange={() => pickDepth(o.d)} />
                      <span className="text-sm font-bold">{o.label}</span>
                      <span className="text-xs text-muted">{o.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn btn-primary btn-key w-full" disabled={pasteBusy || !paste.trim()}><Search size={20} strokeWidth={2.25} aria-hidden />{pasteBusy ? 'Bezig…' : 'Analyseren'}</button>
              {pasteErr && <ErrorBox error={pasteErr} />}
              {botLink && <a className="btn btn-ghost w-full" href={botLink} target="_blank" rel="noreferrer">Partij openen op Chess.com <ExternalLink size={14} aria-hidden /></a>}
              <p className="text-[13px] leading-snug text-muted">Ook voor partijen tegen een bot: op Chess.com via Delen → PGN → Kopiëren.</p>
              <Note icon={lockIcon}>Stockfish rekent op je eigen apparaat; er wordt niets verstuurd.</Note>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={load}>
              <IconField key={source} icon={<User size={18} strokeWidth={2.25} />} label={`Gebruikersnaam op ${SOURCE_NAME[source]}`} placeholder={`Gebruikersnaam op ${SOURCE_NAME[source]}`}
                autoComplete="username" autoCapitalize="none" spellCheck={false} value={name ?? stored ?? ''} onChange={e => setName(e.target.value)} />
              <fieldset>
                <legend className="sr-only">Hoe grondig analyseren</legend>
                <div className="grid grid-cols-2 gap-2">
                  {[{ d: QUICK_DEPTH, label: 'Snel', hint: '± halve minuut' }, { d: DEEP_DEPTH, label: 'Grondig', hint: 'paar minuten' }].map(o => (
                    <label key={o.d} className={`tap flex min-h-12 cursor-pointer flex-col justify-center rounded-[14px]! px-3 py-1.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${depthPref === o.d ? 'tap-on' : ''}`}>
                      <input type="radio" name={`review-depth-${pasteMode ? 'p' : 'u'}`} className="sr-only" checked={depthPref === o.d} onChange={() => pickDepth(o.d)} />
                      <span className="text-sm font-bold">{o.label}</span>
                      <span className="text-xs text-muted">{o.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn btn-primary btn-key w-full" disabled={busy || !username}><Download size={20} strokeWidth={2.25} aria-hidden />Partijen ophalen</button>
              <Note icon={lockIcon}>Je laatste 30 partijen. Stockfish rekent op je eigen apparaat; er wordt niets verstuurd.</Note>
            </form>
          )}
        </section>

      </div>

      <div className="space-y-5 lg:max-w-2xl">
        {err && <ErrorBox error={err} />}
        <section aria-labelledby="games-title">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="games-title" className="text-lg font-extrabold">Je partijen{allGames.length ? <span className="font-normal text-muted"> · {allGames.length}</span> : null}</h2>
            <Link to="/analyse/briljant" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold"
              style={{ background: `color-mix(in srgb, ${CLASS_INFO.brilliant.color} 14%, transparent)`, color: `color-mix(in srgb, ${CLASS_INFO.brilliant.color} 70%, var(--ink))` }}>
              <MoveClassIcon cls="brilliant" size={18} />Mijn briljante zetten{brilliants ? ` (${brilliants})` : ''}
            </Link>
          </div>
          {busy && <div className="mb-2"><Spinner label={`Partijen ophalen van ${SOURCE_NAME[source]}…`} /></div>}
          {games && games.length === 0 && <p className="mb-2 text-sm text-muted">{shownFor} heeft nog geen gewone schaakpartijen op {SOURCE_NAME[source]}.</p>}
          {allGames.length === 0
            ? !busy && <p className="rounded-[18px] border-2 border-dashed border-line p-4 text-sm text-muted">Vul je gebruikersnaam in en haal je partijen op. Kies daarna een partij om te analyseren.</p>
            : <GameRows games={allGames} saved={savedById} onOpen={open} />}
          {saved.length > 0 && (
            <div className="mt-2 text-right"><button className="btn btn-quiet text-sm" onClick={async () => { if (confirm('Alle opgeslagen analyses wissen?')) await db.reviews.clear() }}>Analyses wissen</button></div>
          )}
        </section>
      </div>
    </div>
  )
}

/** Chess.com geeft alleen een URL-naam ("Kings Indian Attack"); de namenlijst van Lichess is netter en geeft ook de theorielengte */
function withOpening(g: ReviewGame, names?: Record<string, [string, string, string]>): ReviewGame {
  if (!names || (g.source === 'lichess' && g.bookPly !== undefined)) return g
  const b = bookInfo(g.san, names)
  return { ...g, opening: b.name ?? g.opening, bookPly: b.ply }
}

/** "vandaag", "gisteren", een weekdag in de laatste week, anders de datum */
function relDay(t: number): string {
  const d = new Date(t)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000)
  if (days === 0) return 'vandaag'
  if (days === 1) return 'gisteren'
  if (days > 1 && days < 7) return d.toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', '')
  return fmtDate(t)
}

const RESULT_TILE = {
  win: { letter: 'W', label: 'Winst', cls: 'bg-brand-soft text-brand-strong' },
  loss: { letter: 'V', label: 'Verlies', cls: 'bg-danger-soft text-danger-ink' },
  draw: { letter: 'R', label: 'Remise', cls: 'bg-surface-2 text-muted' },
  open: { letter: '…', label: 'Bezig', cls: 'bg-info-soft text-info-ink' },
}

function GameRows({ games, saved, onOpen }: { games: ReviewGame[]; saved: Map<string, GameReviewRecord>; onOpen: (g: ReviewGame) => void }) {
  return (
    <ul className="overflow-hidden rounded-[18px] border-2 border-line bg-surface">
      {games.map((g, i) => {
        const opp = g.myColor === 'white' ? g.black : g.white
        const o = RESULT_TILE[outcome(g)]
        const rec = saved.get(g.id)
        const acc = rec && isAnalysed(rec) ? rec.accuracy?.[g.myColor] : undefined
        const blunders = rec?.blunders?.[g.myColor]
        return (
          <li key={g.id} className={i ? 'border-t border-line' : undefined}>
            <button className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => onOpen(g)}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold ${o.cls}`} aria-label={o.label}>{o.letter}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5"><span className="truncate font-bold">{opp.name}</span>{opp.rating && <span className="text-sm text-muted">{opp.rating}</span>}</span>
                <span className="block truncate text-[13px] text-muted">{[g.opening, relDay(g.playedAt)].filter(Boolean).join(' · ')}</span>
              </span>
              {acc !== undefined ? (
                <span className="shrink-0 text-right">
                  <span className="block font-extrabold tabular-nums">{Math.round(acc)}%</span>
                  {blunders !== undefined && (blunders > 0
                    ? <span className="rounded-md bg-danger-soft px-1.5 text-[11px] font-bold text-danger-ink">{plural(blunders, 'blunder', 'blunders')}</span>
                    : <span className="rounded-md bg-brand-soft px-1.5 text-[11px] font-bold text-brand-strong">geen blunders</span>)}
                </span>
              ) : <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />}
            </button>
          </li>
        )
      })}
    </ul>
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
      navigate(ply ? replayUrl(game, ply) : `/analyse/${encodeURIComponent(game.id)}`, { replace: true })
    })()
  }, [shared, navigate])
  if (!shared) return <Empty title="Deze link klopt niet" action={<Link className="btn btn-primary" to="/analyse">Naar partij-analyse</Link>}>De gedeelde partij kon niet gelezen worden. Misschien is de link niet helemaal gekopieerd.</Empty>
  return <Spinner label="Gedeelde partij openen…" />
}

export function GameReviewView() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const record = useLiveQuery(() => db.reviews.get(id), [id], null as GameReviewRecord | null | undefined)
  // Oude links met een zetnummer gaan meteen naar het naspelen
  if (params.get('zet')) return <Navigate to={`/analyse/${encodeURIComponent(id)}/naspelen?zet=${params.get('zet')}`} replace />
  if (record === null) return <Spinner label="Partij laden…" />
  if (!record) return <Navigate to="/analyse" replace />
  return <ReviewOverview record={record} />
}

export function ReviewReplayView() {
  const { id = '' } = useParams()
  const record = useLiveQuery(() => db.reviews.get(id), [id], null as GameReviewRecord | null | undefined)
  if (record === null) return <Spinner label="Partij laden…" />
  if (!record) return <Navigate to="/analyse" replace />
  return <ReviewReplay record={record} />
}

const NOTABLE: MoveClass[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']
const ERRORS: MoveClass[] = ['inaccuracy', 'mistake', 'miss', 'blunder']

/** Alles wat overzicht en naspelen delen: engine-analyse, theorie, beoordeling per zet, en het bewaren van de cijfers */
function useReview(record: GameReviewRecord) {
  const game = record.game
  const { evals, error, progress } = useEngineReview(record)
  const names = useAsync(() => loadNames(), [])
  const fens = useMemo(() => fensOf(game.san), [game.san])
  const book = useMemo(() => {
    const own = names.data ? bookInfo(game.san, names.data) : { ply: 0 }
    return { ply: Math.max(own.ply, game.bookPly ?? 0), name: game.opening ?? own.name }
  }, [names.data, game])
  const done = evals ? Math.min(evals.length, fens.length) : 0
  const ready = done >= fens.length
  const moves = useMemo(() => (evals ? classifyGame(game.san, evals, book.ply, { ratings: reviewRatings(game) }) : []), [evals, game, book.ply])
  // Cijfers bewaren voor de partijlijst, met dezelfde theorielengte als hier
  useEffect(() => {
    if (!ready || !names.data || !moves.length) return
    const w = summarize(moves, 'white', game.source)
    const b = summarize(moves, 'black', game.source)
    const accuracy = { white: w.accuracy, black: b.accuracy }
    const rating = { white: w.rating, black: b.rating }
    const blunders = { white: w.counts.blunder, black: b.counts.blunder }
    const r = record
    if (r.accuracy?.white !== accuracy.white || r.accuracy?.black !== accuracy.black || r.rating?.white !== rating.white || r.rating?.black !== rating.black
      || r.blunders?.white !== blunders.white || r.blunders?.black !== blunders.black) {
      db.reviews.update(record.id, { accuracy, rating, blunders })
    }
  }, [ready, names.data, moves]) // eslint-disable-line react-hooks/exhaustive-deps
  return { game, evals, error, progress, fens, book, done, ready, moves }
}

function AnalysisProgress({ progress, done, total, error }: { progress: EngineProgress | null; done: number; total: number; error: string | null }) {
  return (
    <div className="rounded-[18px] border-2 border-line bg-surface p-4" aria-live="polite">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{progress?.deepening ? `Grondige analyse (diepte ${progress.depth})…` : 'Stockfish analyseert…'}</span>
        <span className="tabular-nums text-muted">{progress?.done ?? done}/{total}</span>
      </div>
      <ProgressBar className="mt-2" value={(progress?.done ?? done) / total} label="Voortgang van de analyse" />
      {error ? <div className="mt-2"><ErrorBox error={error} /></div> : <p className="mt-2 text-xs text-muted">{progress?.deepening
        ? 'De huidige beoordeling blijft staan tot dit klaar is. Dit gebeurt op je eigen apparaat.'
        : 'Dit gebeurt op je eigen apparaat. Je kunt intussen al naspelen.'}</p>}
    </div>
  )
}

const replayUrl = (g: ReviewGame, ply?: number) => `/analyse/${encodeURIComponent(g.id)}/naspelen${ply ? `?zet=${ply}` : ''}`

// ---------------- 11b: overzicht ----------------

function ReviewOverview({ record }: { record: GameReviewRecord }) {
  const navigate = useNavigate()
  const { game, evals, error, progress, fens, book, done, ready, moves } = useReview(record)
  const me = game.myColor
  const opp: Side = me === 'white' ? 'black' : 'white'
  const sum = { white: summarize(moves, 'white', game.source), black: summarize(moves, 'black', game.source) }
  const myErrors = moves.filter(m => m.side === me && ERRORS.includes(m.cls)).length
  const rows = CLASS_ORDER.filter(k => sum.white.counts[k] + sum.black.counts[k] > 0)
  const scale = game.source === 'chesscom' ? 'Chess.com' : 'Lichess'

  const SideCard = ({ side }: { side: Side }) => {
    const p = side === 'white' ? game.white : game.black
    const s = sum[side]
    const mine = side === me
    return (
      <div className={`min-w-0 rounded-[16px] p-3 ${mine ? 'bg-brand-soft' : 'bg-surface-2'}`}>
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-line ${side === 'white' ? 'bg-white' : 'bg-neutral-800'}`} aria-hidden />
          <span className="truncate">{p.name}</span>{mine && <span className="sr-only">(jij)</span>}
        </div>
        {ready ? (
          <>
            <div className="mt-1 text-[32px] leading-none font-extrabold tracking-tight tabular-nums">{fmtPct(s.accuracy).replace(/%$/, '')}<span className="text-lg">%</span></div>
            <div className="text-xs text-muted">nauwkeurigheid</div>
            <div className="mt-1 text-sm">partijrating <b className="tabular-nums">{s.rating ?? '–'}</b></div>
          </>
        ) : <div className="mt-2 h-14 animate-pulse rounded-lg bg-surface/60" aria-hidden />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/analyse" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-ink"><ChevronLeft size={16} aria-hidden />Partij-analyse</Link>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{game.white.name} <span className="text-muted">–</span> {game.black.name}</h1>
        <p className="text-sm text-muted">
          {[game.result === '*' ? 'Nog bezig' : game.result.replace('1/2-1/2', '½-½'), book.name, fmtDate(game.playedAt)].filter(Boolean).join(' · ')}
          {game.url && <>{' · '}<a className="inline-flex items-center gap-1 underline hover:text-ink" href={game.url} target="_blank" rel="noreferrer">{SOURCE_NAME[game.source]}<ExternalLink size={12} aria-hidden /></a></>}
        </p>
      </div>

      {(!ready || progress?.deepening) && <AnalysisProgress progress={progress} done={done} total={fens.length} error={error} />}

      <section className="rounded-[22px] border-2 border-line bg-surface p-3" aria-label="Nauwkeurigheid en verloop">
        <div className="grid grid-cols-2 gap-2">
          <SideCard side={me} />
          <SideCard side={opp} />
        </div>
        {evals && evals.length > 1 && <div className="mt-3"><EvalGraph evals={evals} total={game.san.length} moves={moves} onPick={p => navigate(replayUrl(game, p))} /></div>}
        {ready && <p className="mt-2 text-xs text-muted">Partijrating op {scale}-schaal: de rating die typisch bij deze nauwkeurigheid hoort. Tik op het verloop om naar die zet te gaan.</p>}
      </section>

      {ready && (
        <section className="overflow-hidden rounded-[22px] border-2 border-line bg-surface" aria-label="Zetten per soort">
          <p className="sr-only">Tik op een soort zet om naar de eerste te gaan: links jouw zetten, rechts die van je tegenstander.</p>
          <ul className="divide-y divide-line">
            {rows.map(k => {
              const hot = k === 'blunder' && sum[me].counts[k] > 0
              const mine = moves.find(m => m.side === me && m.cls === k)
              const theirs = moves.find(m => m.side === opp && m.cls === k)
              const label = CLASS_INFO[k].label.toLowerCase()
              return (
                <li key={k} className={`grid grid-cols-[1fr_3.5rem] ${hot ? 'bg-danger-soft' : ''}`}>
                  <button className="grid min-h-12 grid-cols-[3.5rem_1fr_3.5rem] items-center text-sm enabled:hover:bg-surface-2 disabled:cursor-default" disabled={!mine && !theirs}
                    onClick={() => { const m = mine ?? theirs; if (m) navigate(replayUrl(game, m.ply + 1)) }}
                    aria-label={`${CLASS_INFO[k].label}: ${sum[me].counts[k]} van jou${mine ? `, ga naar je eerste ${label} zet` : theirs ? `, ga naar de eerste van je tegenstander` : ''}`}>
                    <span className={`text-center text-base font-bold tabular-nums ${hot ? 'text-danger-ink' : ''}`}>{sum[me].counts[k]}</span>
                    <span className={`flex items-center justify-center gap-2 font-semibold ${hot ? 'text-danger-ink' : ''}`}><MoveClassIcon cls={k} size={20} />{CLASS_INFO[k].label}</span>
                    <span aria-hidden className="flex justify-center text-muted">{(mine || theirs) && <ChevronRight size={16} />}</span>
                  </button>
                  <button className="min-h-12 text-center text-base tabular-nums text-muted enabled:hover:bg-surface-2 disabled:cursor-default" disabled={!theirs}
                    onClick={() => theirs && navigate(replayUrl(game, theirs.ply + 1))}
                    aria-label={`${sum[opp].counts[k]} van je tegenstander${theirs ? `, ga naar de eerste ${label} zet` : ''}`}>{sum[opp].counts[k]}</button>
                </li>
              )
            })}
          </ul>
          {sum[me].missedBrilliants > 0 && (
            <button className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-line px-3 py-2 text-sm hover:bg-surface-2"
              onClick={() => { const m = moves.find(x => x.side === me && x.missedBrilliant); if (m) navigate(replayUrl(game, m.ply + 1)) }}>
              <MoveClassIcon cls="brilliant" size={18} />Gemiste briljante zetten: <b>{sum[me].missedBrilliants}</b><ChevronRight size={16} aria-hidden className="text-muted" />
            </button>
          )}
        </section>
      )}

      <p className="text-center text-xs text-muted">
        {ENGINE_NAME} · diepte {record.depth}{record.depth >= DEEP_DEPTH ? ' (grondig)' : ''} · op je eigen apparaat
        {ready && record.depth < DEEP_DEPTH && !progress?.deepening && <> · <button className="underline hover:text-ink" onClick={() => db.reviews.update(record.id, { deep: { depth: DEEP_DEPTH, evals: [] } })}>Grondiger analyseren</button></>}
      </p>

      <div className={`grid gap-2 ${myErrors > 0 ? 'grid-cols-[1.4fr_1fr]' : 'grid-cols-1'} ${STICKY_ACTIONS}`}>
        {myErrors > 0 && (
          <button className="btn btn-primary btn-key" disabled={!ready} onClick={() => navigate(`/analyse/${encodeURIComponent(game.id)}/fouten`)}>
            <Dumbbell size={20} aria-hidden />Train je {plural(myErrors, 'fout', 'fouten')}
          </button>
        )}
        <Link to={replayUrl(game)} className={myErrors > 0 ? 'tap flex min-h-[54px] items-center justify-center gap-2 font-bold' : 'btn btn-primary btn-key'}>
          <Play size={18} aria-hidden />Naspelen
        </Link>
      </div>
    </div>
  )
}

// ---------------- 11c: naspelen ----------------

function ReviewReplay({ record }: { record: GameReviewRecord }) {
  const navigate = useNavigate()
  const { game, evals, error, progress, fens, done, ready, moves } = useReview(record)
  const total = game.san.length
  const [params] = useSearchParams()
  const [ply, setPly] = useState(() => Math.max(0, Math.min(total, Number(params.get('zet')) || 0)))
  const [sharing, setSharing] = useState(false)
  const [orientation, setOrientation] = useState<Side>(game.myColor)
  const current: ReviewedMove | undefined = moves[ply - 1]
  const go = (p: number) => setPly(Math.max(0, Math.min(total, p)))
  const nextError = moves.find(m => m.ply >= ply && m.side === game.myColor && ERRORS.includes(m.cls))
  const close = () => navigate(`/analyse/${encodeURIComponent(game.id)}`)

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
  const topSide: Side = orientation === 'white' ? 'black' : 'white'
  const top = topSide === 'white' ? game.white : game.black
  const bottom = topSide === 'white' ? game.black : game.white

  const Player = ({ p, side, score }: { p: { name: string; rating?: number }; side: Side; score?: string }) => (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className={`inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-line ${side === 'white' ? 'bg-white' : 'bg-neutral-800'}`} aria-hidden />
      <span className="truncate font-semibold">{p.name}</span>{p.rating && <span className="text-muted">{p.rating}</span>}
      {score && <span className="ml-auto font-mono text-xs font-bold tabular-nums text-muted">{score}</span>}
    </div>
  )

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
      <div className="mx-auto w-full max-w-[min(92vw,620px)] lg:max-w-[min(640px,calc(100dvh-140px))]">
        <div className="sticky top-0 z-20 -mx-4 flex items-center gap-1 bg-bg/95 px-2 py-1.5 backdrop-blur sm:-mx-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0">
          <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={close} aria-label="Sluiten, terug naar het overzicht"><X size={22} aria-hidden /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{game.white.name} – {game.black.name}</div>
            <div className="text-xs text-muted">zet {ply} van {total}</div>
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setOrientation(o => (o === 'white' ? 'black' : 'white'))} aria-label="Bord draaien" title="Bord draaien"><FlipVertical2 size={20} aria-hidden /></button>
          <button className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setSharing(true)} aria-label="Delen" title="Delen"><Share2 size={20} aria-hidden /></button>
        </div>

        <Player p={top} side={topSide} score={evals ? formatScore(evalNow).replace('.', ',') : undefined} />
        <div className="flex items-stretch gap-1.5">
          <EvalBar e={evalNow} orientation={orientation} />
          <div className="relative min-w-0 flex-1">
            <Board fen={fens[ply]} orientation={orientation} lastMove={lastMove} arrows={arrows} id="review" label={`Partijstelling na ${ply} halve zetten`} />
            {current && lastMove && <SquareBadge square={lastMove[1]} cls={current.cls} orientation={orientation} />}
          </div>
        </div>
        <Player p={bottom} side={orientation} />
      </div>

      <div className="mx-auto mt-2 w-full max-w-[min(92vw,620px)] space-y-3 lg:mt-12 lg:max-w-none">
        {(!ready || progress?.deepening) && <AnalysisProgress progress={progress} done={done} total={fens.length} error={error} />}
        <ReplayComment move={current} ply={ply} ready={!!evals && done > ply} game={game} replyLine={current ? replyLine(fens[ply], evals?.[ply]) : []} />
        {evals && evals.length > 1 && <EvalGraph evals={evals} total={total} ply={ply} moves={moves} onPick={go} compact />}
        <MoveChips san={game.san} moves={moves} ply={ply} onPick={go} />
        <div className={`grid grid-cols-[auto_auto_1fr] gap-2 ${STICKY_ACTIONS}`}>
          <button className="tap flex h-[54px] w-[54px] items-center justify-center" onClick={() => go(ply - 1)} disabled={ply === 0} aria-label="Vorige zet"><ChevronLeft size={22} aria-hidden /></button>
          <button className="tap flex h-[54px] w-[54px] items-center justify-center" onClick={() => go(ply + 1)} disabled={ply === total} aria-label="Volgende zet"><ChevronRight size={22} aria-hidden /></button>
          {nextError
            ? <button className="btn btn-primary btn-key" onClick={() => setPly(nextError.ply + 1)}><SkipForward size={20} aria-hidden />Volgende fout</button>
            : <button className="btn btn-primary btn-key" onClick={close}>Naar het overzicht</button>}
        </div>
      </div>
      {sharing && <ShareDialog game={game} ply={ply} move={current} onClose={() => setSharing(false)} />}
    </div>
  )
}

/** De beste reactie van de tegenstander na de gespeelde zet (twee halve zetten), voor de uitleg */
function replyLine(fenAfter: string, e: PosEval | undefined): string[] {
  if (!e?.pv?.length) return []
  const c = new Chess(fenAfter)
  const out: string[] = []
  for (const u of e.pv.slice(0, 2)) {
    try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san) } catch { break }
  }
  return out
}

function ReplayComment({ move, ply, ready, game, replyLine }: { move?: ReviewedMove; ply: number; ready: boolean; game: ReviewGame; replyLine: string[] }) {
  if (ply === 0) return <div className="rounded-[18px] border-2 border-line bg-surface p-4 text-sm text-muted">Beginstelling. Blader met de knoppen onderaan of tik op een zet.</div>
  if (!move || !ready) return <div className="rounded-[18px] border-2 border-line bg-surface p-4 text-sm text-muted">Deze zet wordt nog beoordeeld…</div>
  const info = CLASS_INFO[move.cls]
  const player = (move.side === 'white' ? game.white : game.black).name
  const label = formatLine([move.san], move.ply)
  const isError = ERRORS.includes(move.cls)
  const better = move.bestSan && move.bestUci !== move.uci ? formatLine([move.bestSan], move.ply) : null
  let text = explainMove(move)
  if (isError && better) {
    text = `Beter was ${better}.`
    if (replyLine.length) text += ` Na ${label} volgt ${formatLine(replyLine, move.ply + 1)}.`
    if (move.missedBrilliant) text += ' Dat was een briljante zet geweest!'
  }
  return (
    <div className="rounded-[18px] border-2 p-4" aria-live="polite"
      style={{ background: `color-mix(in srgb, ${info.color} 10%, var(--surface))`, borderColor: `color-mix(in srgb, ${info.color} 38%, var(--line))` }}>
      <div className="flex items-start gap-3">
        <MoveClassIcon cls={move.cls} size={34} />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted">{player}</div>
          <div className="font-extrabold" style={{ color: `color-mix(in srgb, ${info.color} 75%, var(--ink))` }}>{info.label} · {label}</div>
          <p className="mt-0.5 text-sm">{text}</p>
          {!isError && move.bestLine.length > 1 && move.bestUci !== move.uci && move.cls !== 'book' && (
            <p className="mt-1 text-xs text-muted">Beste lijn: <span className="font-mono">{formatLine(move.bestLine, move.ply)}</span></p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Zetten als een rij chips om horizontaal door te scrollen; de huidige zet blijft in beeld */
function MoveChips({ san, moves, ply, onPick }: { san: string[]; moves: ReviewedMove[]; ply: number; onPick: (p: number) => void }) {
  const ref = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const box = ref.current
    const el = box?.querySelector<HTMLElement>('[aria-current="true"]')
    if (box && el) box.scrollLeft = el.parentElement!.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2
  }, [ply, moves.length])
  return (
    <nav aria-label="Zetten">
      <ol ref={ref} className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
        {san.map((s, i) => {
          const m = moves[i]
          const notable = m && NOTABLE.includes(m.cls)
          const on = ply === i + 1
          return (
            <li key={i} className="shrink-0">
              <button aria-current={on ? 'true' : undefined} onClick={() => onPick(i + 1)}
                aria-label={`${formatLine([s], i)}${m ? `, ${CLASS_INFO[m.cls].label.toLowerCase()}` : ''}`}
                className={`tap flex min-h-10 items-center gap-1.5 rounded-xl! px-2.5 text-sm font-bold tabular-nums ${on ? 'tap-on' : ''}`}
                style={on && notable ? { borderColor: CLASS_INFO[m.cls].color, boxShadow: `0 3px 0 ${CLASS_INFO[m.cls].color}`, background: `color-mix(in srgb, ${CLASS_INFO[m.cls].color} 12%, var(--surface))` } : undefined}>
                {notable && <MoveClassIcon cls={m.cls} size={16} />}
                {i % 2 === 0 ? `${i / 2 + 1}.${s}` : s}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function uciAt(fen: string, san: string): string {
  const m = new Chess(fen).move(san)
  return m.from + m.to + (m.promotion ?? '')
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
  return (
    <div className={`relative w-2.5 shrink-0 overflow-hidden rounded-md bg-neutral-700 sm:w-3.5 ${orientation === 'black' ? 'rotate-180' : ''}`} role="img" aria-label={`Evaluatie ${score}`}>
      <div className="absolute inset-x-0 bottom-0 bg-neutral-100 transition-[height] duration-500" style={{ height: `${white}%` }} />
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

function EvalGraph({ evals, total, ply, moves, onPick, compact }: { evals: PosEval[]; total: number; ply?: number; moves: ReviewedMove[]; onPick: (p: number) => void; compact?: boolean }) {
  if (evals.length < 2) return null
  const W = Math.max(total, 1)
  const pts = evals.map((e, i) => `${i},${100 - winPct(e)}`)
  const area = `M0,100 L${pts.join(' L')} L${evals.length - 1},100 Z`
  return (
    <div className="overflow-hidden rounded-[14px]">
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className={`block w-full cursor-pointer bg-neutral-700 ${compact ? 'h-12' : 'h-20'}`} role="img" aria-label="Verloop van de evaluatie. Tik om naar die zet te gaan."
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect()
          onPick(Math.round(((e.clientX - r.left) / r.width) * W))
        }}>
        <path d={area} fill="#f2f2ef" />
        <line x1="0" x2={W} y1="50" y2="50" stroke="#888" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {moves.filter(m => ['mistake', 'miss', 'blunder', 'brilliant', 'great'].includes(m.cls)).map(m => (
          <line key={m.ply} x1={m.ply + 1} x2={m.ply + 1} y1="0" y2="100" stroke={CLASS_INFO[m.cls].color} strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.9" />
        ))}
        {ply !== undefined && <line x1={ply} x2={ply} y1="0" y2="100" stroke="#e4a92a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
      </svg>
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
    return mistakeItems(classifyGame(game.san, record.evals, ply, { ratings: reviewRatings(game) }), game.myColor, fens)
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
      const found = highlightsOf(classifyGame(g.san, r.evals, book, { ratings: reviewRatings(g) }), g.myColor)
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
  const to = replayUrl(g, h.move.ply + 1)
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
