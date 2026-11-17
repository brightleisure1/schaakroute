import { useEffect, useMemo, useRef, useState } from 'react'
import { Repeat, Sun } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type TrainingCard } from '../lib/db'
import { cardLine, variationLine } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { useAsync, useCardMap, useDueCount, useFamilies, useManifest, useProgressMap, variationMastery } from '../lib/hooks'
import { DAY, masteryScore, stageOf } from '../lib/srs'
import { endSession, startSession } from '../lib/progress'
import { Trainer } from '../components/Trainer'
import { AUTO_NEXT_MS } from '../lib/lessonPlan'
import { CropBoard } from '../components/CropBoard'
import { EmptyKnight } from '../components/PieceMotion'
import { Empty, FocusBar, ProgressBar, Spinner, Tabs, useSettings, useTrainingFocus } from '../components/ui'
import type { FamilyFile, Variation } from '../lib/types'
import { locale, t, tn, tr } from '../lib/i18n'
import { GAMES_FILTER, gameCardText, inReviewFilter } from '../lib/gameCards'

export function Mastery() {
  const [search, setSearch] = useSearchParams()
  const type = (search.get('type') as 'positions' | 'lines') ?? 'positions'
  const family = search.get('family') ?? ''
  const { data: manifest } = useManifest()
  const [session, setSession] = useState(false)
  useTrainingFocus(session)
  // Nog nooit iets geleerd: geen keuzes bovenaan, alleen uitleg en de ene knop (ontwerp 12g)
  const anyLearned = useLiveQuery(async () => (await db.cards.filter(c => !c.suspended && (c.correct + c.wrong > 0 || !!c.source)).first()) !== undefined, [], undefined)
  if (anyLearned === false) {
    return (
      <div className="lg:max-w-xl">
        <div className="mb-4">
          <h1 className="text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em] sm:text-3xl">{t('Herhalen')}</h1>
          <p className="mt-1 text-[15px] text-muted">{t('Herhaal wat je bijna vergeet.')}</p>
        </div>
        <ReviewEmpty />
      </div>
    )
  }
  return (
    <div>
      {!session && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('Herhalen')}</h1>
            <p className="mt-1 text-muted">{t('Herhaal wat je bijna vergeet.')}</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="shrink-0 [&_button]:whitespace-nowrap"><Tabs value={type} onChange={v => setSearch({ type: v, ...(family ? { family } : {}) })} options={[{ value: 'positions', label: t('Losse posities') }, { value: 'lines', label: t('Complete varianten') }]} /></div>
            {manifest && (
              <select className="input sm:w-56" value={family} onChange={e => setSearch({ type, ...(e.target.value ? { family: e.target.value } : {}) })} aria-label={t('Filter op opening')}>
                <option value="">{t('Alle openingen')}</option>
                <option value={GAMES_FILTER}>{t('Fouten uit je partijen')}</option>
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
  const [answered, setAnswered] = useState(-1) // index van de kaart die al beantwoord is
  const advanced = useRef(-1)
  // Verder naar de volgende kaart, maar nooit twee keer voor dezelfde (knop en automatisch tegelijk)
  const advance = (from: number) => { if (advanced.current === from) return; advanced.current = from; setIndex(from + 1) }
  const [sessionId, setSessionId] = useState<number>()
  const [files, setFiles] = useState<Map<string, FamilyFile>>(new Map())
  const dueCount = useDueCount(c => inReviewFilter(c, family), [family])

  async function build(extraMode: boolean) {
    const all = await db.cards.toArray()
    const mine = all.filter(c => !c.suspended && inReviewFilter(c, family))
    const now = Date.now()
    const list = extraMode
      ? mine.sort((a, b) => masteryScore(a) - masteryScore(b)).slice(0, 20)
      : mine.filter(c => c.dueAt <= now).sort((a, b) => b.lapses - a.lapses || a.dueAt - b.dueAt) // alles wat openstaat, zodat het getal klopt met het bolletje in het menu; stoppen kan altijd
    await begin(list, extraMode)
  }
  async function begin(list: TrainingCard[], extraMode: boolean) {
    setQueue(list)
    setIndex(0)
    advanced.current = -1
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
  // De training staat op dezelfde pagina: zonder dit begon hij halverwege gescrold en sprong hij daarna omhoog
  useEffect(() => { if (started) window.scrollTo({ top: 0 }) }, [started])
  useEffect(() => { onSession(inSession) }, [inSession, onSession])
  const startWith = (list: TrainingCard[], extraMode: boolean) => { void begin(list, extraMode); setStarted(true) }

  // Overzicht (ontwerp 6b/6d): geheugen per stadium, herhalingen per dag en de zwakste posities
  const cardMap = useCardMap()
  const overview = useMemo(() => {
    // Zelfde posities als de herhaalwachtrij: alles wat je al eens gespeeld hebt (ook alleen fout)
    const mine = [...cardMap.values()].filter(c => !c.suspended && (c.correct + c.wrong > 0 || !!c.source) && inReviewFilter(c, family))
    const stages = { learning: 0, young: 0, mature: 0 }
    for (const c of mine) { const st = stageOf(c); stages[st === 'new' ? 'learning' : st]++ }
    const day0 = new Date()
    day0.setHours(0, 0, 0, 0)
    const t0 = day0.getTime()
    const forecast = Array.from({ length: 7 }, (_, d) => ({
      label: d === 0 ? t('Vandaag') : new Date(t0 + d * DAY).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''),
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
    if (!mine.length) return family === GAMES_FILTER ? <GamesEmpty /> : <ReviewEmpty filtered={!!family} />
    const max = Math.max(1, ...forecast.map(f => f.n))
    const stageRows = [
      { key: 'learning', label: t('Lerend'), hint: t('komt binnen een dag terug'), n: stages.learning, c: 'bg-accent' },
      { key: 'young', label: t('Jong'), hint: t('interval 1 tot 7 dagen'), n: stages.young, c: 'bg-(--board-dark)' },
      { key: 'mature', label: t('Vast'), hint: t('al 7+ dagen vast'), n: stages.mature, c: 'bg-brand' },
    ]
    const fileMap = new Map((weakFiles.data ?? []).map(f => [f.family.id, f]))
    return (
      <div className="space-y-5 lg:space-y-6">
        <section className="card overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col p-5 lg:p-8">
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-extrabold leading-[0.9] tracking-tight tabular-nums lg:text-7xl">{left}</span>
              <span className="text-lg font-bold leading-tight lg:text-xl">{left === 1 ? t('positie') : t('posities')}<br />{extra && left ? t('om te oefenen') : t('om te herhalen')}</span>
            </div>
            <p className="mt-3 text-muted">{left ? (index > 0 ? t('Je gaat verder waar je was.') : t('Vind telkens de zet die je eerder leerde. Eerdere fouten komen eerst.')) : t('Niets openstaand. Oefen je zwakste posities, of kom later terug.')}</p>
            <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row sm:flex-wrap">
              {left > 0 && <button className="btn btn-primary min-h-13 px-6 text-base" onClick={() => setStarted(true)} autoFocus><Repeat size={20} aria-hidden />{index > 0 ? t('Ga verder') : t('Start herhalen')}</button>}
              <button className={`btn ${left ? 'btn-ghost' : 'btn-primary'} min-h-12`} onClick={() => startWith(weakest.slice(0, 20), true)}>{t('Oefen je {n} zwakste posities', { n: Math.min(20, weakest.length) })}</button>
            </div>
          </div>
          <div className="space-y-6 border-line bg-bg p-5 max-lg:border-t lg:border-l lg:p-8">
            <div>
              <div className="flex items-baseline justify-between gap-3"><h2 className="font-bold">{t('Je geheugen')}</h2><span className="text-sm text-muted">{tn(mine.length, '{n} positie', '{n} posities')}</span></div>
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
              <h2 className="font-bold">{t('Komende 7 dagen')}</h2>
              <ol className="mt-3 grid grid-cols-7 items-end gap-1.5 lg:gap-2">
                {forecast.map((f, i) => (
                  <li key={i} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold tabular-nums">{f.n}<span className="sr-only"> {i === 0 ? t('herhalingen vandaag') : t('herhalingen op {day}', { day: f.label })}</span></span>
                    <span className="flex h-14 w-full items-end" aria-hidden><span className={`w-full rounded-t-md rounded-b-sm ${i === 0 ? 'bg-accent' : 'bg-(--chart-soft)'}`} style={{ height: `${Math.max(6, (f.n / max) * 100)}%` }} /></span>
                    <span className="text-xs text-muted first-letter:uppercase" aria-hidden>{f.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
        <section aria-labelledby="weak-title">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="weak-title" className="text-lg font-bold lg:text-xl">{t('Zwakste posities')}</h2><span className="text-sm text-muted">{t('laagste beheersing eerst')}</span></div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {weakest.slice(0, 4).map(c => {
              const f = fileMap.get(c.familyIds[0])
              const v = f?.variations.find(x => x.id === c.variationIds[0])
              const score = masteryScore(c)
              const fromGame = c.source ? gameCardText(c.source) : null
              const title = fromGame?.short ?? v?.path[v.path.length - 1] ?? f?.family.name ?? t('Positie')
              return (
                <button key={c.id} className="tap flex flex-col gap-3 p-2.5 text-left sm:p-3" onClick={() => startWith([c], true)} aria-label={t('Oefen {title}, beheersing {score}%', { title, score })}>
                  <CropBoard epd={c.epd} uci={c.lineUci} orientation={c.side} inset={4} />
                  <span className="block w-full px-0.5">
                    <span className="flex items-center justify-between gap-2"><span className="truncate font-bold">{title}</span>{c.lapses > 0 && <span className="shrink-0 rounded-full bg-danger-soft px-2 text-xs font-bold text-danger-ink">{t('{n}× fout', { n: c.lapses })}</span>}</span>
                    <span className="block truncate text-xs text-muted">{fromGame ? `${t('Je partij')} · ${fromGame.date}` : f ? `${f.family.name}${v ? ` · ${v.eco}` : ''}` : '…'}</span>
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
        <h2 className="mt-2 text-xl font-bold">{extra ? t('Extra oefening klaar') : t('Alle herhalingen gedaan!')}</h2>
        <p className="mt-1 text-muted">{t('{good} direct goed · {bad} met fouten', { good: stats.good, bad: stats.bad })}</p>
        <div className="mt-4 grid gap-2">
          {dueCount > 0 && <button className="btn btn-primary" onClick={() => { void build(false); setStarted(true) }}>{t('Nog {n} openstaand', { n: dueCount })}</button>}
          <button className="btn btn-ghost" onClick={() => { void build(true); setStarted(true) }}>{t('Oefen je {n} zwakste posities', { n: 20 })}</button>
          <Link to="/" className="btn btn-ghost">{t('Naar het dashboard')}</Link>
        </div>
      </div>
    ) : (
      <Empty title={t('Geen openstaande herhalingen')} action={<button className="btn btn-primary" onClick={() => { void build(true); setStarted(true) }}>{t('Oefen toch je zwakste posities')}</button>}>
        {t('Posities komen hier terug zodra hun herhaaldatum is bereikt. Leer eerst varianten in de cursus of bij Varianten.')}
      </Empty>
    )
  }
  const card = queue[index]
  const file = files.get(card.familyIds[0])
  const v = file?.variations.find(x => x.id === card.variationIds[0])
  const fromGame = card.source ? gameCardText(card.source) : null
  const base = cardLine(card, fromGame ? fromGame.title : v ? t('Vind de zet: {name}', { name: v.path.join(', ') || file!.family.name }) : t('Vind de zet'))
  // De laatste zetten voor de stelling worden voorgespeeld, zodat je niet zomaar in een losse stelling springt
  const line = { ...base, subtitle: file?.family.name, sub: fromGame?.sub, previewFrom: Math.max(0, (base.startPly ?? 0) - PREVIEW_PLIES) }
  return (
    <div>
    <FocusBar value={index / queue.length} count={`${index + 1} / ${queue.length}`} sub={extra ? t('Zwakste posities') : t('Herhalen')} onClose={() => { setStarted(false); if (extra) void build(false) }} closeLabel={t('Stoppen, je gaat later verder')} />
    <ReviewPiles todo={queue.length - index - (answered === index ? 1 : 0)} wrong={stats.bad} correct={stats.good} />
    <Trainer
      key={card.id + index}
      line={line}
      mode="review"
      family={file}
      sessionId={sessionId}
      autoIntro={false}
      onComplete={r => {
        const failed = r.mistakes + r.hints + r.shown > 0
        setAnswered(index)
        setStats(s => ({ good: s.good + (failed ? 0 : 1), bad: s.bad + (failed ? 1 : 0) }))
        // Fout: de kaart komt achteraan de stapel terug, hooguit twee keer
        if (failed && queue.filter(c => c.id === card.id).length <= MAX_RETRIES) setQueue(q => q && [...q, card])
        // Goed: vanzelf door naar de volgende kaart; na een fout blijft de knop staan, zodat je de correctie ziet
        else if (!failed) setTimeout(() => advance(index), AUTO_NEXT_MS)
      }}
      renderEnd={() => (
        <button className="btn btn-primary min-h-12" autoFocus onClick={() => advance(index)}>{index + 1 < queue.length ? t('Volgende positie') : t('Afronden')}</button>
      )}
    />
    </div>
  )
}

/** Herhalen zonder posities (ontwerp 12g): wat er komt, één knop en in drie stappen hoe het werkt */
/** Nog geen fouten uit je partijen in Herhalen: verwijs naar de partij-analyse */
function GamesEmpty() {
  return (
    <section className="card flex flex-col items-center gap-1.5 px-5 py-7 text-center lg:max-w-xl" aria-labelledby="games-empty-title">
      <EmptyKnight size={64} />
      <h2 id="games-empty-title" className="mt-2 text-lg font-extrabold tracking-[-0.01em]">{t('Nog geen fouten uit je partijen')}</h2>
      <p className="max-w-[300px] text-sm leading-snug text-muted">{t('Laat een eigen partij analyseren: je fouten en blunders komen daarna vanzelf hier terug.')}</p>
      <Link to="/analyse" className="btn btn-primary mt-3 w-full">{t('Naar partij-analyse')}</Link>
    </section>
  )
}

function ReviewEmpty({ filtered }: { filtered?: boolean }) {
  const steps = [
    { title: t('Leer een variant'), text: t('in de dagtraining of de cursus') },
    { title: t('Na een dag komt hij terug'), text: t('precies voor je hem vergeet') },
    { title: t('Daarna na 3 en 7 dagen'), text: t('tot hij vast zit') },
  ]
  return (
    <div className="space-y-4 lg:max-w-xl">
      <section className="card flex flex-col items-center gap-1.5 px-5 py-7 text-center" aria-labelledby="review-empty-title">
        <EmptyKnight size={64} />
        <h2 id="review-empty-title" className="mt-2 text-lg font-extrabold tracking-[-0.01em]">{filtered ? t('Nog niets van deze opening') : t('Nog niets om te herhalen')}</h2>
        <p className="max-w-[280px] text-sm leading-snug text-muted">{t('Zodra je een variant hebt geleerd, komt hij hier vanzelf terug.')}</p>
        <Link to="/dagelijks" className="btn btn-primary mt-3 w-full"><Sun size={20} aria-hidden />{t('Start de dagtraining')}</Link>
      </section>
      <section className="card p-4" aria-labelledby="review-how-title">
        <h2 id="review-how-title" className="text-[15px] font-bold">{t('Zo werkt het')}</h2>
        <ol className="mt-3 divide-y-2 divide-surface-2">
          {steps.map((st, i) => (
            <li key={st.title} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span aria-hidden className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-extrabold text-accent-ink">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-tight">{st.title}</span>
                <span className="block text-[13px] text-muted">{st.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

const PREVIEW_PLIES = 6
const MAX_RETRIES = 2

/** Drie stapels, zoals bij Lotus: wat nog komt, wat fout ging en wat goed ging */
function ReviewPiles({ todo, wrong, correct }: { todo: number; wrong: number; correct: number }) {
  const piles = [
    { label: t('Nog doen'), n: todo, tone: 'bg-info-soft text-info-ink' },
    { label: t('Fout'), n: wrong, tone: 'bg-danger-soft text-danger-ink' },
    { label: t('Correct'), n: correct, tone: 'bg-brand-soft text-brand-strong' },
  ]
  return (
    <dl className="mb-3 grid grid-cols-3 gap-2" aria-live="polite">
      {piles.map(p => (
        <div key={p.label} className={`flex flex-col-reverse items-center rounded-xl px-2 py-1.5 ${p.tone}`}>
          <dt className="text-xs font-semibold uppercase tracking-wide">{p.label}</dt>
          <dd className="text-xl font-bold tabular-nums">{p.n}</dd>
        </div>
      ))}
    </dl>
  )
}

function LineReview({ family, onSession }: { family: string; onSession: (on: boolean) => void }) {
  const settings = useSettings()
  const { data: manifest } = useManifest()
  const ids = family && family !== GAMES_FILTER ? [family] : settings?.openings.length ? settings.openings : manifest?.families.map(f => f.id) ?? []
  const files = useAsync(() => Promise.all(ids.map(loadFamily)), [ids.join(',')])
  const progress = useProgressMap()
  const cards = useCardMap()
  const [current, setCurrent] = useState<{ file: FamilyFile; v: Variation } | null>(null)
  const [sessionId, setSessionId] = useState<number>()
  useEffect(() => { if (current) window.scrollTo({ top: 0 }) }, [current])
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
        <FocusBar value={Math.max(0, idx) / Math.max(1, learned.length)} count={`${Math.max(0, idx) + 1} / ${learned.length}`} sub={t('Complete varianten')} onClose={() => setCurrent(null)} closeLabel={t('Terug naar het overzicht')} />
        <Trainer
          key={current.v.id + sessionId}
          line={variationLine(current.file, current.v)}
          mode="mastery"
          family={current.file}
          sessionId={sessionId}
          autoIntro={false}
          renderEnd={(_r, restart) => (
            <>
              {next && next.v.id !== current.v.id && <button className="btn btn-primary min-h-12" autoFocus onClick={() => setCurrent({ file: next.file, v: next.v })}>{t('Volgende variant: {name}', { name: next.v.path.join(', ') || next.file.family.name })}</button>}
              <button className="btn btn-ghost min-h-11" onClick={restart}>{t('Nog een keer')}</button>
              <button className="btn btn-ghost min-h-11" onClick={() => setCurrent(null)}>{t('Overzicht')}</button>
            </>
          )}
        />
      </div>
    )
  }
  if (!learned.length) return <Empty title={t('Nog geen geleerde varianten')} action={<Link to="/openingen" className="btn btn-primary">{t('Begin met leren')}</Link>}>{t('Speel een variant eerst één keer helemaal uit in de cursus of bij Varianten. Daarna kun je hem hier uit je hoofd spelen.')}</Empty>
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('{n} geleerde varianten · {m} te herhalen', { n: learned.length, m: learned.filter(x => x.due).length })}</p>
        <button className="btn btn-primary" onClick={() => setCurrent({ file: learned[0].file, v: learned[0].v })}>{tr('Start', 'Start')}</button>
      </div>
      <ul className="card divide-y divide-line">
        {learned.slice(0, 200).map(x => (
          <li key={x.v.id}>
            <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2" onClick={() => setCurrent({ file: x.file, v: x.v })}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.v.path.join(', ') || x.file.family.name}</span><span className="text-xs text-muted">{x.file.family.name} · {x.v.eco}</span></span>
              {x.due && <span className="chip !text-xs !text-accent-ink">{t('herhalen')}</span>}
              <span className="w-20"><ProgressBar value={x.score / 100} /><span className="text-xs text-muted">{t('{n}% beheersing', { n: x.score })}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
