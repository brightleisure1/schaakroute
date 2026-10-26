import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Flame, Sun } from 'lucide-react'
import { buildDailyPlan, estimateMinutes, planBreakdown, type DailyItem } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { db, saveSettings, today } from '../lib/db'
import { endSession, markDailyComplete, startSession, checkBadges, streak } from '../lib/progress'
import { Trainer, type LineResult } from '../components/Trainer'
import { PuzzleTrainer } from '../components/PuzzleTrainer'
import { CropBoard } from '../components/CropBoard'
import { epdOf } from '../lib/chess'
import { BadgesEarned, Confetti, Empty, FocusBar, Spinner, plural, useSettings, useTrainingFocus } from '../components/ui'
import type { FamilyFile } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

const KIND_LABEL: Record<DailyItem['kind'], string> = { review: 'Herhaling', new: 'Nieuwe zetten', hard: 'Moeilijke variant', puzzle: 'Tactische kans' }

/** De dagroute (ontwerp 6e): startscherm, of met `done` het scherm om verder te gaan waar je was */
function DailyRoute({ plan, done = 0, resume = false, streakDays, minutesGoal, onMinutes, onStart, secondary }: {
  plan: DailyItem[]; done?: number; resume?: boolean; streakDays: number; minutesGoal?: number
  onMinutes?: (m: 5 | 10 | 15 | 20) => void; onStart: () => void; secondary?: { label: string; onClick: () => void }
}) {
  const steps = routeSteps(plan, planBreakdown(plan))
  const resuming = resume
  const minutes = estimateMinutes(plan.slice(done))
  const date = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  // Per halte: afgerond, bezig of nog te doen (het plan staat op volgorde van soort)
  const stateOf = (kind: DailyItem['kind']) => {
    const first = plan.findIndex(i => i.kind === kind)
    const last = plan.length - 1 - [...plan].reverse().findIndex(i => i.kind === kind)
    return last < done ? 'done' : resuming && first <= done ? 'current' : 'todo'
  }
  const minutePicker = onMinutes && (
    <div className="flex rounded-xl border border-line bg-surface-2 p-1" role="group" aria-label="Minuten vandaag">
      {([5, 10, 15, 20] as const).map(m => {
        const on = minutesGoal === m
        return <button key={m} aria-pressed={on} className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => onMinutes(m)}>{m} min</button>
      })}
    </div>
  )
  const label = resuming ? 'Ga verder' : 'Start de route'
  const buttons = (cls: string) => (
    <div className={`flex flex-col gap-2 sm:flex-row ${cls}`}>
      <button className="btn btn-primary min-h-13 px-7 text-base" onClick={onStart} autoFocus={resuming}><Sun size={20} aria-hidden />{label}</button>
      {secondary && <button className="btn btn-ghost min-h-12" onClick={secondary.onClick}>{secondary.label}</button>}
    </div>
  )
  return (
    <div className="space-y-5 lg:space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-accent-ink">Daily Training · {resuming ? `${done} van ${plural(plan.length, 'onderdeel', 'onderdelen')} gedaan` : date}</div>
          <h1 className="mt-1 text-3xl font-extrabold leading-none tracking-tight lg:text-[2.75rem]">{resuming ? `Nog ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'}` : `${minutes} minuten, ${plural(steps.length, 'stap', 'stappen')}`}</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"><Flame size={15} aria-hidden className="text-star" />{streakDays ? `Streak van ${plural(streakDays, 'dag', 'dagen')}` : 'Begin vandaag een streak'}</span>
      </header>

      <ol className="grid grid-cols-1 lg:grid-cols-4 lg:gap-5">
        {steps.map((s, i) => {
          const last = i === steps.length - 1
          const state = stateOf(s.kind)
          return (
            <li key={s.kind} className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-3 lg:flex lg:flex-col lg:gap-3.5 ${state === 'done' ? 'opacity-60' : ''}`} aria-current={state === 'current' ? 'step' : undefined}>
              <div className="flex flex-col items-center lg:flex-row">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold lg:h-9 lg:w-9 ${s.soft} ${state === 'current' ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}>
                  {state === 'done' ? <><Check size={16} strokeWidth={3} aria-hidden /><span className="sr-only">Afgerond</span></> : <span aria-hidden>{i + 1}</span>}
                </span>
                {!last && <span className="my-1 flex-1 border-l-[3px] border-dotted border-accent lg:my-0 lg:-mr-5 lg:ml-2.5 lg:border-l-0 lg:border-t-[3px]" aria-hidden />}
              </div>
              <div className={`card mb-3 flex items-center gap-3 p-2.5 lg:mb-0 lg:flex-col lg:items-stretch lg:p-3 ${state === 'current' ? 'border-accent' : ''}`}>
                <div className="w-21 shrink-0 lg:w-full">{s.board}</div>
                <div className="min-w-0 lg:px-0.5">
                  <div className="flex items-baseline gap-2 lg:justify-between"><span className={`text-xs font-bold uppercase tracking-wide ${s.color}`}>{s.label}</span><span className="text-xs text-muted">{state === 'done' ? 'klaar' : state === 'current' ? 'hier ben je' : `≈ ${s.min} min`}</span></div>
                  <div className="mt-0.5 line-clamp-2 font-bold leading-snug lg:mt-1 lg:text-base">{s.title}</div>
                  <div className="text-sm text-muted">{s.detail}</div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Desktop: keuze en start in één balk */}
      <section className="card hidden flex-wrap items-center justify-between gap-5 py-4 pl-6 pr-5 lg:flex">
        <div className="flex flex-wrap items-center gap-4">
          {minutePicker ? <><span className="font-bold">Hoe lang vandaag?</span>{minutePicker}</> : <span className="font-bold">Je gaat verder waar je was.</span>}
          <span className="text-sm text-muted">Stoppen kan altijd, je gaat later verder.</span>
        </div>
        {buttons('')}
      </section>
      {/* Telefoon: keuze en start blijven onderin, boven de tabbalk */}
      <div className="sticky bottom-(--bottom-nav,0px) z-10 -mx-4 space-y-2.5 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        {minutePicker}
        {buttons('[&>button]:w-full')}
      </div>
    </div>
  )
}

// Startscherm (ontwerp 6e): per soort onderdeel een halte met eigen kleur
const STEP_STYLE: Record<DailyItem['kind'], { label: string; color: string; soft: string }> = {
  review: { label: 'Herhalen', color: 'text-brand-strong', soft: 'bg-brand-soft text-brand-strong' },
  new: { label: 'Nieuw', color: 'text-accent-ink', soft: 'bg-accent-soft text-accent-ink' },
  hard: { label: 'Moeilijk', color: 'text-info-ink', soft: 'bg-info-soft text-info-ink' },
  puzzle: { label: 'Tactiek', color: 'text-danger-ink', soft: 'bg-danger-soft text-danger-ink' },
}

/** De haltes van de route: titel, uitleg, duur en een bordje van de eerste stelling per soort */
function routeSteps(plan: DailyItem[], parts: ReturnType<typeof planBreakdown>) {
  const kinds: DailyItem['kind'][] = ['review', 'new', 'hard', 'puzzle']
  return kinds.filter(k => parts[k].count > 0).map(kind => {
    const first = plan.find(i => i.kind === kind)!
    const n = parts[kind].count
    const min = Math.max(1, Math.round(parts[kind].seconds / 60))
    let title = ''
    let detail = ''
    let board: React.ReactNode = null
    if (first.kind === 'review') {
      title = plural(n, 'positie', 'posities')
      detail = 'eerdere fouten eerst'
      board = <CropBoard epd={first.card.epd} uci={first.card.lineUci} orientation={first.card.side} inset={4} coordsFrom="lg" />
    } else if (first.kind === 'puzzle') {
      title = first.puzzle.variation ?? 'Openingspuzzel'
      detail = n > 1 ? `${n} tactische kansen op jouw niveau` : 'tactische kans op jouw niveau'
      board = <CropBoard epd={epdOf(first.puzzle.fen)} uci={first.puzzle.uci.slice(0, 1)} orientation={first.puzzle.fen.split(' ')[1] === 'w' ? 'black' : 'white'} inset={4} coordsFrom="lg" />
    } else {
      title = n > 1 ? `${first.line.title} + ${n - 1} meer` : first.line.title
      detail = kind === 'new' ? 'leren en direct zelf spelen' : 'opnieuw, je ging eerder fout'
      board = <CropBoard epd={first.variation.epd} uci={first.variation.uci} orientation={first.line.side} inset={4} coordsFrom="lg" />
    }
    return { kind, ...STEP_STYLE[kind], title, detail, min, board }
  })
}

type Totals = { correct: number; mistakes: number; newPositions: number; reviews: number; xp: number; puzzles: number }
interface SavedDaily { day: string; plan: DailyItem[]; index: number; totals: Totals; startXp: number }
const DAILY_KEY = 'dailyState'

export function Daily() {
  const settings = useSettings()
  const nav = useNavigate()
  const [plan, setPlan] = useState<DailyItem[] | null>(null)
  const [saved, setSaved] = useState<SavedDaily | null | undefined>(undefined)
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [files, setFiles] = useState<Map<string, FamilyFile>>(new Map())
  const [sessionId, setSessionId] = useState<number>()
  const totals = useRef({ correct: 0, mistakes: 0, newPositions: 0, reviews: 0, xp: 0, puzzles: 0 })
  const [summary, setSummary] = useState<null | (Totals & { badges: BadgeDef[]; dueTomorrow: number })>(null)
  // Tijdens de sessie: geen tabbalk en kopbalk, wel de bovenbalk met stoppen en voortgang
  useTrainingFocus(started && !summary)
  const st = useLiveQuery(() => streak(), [], { current: 0, best: 0 })
  const startXp = useRef(0)

  // Een onderbroken sessie van vandaag kan worden hervat
  useEffect(() => {
    db.meta.get(DAILY_KEY).then(m => {
      const v = m?.value as SavedDaily | undefined
      setSaved(v && v.day === today() && v.index < v.plan.length ? v : null)
    }).catch(() => setSaved(null))
  }, [])

  async function loadFiles(p: DailyItem[]) {
    const ids = [...new Set(p.map(i => (i.kind === 'review' ? i.card.familyIds[0] : i.familyId)).filter(Boolean))] as string[]
    const loaded = await Promise.all(ids.map(id => loadFamily(id).catch(() => null)))
    setFiles(new Map(loaded.filter(Boolean).map(f => [f!.family.id, f!])))
  }

  useEffect(() => {
    if (!settings || plan || saved === undefined) return
    buildDailyPlan(settings).then(async p => {
      setPlan(p)
      await loadFiles(p)
    })
  }, [settings, plan, saved])

  function persist(i: number, p = plan) {
    if (!p) return
    db.meta.put({ key: DAILY_KEY, value: { day: today(), plan: p, index: i, totals: totals.current, startXp: startXp.current } satisfies SavedDaily }).catch(() => {})
  }

  async function start() {
    setStarted(true)
    startXp.current = ((await db.meta.get('xp'))?.value as number) ?? 0
    setSessionId(await startSession('daily'))
    persist(0)
    saveSettings({ lastRoute: '/dagelijks', lastRouteLabel: 'Daily Training' }).catch(() => {})
  }

  async function resume() {
    if (!saved) return
    totals.current = saved.totals
    startXp.current = saved.startXp
    setPlan(saved.plan)
    setIndex(saved.index)
    await loadFiles(saved.plan)
    setStarted(true)
    setSaved(null)
    setSessionId(await startSession('daily'))
  }

  function pause() {
    persist(index)
    nav('/')
  }

  async function finish() {
    if (sessionId) await endSession(sessionId, { correct: totals.current.correct, mistakes: totals.current.mistakes, newCards: totals.current.newPositions, reviewedCards: totals.current.reviews })
    await markDailyComplete()
    await db.meta.delete(DAILY_KEY).catch(() => {})
    const badges = await checkBadges()
    const xpNow = ((await db.meta.get('xp'))?.value as number) ?? 0
    const dueTomorrow = await db.cards.where('dueAt').belowOrEqual(Date.now() + 36 * 3600_000).filter(c => !c.suspended).count()
    setSummary({ ...totals.current, xp: xpNow - startXp.current, badges, dueTomorrow })
  }

  function advance(r?: LineResult, item?: DailyItem) {
    if (r && item) {
      totals.current.correct += r.correctFirstTry
      totals.current.mistakes += r.mistakes
      if (item.kind === 'review') totals.current.reviews += 1
      else totals.current.newPositions += r.newCards
    }
    const next = index + 1
    setIndex(next)
    persist(next)
    if (plan && next >= plan.length) finish()
  }

  if (saved && !started && !summary) {
    return <DailyRoute plan={saved.plan} done={saved.index} resume streakDays={st.current} onStart={resume} secondary={{ label: 'Nieuwe training samenstellen', onClick: async () => { await db.meta.delete(DAILY_KEY); setSaved(null) } }} />
  }

  if (!settings || !plan) return <Spinner label="Daily Training samenstellen…" />

  if (summary) {
    return (
      <div className="mx-auto max-w-lg">
        <Confetti fire={1} />
        <div className="card p-6 text-center animate-pop">
          <Sun size={44} strokeWidth={1.5} aria-hidden className="mx-auto text-star" />
          <h1 className="mt-2 text-2xl font-extrabold">Daily Training voltooid</h1>
          <p className="text-muted">{new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <Stat label="Goede zetten" value={summary.correct} />
            <Stat label="Fouten" value={summary.mistakes} />
            <Stat label="Nieuwe posities" value={summary.newPositions} />
            <Stat label="Herhaalde posities" value={summary.reviews} />
            <Stat label="Puzzels" value={summary.puzzles} />
            <Stat label="Verdiende XP" value={`+${summary.xp}`} />
          </div>
          <p className="mt-4 text-sm">{summary.dueTomorrow ? <>Morgen staan er <b>{plural(summary.dueTomorrow, 'positie', 'posities')}</b> klaar om te herhalen.</> : 'Morgen leer je weer nieuwe varianten.'}</p>
          <BadgesEarned badges={summary.badges} className="mt-3" />
          <div className="mt-5 grid gap-2">
            <Link to="/statistieken" className="btn btn-primary">Bekijk je voortgang</Link>
            <Link to="/" className="btn btn-ghost">Naar het dashboard</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!plan.length) {
    return <Empty title="Niets te doen vandaag" action={<Link to="/openingen" className="btn btn-primary">Kies openingen</Link>}>Alle varianten van je gekozen openingen zijn geleerd en er zijn geen herhalingen. Kies extra openingen of oefen in Mastery.</Empty>
  }

  if (!started) {
    return <DailyRoute plan={plan} streakDays={st.current} minutesGoal={settings.dailyMinutes} onMinutes={async m => { await saveSettings({ dailyMinutes: m }); setPlan(null) }} onStart={start} />
  }

  const item = plan[Math.min(index, plan.length - 1)]
  const header = (
    <FocusBar
      value={index / plan.length}
      count={`${index + 1} / ${plan.length}`}
      sub={`${KIND_LABEL[item.kind]}${item.kind === 'new' ? (item.mode === 'learn' ? ' · leren' : ' · zelf spelen') : ''}`}
      onClose={pause}
      closeLabel="Pauzeren, je gaat later verder waar je was"
    />
  )
  if (index >= plan.length) return <Spinner label="Afronden…" />

  if (item.kind === 'puzzle') {
    return (
      <div>
        {header}
        <PuzzleTrainer key={item.puzzle.id + index} puzzle={item.puzzle} familyId={item.familyId} nextLabel="Verder" onDone={r => { totals.current.puzzles++; if (r.solved) totals.current.correct++; else totals.current.mistakes += r.mistakes }} onNext={() => advance()} />
      </div>
    )
  }
  const file = item.kind === 'review' ? files.get(item.card.familyIds[0]) : files.get(item.familyId)
  const line = item.kind === 'review' ? { ...item.line, title: 'Vind de zet', subtitle: file?.family.name } : item.line
  const mode = item.kind === 'review' ? 'review' : item.mode
  return (
    <div>
    {header}
    <Trainer
      key={line.key + mode + index}
      line={line}
      mode={mode}
      family={file}
      sessionId={sessionId}
      autoIntro={mode === 'learn'}
      renderEnd={r => (
        <button className="btn btn-primary min-h-12" autoFocus onClick={() => advance(r, item)}>{mode === 'learn' ? 'Nu zelf spelen' : index + 1 < plan.length ? 'Verder' : 'Training afronden'}</button>
      )}
    />
    </div>
  )
}


function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl bg-surface-2 p-3"><div className="text-xl font-bold">{value}</div><div className="text-muted">{label}</div></div>
}
