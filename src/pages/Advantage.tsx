import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Chess } from 'chess.js'
import { loadNames, loadStats } from '../lib/data'
import { useAsync, useFamily, useManifest } from '../lib/hooks'
import { START_FEN, epdOf, formatMoves, parseUci, uciOf } from '../lib/chess'
import { moveScore, bandCount } from '../lib/trainer'
import { addXp } from '../lib/progress'
import { queryExplorer, ratingGroupsFor, type ExplorerResult } from '../lib/explorer'
import { Board } from '../components/Board'
import { EvalButton } from '../components/EvalButton'
import { MoveList } from '../components/Trainer'
import { ErrorBox, PageHeader, Spinner, Tabs, nf, pct, useSettings } from '../components/ui'
import { FamilyPicker } from './Variations'
import type { Side, StatMove, StatsFile } from '../lib/types'

const BAND_LABEL = ['< 1200', '1200–1599', '1600–1999', '2000+']
const bandFor = (elo: number) => (elo < 1200 ? 0 : elo < 1600 ? 1 : elo < 2000 ? 2 : 3)

function ResultBar({ w, d, l }: { w: number; d: number; l: number }) {
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full text-[0px]" title={`winst ${pct(w)} · remise ${pct(d)} · verlies ${pct(l)}`}>
      <div className="bg-brand" style={{ width: pct(w) }} />
      <div className="bg-line" style={{ width: pct(d) }} />
      <div className="bg-danger" style={{ width: pct(l) }} />
    </div>
  )
}

