import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Star } from 'lucide-react'
import { Chess } from 'chess.js'
import type { Arrow } from 'react-chessboard'
import { loadNames, loadStats } from '../lib/data'
import { useAsync, useFamily, useManifest } from '../lib/hooks'
import { START_FEN, epdOf, parseUci, uciOf } from '../lib/chess'
import { moveScore, bandCount } from '../lib/trainer'
import { addXp } from '../lib/progress'
import { queryExplorer, ratingGroupsFor, type ExplorerResult } from '../lib/explorer'
import { Board } from '../components/Board'
import { EvalButton } from '../components/EvalButton'
import { MoveList } from '../components/Trainer'
import { BottomAction, FilterKey, PillChoice, TrainingHeading, TrainingSheet, TrainingTopBar, useCloseTraining } from '../components/TrainingModeChrome'
import { Empty, ErrorBox, Spinner, nf, pct, useSettings } from '../components/ui'
import { BoardLoading, InlineWait } from '../components/PieceMotion'
import { FamilyPicker } from './Variations'
import type { Side, StatMove, StatsFile } from '../lib/types'

const BAND_LABEL = ['< 1200', '1200–1599', '1600–1999', '2000+']
const bandFor = (elo: number) => (elo < 1200 ? 0 : elo < 1600 ? 1 : elo < 2000 ? 2 : 3)

function ResultBar({ w, d, l, className = '' }: { w: number; d: number; l: number; className?: string }) {
  return (
    <div className={`flex h-1.5 w-full gap-px overflow-hidden rounded-full ${className}`} title={`winst ${pct(w)} · remise ${pct(d)} · verlies ${pct(l)}`} aria-label={`winst ${pct(w)}, remise ${pct(d)}, verlies ${pct(l)}`}>
      <div className="bg-brand" style={{ width: `${w * 100}%` }} />
      <div className="bg-line" style={{ width: `${d * 100}%` }} />
      <div className="bg-danger" style={{ width: `${l * 100}%` }} />
    </div>
  )
}

/** Score als label: groen als de zet goed scoort, rood als hij slecht scoort */
const scoreTone = (s: number) => (s >= 0.55 ? 'bg-brand-soft text-brand-strong' : s <= 0.45 ? 'bg-danger-soft text-danger-ink' : 'bg-surface-2 text-ink')

