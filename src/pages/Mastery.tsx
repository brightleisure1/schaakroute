import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TrainingCard } from '../lib/db'
import { cardLine, variationLine } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { useAsync, useCardMap, useManifest, useProgressMap, variationMastery } from '../lib/hooks'
import { masteryScore } from '../lib/srs'
import { endSession, startSession } from '../lib/progress'
import { Trainer } from '../components/Trainer'
import { Empty, PageHeader, ProgressBar, Spinner, Tabs, useSettings } from '../components/ui'
import type { FamilyFile, Variation } from '../lib/types'

export function Mastery() {
  const [search, setSearch] = useSearchParams()
  const type = (search.get('type') as 'positions' | 'lines') ?? 'positions'
  const family = search.get('family') ?? ''
  const { data: manifest } = useManifest()
  return (
    <div>
      <PageHeader title="Mastery" subtitle="Spaced repetition (SM-2): wat je fout doet komt snel terug, wat je goed kent steeds later." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={type} onChange={t => setSearch({ type: t, ...(family ? { family } : {}) })} options={[{ value: 'positions', label: 'Losse posities' }, { value: 'lines', label: 'Complete varianten' }]} />
        {manifest && (
          <select className="input sm:max-w-xs" value={family} onChange={e => setSearch({ type, ...(e.target.value ? { family: e.target.value } : {}) })} aria-label="Filter op opening">
            <option value="">Alle openingen</option>
            {manifest.families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
      {type === 'positions' ? <PositionReview key={family} family={family} /> : <LineReview key={family} family={family} />}
    </div>
  )
}

function PositionReview({ family }: { family: string }) {
  const [queue, setQueue] = useState<TrainingCard[] | null>(null)
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

  if (!queue) return <Spinner />
  if (index >= queue.length) {
    return queue.length ? (
      <div className="card mx-auto max-w-md p-6 text-center animate-pop">
        <h2 className="mt-2 text-xl font-bold">{extra ? 'Extra oefening klaar' : 'Alle herhalingen gedaan!'}</h2>
        <p className="mt-1 text-muted">{stats.good} direct goed · {stats.bad} met fouten</p>
        <div className="mt-4 grid gap-2">
          {dueCount > 0 && <button className="btn btn-primary" onClick={() => build(false)}>Nog {dueCount} openstaand</button>}
          <button className="btn btn-ghost" onClick={() => build(true)}>Oefen je 20 zwakste posities</button>
          <Link to="/" className="btn btn-ghost">Naar het dashboard</Link>
        </div>
      </div>
    ) : (
      <Empty title="Geen openstaande herhalingen" action={<button className="btn btn-primary" onClick={() => build(true)}>Oefen toch je zwakste posities</button>}>
        Posities komen hier terug zodra hun herhaaldatum is bereikt. Leer eerst varianten in de Course of via Variations.
      </Empty>
    )
  }
  const card = queue[index]
  const file = files.get(card.familyIds[0])
  const v = file?.variations.find(x => x.id === card.variationIds[0])
  const line = { ...cardLine(card, v ? `Vind de zet — ${v.path.join(', ') || file!.family.name}` : 'Vind de zet'), subtitle: file?.family.name }
  return (
    <Trainer
      key={card.id + index}
      line={line}
      mode="review"
      family={file}
      sessionId={sessionId}
      autoIntro={false}
      header={<div className="mb-2"><ProgressBar value={index / queue.length} /><div className="mt-1 text-xs text-muted">Positie {index + 1} van {queue.length}{extra ? ' (extra)' : ''}</div></div>}
      onComplete={r => setStats(s => ({ good: s.good + (r.mistakes + r.hints + r.shown === 0 ? 1 : 0), bad: s.bad + (r.mistakes + r.hints + r.shown > 0 ? 1 : 0) }))}
      renderEnd={() => (
        <button className="btn btn-primary min-h-12" autoFocus onClick={() => setIndex(i => i + 1)}>{index + 1 < queue.length ? 'Volgende positie' : 'Afronden'}</button>
      )}
    />
  )
}

function LineReview({ family }: { family: string }) {
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

  if (files.loading || !settings) return <Spinner />
  if (current) {
    const idx = learned.findIndex(x => x.v.id === current.v.id)
    const next = learned[(idx + 1) % Math.max(1, learned.length)]
    return (
      <div>
        <button className="mb-3 text-sm text-muted hover:text-ink" onClick={() => setCurrent(null)}>← Terug naar het overzicht</button>
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
  if (!learned.length) return <Empty title="Nog geen geleerde varianten" action={<Link to="/openingen" className="btn btn-primary">Begin met leren</Link>}>Speel een variant eerst één keer helemaal uit in de Course of via Variations. Daarna kun je hem hier uit je hoofd spelen.</Empty>
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{learned.length} geleerde varianten · {learned.filter(x => x.due).length} met openstaande herhalingen. Geen hints: speel de hele variant vanaf de eerste zet.</p>
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