function StatsTable({ moves, total, side, band, onPick, highlight }: { moves: StatMove[]; total: number; side: Side; band: number; onPick?: (uci: string) => void; highlight?: string }) {
  const bandTotal = moves.reduce((a, m) => a + bandCount(m, band), 0)
  return (
    <table className="w-full text-sm tabular-nums">
      <thead className="text-xs text-muted">
        <tr><th className="py-1 text-left">Zet</th><th className="text-right">Gespeeld</th><th className="text-right" title={`Rating ${BAND_LABEL[band]}`}>Jouw niveau</th><th className="w-[38%] pl-3 text-left">Resultaat voor {side === 'white' ? 'wit' : 'zwart'} (jouw niveau)</th></tr>
      </thead>
      <tbody>
        {moves.map(m => {
          const mine = moveScore(m, side, band)
          const all = moveScore(m, side)
          const s = mine.n >= 10 ? mine : all
          return (
            <tr key={m[0]} className={`border-t border-line ${highlight === m[0] ? 'bg-brand-soft' : ''} ${onPick ? 'cursor-pointer hover:bg-surface-2' : ''}`} onClick={() => onPick?.(m[0])}>
              <td className="py-1.5 font-mono font-semibold">{m[1]}</td>
              <td className="text-right">{pct(m[2] / total)}<div className="text-xs text-muted">{nf(m[2])}</div></td>
              <td className="text-right">{bandTotal ? pct(mine.n / bandTotal) : '–'}<div className="text-xs text-muted">{nf(mine.n)}</div></td>
              <td className="pl-3"><ResultBar w={s.win} d={s.draw} l={s.loss} /><div className="text-xs text-muted">score {pct(s.score)}{mine.n < 10 ? ' (alle niveaus)' : ''}</div></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function Advantage() {
  const { id: paramId } = useParams()
  const nav = useNavigate()
  const settings = useSettings()
  const { data: manifest, error } = useManifest()
  const id = paramId ?? settings?.openings[0] ?? manifest?.families[0]?.id
  const { data: file } = useFamily(id)
  const stats = useAsync(() => (id ? loadStats(id) : Promise.resolve(null)), [id])
  const names = useAsync(() => loadNames(), [])
  const [tab, setTab] = useState<'train' | 'explore'>('train')

  if (error) return <ErrorBox error={error} />
  if (!manifest || !settings) return <Spinner />
  return (
    <div>
      <PageHeader title="Advantage" subtitle="Wat werkt op jouw niveau." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FamilyPicker value={id ?? ''} onChange={v => nav(`/advantage/${v}`)} families={manifest.families} mine={settings.openings} />
        <Tabs value={tab} onChange={setTab} options={[{ value: 'train', label: 'Trainen' }, { value: 'explore', label: 'Verkennen' }]} />
      </div>
      {!file || stats.loading ? <Spinner /> : !stats.data ? <ErrorBox error="Geen statistieken beschikbaar" /> : tab === 'train'
        ? <PracticeTrainer key={file.family.id} rootUci={file.family.rootUci} side={file.family.side} stats={stats.data} elo={settings.elo} names={names.data ?? {}} />
        : <Explorer key={file.family.id} rootUci={file.family.rootUci} side={file.family.side} stats={stats.data} elo={settings.elo} token={settings.lichessToken} names={names.data ?? {}} />}
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
          <button className="btn btn-ghost flex-1" onClick={() => setUci(u => (u.length > 0 ? u.slice(0, -1) : u))} disabled={!uci.length}>Terug</button>
          <button className="btn btn-ghost flex-1" onClick={() => setUci(rootUci)}>⟲ Begin van de opening</button>
        </div>
      </div>
      <aside className="space-y-3">
        <div className="card p-4">
          <div className="text-sm text-muted">{nameAt(names, uci) ?? 'Onbenoemde stelling'}</div>
          <MoveList sans={san} current={san.length} onSelect={p => setUci(u => u.slice(0, p))} />
        </div>
        <div className="card p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-semibold">Praktijk (offline steekproef)</h3>
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
          ) : live.loading ? <div className="text-sm text-muted">Laden…</div> : live.error ? <div className="text-sm text-danger-ink">{live.error}</div> : live.data && (
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

/** Trainen: jij kiest de zet met de beste praktische score; de tegenstander speelt wat spelers van jouw niveau vaak spelen. */
function PracticeTrainer({ rootUci, side, stats, elo, names }: { rootUci: string[]; side: Side; stats: StatsFile; elo: number; names: Record<string, [string, string, string]> }) {
  const { uci, setUci, fen, san, last } = useLine(rootUci)
  const band = bandFor(elo)
  const pos = stats.positions[epdOf(fen)]
  const turn: Side = fen.split(' ')[1] === 'w' ? 'white' : 'black'
  const userTurn = turn === side
  const [feedback, setFeedback] = useState<{ tone: 'good' | 'bad' | 'info'; text: string; uci?: string } | null>(null)
  const [score, setScore] = useState({ good: 0, total: 0 })
  const [reveal, setReveal] = useState(false)

  const candidates = useMemo(() => {
    if (!pos) return []
    return pos.m
      .map(m => {
        const mine = moveScore(m, side, band)
        const s = mine.n >= 20 ? mine : moveScore(m, side)
        return { m, s, n: mine.n >= 20 ? mine.n : m[2] }
      })
      .filter(x => x.n >= 20 && x.m[2] / pos.n >= 0.02)
      .sort((a, b) => b.s.score - a.s.score)
  }, [pos, side, band])
  const ended = !pos || (userTurn && candidates.length === 0) || uci.length - rootUci.length >= 16

  // tegenstander: gewogen willekeurig op basis van wat er op jouw niveau gespeeld wordt
  useEffect(() => {
    if (userTurn || ended || !pos) return
    const t = setTimeout(() => {
      const opts = pos.m.map(m => ({ m, w: bandCount(m, band) || m[2] })).filter(x => x.w / pos.n >= 0.03 || x.w >= 30)
      const sum = opts.reduce((a, x) => a + x.w, 0)
      let r = Math.random() * sum
      const pick = opts.find(x => (r -= x.w) <= 0) ?? opts[0]
      if (pick) setUci(u => [...u, pick.m[0]])
    }, 600)
    return () => clearTimeout(t)
  }, [fen, userTurn, ended]) // eslint-disable-line react-hooks/exhaustive-deps

  function play(from: string, to: string, promotion?: string) {
    if (!userTurn || ended) return false
    const c = new Chess(fen)
    let mv
    try { mv = c.move({ from, to, promotion: promotion ?? 'q' }) } catch { return false }
    const u = uciOf(mv)
    const best = candidates[0]
    const mine = candidates.find(x => x.m[0] === u)
    setReveal(false)
    if (!mine) {
      setFeedback({ tone: 'info', text: `${mv.san} komt op dit niveau (bijna) niet voor. Kies een gangbare zet.` })
      return false
    }
    setScore(s => ({ good: s.good + (mine.s.score >= best.s.score - 0.03 ? 1 : 0), total: s.total + 1 }))
    if (mine.s.score >= best.s.score - 0.03) {
      setFeedback({ tone: 'good', text: `${mv.san}: praktische score ${pct(mine.s.score)} over ${nf(mine.n)} partijen, een van de best scorende keuzes.`, uci: u })
      addXp(3).catch(() => {})
    } else {
      setFeedback({ tone: 'bad', text: `${mv.san} scoort ${pct(mine.s.score)}; ${best.m[1]} scoort ${pct(best.s.score)} op jouw niveau. Je speelt verder met jouw zet.`, uci: u })
    }
    setUci(x => [...x, u])
    return true
  }

  const restart = () => { setUci(rootUci); setFeedback(null); setScore({ good: 0, total: 0 }) }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="mx-auto w-full max-w-[min(92vw,600px)]">
        <Board id="practice" fen={fen} orientation={side} movable={userTurn && !ended ? side : undefined} onMove={play} lastMove={last} />
      </div>
      <aside className="space-y-3">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-strong">Praktijktraining · rating {BAND_LABEL[band]}</div>
          <div className="mt-1 text-sm text-muted">{nameAt(names, uci) ?? ''}</div>
          <div className="mt-1 font-mono text-xs">{formatMoves(san)}</div>
          <div className="mt-2 text-sm">Beste praktische keuzes: <b>{score.good}</b> van {score.total}</div>
        </div>
        {feedback && <div className={`rounded-2xl px-4 py-3 text-sm ${feedback.tone === 'good' ? 'bg-brand-soft text-brand-strong' : feedback.tone === 'bad' ? 'bg-danger-soft text-danger-ink' : 'bg-info-soft text-info-ink'}`}>{feedback.text}</div>}
        {ended ? (
          <div className="card p-4">
            <div className="font-semibold">Einde van de betrouwbare data</div>
            <p className="text-sm text-muted">Verder in deze lijn zijn er te weinig partijen in de steekproef om iets zinnigs te zeggen.</p>
            <button className="btn btn-primary mt-3 w-full" onClick={restart}>Nieuwe ronde</button>
          </div>
        ) : userTurn ? (
          <div className="card p-4">
            <div className="text-sm">Jij bent aan zet. Welke zet scoort in de praktijk het best?</div>
            <button className="btn btn-quiet mt-2 px-0 text-sm" onClick={() => setReveal(r => !r)}>{reveal ? 'Verberg' : 'Toon'} de statistiek</button>
            {reveal && pos && <StatsTable moves={pos.m} total={pos.n} side={side} band={band} />}
          </div>
        ) : <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">De tegenstander kiest een zet zoals spelers van jouw niveau dat vaak doen…</div>}
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={restart}>⟲ Opnieuw</button>
        </div>
        <p className="text-xs text-muted">Praktische score = winst + ½ remise op jouw niveau.</p>
      </aside>
    </div>
  )
}