/** Wat er in deze stelling gespeeld wordt: hoe vaak op jouw niveau, en hoe het afloopt voor jouw kleur */
function StatsTable({ moves, total, side, band, onPick, highlight }: { moves: StatMove[]; total: number; side: Side; band: number; onPick?: (uci: string) => void; highlight?: string }) {
  const bandTotal = moves.reduce((a, m) => a + bandCount(m, band), 0)
  const rows = moves.map(m => {
    const mine = moveScore(m, side, band)
    const all = moveScore(m, side)
    const s = mine.n >= 10 ? mine : all
    return { m, mine, s, freq: bandTotal ? mine.n / bandTotal : m[2] / total, allFreq: m[2] / total }
  }).sort((a, b) => b.freq - a.freq)
  const maxFreq = Math.max(0.01, ...rows.map(r => r.freq))
  // Best scorende zet met genoeg partijen om iets te zeggen
  const best = rows.filter(r => r.s.n >= 30).sort((a, b) => b.s.score - a.s.score)[0]?.m[0]
  const colorNl = side === 'white' ? 'wit' : 'zwart'
  return (
    <div>
      <div className="mb-1 grid grid-cols-[3.25rem_minmax(0,1fr)_4.25rem] gap-3 px-2 text-xs font-semibold text-muted">
        <span>Zet</span><span title={`Rating ${BAND_LABEL[band]}`}>Op jouw niveau</span><span className="text-right">Score {colorNl}</span>
      </div>
      <ul className="space-y-0.5">
        {rows.map(({ m, mine, s, freq, allFreq }) => {
          const Row = onPick ? 'button' : 'div'
          return (
            <li key={m[0]}>
              <Row className={`grid w-full grid-cols-[3.25rem_minmax(0,1fr)_4.25rem] items-center gap-3 rounded-xl px-2 py-2 text-left ${highlight === m[0] ? 'bg-brand-soft' : ''} ${onPick ? 'transition hover:bg-surface-2' : ''}`} {...(onPick ? { onClick: () => onPick(m[0]) } : {})}>
                <span className="flex items-center gap-1 text-base font-bold">{m[1]}{best === m[0] && <Star size={13} aria-label="best scorend" className="fill-star text-star" />}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-(--board-dark)" style={{ width: `${(freq / maxFreq) * 100}%` }} /></span>
                    <span className="w-9 text-right text-sm font-semibold tabular-nums">{pct(freq)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{nf(mine.n)} partijen<span className="hidden sm:inline"> · alle niveaus {pct(allFreq)}</span></span>
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className={`rounded-lg px-2 py-0.5 text-sm font-bold tabular-nums ${scoreTone(s.score)}`} title={mine.n < 10 ? 'Te weinig partijen op jouw niveau: score over alle niveaus' : undefined}>{pct(s.score)}</span>
                  <ResultBar w={s.win} d={s.draw} l={s.loss} />
                </span>
              </Row>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand" aria-hidden />winst</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-line" aria-hidden />remise</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" aria-hidden />verlies</span>
        <span>· score = winst + ½ remise</span>
      </p>
    </div>
  )
}

type Names = Record<string, [string, string, string]>
type Mode = 'train' | 'explore'

/** Op jouw niveau (ontwerp 10m): een korte ronde van tien vragen "welke zet scoort het best?", met verkennen achter de filterknop */
export function Advantage() {
  const { id: paramId } = useParams()
  const nav = useNavigate()
  const close = useCloseTraining()
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const id = paramId ?? settings?.openings[0] ?? manifest?.families[0]?.id
  const { data: file } = useFamily(id)
  const stats = useAsync(() => (id ? loadStats(id) : Promise.resolve(null)), [id])
  const names = useAsync(() => loadNames(), [])
  const [mode, setMode] = useState<Mode>('train')
  const [sheet, setSheet] = useState(false)
  const [round, setRound] = useState(0)

  if (error) return <ErrorBox error={error} />
  if (!manifest || !settings) return <Spinner />
  const band = bandFor(settings.elo)
  const family = manifest.families.find(f => f.id === id)
  const openSheet = () => setSheet(true)
  const filterKey = <FilterKey onClick={openSheet} expanded={sheet} active={mode === 'explore'} label="Opening en modus" />
  const label = `Op jouw niveau · rating ${BAND_LABEL[band]}`
  const loading = !file || stats.loading

  return (
    <div className="flex flex-col gap-2.5">
      {loading || !stats.data ? (
        <>
          <TrainingTopBar onClose={close} closeLabel="Stoppen met Op jouw niveau" />
          <TrainingHeading tone="info" label={label} title={mode === 'train' ? 'Welke zet scoort het best?' : 'Wat wordt hier gespeeld?'} action={filterKey} />
          {loading ? <BoardLoading label="Stelling laden…" /> : <ErrorBox error="Geen statistieken beschikbaar" />}
        </>
      ) : mode === 'train' ? (
        <AdvantageQuiz
          key={`${file.family.id}-${round}`}
          rootUci={file.family.rootUci}
          side={file.family.side}
          stats={stats.data}
          elo={settings.elo}
          names={names.data ?? {}}
          label={label}
          familyName={family?.name ?? file.family.name}
          filterKey={filterKey}
          onClose={close}
          onOpenSheet={openSheet}
          onRestart={() => setRound(r => r + 1)}
        />
      ) : (
        <>
          <TrainingTopBar onClose={close} closeLabel="Stoppen met Op jouw niveau" />
          <TrainingHeading tone="info" label={`${label} · verkennen`} title="Wat wordt hier gespeeld?" sub={family?.name} action={filterKey} />
          <Explorer key={file.family.id} rootUci={file.family.rootUci} side={file.family.side} stats={stats.data} elo={settings.elo} token={settings.lichessToken} names={names.data ?? {}} />
        </>
      )}

      <TrainingSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Opening en modus"
        footer={<button type="button" className="btn btn-primary w-full" onClick={() => setSheet(false)}>Klaar</button>}
      >
        <div>
          <div className="mb-2 text-sm font-semibold" aria-hidden>Opening</div>
          <div className="[&_select]:max-w-none">
            <FamilyPicker value={id ?? ''} onChange={v => nav(`/advantage/${v}`, { replace: true })} families={manifest.families} mine={settings.openings} />
          </div>
        </div>
        <PillChoice<Mode>
          legend="Wat wil je doen?"
          value={mode}
          onChange={setMode}
          options={[{ value: 'train', label: 'Trainen' }, { value: 'explore', label: 'Verkennen' }]}
          hint={mode === 'train' ? 'Tien vragen: kies uit vier zetten welke het best scoort op jouw niveau.' : 'Speel zelf zetten op het bord en zie wat er op jouw niveau gespeeld wordt en hoe het afloopt.'}
        />
        {mode === 'train' && (
          <button type="button" className="tap flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px]! px-4 font-bold" onClick={() => { setRound(r => r + 1); setSheet(false) }}>
            ⟲ Opnieuw beginnen
          </button>
        )}
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
          Praktische score = winst + ½ remise, in partijen van spelers met rating {BAND_LABEL[band]} (jouw rating is {settings.elo}; aan te passen in Instellingen).
        </p>
      </TrainingSheet>
    </div>
  )
}

function useLine(rootUci: string[]) {
  const [uci, setUci] = useState<string[]>(rootUci)
  const { fen, san, last } = useMemo(() => {
    const c = new Chess(START_FEN)
    const san: string[] = []
    let last: [string, string] | null = null
    for (const u of uci) {
      const m = c.move(parseUci(u))
      san.push(m.san)
      last = [m.from, m.to]
    }
    return { fen: c.fen(), san, last }
  }, [uci])
  return { uci, setUci, fen, san, last }
}

function nameAt(names: Record<string, [string, string, string]>, uci: string[]) {
  const c = new Chess()
  let n: string | undefined = names[epdOf(c.fen())]?.[1]
  for (const u of uci) {
    c.move(parseUci(u))
    n = names[epdOf(c.fen())]?.[1] ?? n
  }
  return n
}

function Explorer({ rootUci, side, stats, elo, token, names }: { rootUci: string[]; side: Side; stats: StatsFile; elo: number; token?: string; names: Record<string, [string, string, string]> }) {
  const { uci, setUci, fen, san, last } = useLine(rootUci)
  const band = bandFor(elo)
  const pos = stats.positions[epdOf(fen)]
  const [live, setLive] = useState<{ loading: boolean; data?: ExplorerResult; error?: string } | null>(null)
  useEffect(() => { setLive(null) }, [fen])
  const turn: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black'

  function play(from: string, to: string, promotion?: string) {
    const c = new Chess(fen)
    try {
      const m = c.move({ from, to, promotion: promotion ?? 'q' })
      setUci(u => [...u, uciOf(m)])
      return true
    } catch {
      return false
    }
  }

  async function fetchLive() {
    if (!token) return
    setLive({ loading: true })
    try {
      setLive({ loading: false, data: await queryExplorer(fen, token, { ratings: ratingGroupsFor(elo) }) })
    } catch (e) {
      setLive({ loading: false, error: (e as Error).message })
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="mx-auto w-full max-w-[min(92vw,600px)]">
        <Board id="explorer" fen={fen} orientation={side} movable={turn} onMove={play} lastMove={last} />
        <div className="mt-2 flex gap-2">
          <button type="button" className="tap flex min-h-11 flex-1 items-center justify-center rounded-[14px]! px-3 font-bold disabled:opacity-50" onClick={() => setUci(u => (u.length > 0 ? u.slice(0, -1) : u))} disabled={!uci.length}>Terug</button>
          <button type="button" className="tap flex min-h-11 flex-1 items-center justify-center rounded-[14px]! px-3 font-bold" onClick={() => setUci(rootUci)}>⟲ Begin van de opening</button>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="card p-4">
          <div className="text-sm text-muted">{nameAt(names, uci) ?? 'Onbenoemde stelling'}</div>
          <MoveList sans={san} current={san.length} onSelect={p => setUci(u => u.slice(0, p))} />
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-bold">Wat wordt hier gespeeld</h3>
            <span className="text-xs text-muted">{pos ? `${nf(pos.n)} partijen` : ''}</span>
          </div>
          {pos ? <StatsTable moves={pos.m} total={pos.n} side={side} band={band} onPick={u => setUci(x => [...x, u])} /> : <p className="text-sm text-muted">Deze stelling kwam te weinig voor in de steekproef (minder dan 20 partijen).</p>}
        </div>
        <div className="card p-4">
          <h3 className="font-semibold">Live Lichess Explorer <span className="text-xs font-normal text-muted">(optioneel)</span></h3>
          {!token ? (
            <p className="mt-1 text-sm text-muted">Voeg een Lichess-token toe in Instellingen voor actuele aantallen.</p>
          ) : !live ? (
            <button className="btn btn-ghost mt-2 w-full" onClick={fetchLive}>Haal live statistieken op (rating {ratingGroupsFor(elo).join(', ')})</button>
          ) : live.loading ? <InlineWait className="text-sm" /> : live.error ? <div className="text-sm text-danger-ink">{live.error}</div> : live.data && (
            <div className="mt-2">
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {live.data.moves.slice(0, 8).map(m => {
                    const n = m.white + m.draws + m.black
                    const total = live.data!.white + live.data!.draws + live.data!.black
                    const win = (side === 'white' ? m.white : m.black) / n
                    const loss = (side === 'white' ? m.black : m.white) / n
                    return (
                      <tr key={m.uci} className="border-t border-line">
                        <td className="py-1.5 font-mono font-semibold">{m.san}</td>
                        <td className="text-right">{pct(n / Math.max(1, total))}<div className="text-xs text-muted">{nf(n)}</div></td>
                        <td className="w-1/2 pl-3"><ResultBar w={win} d={m.draws / n} l={loss} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {live.data.opening && <div className="mt-1 text-xs text-muted">{live.data.opening.eco} {live.data.opening.name}</div>}
            </div>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-2 font-semibold">Engine <span className="text-xs font-normal text-muted">(objectief, niet hetzelfde als praktisch succes)</span></h3>
          <EvalButton fen={fen} multipv={3} label="Analyseer met Stockfish (3 beste zetten)" />
        </div>
      </aside>
    </div>
  )
}

const QUESTIONS = 10
/** Binnen 3 procentpunt van de best scorende zet telt als een van de beste keuzes (zoals voorheen) */
const MARGIN = 0.03
const ARROW_PICK = 'rgba(47,125,79,0.85)'
const ARROW_BEST = 'rgba(58,110,165,0.85)'

interface Choice { uci: string; san: string; score: number; n: number; allLevels: boolean; name: string; freq: number }

/** Korte naam van de stelling na een zet ("Italian Game: Classical Variation, Giuoco Pianissimo" → "Giuoco Pianissimo") */
const shortName = (full: string) => full.split(/[:,]\s*/).pop()?.trim() || full

function shuffle<T>(list: T[]) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Trainen als keuzevraag: in elke stelling waar jij aan zet bent kies je uit (maximaal) vier zetten die op jouw niveau
 * echt gespeeld worden, waaronder de best scorende. Na Controleer zie je per zet de praktische score. Je speelt verder
 * met jouw keuze; de tegenstander antwoordt zoals spelers van jouw niveau dat vaak doen.
 */
function AdvantageQuiz({ rootUci, side, stats, elo, names, label, familyName, filterKey, onClose, onOpenSheet, onRestart }: {
  rootUci: string[]; side: Side; stats: StatsFile; elo: number; names: Names; label: string; familyName: string
  filterKey: ReactNode; onClose: () => void; onOpenSheet: () => void; onRestart: () => void
}) {
  const { uci, setUci, fen, last } = useLine(rootUci)
  const band = bandFor(elo)
  const pos = stats.positions[epdOf(fen)]
  const turn: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const userTurn = turn === side
  const colorNl = side === 'white' ? 'wit' : 'zwart'
  const [asked, setAsked] = useState(0)
  const [good, setGood] = useState(0)
  const [choice, setChoice] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [finished, setFinished] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Zelfde selectie als voorheen: genoeg partijen (op jouw niveau, anders alle niveaus) en minstens 2% gespeeld
  const candidates = useMemo(() => {
    if (!pos) return []
    return pos.m
      .map(m => {
        const mine = moveScore(m, side, band)
        const s = mine.n >= 20 ? mine : moveScore(m, side)
        return { m, s, n: mine.n >= 20 ? mine.n : m[2], allLevels: mine.n < 20 }
      })
      .filter(x => x.n >= 20 && x.m[2] / pos.n >= 0.02)
      .sort((a, b) => b.s.score - a.s.score)
  }, [pos, side, band])

  const here = useMemo(() => nameAt(names, uci), [names, uci])
  // De beste zet plus de drie andere die op jouw niveau het vaakst gespeeld worden, in willekeurige volgorde
  // (de volgorde ligt vast per stelling, zodat de kaarten niet verspringen als de namen later binnenkomen)
  const picks = useMemo(() => {
    if (!userTurn || !candidates.length) return []
    const [best, ...rest] = candidates
    const others = [...rest].sort((a, b) => (bandCount(b.m, band) || b.m[2]) - (bandCount(a.m, band) || a.m[2])).slice(0, 3)
    return shuffle([best, ...others])
  }, [candidates, userTurn, band])
  const choices = useMemo<Choice[]>(() => {
    const bandTotal = pos ? pos.m.reduce((a, m) => a + bandCount(m, band), 0) : 0
    return picks.map(x => {
      let name = ''
      try {
        const after = new Chess(fen)
        after.move(parseUci(x.m[0]))
        const full = names[epdOf(after.fen())]?.[1]
        if (full && full !== here) name = shortName(full)
      } catch { /* zet niet speelbaar: zonder naam */ }
      // Hoe vaak de zet gespeeld wordt (op jouw niveau, anders over alle niveaus): staat op elke kaart (ontwerp 16c)
      const freq = bandTotal ? bandCount(x.m, band) / bandTotal : pos ? x.m[2] / pos.n : 0
      return { uci: x.m[0], san: x.m[1], score: x.s.score, n: x.n, allLevels: x.allLevels, name, freq }
    })
  }, [picks, fen, names, here, pos, band])

  const bestUci = candidates[0]?.m[0]
  const bestScore = candidates[0]?.s.score ?? 0
  const depth = uci.length - rootUci.length
  const lineEnded = !pos || (userTurn && choices.length < 2) || depth >= 16
  const noData = lineEnded && depth === 0

  // Einde van de betrouwbare data: opnieuw vanaf de opening, de ronde loopt door
  useEffect(() => {
    if (!lineEnded || noData || finished || checked) return
    const t = setTimeout(() => {
      setUci(rootUci)
      setNotice('Verder in deze lijn zijn er te weinig partijen. We beginnen opnieuw vanaf de opening.')
    }, 900)
    return () => clearTimeout(t)
  }, [lineEnded, noData, finished, checked]) // eslint-disable-line react-hooks/exhaustive-deps

  // tegenstander: gewogen willekeurig op basis van wat er op jouw niveau gespeeld wordt
  useEffect(() => {
    if (userTurn || lineEnded || finished || !pos) return
    const t = setTimeout(() => {
      const opts = pos.m.map(m => ({ m, w: bandCount(m, band) || m[2] })).filter(x => x.w / pos.n >= 0.03 || x.w >= 30)
      const sum = opts.reduce((a, x) => a + x.w, 0)
      let r = Math.random() * sum
      const pick = opts.find(x => (r -= x.w) <= 0) ?? opts[0]
      if (pick) setUci(u => [...u, pick.m[0]])
    }, 600)
    return () => clearTimeout(t)
  }, [fen, userTurn, lineEnded, finished]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sneltoetsen: 1 t/m 4 kiest een zet (niet tijdens typen in een veld)
  useEffect(() => {
    if (checked || finished || !choices.length) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest('input, textarea, select, [role="dialog"]')) return
      const c = choices[Number(e.key) - 1]
      if (c) { e.preventDefault(); setChoice(c.uci) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [choices, checked, finished])

  const picked = choices.find(c => c.uci === choice)
  const correct = !!picked && picked.score >= bestScore - MARGIN
  const bestSan = candidates[0]?.m[1]
  // Na Controleer: "Bijna" als je keuze dicht bij de beste zit (oranje), anders rood
  const gap = picked ? bestScore - picked.score : 0
  const near = !!picked && !correct && gap <= 0.06
  const mostPlayed = !!picked && choices.every(c => c.freq <= picked.freq)
  const feedback = !picked ? null : correct
    ? { lead: 'Goed gekozen.', text: `${picked.san} scoort ${pct(picked.score)} over ${nf(picked.n)} partijen, ${picked.uci === bestUci ? 'het best van deze zetten' : 'een van de best scorende keuzes'}.` }
    : { lead: near ? 'Bijna.' : 'Niet de beste.', text: `${picked.san} ${mostPlayed ? 'wordt het meest gespeeld' : `scoort ${pct(picked.score)}`}, maar ${bestSan} scoort op jouw niveau ${Math.round(gap * 100)} procentpunt beter. Je speelt verder met jouw zet.` }

  function check() {
    if (!picked || checked) return
    setChecked(true)
    setNotice(null)
    setAsked(a => a + 1)
    if (correct) {
      setGood(g => g + 1)
      addXp(3).catch(() => {})
    }
  }
  function next() {
    if (!checked || !choice) return
    if (asked >= QUESTIONS) { setFinished(true); return }
    setUci(x => [...x, choice])
    setChoice(null)
    setChecked(false)
  }

  const arrows: Arrow[] = []
  if (picked && !finished) {
    arrows.push({ startSquare: picked.uci.slice(0, 2), endSquare: picked.uci.slice(2, 4), color: ARROW_PICK })
    if (checked && bestUci && bestUci !== picked.uci) arrows.push({ startSquare: bestUci.slice(0, 2), endSquare: bestUci.slice(2, 4), color: ARROW_BEST })
  }

  const qNum = Math.min(QUESTIONS, asked + (checked || finished ? 0 : 1))
  const top = (
    <TrainingTopBar
      value={asked / QUESTIONS}
      count={`${qNum}/${QUESTIONS}`}
      countLabel={`Vraag ${qNum} van ${QUESTIONS}`}
      onClose={onClose}
      closeLabel="Stoppen met Op jouw niveau"
    />
  )
  const heading = <TrainingHeading tone="info" label={label} title={finished ? 'Ronde klaar' : 'Welke zet scoort het best?'} sub={here ?? familyName} action={filterKey} />

  if (noData) {
    return (
      <>
        {top}
        {heading}
        <Empty title="Te weinig partijen" action={<button type="button" className="btn btn-primary" onClick={onOpenSheet}>Andere opening kiezen</button>}>
          Voor deze opening zijn er op jouw niveau te weinig partijen in de steekproef om een vraag te stellen.
        </Empty>
      </>
    )
  }

  return (
    <>
      {top}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:gap-y-4">
        <div className="lg:col-start-2 lg:row-start-1">{heading}</div>

        <div className="mx-auto w-full max-w-[clamp(240px,calc(100dvh-520px),100%)] sm:max-w-[clamp(300px,calc(100dvh-460px),480px)] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:max-w-[min(100%,600px,calc(100dvh-140px))]">
          <div className="rounded-xl shadow-[0_1px_0_var(--board-edge),0_10px_26px_rgba(30,40,30,0.14)]">
            <Board id="practice" label={`Schaakbord, je speelt ${colorNl}`} fen={fen} orientation={side} lastMove={last} arrows={arrows} />
          </div>
        </div>

        <div className="flex flex-col gap-3.5 lg:col-start-2 lg:row-start-2">
          {finished ? (
            <div className="rounded-[18px] border-2 border-line bg-surface p-5 text-center animate-fade-up" role="status">
              <div className="text-4xl font-extrabold tabular-nums text-info-ink">{good} <span className="text-2xl text-muted">van {QUESTIONS}</span></div>
              <p className="mt-2 text-muted">keer koos je een van de best scorende zetten op jouw niveau.</p>
            </div>
          ) : userTurn && !lineEnded ? (
            <div role="group" aria-label="Kies de zet die volgens jou het best scoort" className="flex flex-col gap-2">
              {choices.map((c, i) => {
                const selected = choice === c.uci
                const isBest = c.uci === bestUci
                // Voor Controleer alleen de keuze; daarna groen voor de beste (en een goede keuze), oranje of rood voor een mindere keuze
                const state = !checked ? (selected ? 'tap-on' : '')
                  : selected && !correct ? (near ? 'border-accent! bg-accent-soft! shadow-[0_3px_0_var(--accent)]!' : 'border-danger! bg-danger-soft! shadow-[0_3px_0_var(--danger)]!')
                  : selected || isBest ? 'tap-on' : ''
                const scoreCls = selected && !correct ? (near ? 'text-accent-ink' : 'text-danger-ink') : selected || isBest ? 'text-brand-strong' : 'text-ink'
                const verdict = checked ? `, score ${pct(c.score)} over ${nf(c.n)} partijen${isBest ? ', beste keuze' : ''}${selected ? ', jouw keuze' : ''}` : ''
                return (
                  <button
                    key={c.uci}
                    type="button"
                    className={`tap grid min-h-[3.75rem] w-full grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[14px]! px-3.5 py-2.5 text-left ${state}`}
                    aria-pressed={selected}
                    aria-disabled={checked || undefined}
                    aria-label={`${c.san}${c.name ? `, ${c.name}` : ''}, ${pct(c.freq)} van de partijen${verdict}`}
                    aria-keyshortcuts={String(i + 1)}
                    onClick={() => { if (!checked) setChoice(c.uci) }}
                  >
                    <span className="text-[17px] font-extrabold">{c.san}</span>
                    <span className="min-w-0">
                      {c.name && <span className={`block truncate text-sm font-bold ${selected && !checked ? 'text-brand-strong' : ''}`}>{c.name}</span>}
                      <span className="block truncate text-xs text-muted">
                        {pct(c.freq)} van de partijen
                        {checked && selected && ' · jouw keuze'}
                        {checked && isBest && <> · <b className="font-bold text-brand-strong">beste keuze</b></>}
                      </span>
                    </span>
                    {checked && (
                      <span className="text-right animate-fade-in" aria-hidden>
                        <span className={`block text-lg font-extrabold leading-tight tabular-nums ${scoreCls}`}>{pct(c.score)}</span>
                        <span className="block text-[11px] leading-none text-muted">score</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="rounded-[18px] border-2 border-line bg-surface-2 px-4 py-3 text-sm text-muted" aria-live="polite">
              {notice ?? 'De tegenstander kiest een zet zoals spelers van jouw niveau dat vaak doen…'}
            </div>
          )}

          {checked && !finished && pos && (
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-muted hover:text-ink">Alle zetten in deze stelling</summary>
              <div className="mt-1 rounded-[18px] border-2 border-line bg-surface p-2">
                <StatsTable moves={pos.m} total={pos.n} side={side} band={band} highlight={choice ?? undefined} />
              </div>
            </details>
          )}

          {finished ? (
            <BottomAction>
              <button type="button" className="btn btn-primary w-full" onClick={onRestart} autoFocus>Nog een ronde</button>
              <button type="button" className="tap flex min-h-12 w-full items-center justify-center rounded-[14px]! px-4 font-bold" onClick={onClose}>Sluiten</button>
            </BottomAction>
          ) : (
            <BottomAction tone={checked ? (correct ? 'good' : near ? 'near' : 'bad') : undefined}>
              {checked && feedback && (
                <p className="text-[15px] leading-snug" role="status">
                  <b className={correct ? 'text-brand-strong' : near ? 'text-accent-ink' : 'text-danger-ink'}>{feedback.lead}</b> {feedback.text}
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={checked ? next : check}
                disabled={!checked && (!picked || !userTurn || lineEnded)}
                aria-describedby={!checked && !picked && userTurn && !lineEnded ? 'advantage-reason' : undefined}
              >
                {checked ? (asked >= QUESTIONS ? 'Bekijk je resultaat' : 'Volgende') : 'Controleer'}
              </button>
              {!checked && !picked && userTurn && !lineEnded && <p id="advantage-reason" className="btn-reason mt-0! text-center">Kies eerst een zet.</p>}
            </BottomAction>
          )}
        </div>
      </div>
    </>
  )
}
