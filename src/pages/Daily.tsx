import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Brain, Pause, Repeat, Sparkles, Sun, Swords } from 'lucide-react'
import { buildDailyPlan, estimateMinutes, type DailyItem } from '../lib/daily'
import { loadFamily } from '../lib/data'
import { db, saveSettings, today } from '../lib/db'
import { endSession, markDailyComplete, startSession, checkBadges } from '../lib/progress'
import { Trainer, type LineResult } from '../components/Trainer'
import { PuzzleTrainer } from '../components/PuzzleTrainer'
import { Confetti, Empty, ProgressBar, Spinner, plural, useSettings } from '../components/ui'
import type { FamilyFile } from '../lib/types'
import type { BadgeDef } from '../lib/gamification'

const KIND_LABEL: Record<DailyItem['kind'], string> = { review: 'Herhaling', new: 'Nieuwe zetten', hard: 'Moeilijke variant', puzzle: 'Tactische kans' }

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
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6">
          <h1 className="text-2xl font-extrabold">Daily Training</h1>
          <p className="mt-1 text-muted">Je was vandaag al bezig: {saved.index} van {plural(saved.plan.length, 'onderdeel', 'onderdelen')} gedaan.</p>
          <ProgressBar className="mt-3" value={saved.index / saved.plan.length} />
          <button className="btn btn-primary mt-5 min-h-12 w-full text-base" onClick={resume} autoFocus>Ga verder</button>
          <button className="btn btn-ghost mt-2 min-h-11 w-full" onClick={async () => { await db.meta.delete(DAILY_KEY); setSaved(null) }}>Nieuwe training samenstellen</button>
        </div>
      </div>
    )
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
          {summary.badges.map(b => <div key={b.id} className="mt-3 rounded-xl bg-accent-soft p-2 text-sm">Nieuwe badge: <b>{b.title}</b></div>)}
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
    const counts = plan.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] ?? 0) + 1 }), {} as Record<string, number>)
    return (
      <div className="mx-auto max-w-lg">
        <div className="card p-6">
          <h1 className="text-2xl font-extrabold">Daily Training</h1>
          <p className="mt-1 text-muted">Eén doorlopende sessie van ongeveer {estimateMinutes(plan)} minuten (doel: {settings.dailyMinutes} min).</p>
          <ul className="mt-4 space-y-2 text-sm">
            <PlanRow icon={<Repeat size={18} />} muted={!counts.review}>{counts.review ? <><b>{plural(counts.review, 'herhaling', 'herhalingen')}</b> (eerdere fouten eerst)</> : 'Geen openstaande herhalingen'}</PlanRow>
            {counts.new ? <PlanRow icon={<Sparkles size={18} />}><b>{plural(counts.new / 2, 'nieuwe variant', 'nieuwe varianten')}</b> (leren en direct zelf spelen)</PlanRow> : null}
            {counts.hard ? <PlanRow icon={<Brain size={18} />}><b>{plural(counts.hard, 'moeilijke variant', 'moeilijke varianten')}</b> opnieuw</PlanRow> : null}
            {counts.puzzle ? <PlanRow icon={<Swords size={18} />}><b>{plural(counts.puzzle, 'tactische kans', 'tactische kansen')}</b> op jouw niveau</PlanRow> : null}
          </ul>
          <div className="mt-4 flex gap-2 text-sm" role="group" aria-label="Minuten per dag">
            {([5, 10, 15, 20] as const).map(m => (
              <button key={m} className={`chip min-h-11 px-3 ${settings.dailyMinutes === m ? 'chip-on' : ''}`} aria-pressed={settings.dailyMinutes === m} onClick={async () => { await saveSettings({ dailyMinutes: m }); setPlan(null) }}>{m} min</button>
            ))}
          </div>
          <button className="btn btn-primary mt-5 min-h-12 w-full text-base" onClick={start} autoFocus>Start</button>
        </div>
      </div>
    )
  }

  const item = plan[Math.min(index, plan.length - 1)]
  const header = (
    <div className="mb-2 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <ProgressBar value={index / plan.length} label="Voortgang Daily Training" />
        <div className="mt-1 flex justify-between text-xs text-muted"><span>{KIND_LABEL[item.kind]}{item.kind === 'new' ? (item.mode === 'learn' ? ' · leren' : ' · zelf spelen') : ''}</span><span>{index + 1} / {plan.length}</span></div>
      </div>
      <button className="btn btn-quiet min-h-11 shrink-0 px-2 text-sm" onClick={pause} title="Pauzeren: je gaat later verder waar je was"><Pause size={16} aria-hidden />Pauze</button>
    </div>
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
    <Trainer
      key={line.key + mode + index}
      line={line}
      mode={mode}
      family={file}
      sessionId={sessionId}
      header={header}
      autoIntro={mode === 'learn'}
      renderEnd={r => (
        <button className="btn btn-primary min-h-12" autoFocus onClick={() => advance(r, item)}>{mode === 'learn' ? 'Nu zelf spelen' : index + 1 < plan.length ? 'Verder' : 'Training afronden'}</button>
      )}
    />
  )
}

function PlanRow({ icon, children, muted }: { icon: React.ReactNode; children: React.ReactNode; muted?: boolean }) {
  return <li className={`flex items-center gap-2 ${muted ? 'text-muted' : ''}`}><span aria-hidden className="text-brand-strong">{icon}</span><span>{children}</span></li>
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl bg-surface-2 p-3"><div className="text-xl font-bold">{value}</div><div className="text-muted">{label}</div></div>
}
