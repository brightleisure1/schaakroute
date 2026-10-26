import { useEffect, useMemo, useState } from 'react'
import { Repeat } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TrainingCard } from '../lib/db'
import { cardLine, variationLine } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { useAsync, useCardMap, useFamilies, useManifest, useProgressMap, variationMastery } from '../lib/hooks'
import { DAY, masteryScore, stageOf } from '../lib/srs'
import { endSession, startSession } from '../lib/progress'
import { Trainer } from '../components/Trainer'
import { CropBoard } from '../components/CropBoard'
import { Empty, FocusBar, ProgressBar, Spinner, Tabs, plural, useSettings, useTrainingFocus } from '../components/ui'
import type { FamilyFile, Variation } from '../lib/types'

export function Mastery() {
  const [search, setSearch] = useSearchParams()
  const type = (search.get('type') as 'positions' | 'lines') ?? 'positions'
  const family = search.get('family') ?? ''
  const { data: manifest } = useManifest()
  const [session, setSession] = useState(false)
  useTrainingFocus(session)
  return (
    <div>
      {!session && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Herhalen</h1>
            <p className="mt-1 text-muted">Herhaal wat je bijna vergeet.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="shrink-0 [&_button]:whitespace-nowrap"><Tabs value={type} onChange={t => setSearch({ type: t, ...(family ? { family } : {}) })} options={[{ value: 'positions', label: 'Losse posities' }, { value: 'lines', label: 'Complete varianten' }]} /></div>
            {manifest && (
              <select className="input sm:w-56" value={family} onChange={e => setSearch({ type, ...(e.target.value ? { family: e.target.value } : {}) })} aria-label="Filter op opening">
                <option value="">Alle openingen</option>
                {manifest.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
        </div>
      )}
      {type === 'positions' ? <PositionReview key={family} family={family} onSession={setSession} /> : <LineReview key={family} family={family} onSession={setSession} />}
    </div>
  )
}

function PositionReview({ family, onSession }: { family: string; onSession: (on: boolean) => void }) {
  const [queue, setQueue] = useState<TrainingCard[] | null>(null)
  const [started, setStarted] = useState(false)
  const [extra, setExtra] = useState(false)
  const [index, setIndex] = useState(0)
  const [stats, setStats] = useState({ good: 0, bad: 0 })
  const [sessionId, setSessionId] = useState<number>()
  const [files, setFiles] = useState<Map<string, FamilyFile>>(new Map())
  const dueCount = useLiveQuery(() => db.cards.where('dueAt').belowOrEqual(Date.now()).filter(c => !c.suspended && (!family || c.familyIds.includes(family))).count(), [family], 0)

  async function build(extraMode: boolean) {
    const all = await db.cards.toArray()
    const mine = all.filter(c => !c.suspended && (!family || c.familyIds.includes(family)))
    const now = Date.now()
    const list = extraMode
      ? mine.sort((a, b) => masteryScore(a) - masteryScore(b)).slice(0, 20)
      : mine.filter(c => c.dueAt <= now).sort((a, b) => b.lapses - a.lapses || a.dueAt - b.dueAt).slice(0, 50)
    await begin(list, extraMode)
  }
  async function begin(list: TrainingCard[], extraMode: boolean) {
    setQueue(list)
    setIndex(0)
    setExtra(extraMode)
    const ids = [...new Set(list.flatMap(c => c.familyIds.slice(0, 1)))]
    const loaded = await Promise.all(ids.map(id => loadFamily(id).catch(() => null)))
    setFiles(new Map(loaded.filter(Boolean).map(f => [f!.family.id, f!])))
  }
  useEffect(() => { build(false) }, [family]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let sid: number | undefined
    startSession('review').then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [])

  const inSession = started && !!queue && index < queue.length
  useEffect(() => { onSession(inSession) }, [inSession, onSession])
  const startWith = (list: TrainingCard[], extraMode: boolean) => { void begin(list, extraMode); setStarted(true) }

  // Overzicht (ontwerp 6b/6d): geheugen per stadium, herhalingen per dag en de zwakste posities
  const cardMap = useCardMap()
  const overview = useMemo(() => {
    // Zelfde posities als de herhaalwachtrij: alles wat je al eens gespeeld hebt (ook alleen fout)
    const mine = [...cardMap.values()].filter(c => !c.suspended && c.correct + c.wrong > 0 && (!family || c.familyIds.includes(family)))
    const stages = { learning: 0, young: 0, mature: 0 }
    for (const c of mine) { const st = stageOf(c); stages[st === 'new' ? 'learning' : st]++ }
    const day0 = new Date()
    day0.setHours(0, 0, 0, 0)
    const t0 = day0.getTime()
    const forecast = Array.from({ length: 7 }, (_, d) => ({
      label: d === 0 ? 'Vandaag' : new Date(t0 + d * DAY).toLocaleDateString('nl-NL', { weekday: 'short' }).replace('.', ''),
      n: mine.filter(c => (d === 0 ? c.dueAt < t0 + DAY : c.dueAt >= t0 + d * DAY && c.dueAt < t0 + (d + 1) * DAY)).length,
    }))
    const weakest = [...mine].sort((a, b) => masteryScore(a) - masteryScore(b))
    return { mine, stages, forecast, weakest }
  }, [cardMap, family])
  const weakFiles = useFamilies([...new Set(overview.weakest.slice(0, 4).map(c => c.familyIds[0]).filter(Boolean))])

  if (!queue) return <Spinner />
  // Startscherm: de tabbalk blijft zichtbaar tot je echt begint
  if (!started) {
    const left = Math.max(0, queue.length - index)
    const { mine, stages, forecast, weakest } = overview
    if (!mine.length) {
      return <Empty title="Nog geen geleerde posities" action={<Link to="/dagelijks" className="btn btn-primary">Start de dagtraining</Link>}>Posities komen hier terug zodra je ze geleerd hebt in de dagtraining of de cursus.</Empty>
    }
    const max = Math.max(1, ...forecast.map(f => f.n))
    const stageRows = [
      { key: 'learning', label: 'Lerend', hint: 'komt binnen een dag terug', n: stages.learning, c: 'bg-accent' },
      { key: 'young', label: 'Jong', hint: 'interval 1 tot 7 dagen', n: stages.young, c: 'bg-(--board-dark)' },
      { key: 'mature', label: 'Vast', hint: 'al 7+ dagen vast', n: stages.mature, c: 'bg-brand' },
    ]
    const fileMap = new Map((weakFiles.data ?? []).map(f => [f.family.id, f]))
    return (
      <div className="space-y-5 lg:space-y-6">
        <section className="card overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col p-5 lg:p-8">
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-extrabold leading-[0.9] tracking-tight tabular-nums lg:text-7xl">{left}</span>
              <span className="text-lg font-bold leading-tight lg:text-xl">{left === 1 ? 'positie' : 'posities'}<br />{extra && left ? 'om te oefenen' : 'om te herhalen'}</span>
            </div>
            <p className="mt-3 text-muted">{left ? (index > 0 ? 'Je gaat verder waar je was.' : 'Vind telkens de zet die je eerder leerde. Eerdere fouten komen eerst.') : 'Niets openstaand. Oefen je zwakste posities, of kom later terug.'}</p>
            <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row sm:flex-wrap">
              {left > 0 && <button className="btn btn-primary min-h-13 px-6 text-base" onClick={() => setStarted(true)} autoFocus><Repeat size={20} aria-hidden />{index > 0 ? 'Ga verder' : 'Start herhalen'}</button>}
              <button className={`btn ${left ? 'btn-ghost' : 'btn-primary'} min-h-12`} onClick={() => startWith(weakest.slice(0, 20), true)}>Oefen je {Math.min(20, weakest.length)} zwakste posities</button>
            </div>
          </div>
          <div className="space-y-6 border-line bg-bg p-5 max-lg:border-t lg:border-l lg:p-8">
            <div>
              <div className="flex items-baseline justify-between gap-3"><h2 className="font-bold">Je geheugen</h2><span className="text-sm text-muted">{plural(mine.length, 'positie', 'posities')}</span></div>
              <div className="mt-3 flex h-2.5 gap-[3px] lg:h-3" aria-hidden>
                {stageRows.filter(r => r.n).map(r => <span key={r.key} className={`rounded-full ${r.c}`} style={{ width: `${(r.n / mine.length) * 100}%` }} />)}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 lg:gap-3">
                {stageRows.map(r => (
                  <div key={r.key}>
                    <dt className="flex items-center gap-1.5 text-sm text-muted"><span className={`h-2 w-2 rounded-full ${r.c}`} aria-hidden />{r.label}</dt>
                    <dd className="text-lg font-bold tabular-nums lg:text-xl">{r.n}</dd>
                    <dd className="hidden text-xs text-muted lg:block">{r.hint}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="font-bold">Komende 7 dagen</h2>
              <ol className="mt-3 grid grid-cols-7 items-end gap-1.5 lg:gap-2">
                {forecast.map((f, i) => (
                  <li key={i} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold tabular-nums">{f.n}<span className="sr-only"> herhalingen {f.label === 'Vandaag' ? 'vandaag' : `op ${f.label}`}</span></span>
                    <span className="flex h-14 w-full items-end" aria-hidden><span className={`w-full rounded-t-md rounded-b-sm ${i === 0 ? 'bg-accent' : 'bg-brand/25'}`} style={{ height: `${Math.max(6, (f.n / max) * 100)}%` }} /></span>
                    <span className="text-xs text-muted first-letter:uppercase" aria-hidden>{f.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
        <section aria-labelledby="weak-title">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="weak-title" className="text-lg font-bold lg:text-xl">Zwakste posities</h2><span className="text-sm text-muted">laagste beheersing eerst</span></div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {weakest.slice(0, 4).map(c => {
              const f = fileMap.get(c.familyIds[0])
              const v = f?.variations.find(x => x.id === c.variationIds[0])
              const score = masteryScore(c)
              const title = v?.path[v.path.length - 1] ?? f?.family.name ?? 'Positie'
              return (
                <button key={c.id} className="card flex flex-col gap-3 p-2.5 text-left transition hover:border-brand sm:p-3" onClick={() => startWith([c], true)} aria-label={`Oefen ${title}, beheersing ${score}%`}>
                  <CropBoard epd={c.epd} uci={c.lineUci} orientation={c.side} inset={4} />
                  <span className="block w-full px-0.5">
                    <span className="flex items-center justify-between gap-2"><span className="truncate font-bold">{title}</span>{c.lapses > 0 && <span className="shrink-0 rounded-full bg-danger-soft px-2 text-xs font-bold text-danger-ink">{c.lapses}× fout</span>}</span>
                    <span className="block truncate text-xs text-muted">{f ? `${f.family.name}${v ? ` · ${v.eco}` : ''}` : '…'}</span>
                    <span className="mt-2.5 flex items-center gap-2"><ProgressBar value={score / 100} tone="accent" className="flex-1" /><span className="text-xs font-bold tabular-nums">{score}%</span></span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      </div>
    )
  }
  if (index >= queue.length) {
    return queue.length ? (
      <div className="card mx-auto max-w-md p-6 text-center animate-pop">
        <h2 className="mt-2 text-xl font-bold">{extra ? 'Extra oefening klaar' : 'Alle herhalingen gedaan!'}</h2>
        <p className="mt-1 text-muted">{stats.good} direct goed · {stats.bad} met fouten</p>
        <div className="mt-4 grid gap-2">
          {dueCount > 0 && <button className="btn btn-primary" onClick={() => { void build(false); setStarted(true) }}>Nog {dueCount} openstaand</button>}
          <button className="btn btn-ghost" onClick={() => { void build(true); setStarted(true) }}>Oefen je 20 zwakste posities</button>
          <Link to="/" className="btn btn-ghost">Naar het dashboard</Link>
        </div>
      </div>
    ) : (
      <Empty title="Geen openstaande herhalingen" action={<button className="btn btn-primary" onClick={() => { void build(true); setStarted(true) }}>Oefen toch je zwakste posities</button>}>
        Posities komen hier terug zodra hun herhaaldatum is bereikt. Leer eerst varianten in de cursus of bij Varianten.
      </Empty>
    )
  }
  const card = queue[index]
  const file = files.get(card.familyIds[0])
  const v = file?.variations.find(x => x.id === card.variationIds[0])
  const line = { ...cardLine(card, v ? `Vind de zet: ${v.path.join(', ') || file!.family.name}` : 'Vind de zet'), subtitle: file?.family.name }
  return (
    <div>
    <FocusBar value={index / queue.length} count={`${index + 1} / ${queue.length}`} sub={extra ? 'Zwakste posities' : 'Herhalen'} onClose={() => setStarted(false)} closeLabel="Stoppen, je gaat later verder" />
    <Trainer
      key={card.id + index}
      line={line}
      mode="review"
      family={file}
      sessionId={sessionId}
      autoIntro={false}
      onComplete={r => setStats(s => ({ good: s.good + (r.mistakes + r.hints + r.shown === 0 ? 1 : 0), bad: s.bad + (r.mistakes + r.hints + r.shown > 0 ? 1 : 0) }))}
      renderEnd={() => (
        <button className="btn btn-primary min-h-12" autoFocus onClick={() => setIndex(i => i + 1)}>{index + 1 < queue.length ? 'Volgende positie' : 'Afronden'}</button>
      )}
    />
    </div>
  )
}

function LineReview({ family, onSession }: { family: string; onSession: (on: boolean) => void }) {
  const settings = useSettings()
  const { data: manifest } = useManifest()
  const ids = family ? [family] : settings?.openings.length ? settings.openings : manifest?.families.map(f => f.id) ?? []
  const files = useAsync(() => Promise.all(ids.map(loadFamily)), [ids.join(',')])
  const progress = useProgressMap()
  const cards = useCardMap()
  const [current, setCurrent] = useState<{ file: FamilyFile; v: Variation } | null>(null)
  const [sessionId, setSessionId] = useState<number>()
  useEffect(() => {
    let sid: number | undefined
    startSession('mastery').then(s => { sid = s; setSessionId(s) })
    return () => { if (sid) endSession(sid, {}) }
  }, [])

  const learned = useMemo(() => {
    const out: { file: FamilyFile; v: Variation; score: number; due: boolean }[] = []
    const now = Date.now()
    const dueVariations = new Set<string>()
    for (const c of cards.values()) if (c.dueAt <= now) for (const id of c.variationIds) dueVariations.add(id)
    for (const f of files.data ?? []) {
      for (const v of f.variations) {
        const p = progress.get(v.id)
        if (!p?.completions) continue
        const m = variationMastery(v, f.family.side, cards, p)
        const due = dueVariations.has(v.id)
        out.push({ file: f, v, score: m.score, due })
      }
    }
    return out.sort((a, b) => Number(b.due) - Number(a.due) || a.score - b.score)
  }, [files.data, progress, cards])

  useEffect(() => { onSession(!!current) }, [current, onSession])

  if (files.loading || !settings) return <Spinner />
  if (current) {
    const idx = learned.findIndex(x => x.v.id === current.v.id)
    const next = learned[(idx + 1) % Math.max(1, learned.length)]
    return (
      <div>
        <FocusBar value={Math.max(0, idx) / Math.max(1, learned.length)} count={`${Math.max(0, idx) + 1} / ${learned.length}`} sub="Complete varianten" onClose={() => setCurrent(null)} closeLabel="Terug naar het overzicht" />
        <Trainer
          key={current.v.id + sessionId}
          line={variationLine(current.file, current.v)}
          mode="mastery"
          family={current.file}
          sessionId={sessionId}
          autoIntro={false}
          renderEnd={(_r, restart) => (
            <>
              {next && next.v.id !== current.v.id && <button className="btn btn-primary min-h-12" autoFocus onClick={() => setCurrent({ file: next.file, v: next.v })}>Volgende variant: {next.v.path.join(', ') || next.file.family.name}</button>}
              <button className="btn btn-ghost min-h-11" onClick={restart}>Nog een keer</button>
              <button className="btn btn-ghost min-h-11" onClick={() => setCurrent(null)}>Overzicht</button>
            </>
          )}
        />
      </div>
    )
  }
  if (!learned.length) return <Empty title="Nog geen geleerde varianten" action={<Link to="/openingen" className="btn btn-primary">Begin met leren</Link>}>Speel een variant eerst één keer helemaal uit in de cursus of bij Varianten. Daarna kun je hem hier uit je hoofd spelen.</Empty>
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{learned.length} geleerde varianten · {learned.filter(x => x.due).length} te herhalen</p>
        <button className="btn btn-primary" onClick={() => setCurrent({ file: learned[0].file, v: learned[0].v })}>Start</button>
      </div>
      <ul className="card divide-y divide-line">
        {learned.slice(0, 200).map(x => (
          <li key={x.v.id}>
            <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => setCurrent({ file: x.file, v: x.v })}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.v.path.join(', ') || x.file.family.name}</span><span className="text-xs text-muted">{x.file.family.name} · {x.v.eco}</span></span>
              {x.due && <span className="chip !text-xs !text-accent-ink">herhalen</span>}
              <span className="w-20"><ProgressBar value={x.score / 100} /><span className="text-xs text-muted">{x.score}% beheersing</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
