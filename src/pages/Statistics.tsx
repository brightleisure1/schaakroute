import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Lock } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today, type DailyActivity } from '../lib/db'
import { familyProgress, useCardMap, useFamilies, useManifest, useProgressMap, variationMastery } from '../lib/hooks'
import { BADGES } from '../lib/gamification'
import { streak, totalXp } from '../lib/progress'
import { stageOf } from '../lib/srs'
import { displayName } from '../lib/data'
import { Empty, PageHeader, ProgressBar, Spinner, StatTile, Stars, Tabs, pct } from '../components/ui'

// Uitsluitend echte, lokaal opgeslagen gebruikersgegevens. Lege toestanden in plaats van voorbeelddata.

const dayKey = (d: Date) => today(d)
function lastDays(n: number) {
  const out: string[] = []
  const d = new Date()
  d.setHours(12)
  d.setDate(d.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}
const shortDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })

export function Statistics() {
  const daily = useLiveQuery(() => db.daily.toArray(), [], [] as DailyActivity[])
  const firstCorrect = useLiveQuery(async () => {
    const m = new Map<string, string>()
    await db.attempts.where('result').anyOf('correct', 'hint').each(a => { if (a.cardId && !m.has(a.cardId)) m.set(a.cardId, a.day) })
    return m
  }, [], new Map<string, string>())
  const badges = useLiveQuery(() => db.badges.toArray(), [], [])
  const xp = useLiveQuery(() => totalXp(), [], 0)
  const st = useLiveQuery(() => streak(), [], { current: 0, best: 0 })
  const cards = useCardMap()
  const progress = useProgressMap()
  const { data: manifest } = useManifest()
  const families = useFamilies(manifest?.families.map(f => f.id) ?? [])
  const [range, setRange] = useState<'30' | '90'>('30')

  const byDay = useMemo(() => new Map(daily.map(d => [d.day, d])), [daily])
  const totals = daily.reduce((a, d) => ({ correct: a.correct + d.correct, mistakes: a.mistakes + d.mistakes, reviews: a.reviews + d.reviews, seconds: a.seconds + d.seconds }), { correct: 0, mistakes: 0, reviews: 0, seconds: 0 })
  const cardList = [...cards.values()]
  const learned = cardList.filter(c => c.correct > 0).length
  const mature = cardList.filter(c => stageOf(c) === 'mature').length

  if (!manifest) return <Spinner />
  if (!daily.length && !cardList.length) {
    return (
      <div>
        <PageHeader title="Statistieken" />
        <Empty title="Nog geen trainingsgegevens" action={<Link to="/dagelijks" className="btn btn-primary">Start je eerste training</Link>}>Statistieken worden opgebouwd uit je eigen trainingen. Er worden geen voorbeeldcijfers getoond.</Empty>
      </div>
    )
  }

  const days = lastDays(Number(range))
  const fileList = families.data ?? []
  const famRows = fileList
    .map(f => ({ f, p: familyProgress(f, progress, cards) }))
    .filter(x => x.p.learned > 0 || x.p.positions > 0)
    .sort((a, b) => b.p.score - a.p.score)
  const varRows = fileList.flatMap(f => f.variations.filter(v => progress.get(v.id)?.completions).map(v => {
    const p = progress.get(v.id)!
    return { f, v, p, m: variationMastery(v, f.family.side, cards, p), errRate: p.mistakes / Math.max(1, p.completions) }
  }))
  const hardest = [...varRows].filter(r => r.p.mistakes > 0).sort((a, b) => b.errRate - a.errRate).slice(0, 10)

  // cumulatief geleerde posities per dag
  const learnedByDay = new Map<string, number>()
  for (const d of firstCorrect.values()) learnedByDay.set(d, (learnedByDay.get(d) ?? 0) + 1)
  const sortedDays = [...learnedByDay.keys()].sort()
  let before = 0
  for (const d of sortedDays) if (d < days[0]) before += learnedByDay.get(d)!
  const cumulative = days.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? before) + (learnedByDay.get(d) ?? 0)], [])

  return (
    <div className="space-y-6">
      <PageHeader title="Statistieken" subtitle={<>Je trainingsgegevens staan alleen op dit apparaat. <Link to="/instellingen" className="underline">Back-up maken</Link></>} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Goede zetten" value={totals.correct.toLocaleString('nl-NL')} />
        <StatTile label="Fouten" value={totals.mistakes.toLocaleString('nl-NL')} hint={totals.correct + totals.mistakes ? `${pct(totals.correct / (totals.correct + totals.mistakes))} nauwkeurig` : undefined} />
        <StatTile label="Geleerde posities" value={learned} hint={`${mature} met interval ≥ 7 dagen`} />
        <StatTile label="Herhalingen" value={totals.reviews} />
        <StatTile label="Trainingstijd" value={`${Math.round(totals.seconds / 60)} min`} />
        <StatTile label="Streak" value={`${st.current} d`} hint={`record ${st.best} · ${xp.toLocaleString('nl-NL')} XP`} />
      </section>

      <section className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Trainingsactiviteit per dag</h2>
          <Tabs value={range} onChange={setRange} options={[{ value: '30', label: '30 dagen' }, { value: '90', label: '90 dagen' }]} />
        </div>
        <DailyBars days={days} byDay={byDay} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">Geleerde posities door de tijd</h2>
          <p className="mb-3 text-xs text-muted">Cumulatief aantal posities dat je minstens één keer goed speelde.</p>
          <LineChart days={days} values={cumulative} />
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Activiteit (16 weken)</h2>
          <Heatmap byDay={byDay} />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Beheersing per opening</h2>
        {famRows.length === 0 ? <p className="text-sm text-muted">Nog geen opening getraind.</p> : (
          <ul className="space-y-3">
            {famRows.map(({ f, p }) => (
              <li key={f.family.id}>
                <div className="flex justify-between text-sm"><Link to={`/opening/${f.family.id}`} className="inline-flex min-h-11 items-center font-medium hover:underline">{f.family.name}</Link><span className="tabular-nums text-muted">{p.score}% · {p.learned}/{p.total} varianten · {p.positions} posities</span></div>
                <ProgressBar value={p.score / 100} className="mt-1" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Moeilijkste varianten</h2>
          {hardest.length === 0 ? <p className="text-sm text-muted">Nog geen fouten geregistreerd. Knap!</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left">Variant</th><th className="text-right">Fouten/keer</th><th className="text-right">Beheersing</th></tr></thead>
              <tbody>{hardest.map(r => (
                <tr key={r.v.id} className="border-t border-line">
                  <td className="py-1.5"><Link className="inline-flex min-h-11 items-center hover:underline" to={`/train/${r.f.family.id}/${r.v.id}?mode=practice`}>{displayName(r.v, r.f.family.name)}</Link><div className="text-xs text-muted">{r.f.family.name}</div></td>
                  <td className="text-right tabular-nums">{r.errRate.toFixed(1).replace('.', ',')}</td>
                  <td className="text-right tabular-nums">{r.m.score}%</td>
                </tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Beheersing per variant</h2>
          {varRows.length === 0 ? <p className="text-sm text-muted">Nog geen varianten afgerond.</p> : (
            <div className="max-h-80 overflow-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-xs text-muted"><tr><th className="text-left">Variant</th><th className="text-right">Keer</th><th className="text-right">Sterren</th><th className="text-right">Beheersing</th></tr></thead>
                <tbody>{[...varRows].sort((a, b) => b.m.score - a.m.score).map(r => (
                  <tr key={r.v.id} className="border-t border-line">
                    <td className="py-1.5">{displayName(r.v, r.f.family.name)}<div className="text-xs text-muted">{r.f.family.name}</div></td>
                    <td className="text-right tabular-nums">{r.p.completions}</td>
                    <td className="text-right"><Stars count={r.p.bestStars} size="text-sm" /></td>
                    <td className="text-right tabular-nums">{r.m.mastered ? 'beheerst' : `${r.m.score}%`}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Badges ({badges.length}/{BADGES.length})</h2>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map(b => {
            const has = badges.find(x => x.id === b.id)
            return (
              <li key={b.id} className="flex items-start gap-3">
                <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${has ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted'}`}>
                  {has ? <b.icon size={20} /> : <Lock size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{b.title}{!has && <span className="sr-only"> (nog niet behaald)</span>}</span>
                  <span className="block text-sm text-muted">{b.description}</span>
                  {has && <span className="block text-xs text-muted">behaald op {new Date(has.earnedAt).toLocaleDateString('nl-NL')}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function DailyBars({ days, byDay }: { days: string[]; byDay: Map<string, DailyActivity> }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const data = days.map(d => ({ d, c: byDay.get(d)?.correct ?? 0, m: byDay.get(d)?.mistakes ?? 0 }))
  const max = Math.max(5, ...data.map(x => x.c + x.m))
  const W = 720, H = 180, pad = 24
  const bw = (W - pad) / data.length
  const y = (v: number) => H - pad - (v / max) * (H - pad - 8)
  if (table) {
    return (
      <div>
        <Legend onTable={() => setTable(false)} tableLabel="Grafiek" />
        <div className="max-h-64 overflow-auto text-sm"><table className="w-full tabular-nums"><thead className="text-xs text-muted"><tr><th className="text-left">Dag</th><th className="text-right">Goed</th><th className="text-right">Fout</th></tr></thead>
          <tbody>{data.filter(x => x.c + x.m).reverse().map(x => <tr key={x.d} className="border-t border-line"><td>{shortDate(x.d)}</td><td className="text-right">{x.c}</td><td className="text-right">{x.m}</td></tr>)}</tbody></table></div>
      </div>
    )
  }
  return (
    <div>
      <Legend onTable={() => setTable(true)} tableLabel="Tabel" />
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Goede zetten en fouten per dag" onMouseLeave={() => setHover(null)}>
          {[0.5, 1].map(f => <line key={f} x1={pad} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--chart-grid)" />)}
          <text x={0} y={y(max) + 4} fontSize="11" fill="var(--muted)">{max}</text>
          <text x={0} y={H - pad + 4} fontSize="11" fill="var(--muted)">0</text>
          {data.map((x, i) => {
            const bx = pad + i * bw + 1
            const w = Math.max(2, bw - 3)
            const hc = (x.c / max) * (H - pad - 8)
            const hm = (x.m / max) * (H - pad - 8)
            return (
              <g key={x.d} onMouseEnter={() => setHover(i)}>
                <rect x={pad + i * bw} y={0} width={bw} height={H - pad} fill="transparent" />
                {x.c > 0 && <rect x={bx} y={H - pad - hc} width={w} height={hc} rx={Math.min(3, w / 2)} fill="var(--chart-1)" />}
                {x.m > 0 && <rect x={bx} y={H - pad - hc - hm - (x.c ? 2 : 0)} width={w} height={hm} rx={Math.min(3, w / 2)} fill="var(--chart-2)" />}
                {(i === data.length - 1 || ((data.length - 1 - i) % 7 === 0 && data.length - 1 - i >= 7)) && <text x={i === data.length - 1 ? W : bx + w / 2} y={H - 6} fontSize="11" textAnchor={i === data.length - 1 ? 'end' : 'middle'} fill="var(--muted)">{shortDate(x.d)}</text>}
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg" style={{ left: `min(calc(${((hover + 0.5) / data.length) * 100}% ), calc(100% - 140px))` }}>
            <div className="font-semibold">{shortDate(data[hover].d)}</div>
            <div><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--chart-1)' }} />Goed: {data[hover].c}</div>
            <div><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--chart-2)' }} />Fout: {data[hover].m}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Legend({ onTable, tableLabel }: { onTable: () => void; tableLabel: string }) {
  return (
    <div className="mb-2 flex items-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-1)' }} />Goede zetten</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--chart-2)' }} />Fouten</span>
      <button className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center px-2 underline" onClick={onTable}>{tableLabel}</button>
    </div>
  )
}

function LineChart({ days, values }: { days: string[]; values: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 360, H = 150, pad = 22, top = 22
  const max = Math.max(5, ...values)
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (W - pad - 6)
  const y = (v: number) => H - pad - (v / max) * (H - pad - top)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulatief geleerde posities"
        onMouseMove={e => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const i = Math.round(((e.clientX - r.left) / r.width * W - pad) / (W - pad - 6) * (values.length - 1))
          setHover(Math.max(0, Math.min(values.length - 1, i)))
        }}
        onMouseLeave={() => setHover(null)}>
        <line x1={pad} x2={W} y1={y(max)} y2={y(max)} stroke="var(--chart-grid)" />
        <line x1={pad} x2={W} y1={y(0)} y2={y(0)} stroke="var(--chart-grid)" />
        <text x={0} y={y(max) + 4} fontSize="11" fill="var(--muted)">{max}</text>
        <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" />
        {hover !== null && <>
          <line x1={x(hover)} x2={x(hover)} y1={8} y2={H - pad} stroke="var(--muted)" strokeDasharray="3 3" />
          <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
        </>}
        <text x={pad} y={H - 6} fontSize="11" fill="var(--muted)">{shortDate(days[0])}</text>
        <text x={W - 6} y={H - 6} fontSize="11" textAnchor="end" fill="var(--muted)">{shortDate(days[days.length - 1])}</text>
        <text x={x(values.length - 1)} y={y(values[values.length - 1]) - 6} fontSize="11" textAnchor="end" fill="var(--ink)" fontWeight={600}>{values[values.length - 1]}</text>
      </svg>
      {hover !== null && <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow">{shortDate(days[hover])}: <b>{values[hover]}</b> posities</div>}
    </div>
  )
}

function Heatmap({ byDay }: { byDay: Map<string, DailyActivity> }) {
  const days = lastDays(16 * 7)
  const max = Math.max(1, ...days.map(d => (byDay.get(d)?.correct ?? 0) + (byDay.get(d)?.mistakes ?? 0)))
  const offset = (new Date(days[0] + 'T12:00:00').getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...days]
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: 'minmax(0, 1fr)' }}>
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const a = byDay.get(d)
          const n = (a?.correct ?? 0) + (a?.mistakes ?? 0)
          const level = n === 0 ? 0 : Math.ceil((n / max) * 4)
          return <span key={d} title={`${shortDate(d)}: ${n} zetten${a?.dailyCompleted ? ' · Daily Training voltooid' : ''}`} className="aspect-square rounded-[3px]" style={{ background: level ? 'var(--chart-1)' : 'var(--surface-2)', opacity: level ? 0.25 + level * 0.1875 : 1 }} />
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted">minder {[0, 1, 2, 3, 4].map(l => <span key={l} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: l ? 'var(--chart-1)' : 'var(--surface-2)', opacity: l ? 0.25 + l * 0.1875 : 1 }} />)} meer</div>
    </div>
  )
}
