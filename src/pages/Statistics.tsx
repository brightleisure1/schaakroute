import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Brain, ChartColumn, ChartNoAxesCombined, Check, Flame, Lock, Sun, Timer, X, type LucideIcon } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today, type DailyActivity } from '../lib/db'
import { familyProgress, useCardMap, useFamilies, useManifest, useProgressMap, variationMastery } from '../lib/hooks'
import { BADGES, levelFromXp } from '../lib/gamification'
import { streak, totalXp } from '../lib/progress'
import { stageOf } from '../lib/srs'
import { displayName } from '../lib/data'
import { PageHeader, Spinner, Stars, nf, pct } from '../components/ui'
import { EmptyKnight } from '../components/PieceMotion'
import { ThickBar } from '../components/OpeningScreens'
import { IconTile, type Tone } from '../components/SettingsList'

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
const CARD = 'rounded-[18px] border-2 border-line bg-surface p-4'

/** Eerste keer (ontwerp 16b): één uitnodiging en wat er straks komt, in plaats van lege grafieken */
function FirstTimeStats() {
  const soon: { icon: LucideIcon; label: string }[] = [
    { icon: ChartColumn, label: 'Goed en fout per dag' },
    { icon: Brain, label: 'Geleerde posities' },
    { icon: ChartNoAxesCombined, label: 'Beheersing per opening' },
  ]
  return (
    <div className="space-y-5 lg:max-w-xl">
      <section className={`${CARD} flex flex-col items-center gap-2 p-5! text-center`} aria-labelledby="stats-first-title">
        <EmptyKnight size={56} className="mb-1 bg-brand-soft" />
        <h2 id="stats-first-title" className="text-lg font-extrabold">Hier komt je voortgang</h2>
        <p className="max-w-sm text-sm leading-snug text-muted">Na je eerste training zie je hier je reeks, je goede zetten en wat je hebt geleerd.</p>
        <Link to="/dagelijks" className="btn btn-primary mt-2 w-full"><Sun size={20} aria-hidden />Start de dagtraining</Link>
      </section>
      <section aria-labelledby="stats-soon-title">
        <h2 id="stats-soon-title" className="mb-2 px-0.5 text-xs font-bold uppercase tracking-[0.05em] text-muted">Komt vrij na je eerste training</h2>
        <ul className="divide-y-2 divide-line overflow-hidden rounded-[18px] border-2 border-line bg-surface">
          {soon.map(({ icon: Icon, label }) => (
            <li key={label} className="flex min-h-15 items-center gap-3 px-3.5 py-3 text-muted">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2"><Icon size={18} /></span>
              <span className="min-w-0 flex-1 font-semibold">{label}<span className="sr-only"> (nog op slot)</span></span>
              <Lock size={16} aria-hidden className="shrink-0" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
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
  const [range, setRange] = useState<'14' | '30' | '90'>('14')

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
        <FirstTimeStats />
      </div>
    )
  }

  const days = lastDays(Number(range))
  const fileList = families.data ?? []
  const famRows = fileList
    .map(f => ({ f, p: familyProgress(f, progress, cards) }))
    .filter(x => x.p.learned > 0 || x.p.positions > 0)
    .sort((a, b) => b.p.pct - a.p.pct || b.p.score - a.p.score)
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

  const lvl = levelFromXp(xp)
  const attempts = totals.correct + totals.mistakes

  return (
    <div className="space-y-4">
      <PageHeader title="Statistieken" />

      <div className="grid gap-4 lg:grid-cols-2">
        <StreakHero current={st.current} best={st.best} xp={xp} level={lvl.level} progress={lvl.progress} toNext={lvl.next - xp} />
        <ul className="grid grid-cols-2 gap-2.5">
          <Tile icon={Check} tone="brand" label="Goede zetten" value={nf(totals.correct)} />
          <Tile icon={X} tone="danger" label="Fouten" value={nf(totals.mistakes)} />
          <Tile icon={Brain} tone="info" label="Geleerde posities" value={nf(learned)} />
          <Tile icon={Timer} tone="accent" label="Trainingstijd" {...trainingTime(totals.seconds)} />
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CorrectBars byDay={byDay} />
        <section className={CARD} aria-labelledby="heatmap-title">
          <h2 id="heatmap-title" className="text-[15px] font-bold">Activiteit · 16 weken</h2>
          <Heatmap byDay={byDay} />
        </section>
      </div>

      {/* Ontwerp 12h: dezelfde kaarten als bovenaan, periode als pillen, staafjes met fouten bovenop */}
      <section className={`${CARD} flex flex-col gap-3`} aria-labelledby="daily-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="daily-title" className="min-w-0 text-[15px] font-bold leading-tight">Goed en fout per dag</h2>
          <div className="flex shrink-0 gap-2" role="group" aria-label="Periode">
            {RANGES.map(r => (
              <button key={r} type="button" className={`pill ${range === r ? 'pill-on' : 'font-medium!'}`} aria-pressed={range === r} onClick={() => setRange(r)}>
                {r} d<span className="sr-only">agen</span>
              </button>
            ))}
          </div>
        </div>
        <DailyBars days={days} byDay={byDay} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <LearnedChart days={days} values={cumulative} />
        <div className={CARD}>
          <h2 className="mb-2 text-[15px] font-bold">Meer cijfers</h2>
          <dl className="divide-y-2 divide-surface-2 text-sm">
            <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-muted">Nauwkeurigheid</dt><dd className="font-bold tabular-nums">{attempts ? pct(totals.correct / attempts) : '–'}</dd></div>
            <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-muted">Herhalingen</dt><dd className="font-bold tabular-nums">{nf(totals.reviews)}</dd></div>
            <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-muted">Posities met interval ≥ 7 dagen</dt><dd className="font-bold tabular-nums">{nf(mature)}</dd></div>
            <div className="flex min-h-11 items-center justify-between gap-3"><dt className="text-muted">Volgend level</dt><dd className="font-bold tabular-nums">nog {nf(lvl.next - xp)} XP</dd></div>
          </dl>
        </div>
      </section>

      <section className={CARD}>
        <h2 className="mb-1 text-[15px] font-bold">Beheersing per opening</h2>
        {famRows.length === 0 ? <p className="text-sm text-muted">Nog geen opening getraind.</p> : (
          <ul className="divide-y-2 divide-surface-2">
            {famRows.map(({ f, p }) => (
              <li key={f.family.id} className="pb-2.5 pt-1 last:pb-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <Link to={`/opening/${f.family.id}`} className="inline-flex min-h-10 min-w-0 items-center font-bold hover:underline"><span className="truncate">{f.family.name}</span></Link>
                  <span className="shrink-0 tabular-nums text-muted">{nf(p.learned)} van {nf(p.total)}<span className="sr-only"> varianten geleerd, {p.positions} posities</span></span>
                </div>
                <ThickBar value={p.pct} size="lg" label={`${f.family.name}: ${p.learned} van ${p.total} varianten geleerd`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <h2 className="mb-3 text-[15px] font-bold">Moeilijkste varianten</h2>
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
        <div className={CARD}>
          <h2 className="mb-3 text-[15px] font-bold">Beheersing per variant</h2>
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

      <section className={CARD}>
        <h2 className="mb-3 text-[15px] font-bold">Prestaties ({badges.length}/{BADGES.length})</h2>
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

const RANGES = ['14', '30', '90'] as const

function DailyBars({ days, byDay }: { days: string[]; byDay: Map<string, DailyActivity> }) {
  const [table, setTable] = useState(false)
  const data = days.map(d => ({ d, c: byDay.get(d)?.correct ?? 0, m: byDay.get(d)?.mistakes ?? 0 }))
  const max = Math.max(5, ...data.map(x => x.c + x.m))
  const H = 96
  const gap = data.length <= 14 ? 5 : data.length <= 30 ? 3 : 1
  const totalC = data.reduce((a, x) => a + x.c, 0)
  const totalM = data.reduce((a, x) => a + x.m, 0)
  return (
    <div>
      {table ? (
        <div className="max-h-64 overflow-auto text-sm"><table className="w-full tabular-nums"><thead className="text-xs text-muted"><tr><th className="text-left">Dag</th><th className="text-right">Goed</th><th className="text-right">Fout</th></tr></thead>
          <tbody>{data.filter(x => x.c + x.m).reverse().map(x => <tr key={x.d} className="border-t border-line"><td>{shortDate(x.d)}</td><td className="text-right">{x.c}</td><td className="text-right">{x.m}</td></tr>)}</tbody></table></div>
      ) : (
        <>
          <div className="flex items-end" style={{ height: H, gap }} role="img" aria-label={`Laatste ${data.length} dagen: ${nf(totalC)} goede zetten en ${nf(totalM)} fouten`}>
            {data.map(x => {
              const hm = Math.round((x.m / max) * H)
              const hc = Math.round((x.c / max) * H)
              return (
                <span key={x.d} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px]" title={`${shortDate(x.d)}: ${x.c} goed, ${x.m} fout`}>
                  {x.m > 0 && <span className="rounded-[4px] bg-(--chart-2)" style={{ height: Math.max(3, hm) }} />}
                  <span className={`rounded-[4px] ${x.c ? 'bg-(--chart-1)' : 'bg-surface-2'}`} style={{ height: x.c ? Math.max(3, hc) : 3 }} />
                </span>
              )
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden><span>{shortDate(data[0].d)}</span><span>vandaag</span></div>
        </>
      )}
      <div className="mt-2 flex items-center gap-3.5 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-(--chart-1)" aria-hidden />Goede zetten</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-(--chart-2)" aria-hidden />Fouten</span>
        <button type="button" className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-end px-1 text-xs font-semibold underline" onClick={() => setTable(t => !t)}>{table ? 'Grafiek' : 'Tabel'}</button>
      </div>
    </div>
  )
}

/** Geleerde posities (ontwerp 12h): het aantal groot rechtsboven, daaronder een gevlakte lijn met een punt op vandaag */
function LearnedChart({ days, values }: { days: string[]; values: number[] }) {
  const W = 322, H = 70, top = 8
  const last = values[values.length - 1] ?? 0
  const max = Math.max(5, ...values)
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * (W - 6)
  const y = (v: number) => H - 1 - (v / max) * (H - 1 - top)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <section className={CARD} aria-labelledby="learned-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="learned-title" className="text-[15px] font-bold">Geleerde posities</h2>
        <span className="text-xl font-extrabold tabular-nums">{nf(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2.5 block w-full" role="img" aria-label={`Geleerde posities: ${nf(values[0] ?? 0)} op ${shortDate(days[0])}, ${nf(last)} vandaag`}>
        <polygon points={`0,${H} ${pts} ${x(values.length - 1).toFixed(1)},${H}`} fill="var(--brand-soft)" />
        <polyline points={pts} fill="none" stroke="var(--chart-1)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r={5} fill="var(--chart-1)" stroke="var(--surface)" strokeWidth={2} />
      </svg>
      <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden><span>{shortDate(days[0])}</span><span>vandaag</span></div>
    </section>
  )
}

function Heatmap({ byDay }: { byDay: Map<string, DailyActivity> }) {
  const days = lastDays(16 * 7)
  const count = (d: string) => (byDay.get(d)?.correct ?? 0) + (byDay.get(d)?.mistakes ?? 0)
  const max = Math.max(1, ...days.map(count))
  const active = days.filter(d => count(d) > 0).length
  const offset = (new Date(days[0] + 'T12:00:00').getDay() + 6) % 7
  const cells = [...Array(offset).fill(null), ...days]
  return (
    <div className="mt-3">
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: 'minmax(0, 1fr)' }} role="img" aria-label={`${active} van de ${days.length} dagen getraind`}>
        {cells.map((d, i) => {
          if (!d) return <span key={i} />
          const a = byDay.get(d)
          const n = count(d)
          const level = n === 0 ? 0 : Math.ceil((n / max) * 3)
          return <span key={d} title={`${shortDate(d)}: ${n} zetten${a?.dailyCompleted ? ' · dagtraining voltooid' : ''}`} className="aspect-square rounded-[4px]" style={{ background: HEAT[level] }} />
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted" aria-hidden>minder {HEAT.map(c => <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />)} meer</div>
    </div>
  )
}

/** Kleurtrappen van de activiteitskaart; mengt met de tokens, dus licht en donker kloppen allebei */
const HEAT = [
  'var(--surface-2)',
  'color-mix(in srgb, var(--chart-1) 28%, var(--surface-2))',
  'color-mix(in srgb, var(--chart-1) 60%, var(--surface-2))',
  'var(--chart-1)',
]

/** Grote reekskaart bovenaan: dagen op rij, record, level en XP. Vaste donkergroene kaart, leesbaar in licht en donker. */
function StreakHero({ current, best, xp, level, progress, toNext }: { current: number; best: number; xp: number; level: number; progress: number; toNext: number }) {
  return (
    <section aria-label="Reeks en level" className="flex items-center gap-4 rounded-[22px] bg-[#1f4d33] p-[18px] text-white dark:ring-2 dark:ring-[#2a6e46]">
      <Flame size={52} strokeWidth={2} aria-hidden className="shrink-0 text-[#e9b44c]" />
      <div className="min-w-0 flex-1">
        <div className="text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{current} {current === 1 ? 'dag' : 'dagen'}</div>
        <div className="mt-1 text-sm text-[#d5e6db]">{current ? 'op rij' : 'train vandaag om te beginnen'} · record {best}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs font-bold uppercase tracking-[0.04em] text-[#e9b44c]">Level {level}</div>
        <div className="text-lg font-extrabold tabular-nums">{nf(xp)} XP</div>
        <div className="ml-auto mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Nog ${nf(toNext)} XP tot level ${level + 1}`}>
          <div className="h-full rounded-full bg-[#e9b44c]" style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }} />
        </div>
      </div>
    </section>
  )
}

function Tile({ icon, tone, label, value, sr }: { icon: LucideIcon; tone: Tone; label: string; value: string; sr?: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-2xl border-2 border-line bg-surface p-3">
      <IconTile icon={icon} tone={tone} size="lg" />
      <span className="min-w-0">
        <span className="block text-[19px] font-extrabold leading-tight tabular-nums">
          {sr ? <><span aria-hidden>{value}</span><span className="sr-only">{sr}</span></> : value}
        </span>
        <span className="block text-xs text-muted">{label}</span>
      </span>
    </li>
  )
}

/** "3 u 12" zoals in het ontwerp; voorgelezen als "3 uur 12 minuten" */
function trainingTime(seconds: number): { value: string; sr: string } {
  const m = Math.round(seconds / 60)
  if (m < 60) return { value: `${m} min`, sr: `${m} ${m === 1 ? 'minuut' : 'minuten'}` }
  const h = Math.floor(m / 60)
  const r = m % 60
  return { value: `${h} u ${String(r).padStart(2, '0')}`, sr: `${h} uur ${r} ${r === 1 ? 'minuut' : 'minuten'}` }
}

/** Goede zetten per dag, laatste 14 dagen (eenvoudige staafjes zoals in het ontwerp) */
function CorrectBars({ byDay }: { byDay: Map<string, DailyActivity> }) {
  const days = lastDays(14)
  const vals = days.map(d => byDay.get(d)?.correct ?? 0)
  const max = Math.max(1, ...vals)
  const total = vals.reduce((a, v) => a + v, 0)
  const H = 72
  return (
    <section className={CARD} aria-labelledby="bars-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="bars-title" className="text-[15px] font-bold">Goede zetten per dag</h2>
        <span className="text-[13px] text-muted">14 dagen</span>
      </div>
      <div className="mt-3.5 flex items-end gap-[5px]" style={{ height: H }} role="img" aria-label={`${nf(total)} goede zetten in de laatste 14 dagen, vandaag ${nf(vals[vals.length - 1])}`}>
        {vals.map((v, i) => (
          <span key={days[i]} title={`${shortDate(days[i])}: ${v} goede zetten`} className="flex-1 rounded-[5px]" style={{ height: v ? Math.max(6, Math.round((v / max) * H)) : 4, background: v ? 'var(--chart-1)' : 'var(--surface-2)' }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden><span>{shortDate(days[0])}</span><span>vandaag</span></div>
    </section>
  )
}
